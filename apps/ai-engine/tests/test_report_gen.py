"""이슈 #67 — report_gen 정직한 헤더 검증(공고별 상세는 프롬프트에 안 보냄)."""
from unittest.mock import patch

from app.services import report_gen


def test_generate_report_sends_only_count_not_per_match_details():
    # 이슈 #76 — 공고별 상세는 web 목록이 전담. 프롬프트엔 건수(match_count)만 전달하고
    # 공고 상세(deadline_note·detail_url 등)는 본문 프롬프트로 보내지 않는다.
    matches = [{"title": "A", "apply_end": "2026-07-31", "detail_url": "http://x"}]
    with patch.object(report_gen, "call", return_value="ok") as mock_call:
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


def test_real_path_includes_match_titles_in_order():
    # cause_text가 "1번 공고"·"2번 공고"로 지칭하는 순서와 matches 순서가 대응되도록,
    # 실제 경로는 title만 뽑아 match_titles로 전달해야 한다(요약·마감일 등은 여전히 제외).
    matches = [
        {"title": "프렙 아카데미 모집 공고", "apply_end": "2026-07-31"},
        {"title": "외식업 경영혁신 컨설팅 공고", "detail_url": "http://x"},
    ]
    with patch.object(report_gen, "call", return_value="ok") as mock_call:
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


def test_real_path_forwards_profile_facts():
    # 결정론 팩트시트를 L5 user payload에 실어, fit_text 의역이 아니라 확정 수치로 쓰게 한다(계획 P1).
    with patch.object(report_gen, "call", return_value="ok") as mock_call:
        report_gen.generate_report_body("cause", [{"title": "A"}], None, "연매출: 1억~3억")
    assert "연매출: 1억~3억" in mock_call.call_args[0][2]


def test_system_prompt_prefers_profile_facts_over_cause():
    assert "profile_facts" in report_gen.SYSTEM
    assert "연매출/월평균" in report_gen.SYSTEM


def test_real_path_forwards_diagnosis_and_answers():
    # 콜2 상담 경로: 진단·답변을 L5 user payload에 실어 서사에 반영하게 한다(계획 P2).
    with patch.object(report_gen, "call", return_value="ok") as mock_call:
        report_gen.generate_report_body(
            "cause", [{"title": "A"}], None, "연매출: 1억~3억",
            diagnosis="강남 카페는 경쟁이 치열합니다", follow_up_answers="자금 용도 → 시설 교체")
    payload = mock_call.call_args[0][2]
    assert "경쟁이 치열" in payload
    assert "시설 교체" in payload


def test_system_prompt_synthesizes_not_repeats_diagnosis():
    # 진단 반복 금지 + 답변 명시 반영이 프롬프트에 박혀 있어야 한다(회귀 방지).
    assert "diagnosis" in report_gen.SYSTEM
    assert "반복" in report_gen.SYSTEM
    assert "follow_up_answers" in report_gen.SYSTEM


def test_real_path_includes_matches_brief_with_score_and_caveats():
    # 우선순위 조언용 압축 힌트(적합도·유의사항 유무)를 payload에 실어야 한다(계획 P3).
    matches = [
        {"title": "A", "match_score": 85, "evidence": '{"reason": "적합", "caveats": ""}'},
        {"title": "B", "match_score": 40, "evidence": '{"reason": "부분", "caveats": "자격 확인 필요"}'},
    ]
    with patch.object(report_gen, "call", return_value="ok") as mock_call:
        report_gen.generate_report_body("cause", matches)
    payload = mock_call.call_args[0][2]
    assert "matches_brief" in payload
    assert '"score": 85' in payload
    # A는 caveats 빈 문자열 → has_caveats false, B는 있음 → true
    assert '"has_caveats": true' in payload
    assert '"has_caveats": false' in payload


def test_match_brief_handles_plain_evidence_without_crashing():
    # evidence가 규칙기반 평문(JSON 아님)이어도 has_caveats=False로 안전 처리.
    brief = report_gen._match_brief({"title": "A", "match_score": 50, "evidence": "규칙 기반 근거 문자열"})
    assert brief == {"title": "A", "score": 50, "has_caveats": False}


def test_system_prompt_count_faithful_header_and_prioritized_advice():
    # 매칭 있으면 '못 찾았습니다' 금지(카드 모순) + 우선순위·다음 한 걸음 조언 지시 고정.
    assert "찾지 못했습니다" in report_gen.SYSTEM  # 규칙 문구 존재
    assert "카드" in report_gen.SYSTEM             # 카드 모순 경고
    assert "matches_brief" in report_gen.SYSTEM
    assert "다음 한 걸음" in report_gen.SYSTEM


def test_real_path_includes_profile_summary_in_user_payload():
    # 실제 LLM 경로: profile_summary를 user payload에 포함해 개인화를 위임한다.
    profile = {"industry": "카페", "region_sido": "대전"}
    with patch.object(report_gen, "call", return_value="ok") as mock_call:
        report_gen.generate_report_body("cause", [{"title": "A"}], profile)
    user_payload = mock_call.call_args[0][2]
    assert '"profile_summary"' in user_payload
    assert "카페" in user_payload
    assert "대전" in user_payload
