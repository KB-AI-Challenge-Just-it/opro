"""콜1 · 개인화 경영 진단 (Opus) — 진단 본문 + 검증 재질문 반환.
온보딩 직후 가장 먼저 호출된다. 매칭보다 앞선 단계라 공고 정보는 받지 않는다.
호출자: Spring ConsultationService"""
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from ..services.diagnosis import diagnose

router = APIRouter()


class DiagnoseRequest(BaseModel):
    profile: dict                          # Spring이 조회해 전달 (ai-engine은 테이블 직접 조회 안 함)
    market_context: Optional[dict] = None  # market_snapshot metric — 없으면 무시
    econ_context: Optional[dict] = None    # econ_indicator 최신값 — 없으면 무시


@router.post("")
def diagnose_endpoint(req: DiagnoseRequest):
    return diagnose(req.profile, req.market_context, req.econ_context)
