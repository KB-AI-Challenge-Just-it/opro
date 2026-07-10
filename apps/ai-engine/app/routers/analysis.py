"""L3 · AI 추론 (Sonnet) — 원인 분석 + '정책자금 매칭 필요한가?' 판단까지 반환.
호출자: Spring PipelineService"""
from fastapi import APIRouter
from pydantic import BaseModel
from ..services.cause_analysis import analyze_cause

router = APIRouter()

class AnalyzeRequest(BaseModel):
    profile: dict          # Spring이 조회해 전달 (ai-engine은 profile 테이블 직접 조회 안 함)
    trigger_context: dict

@router.post("")
def analyze(req: AnalyzeRequest):
    return analyze_cause(req.profile, req.trigger_context)
