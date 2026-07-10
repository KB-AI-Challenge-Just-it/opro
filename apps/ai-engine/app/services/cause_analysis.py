"""L3 · AI 추론 — Sonnet, 추론 품질 우선.
프로필은 Spring이 전달(단일 데이터 오너십: 비즈니스 데이터 조회는 Spring)."""
import json
from .anthropic_client import call
from ..config import settings

SYSTEM = """당신은 소상공인 경영 분석가입니다. 트리거된 지표 변화와 사업자 프로필을 보고
1) 원인을 사장님이 이해할 수 있는 언어로 분석하고
2) 이 상황에 정책자금 매칭이 필요한지 판단하세요.
반드시 JSON만 출력: {"cause_text": "...", "needs_funding_match": true|false, "match_hint": "매칭 검색에 쓸 상황 요약 1~2문장"}"""

def analyze_cause(profile: dict, trigger_context: dict) -> dict:
    user = json.dumps({"profile": profile, "trigger": trigger_context},
                      ensure_ascii=False, default=str)
    raw = call(settings.model_reasoning, SYSTEM, user, max_tokens=1200)
    try:
        return json.loads(raw.replace("```json", "").replace("```", "").strip())
    except json.JSONDecodeError:
        return {"cause_text": raw, "needs_funding_match": True, "match_hint": raw[:200]}
