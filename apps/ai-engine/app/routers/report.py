"""L5 · 리포트 생성 (Sonnet). 저장은 Spring이 담당 — 여기선 본문 텍스트만 반환."""
from fastapi import APIRouter
from pydantic import BaseModel
from ..services.report_gen import generate_report_body

router = APIRouter()

class ReportRequest(BaseModel):
    cause_text: str
    matches: list[dict] = []
    profile_summary: dict | None = None
    profile_facts: str | None = None       # 결정론 팩트시트 — L5가 수치를 정확히 쓰게 함 (없으면 무시)
    diagnosis: str | None = None           # 콜2 상담 진단 본문 — 반복 말고 그 위에서 정제(계획 P2), 없으면 무시
    follow_up_answers: str | None = None    # 콜2 재질문 답변 — 서사에 명시 반영, 없으면 무시

@router.post("/generate")
def generate(req: ReportRequest):
    return {"body_md": generate_report_body(
        req.cause_text, req.matches, req.profile_summary, req.profile_facts,
        req.diagnosis, req.follow_up_answers)}
