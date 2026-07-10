"""수집 후 인덱싱: Spring이 기업마당 공고를 Postgres에 적재한 뒤 호출.
policy_announcement 전량을 읽어 BM25 재구성 + Chroma 임베딩 upsert."""
from fastapi import APIRouter
from ..services.indexing import rebuild_indexes

router = APIRouter()

@router.post("/rebuild")
def rebuild():
    count = rebuild_indexes()
    return {"indexed": count}
