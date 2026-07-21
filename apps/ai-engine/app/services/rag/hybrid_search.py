"""L4 · 하이브리드 RAG 매칭 (앙상블 지점).
쿼리 변환 → BM25 ∥ 벡터 → RRF(Reciprocal Rank Fusion)로 두 순위를 하나로 결합."""
import logging
import time
from . import bm25_index, vector_search
from .query_transform import transform
from ..text_utils import strip_html, truncate
from ...db import pool

log = logging.getLogger(__name__)

RRF_K = 60
SUMMARY_MAX_LEN = 400  # 이슈 #61 비용 관리 — 원문 그대로 넣지 않고 앞부분만 (대상·지원분야 핵심이 몰려있음)

def rrf_fuse(*rankings: list[tuple[str, int]]) -> list[tuple[str, float]]:
    scores: dict[str, float] = {}
    for ranking in rankings:
        for doc_id, rank in ranking:
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)

def hybrid_match(cause_text: str, profile_hint: str = "", top_k: int = 5) -> list[dict]:
    t0 = time.monotonic()
    q = transform(cause_text, profile_hint)
    log.info("쿼리변환 완료 (%.1fs)", time.monotonic() - t0)

    bm25_ranks = bm25_index.search(q["bm25_query"])
    log.info("BM25 검색 완료 (%.1fs 누적, %d건)", time.monotonic() - t0, len(bm25_ranks))

    vec_ranks = vector_search.search(q["vector_query"])
    log.info("벡터 검색 완료 (%.1fs 누적, %d건)", time.monotonic() - t0, len(vec_ranks))

    fused = rrf_fuse(bm25_ranks, vec_ranks)[:top_k]

    bm25_map, vec_map = dict(bm25_ranks), dict(vec_ranks)
    query_tokens = set(bm25_index.tokenize(q.get("bm25_query", "")))
    out = []
    with pool.connection() as conn:
        for pblanc_id, score in fused:
            row = conn.execute(
                """SELECT title, apply_end, detail_url, target, support_field, summary_html
                   FROM policy_announcement WHERE pblanc_id=%s""",
                (pblanc_id,)).fetchone()
            title, apply_end, detail_url, target, support_field, summary_html = row if row else (None,) * 6
            summary = truncate(strip_html(summary_html), SUMMARY_MAX_LEN) if summary_html else ""
            bm25_r = bm25_map.get(pblanc_id)
            vec_r = vec_map.get(pblanc_id)
            out.append({
                "pblanc_id": pblanc_id,
                "title": title,
                "apply_end": str(apply_end) if apply_end else None,
                "detail_url": detail_url,
                # 이슈 #61 ① — 매칭 결과에 공고 원문(정제·truncate)을 실어 L3가 실제 근거로 쓰게 한다.
                "target": target,
                "support_field": support_field,
                "summary": summary,
                "evidence": _build_evidence(query_tokens, title, target, support_field, summary),
                "rrf_score": round(score, 5),
                "bm25_rank": bm25_r,
                "vector_rank": vec_r,
            })
    log.info("DB 조회·매칭 완료 (%.1fs 누적, %d건)", time.monotonic() - t0, len(out))
    return out


def _build_evidence(query_tokens: set[str], title: str | None, target: str | None,
                     support_field: str | None, summary: str) -> str:
    """이슈 #61 ② — RRF/BM25 순위 같은 검색 내부 정보 대신, 검색어와 공고 내용이 실제로
    겹치는 키워드 + 지원대상·지원분야를 근거로 제시한다. 추가 Claude 호출 없이(비용 0)
    이미 계산된 쿼리 토큰과 kiwi 형태소 분석만으로 만든다."""
    content = " ".join(filter(None, [title, target, support_field, summary]))
    content_tokens = set(bm25_index.tokenize(content)) if content else set()
    overlap = [t for t in query_tokens if t in content_tokens]

    parts = []
    if overlap:
        keywords = "」「".join(overlap[:4])
        parts.append(f"검색 조건 중 「{keywords}」가 공고 내용과 일치")
    if target:
        parts.append(f"지원대상: {target}")
    if support_field:
        parts.append(f"지원분야: {support_field}")
    if not parts:
        return "프로필 상황과 의미적으로 관련이 높은 공고입니다."
    return " · ".join(parts)
