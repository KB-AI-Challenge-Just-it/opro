"""L4 · 하이브리드 RAG 매칭 (앙상블 지점).
쿼리 변환 → BM25 ∥ 벡터 → RRF(Reciprocal Rank Fusion)로 두 순위를 하나로 결합."""
from . import bm25_index, vector_search
from .query_transform import transform
from ...db import pool

RRF_K = 60

def rrf_fuse(*rankings: list[tuple[str, int]]) -> list[tuple[str, float]]:
    scores: dict[str, float] = {}
    for ranking in rankings:
        for doc_id, rank in ranking:
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)

def hybrid_match(cause_text: str, profile_hint: str = "", top_k: int = 5) -> list[dict]:
    q = transform(cause_text, profile_hint)
    bm25_ranks = bm25_index.search(q["bm25_query"])
    vec_ranks = vector_search.search(q["vector_query"])
    fused = rrf_fuse(bm25_ranks, vec_ranks)[:top_k]

    bm25_map, vec_map = dict(bm25_ranks), dict(vec_ranks)
    out = []
    with pool.connection() as conn:
        for pblanc_id, score in fused:
            row = conn.execute(
                "SELECT title, apply_end, detail_url FROM policy_announcement WHERE pblanc_id=%s",
                (pblanc_id,)).fetchone()
            out.append({
                "pblanc_id": pblanc_id,
                "title": row[0] if row else None,
                "apply_end": str(row[1]) if row and row[1] else None,
                "detail_url": row[2] if row else None,
                "rrf_score": round(score, 5),
                "bm25_rank": bm25_map.get(pblanc_id),
                "vector_rank": vec_map.get(pblanc_id),
            })
    return out
