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


# 이슈 #83 — 리포트 헤더 개인화(profile_summary). MOCK 경로는 결정론적으로 검증한다.

def test_mock_header_backward_compat_without_profile_summary():
    # profile_summary 없이(하위호환) 호출하면 순수 건수 헤더만.
    matches = [{"title": "A"}, {"title": "B"}]
    with patch.object(report_gen.settings, "mock_llm", True):
        body = report_gen.generate_report_body("cause", matches)
    assert "## 적합 공고 2건" in body
    assert "사장님" not in body


def test_mock_header_none_profile_summary_is_plain():
    # 명시적 None도 하위호환 — 개인화 없음.
    with patch.object(report_gen.settings, "mock_llm", True):
        body = report_gen.generate_report_body("cause", [{"title": "A"}], None)
    assert "## 적합 공고 1건" in body
    assert "사장님" not in body


def test_mock_header_empty_dict_profile_summary_is_plain():
    # 세 필드 모두 비어있으면 개인화하지 않는다.
    with patch.object(report_gen.settings, "mock_llm", True):
        body = report_gen.generate_report_body("cause", [{"title": "A"}], {})
    assert "## 적합 공고 1건" in body
    assert "사장님" not in body


def test_mock_header_full_profile_summary_personalizes():
    profile = {"industry": "카페", "region_sido": "대전", "region_sigungu": "동구"}
    matches = [{"title": "A"}, {"title": "B"}, {"title": "C"}, {"title": "D"}, {"title": "E"}]
    with patch.object(report_gen.settings, "mock_llm", True):
        body = report_gen.generate_report_body("cause", matches, profile)
    assert "## 대전 동구 카페 사장님, 적합 공고 5건" in body


def test_mock_header_partial_profile_summary_uses_only_present_fields():
    # 업종만 있고 지역 없음 — 있는 것만 쓰고 없는 지역은 지어내지 않는다.
    with patch.object(report_gen.settings, "mock_llm", True):
        body = report_gen.generate_report_body("cause", [{"title": "A"}], {"industry": "카페"})
    assert "## 카페 사장님, 적합 공고 1건" in body


def test_mock_header_personalizes_even_with_zero_matches():
    profile = {"region_sido": "대전", "region_sigungu": "동구", "industry": "카페"}
    with patch.object(report_gen.settings, "mock_llm", True):
        body = report_gen.generate_report_body("cause", [], profile)
    assert "## 대전 동구 카페 사장님, 적합한 정책자금을 찾지 못했습니다" in body


def test_real_path_includes_match_titles_in_order():
    # cause_text가 "1번 공고"·"2번 공고"로 지칭하는 순서와 matches 순서가 대응되도록,
    # 실제 경로는 title만 뽑아 match_titles로 전달해야 한다(요약·마감일 등은 여전히 제외).
    matches = [
        {"title": "프렙 아카데미 모집 공고", "apply_end": "2026-07-31"},
        {"title": "외식업 경영혁신 컨설팅 공고", "detail_url": "http://x"},
    ]
    with patch.object(report_gen.settings, "mock_llm", False), \
         patch.object(report_gen, "call", return_value="ok") as mock_call:
        report_gen.generate_report_body("cause", matches)
    user_payload = mock_call.call_args[0][2]
    assert '"match_titles": ["프렙 아카데미 모집 공고", "외식업 경영혁신 컨설팅 공고"]' in user_payload
    assert "deadline_note" not in user_payload
    assert "detail_url" not in user_payload


def test_system_prompt_instructs_replacing_ordinal_with_real_title():
    # 회귀 방지: L5가 L3의 "1번 공고" 같은 번호 지칭을 실제 공고명으로 되살려 쓰도록 강제한다.
    # 이 지시가 없으면 리포트 본문이 공고명을 잃고 "1번 공고"만 남는 회귀가 재발한다.
    assert "match_titles" in report_gen.SYSTEM
    assert "번호로만 부르지 말고" in report_gen.SYSTEM


def test_real_path_includes_profile_summary_in_user_payload():
    # 실제 LLM 경로: profile_summary를 user payload에 포함해 개인화를 위임한다.
    profile = {"industry": "카페", "region_sido": "대전"}
    with patch.object(report_gen.settings, "mock_llm", False), \
         patch.object(report_gen, "call", return_value="ok") as mock_call:
        report_gen.generate_report_body("cause", [{"title": "A"}], profile)
    user_payload = mock_call.call_args[0][2]
    assert '"profile_summary"' in user_payload
    assert "카페" in user_payload
    assert "대전" in user_payload
