"""policy_announcement(Postgres) → BM25(형태소) 재구성 + Chroma 임베딩 upsert"""
import re
from ..db import pool
from ..vectorstore import get_collection
from .rag import bm25_index

def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "")

def rebuild_indexes() -> int:
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT pblanc_id, title, summary_html FROM policy_announcement").fetchall()
    docs = [(pid, f"{title} {_strip_html(summary)}") for pid, title, summary in rows]
    bm25_index.rebuild(docs)
    if docs:
        col = get_collection()
        col.upsert(ids=[d[0] for d in docs], documents=[d[1] for d in docs])
    return len(docs)
