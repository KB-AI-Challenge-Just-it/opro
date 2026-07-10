"""L4 · 하이브리드 RAG 매칭 (앙상블 지점): Haiku 쿼리 변환 → BM25 ∥ 벡터 → RRF"""
from fastapi import APIRouter
from pydantic import BaseModel
from ..services.rag.hybrid_search import hybrid_match

router = APIRouter()

class MatchRequest(BaseModel):
    cause_text: str
    profile_hint: str = ""
    top_k: int = 5

@router.post("")
def match(req: MatchRequest):
    return {"matches": hybrid_match(req.cause_text, req.profile_hint, req.top_k)}
