"""L4 · 쿼리 변환 — Haiku, 단순 변환 작업.
원인 분석 텍스트 → 검색 친화 쿼리(키워드형 + 자연어형)로 변환."""
import json
from ..anthropic_client import call
from ...config import settings

SYSTEM = """소상공인 상황 설명을 정책자금 공고 검색용 쿼리로 변환하세요.
JSON만 출력: {"bm25_query": "정확 용어·숫자 위주 키워드", "vector_query": "시맨틱 검색용 자연어 문장"}"""

def transform(cause_text: str, profile_hint: str = "") -> dict:
    if settings.mock_llm:
        return {"bm25_query": cause_text, "vector_query": cause_text}
    raw = call(settings.model_query_transform, SYSTEM,
               f"{cause_text}\n프로필: {profile_hint}", max_tokens=300)
    try:
        return json.loads(raw.replace("```json", "").replace("```", "").strip())
    except json.JSONDecodeError:
        return {"bm25_query": cause_text, "vector_query": cause_text, "fallback": True}
