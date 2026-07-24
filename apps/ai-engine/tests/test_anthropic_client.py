"""이슈 #104 — call()이 stop_reason == "max_tokens"(응답 잘림)를 감지해 경고 로그를 남기는지 검증.
잘린 응답의 불완전 JSON은 파싱 실패로 리포트 품질을 규칙 기반으로 떨어뜨리므로, 잘림을
운영 로그에서 즉시 알아챌 수 있어야 한다. 잘리지 않은 정상 응답에선 경고가 없어야 한다."""
import logging
from types import SimpleNamespace
from unittest.mock import patch

from app.services import anthropic_client


def _fake_msg(stop_reason: str, text: str = '{"ok": true}'):
    usage = SimpleNamespace(
        input_tokens=100,
        output_tokens=50,
        cache_read_input_tokens=0,
        cache_creation_input_tokens=0,
    )
    block = SimpleNamespace(type="text", text=text)
    return SimpleNamespace(usage=usage, stop_reason=stop_reason, content=[block])


def test_call_warns_when_truncated_by_max_tokens(caplog):
    with patch.object(anthropic_client.client.messages, "create",
                      return_value=_fake_msg("max_tokens")):
        with caplog.at_level(logging.WARNING, logger=anthropic_client.log.name):
            out = anthropic_client.call("model-x", "sys", "usr", max_tokens=4000)
    assert out == '{"ok": true}'
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "max_tokens" in warnings[0].getMessage()
    assert "4000" in warnings[0].getMessage()
    assert "model-x" in warnings[0].getMessage()


def test_call_no_warning_on_normal_stop(caplog):
    with patch.object(anthropic_client.client.messages, "create",
                      return_value=_fake_msg("end_turn")):
        with caplog.at_level(logging.WARNING, logger=anthropic_client.log.name):
            out = anthropic_client.call("model-x", "sys", "usr", max_tokens=4000)
    assert out == '{"ok": true}'
    assert [r for r in caplog.records if r.levelno == logging.WARNING] == []


# prefill — 이슈: diagnosis()가 가끔 JSON 없이 순수 자연어 문단만 반환해 follow_up_questions가
# 통째로 비는 사고가 실측됐다(콘솔 로그 없이 응답 자체가 JSON을 안 지킴). assistant 턴을 "{"로
# 미리 채워두면 모델이 그 뒤를 이어 쓸 수밖에 없어 JSON 이탈 자체가 구조적으로 불가능해진다.
def test_call_with_prefill_sends_assistant_turn_and_prepends_to_output():
    with patch.object(anthropic_client.client.messages, "create",
                       return_value=_fake_msg("end_turn", text='"diagnosis": "ok"}')) as mock_create:
        out = anthropic_client.call("model-x", "sys", "usr", max_tokens=100, prefill="{")
    assert out == '{"diagnosis": "ok"}'
    sent_messages = mock_create.call_args.kwargs["messages"]
    assert sent_messages[-1] == {"role": "assistant", "content": "{"}


def test_call_without_prefill_keeps_single_user_message():
    with patch.object(anthropic_client.client.messages, "create",
                       return_value=_fake_msg("end_turn")) as mock_create:
        anthropic_client.call("model-x", "sys", "usr", max_tokens=100)
    sent_messages = mock_create.call_args.kwargs["messages"]
    assert sent_messages == [{"role": "user", "content": "usr"}]
