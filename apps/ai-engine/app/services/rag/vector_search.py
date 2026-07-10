"""L4 · 벡터 검색 — Chroma, 시맨틱 유사도. 공고문은 수집 배치에서 사전 임베딩."""
from ...vectorstore import get_collection

def search(query: str, top_k: int = 20) -> list[tuple[str, int]]:
    col = get_collection()
    res = col.query(query_texts=[query], n_results=top_k)
    ids = res["ids"][0] if res["ids"] else []
    return [(pid, r + 1) for r, pid in enumerate(ids)]
