"""L4 · 하이브리드 RAG 매칭 (앙상블 지점).
쿼리 변환 → BM25 ∥ 벡터 → RRF(Reciprocal Rank Fusion)로 두 순위를 하나로 결합.
이슈 #67: profile 지역/업종 하드 필터를 RRF 정렬 후 top_k 절단 이전에 적용해
matches 건수 = 지역·업종 하드 조건을 통과한(=적합) 공고 수가 되게 한다."""
import logging
import re
import time
from . import bm25_index, vector_search
from .query_transform import transform
from ..text_utils import strip_html, truncate
from ...db import pool

log = logging.getLogger(__name__)

RRF_K = 60
SUMMARY_MAX_LEN = 400  # 이슈 #61 비용 관리 — 원문 그대로 넣지 않고 앞부분만 (대상·지원분야 핵심이 몰려있음)

# 특정 업종을 명시적으로 한정하는 것으로 보이는 키워드. content에 이 중 하나가 있고
# profile.industry와 무관하면 제외한다(과잉 배제보다 과소 배제가 안전 — 좁고 확실한 것만).
RESTRICTIVE_INDUSTRY_KEYWORDS = [
    "방산", "방위산업", "바이오", "제약", "의료기기", "반도체", "소재부품장비", "소부장",
    "뿌리산업", "제조업", "조선", "항공우주", "자동차부품", "석유화학", "농업", "어업",
    "수산업", "축산업", "임업", "광업", "건설업", "섬유산업",
]

def rrf_fuse(*rankings: list[tuple[str, int]]) -> list[tuple[str, float]]:
    scores: dict[str, float] = {}
    for ranking in rankings:
        for doc_id, rank in ranking:
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)

def hybrid_match(cause_text: str, profile: dict | None = None, top_k: int = 5) -> list[dict]:
    t0 = time.monotonic()
    q = transform(cause_text, profile)
    log.info("쿼리변환 완료 (%.1fs)", time.monotonic() - t0)

    # 후보는 넉넉하게(각 축 top 20) 가져온다 — 하드 필터 통과분이 top_k를 채우도록.
    bm25_ranks = bm25_index.search(q["bm25_query"])
    log.info("BM25 검색 완료 (%.1fs 누적, %d건)", time.monotonic() - t0, len(bm25_ranks))

    vec_ranks = vector_search.search(q["vector_query"])
    log.info("벡터 검색 완료 (%.1fs 누적, %d건)", time.monotonic() - t0, len(vec_ranks))

    # RRF로 전체 후보를 정렬하되, top_k 절단은 하드 필터 이후에 한다.
    fused = rrf_fuse(bm25_ranks, vec_ranks)

    bm25_map, vec_map = dict(bm25_ranks), dict(vec_ranks)
    out = []
    with pool.connection() as conn:
        for pblanc_id, score in fused:
            if len(out) >= top_k:
                break
            row = conn.execute(
                """SELECT title, apply_end, detail_url, target, support_field, summary_html, region
                   FROM policy_announcement WHERE pblanc_id=%s""",
                (pblanc_id,)).fetchone()
            if not row:
                continue
            title, apply_end, detail_url, target, support_field, summary_html, region = row
            full_summary = strip_html(summary_html) if summary_html else ""

            # ── 하드 필터 (RRF 정렬 후 · top_k 절단 전) ─────────────────
            reg_pass, reg_label = _region_result(region, profile)
            ind_pass, ind_label = _industry_result(target, full_summary, profile)
            if not (reg_pass and ind_pass):
                continue  # 지역/업종 하드 조건 불일치 → 후보에서 제외

            warnings = _risk_warnings(profile, target, full_summary)

            summary = truncate(full_summary, SUMMARY_MAX_LEN) if full_summary else ""
            out.append({
                "pblanc_id": pblanc_id,
                "title": title,
                "apply_end": str(apply_end) if apply_end else None,
                "detail_url": detail_url,
                # 이슈 #61 ① — 매칭 결과에 공고 원문(정제·truncate)을 실어 L3가 실제 근거로 쓰게 한다.
                "target": target,
                "support_field": support_field,
                "summary": summary,
                "evidence": _build_evidence(reg_label, ind_label, target, warnings),
                # 이슈 #89 — 이미 결정론적으로 계산된 체크리스트(reg_pass·ind_label·warnings)를
                # 재사용해 3항목 충족률(0~100)로 환산. 새 LLM 호출·중복 계산 없음.
                "match_score": _match_score(reg_pass, ind_label, warnings),
                "rrf_score": round(score, 5),
                "bm25_rank": bm25_map.get(pblanc_id),
                "vector_rank": vec_map.get(pblanc_id),
            })
    log.info("DB 조회·필터·매칭 완료 (%.1fs 누적, 통과 %d건)", time.monotonic() - t0, len(out))
    return out


