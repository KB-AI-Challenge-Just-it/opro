"""Anthropic 클라이언트 공용. 배치 모니터링은 Batch API(50% 할인),
반복 컨텍스트(업종별 임계값 테이블·정책자금 시스템 프롬프트)는 프롬프트 캐싱 적용."""
import logging
import anthropic
from ..config import settings

log = logging.getLogger(__name__)

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
    # 이슈 #61 — 컨텍스트 확장(공고 원문 포함)이 실제 토큰비에 미치는 영향을 감이 아니라 숫자로 보기 위함.
    u = msg.usage
    log.info("claude usage model=%s input=%d output=%d cache_read=%d cache_write=%d",
              model, u.input_tokens, u.output_tokens,
              getattr(u, "cache_read_input_tokens", 0) or 0,
              getattr(u, "cache_creation_input_tokens", 0) or 0)
    # 응답이 길이 제한으로 강제 종료되면 JSON이 불완전해 파싱 실패로 이어진다(이슈 #104).
    # 모든 호출자에 공통 적용되도록 call() 자체에서 잘림을 감지해 경고를 남긴다.
    if getattr(msg, "stop_reason", None) == "max_tokens":
        log.warning("claude 응답이 max_tokens(%d)에 도달해 잘렸습니다. model=%s", max_tokens, model)
    return "".join(b.text for b in msg.content if b.type == "text")
