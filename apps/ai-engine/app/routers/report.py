"""L5 · 리포트 생성 (Sonnet). 저장은 Spring이 담당 — 여기선 본문 텍스트만 반환."""
from fastapi import APIRouter
from pydantic import BaseModel
from ..services.report_gen import generate_report_body

router = APIRouter()

class ReportRequest(BaseModel):
    cause_text: str
    matches: list[dict] = []
    profile_summary: dict | None = None

@router.post("/generate")
def generate(req: ReportRequest):
    return {"body_md": generate_report_body(req.cause_text, req.matches, req.profile_summary)}