# 시/도(광역) 단위 행정구역명. region에서 이 부분을 먼저 제거해야 "대구광역시"의 "구"를
# 구/군으로 오인하지 않는다.
_SIDO_SUFFIX_RE = re.compile(r"[가-힣]{2,3}(?:특별자치시|특별자치도|특별시|광역시|도)")
# 토큰 '전체'가 구/군 형태일 때만 인정한다(부분매치 금지). region은 순수 행정구역명이 아니라
# 기업마당 jrsdInsttNm(기관명)이 raw로 저장돼 있어("서울연구원" 등), 부분매치로 잡으면
# "연구원"의 "연구"(연+구)를 구/군으로 오탐해 정상 공고를 오배제한다. 그래서 공백으로 나눈
# 토큰 하나가 통째로 이 패턴이어야 한다("북구"·"달성군" O, "연구원"·"연구소" X).
_DISTRICT_TOKEN_RE = re.compile(r"^[가-힣]{1,3}(?:군|구)$")  # 성남시 등 자치'시'는 과잉배제 방지로 제외


def _region_has_district(region: str, sido: str | None) -> bool:
    """region 문자열이 특정 구/군을 한정하는지 판별.
    시/도명(광역시·도 등)을 먼저 제거해 시/도의 '구'(예: 대'구'광역시)를 오탐하지 않고,
    남은 문자열을 공백 토큰으로 나눠 토큰 '전체'가 구/군 형태인 것만 인정한다."""
    stripped = _SIDO_SUFFIX_RE.sub(" ", region)
    if sido:  # 공식 접미사 없이 짧게 쓰인 시/도(예: "대구")도 제거 — 그래야 남은 게 순수 구/군
        stripped = stripped.replace(sido.replace(" ", ""), " ")
    return any(_DISTRICT_TOKEN_RE.match(tok) for tok in stripped.split())


def _region_result(region: str | None, profile: dict | None) -> tuple[bool, str]:
    """지역 하드 필터 + evidence 라벨. region 컬럼 사용.
    주의: region은 순수 행정구역명이 아니라 기업마당 jrsdInsttNm(소관기관명)이 정규화 없이
    raw로 저장된 값이다(BizinfoCollector 참고). "대구광역시 북구"처럼 행정구역이 그대로
    담기기도 하지만 "서울연구원"·"중소벤처기업진흥공단"처럼 기관명일 수도 있어, 구/군 판별은
    부분매치가 아니라 토큰 전체 매치로만 한다(_region_has_district).
    NULL/빈값/전국 → 통과. profile에 지역정보 없으면 필터 안 함(하위호환)."""
    if not profile:
        return True, ""
    sido = profile.get("region_sido")
    sigungu = profile.get("region_sigungu")
    if not region or not region.strip() or "전국" in region.replace(" ", ""):
        return True, "전국 대상 공고"
    cands = [c.replace(" ", "") for c in (sido, sigungu) if c]
    if not cands:
        return True, ""  # 프로필에 지역정보 없음 → 지역 필터 건너뜀
    r = region.replace(" ", "")
    # 이슈 #74: region이 특정 구/군을 한정하는데 그 안에 프로필의 구/군이 없으면 제외한다
    # (시/도만 같은 걸로는 부족 — 구/군 한정 공고에 다른 구/군 프로필이 오매칭되던 버그).
    # 프로필에 구/군 정보가 없으면(sigungu None) 이 강화 조건은 적용하지 않는다(과잉배제 방지).
    if sigungu and sigungu.replace(" ", "") not in r and _region_has_district(region, sido):
        return False, ""
    for c in cands:
        if c in r or r in c:  # 포함 관계 양방향 허용 (부산광역시 ⊇ 부산 등)
            loc = " ".join(filter(None, [sido, sigungu]))
            return True, f"지역 일치({loc})"
    return False, ""


