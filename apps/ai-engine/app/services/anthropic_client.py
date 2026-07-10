"""Anthropic 클라이언트 공용. 배치 모니터링은 Batch API(50% 할인),
반복 컨텍스트(업종별 임계값 테이블·정책자금 시스템 프롬프트)는 프롬프트 캐싱 적용."""
import anthropic
from ..config import settings

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

def call(model: str, system: str, user: str, max_tokens: int = 1500,
         cache_system: bool = True) -> str:
    system_block = [{"type": "text", "text": system}]
    if cache_system:
        system_block[0]["cache_control"] = {"type": "ephemeral"}
    msg = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system_block,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in msg.content if b.type == "text")
