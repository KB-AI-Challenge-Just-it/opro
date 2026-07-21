"""L2 · 1차 스크리닝(선택) — Haiku 저비용·고속.
임계값 근처의 애매한 신호를 규칙만으로 버리기 아까울 때만 사용. MVP에선 off 가능."""
from .anthropic_client import call
from ..config import settings

SYSTEM = "당신은 소상공인 경영 신호 스크리너입니다. 주어진 지표 변화가 사장님에게 알릴 가치가 있으면 YES, 아니면 NO만 답하세요."

def screen(signal_summary: str) -> bool:
    if settings.mock_llm:
        return True
    out = call(settings.model_screening, SYSTEM, signal_summary, max_tokens=5)
    return out.strip().upper().startswith("Y")
