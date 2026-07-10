"""L4 · BM25 인덱스 — kiwi 형태소 분석 토큰화. 정확 용어·숫자 매칭 담당.
공고 적재 배치에서 인덱스를 재구성하고 프로세스 메모리에 유지."""
from kiwipiepy import Kiwi
from rank_bm25 import BM25Okapi

_kiwi = Kiwi()
_index: BM25Okapi | None = None
_doc_ids: list[str] = []

def tokenize(text: str) -> list[str]:
    return [t.form for t in _kiwi.tokenize(text)
            if t.tag.startswith(("N", "SN", "SL", "V"))]

def rebuild(docs: list[tuple[str, str]]):
    """docs: [(pblanc_id, text)]"""
    global _index, _doc_ids
    _doc_ids = [d[0] for d in docs]
    _index = BM25Okapi([tokenize(d[1]) for d in docs])

def search(query: str, top_k: int = 20) -> list[tuple[str, int]]:
    """returns [(pblanc_id, rank)] — RRF는 순위만 필요"""
    if _index is None:
        return []
    scores = _index.get_scores(tokenize(query))
    ranked = sorted(zip(_doc_ids, scores), key=lambda x: x[1], reverse=True)[:top_k]
    return [(pid, r + 1) for r, (pid, _) in enumerate(ranked)]
