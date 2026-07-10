"""L2 보조 · 1차 스크리닝 — Haiku 저비용·고속.
임계값 게이트 자체는 Spring의 규칙 엔진이 담당. 애매한 신호만 여기로 위임(선택)."""
from fastapi import APIRouter
from pydantic import BaseModel
from ..services.screening import screen

router = APIRouter()

class ScreenRequest(BaseModel):
    signal_summary: str

@router.post("")
def do_screen(req: ScreenRequest):
    return {"worth_alerting": screen(req.signal_summary)}
