"""L4 · 하이브리드 RAG 매칭 (앙상블 지점): Haiku 쿼리 변환 → BM25 ∥ 벡터 → RRF.
profile(구조화 지역/업종/리스크)로 RRF·top_k 절단 이전에 하드 필터를 적용한다 (이슈 #67)."""
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from ..services.rag.hybrid_search import hybrid_match

router = APIRouter()

class MatchRequest(BaseModel):
    cause_text: str
    # {region_sido, region_sigungu, industry, tax_delinquency, overdue_status}.
    # tax_delinquency/overdue_status는 BusinessProfile과 동일한 문자열 enum(NONE/YES/...).
    # None/누락이면 하위 호환 — 필터 없이 기존 동작.
    profile: Optional[dict] = None
    top_k: int = 5

@router.post("")
def match(req: MatchRequest):
    return {"matches": hybrid_match(req.cause_text, req.profile, req.top_k)}
