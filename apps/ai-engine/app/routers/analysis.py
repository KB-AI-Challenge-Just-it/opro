"""L3 · AI 추론 (Sonnet) — 적합성 설명 반환.
매칭이 먼저 실행된 뒤, 매칭 결과가 있을 때만 호출된다(이슈 #29).
'왜 이 매칭된 공고들이 이 프로필에 맞는지'를 설명한다.
호출자: Spring PipelineService"""
from fastapi import APIRouter
from pydantic import BaseModel
from ..services.cause_analysis import explain_fit

router = APIRouter()

class AnalyzeRequest(BaseModel):
    profile: dict                          # Spring이 조회해 전달 (ai-engine은 profile 테이블 직접 조회 안 함)
    matches: list[dict]                    # 매칭 결과 [{pblanc_id, title, evidence}, ...]
    market_context: dict | None = None     # 옵션 — 없으면 무시

@router.post("")
def analyze(req: AnalyzeRequest):
    return explain_fit(req.profile, req.matches, req.market_context)
