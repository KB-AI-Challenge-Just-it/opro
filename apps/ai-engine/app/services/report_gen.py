"""L5 · 리포트 생성 — Sonnet. 합성이며 앙상블 아님:
원인 텍스트(항상 포함) + 매칭 결과(있을 때만)를 하나의 리포트로. 저장은 Spring."""
import json
from .anthropic_client import call
from ..config import settings

SYSTEM = """소상공인 사장님께 보내는 경영 알림 리포트를 작성하세요.
구성: ① 지금 상황 ② 원인 ③ (매칭이 있으면) 대응 가능한 정책자금과 왜 맞는지 근거.
전문용어 없이, 마크다운, 600자 이내."""

def generate_report_body(cause_text: str, matches: list[dict]) -> str:
    user = json.dumps({"cause": cause_text, "matches": matches}, ensure_ascii=False)
    return call(settings.model_report, SYSTEM, user, max_tokens=1500)
