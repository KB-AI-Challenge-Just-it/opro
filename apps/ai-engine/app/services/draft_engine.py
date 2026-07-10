"""확장(5-3) · 신청서류 초안 생성 (Sonnet).
공고·프로필·원인분석 컨텍스트는 Spring이 조회해 전달. 저장도 Spring."""
import json
from .anthropic_client import call
from ..config import settings

SYSTEM = """정책자금 신청서 초안 작성 도우미입니다. 공고 요구 항목별로 초안을 작성하세요.
- 사업자 프로필의 사실 정보만 사용하고, 모르는 값은 지어내지 말고 [여기에 \u25cb\u25cb 기입]으로 표시
- JSON만 출력: {"사업개요": "...", "신청사유": "...", "활용계획": "...", "기대효과": "..."}"""

def generate_draft_sections(announcement: dict, profile: dict, cause_text: str) -> dict:
    user = json.dumps({"공고": announcement, "프로필": profile, "경영상황": cause_text},
                      ensure_ascii=False, default=str)
    raw = call(settings.model_reasoning, SYSTEM, user, max_tokens=2000)
    try:
        return json.loads(raw.replace("```json", "").replace("```", "").strip())
    except json.JSONDecodeError:
        return {"raw": raw}