def _industry_result(target: str | None, full_summary: str, profile: dict | None) -> tuple[bool, str]:
    """업종 하드 필터 + evidence 라벨. 전용 컬럼이 없어 target/summary 휴리스틱.
    profile.industry 없으면 건너뜀. 명시적 업종 한정이 profile과 무관할 때만 제외."""
    if not profile:
        return True, ""
    industry = profile.get("industry")
    if not industry:
        return True, ""  # 구버전 호출 등 — 업종 필터 건너뜀
    content = f"{target or ''} {full_summary or ''}"
    tokens = [t for t in re.split(r"[^가-힣A-Za-z0-9]+", industry) if len(t) >= 2]
    if any(tok in content for tok in tokens):
        return True, f"업종 일치({industry} 포함)"
    for kw in RESTRICTIVE_INDUSTRY_KEYWORDS:
        if kw in content:
            return False, ""  # 특정 업종 한정 + 프로필 무관 → 제외
    return True, "업종 제한 없음"


def _risk_warnings(profile: dict | None, target: str | None, full_summary: str) -> list[str]:
    """체납·연체 리스크 경고(확실한 배제 아님 — 문구만 덧붙이고 매칭은 유지).
    실제 저장값은 영문 enum이 아니라 온보딩 화면5/6 선택지 그대로의 한글 문자열이다
    (TAX_OPTIONS=["없음","있음","잘 모름"], OVERDUE_OPTIONS=["없음","있었지만 해결","현재 연체 중","잘 모름"]) —
    "NONE"/"UNKNOWN_*" 같은 영문 리터럴과 비교하면 전부 리스크로 오판된다(있었지만 해결도 포함)."""
    if not profile:
        return []
    content = f"{target or ''} {full_summary or ''}"
    warnings = []
    if profile.get("tax_delinquency") == "있음" and "체납" in content:
        warnings.append("⚠️ 세금체납 이력 시 배제 대상일 수 있음")
    if profile.get("overdue_status") == "현재 연체 중" and "연체" in content:
        warnings.append("⚠️ 연체 이력 시 배제 대상일 수 있음")
    return warnings


def _match_score(reg_pass: bool, ind_label: str, warnings: list[str]) -> int:
    """이슈 #89 — 3개 체크리스트 충족률을 0~100 정수로. raw BM25/RRF 점수는 사용자에게
    의미 없어 노출 안 하기로 했으므로(#80), 이미 계산된 결정론적 항목만 재사용한다.
      1) 지역 일치 — 하드필터 통과분만 여기 도달하므로 항상 충족(투명성용 항목).
      2) 업종 정확 일치 — ind_label이 "업종 일치"로 시작하면 충족. "업종 제한 없음"은
         필터 통과일 뿐 매칭 사유가 아니므로 미충족(#74/#79 원칙).
      3) 리스크 경고 없음 — warnings가 비면 충족."""
    passed = sum([
        reg_pass,
        ind_label.startswith("업종 일치"),
        not warnings,
    ])
    return round(passed / 3 * 100)


def _build_evidence(reg_label: str, ind_label: str, target: str | None,
                    warnings: list[str]) -> str:
    """이슈 #67 — 토큰 겹침 카운트 대신 지역/업종 일치 + 리스크 경고 항목으로 구성.
    내부 쿼리·순위 노출 없이 사용자가 바로 이해할 한국어 문장으로."""
    parts = [p for p in (reg_label, ind_label) if p]
    if not parts and target:  # profile 없는 하위호환 경로 — 최소 정보라도 제공
        parts.append(f"지원대상: {target}")
    base = " · ".join(parts) if parts else "검색 조건과 관련도가 높은 공고입니다."
    if warnings:
        base += " · " + " ".join(warnings)
    return base
