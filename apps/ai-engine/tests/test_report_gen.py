"""이슈 #67 — report_gen 마감임박 결정론적 계산 + 정직한 헤더 검증."""
from datetime import date
from unittest.mock import patch

from app.services import report_gen


def test_deadline_note_marks_urgent_within_14_days():
    today = date(2026, 7, 21)
    assert report_gen._deadline_note("2026-07-31", today) == "마감: 2026-07-31 (D-10, 마감임박)"
    assert report_gen._deadline_note("2026-08-04", today) == "마감: 2026-08-04 (D-14, 마감임박)"
    assert report_gen._deadline_note("2026-08-05", today) == "마감: 2026-08-05 (D-15)"
    assert report_gen._deadline_note("2026-09-03", today) == "마감: 2026-09-03 (D-44)"
    assert report_gen._deadline_note(None, today) == "마감일 미정"


def test_generate_report_sends_only_count_not_per_match_details():
    # 이슈 #76 — 공고별 상세는 web 목록이 전담. 프롬프트엔 건수(match_count)만 전달하고
    # 공고 상세(deadline_note·detail_url 등)는 본문 프롬프트로 보내지 않는다.
    matches = [{"title": "A", "apply_end": "2026-07-31", "detail_url": "http://x"}]
    with patch.object(report_gen.settings, "mock_llm", False), \
         patch.object(report_gen, "call", return_value="ok") as mock_call:
        report_gen.generate_report_body("cause", matches)
    user_payload = mock_call.call_args[0][2]
    assert '"match_count": 1' in user_payload
    assert "deadline_note" not in user_payload
    assert "detail_url" not in user_payload


def test_system_prompt_is_situation_and_fit_only_with_honest_header():
    # ①②만 생성. ③ 공고별 실무 정보 지시는 제거됨.
    assert "적합 공고" in report_gen.SYSTEM
    assert "찾지 못했습니다" in report_gen.SYSTEM
    assert "③" not in report_gen.SYSTEM
    assert "deadline_note" not in report_gen.SYSTEM
    assert "바로가기" not in report_gen.SYSTEM


def test_mock_header_honest_when_no_matches():
    with patch.object(report_gen.settings, "mock_llm", True):
        body = report_gen.generate_report_body("cause", [])
    assert "적합한 정책자금을 찾지 못했습니다" in body
    assert "매칭" not in body
