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
    bm25_index.rebuild(docs)  # 프로세스 메모리 인덱스라 항상 재구성 필요 — 가볍다(형태소 분석만)
    if docs:
        col = get_collection()
        # Chroma는 볼륨에 영속되므로 재기동해도 이미 임베딩된 문서는 그대로 남아있다.
        # 그런데도 매번 전체를 upsert하면 bge-m3 CPU 임베딩을 실 데이터 규모(1000건대)에서
        # 매번 재계산하게 되어 재기동마다 수 분씩 걸리고, main.py의 동기 startup 훅과 맞물려
        # 헬스체크(start_period 300s)를 넘겨버려 api-core/web이 아예 못 뜨는 사태로 이어진다.
        # collector가 upsert 시 title/summary_html을 갱신하지 않고 last_seen_at만 갱신하므로
        # (BizinfoCollector.java ON CONFLICT DO UPDATE SET last_seen_at = now()), 이미 Chroma에
        # 있는 id는 내용이 바뀌었을 리 없어 재임베딩을 건너뛰어도 안전하다 — 신규분만 upsert.
        existing_ids = set(col.get(ids=[d[0] for d in docs])["ids"])
        new_docs = [d for d in docs if d[0] not in existing_ids]
        if new_docs:
            col.upsert(ids=[d[0] for d in new_docs], documents=[d[1] for d in new_docs])
    return len(docs)
