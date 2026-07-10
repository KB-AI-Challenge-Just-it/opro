"""확장(5-3) · 신청서류 초안 — 컨텍스트 입력형 (호출자: Spring)"""
from fastapi import APIRouter
from pydantic import BaseModel
from ..services.draft_engine import generate_draft_sections

router = APIRouter()

class DraftRequest(BaseModel):
    announcement: dict
    profile: dict
    cause_text: str

@router.post("")
def create_draft(req: DraftRequest):
    sections = generate_draft_sections(req.announcement, req.profile, req.cause_text)
    return {"sections": sections,
            "notice": "초안입니다. 반드시 검토·수정 후 직접 제출하세요."}
