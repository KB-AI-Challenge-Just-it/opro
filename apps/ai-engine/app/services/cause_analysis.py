"""L3 · AI 추론 — Sonnet, 추론 품질 우선.
매칭이 먼저 실행된 뒤 호출되므로 역할은 '적합성 설명'이다:
매칭된 공고들이 왜 이 프로필에 도움이 되는지 사장님 언어로 설명한다.
프로필은 Spring이 전달(단일 데이터 오너십: 비즈니스 데이터 조회는 Spring)."""
import json
from .anthropic_client import call
from ..config import settings

SYSTEM = """당신은 소상공인 정책자금 안내 전문가입니다. 사장님의 프로필(업종·지역·고민)과,
그 프로필에 이미 매칭된 정책자금 공고 목록을 보고
"왜 이 공고들이 지금 이 사장님께 도움이 되는지"를 사장님이 이해할 수 있는 언어로 설명하세요.
- 매칭 필요 여부는 판단하지 마세요(이미 매칭된 결과를 설명하는 단계입니다).
- 공고 제목을 자연스럽게 언급하고, 프로필의 업종·지역·고민과 연결해 설명하세요.
- 어려운 행정 용어 대신 사장님이 바로 이해할 수 있는 말로 쓰세요.
반드시 JSON만 출력: {"fit_text": "..."}"""

def explain_fit(profile: dict, matches: list[dict], market_context: dict | None = None) -> dict:
    payload = {"profile": profile, "matches": matches}
    if market_context:
        payload["market_context"] = market_context
    user = json.dumps(payload, ensure_ascii=False, default=str)
    raw = call(settings.model_reasoning, SYSTEM, user, max_tokens=1200)
    try:
        return json.loads(raw.replace("```json", "").replace("```", "").strip())
    except json.JSONDecodeError:
        return {"fit_text": raw}
