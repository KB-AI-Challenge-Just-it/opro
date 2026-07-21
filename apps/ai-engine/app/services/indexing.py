"""policy_announcement(Postgres) → BM25(형태소) 재구성 + Chroma 임베딩 upsert"""
from ..db import pool
from ..vectorstore import get_collection
from .rag import bm25_index
from .text_utils import strip_html

def rebuild_indexes() -> int:
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT pblanc_id, title, summary_html FROM policy_announcement "
            "WHERE apply_end >= CURRENT_DATE OR apply_end IS NULL").fetchall()
    docs = [(pid, f"{title} {strip_html(summary)}") for pid, title, summary in rows]
    bm25_index.rebuild(docs)
    if docs:
        col = get_collection()
        col.upsert(ids=[d[0] for d in docs], documents=[d[1] for d in docs])
    return len(docs)
