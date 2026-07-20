"""L4 · 벡터 검색 — Chroma, 시맨틱 유사도. 공고문은 수집 배치에서 사전 임베딩."""
import logging
import time
from ...vectorstore import get_collection

log = logging.getLogger(__name__)

def search(query: str, top_k: int = 20) -> list[tuple[str, int]]:
    t0 = time.monotonic()
    col = get_collection()
    log.info("get_collection (임베딩 함수 로딩 포함) 완료 (%.1fs)", time.monotonic() - t0)

    t1 = time.monotonic()
    res = col.query(query_texts=[query], n_results=top_k)
    log.info("col.query (쿼리 임베딩+Chroma 검색) 완료 (%.1fs)", time.monotonic() - t1)

    ids = res["ids"][0] if res["ids"] else []
    return [(pid, r + 1) for r, pid in enumerate(ids)]
