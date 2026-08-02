"""1단계 — 하드 룰 회귀 하네스 (토큰 소모 없음).
diagnosis_rules.check_follow_up_rules가 SYSTEM 프롬프트의 재질문 규칙을 정확히 채점하는지
골든 프로필 + canned LLM 응답(정상/위반 각각)으로 검증한다. 실제 Opus 호출은 하지 않는다 —
이 하네스는 2단계(실제 호출 + LLM 판정자)에 앞서 "채점 로직 자체가 맞는가"를 먼저 고정한다."""
from app.services.diagnosis_rules import check_follow_up_rules
from app.services.golden_profiles import GOLDEN_PROFILES


def _q(id_, question, type_="choice", options=None):
    q = {"id": id_, "question": question, "type": type_}
    if type_ == "choice":
        q["options"] = options if options is not None else ["A", "B", "C"]
    return q


def _result(*questions):
    return {"diagnosis": "진단 본문", "follow_up_questions": list(questions)}


# ------------------------------------------------------------------
# 정상 케이스 — 모든 골든 프로필에서 규칙 준수 응답은 hard/soft 둘 다 비어야 한다.
# ------------------------------------------------------------------

def test_compliant_response_passes_for_every_golden_profile():
    # 어떤 골든 프로필의 채워진 필드와도 키워드가 안 겹치는 질문으로 골랐다 —
    # 이 테스트는 "형식이 규칙을 지키면 모든 프로필에서 위반 0"을 보는 게 목적이라
    # SOFT 휴리스틱과 우연히 겹치는 표현은 피한다.
    compliant = _result(
        _q("q1", "이 자금을 신청하려는 가장 큰 계기가 무엇인가요?", options=["시설 노후화", "인건비 부담", "판로 확대", "기타"]),
        _q("q2", "지금 가장 걱정되는 점을 자유롭게 적어주세요", "text"),
    )
    for name, profile in GOLDEN_PROFILES.items():
        violations = check_follow_up_rules(profile, compliant)
        assert violations == {"hard": [], "soft": []}, f"{name}: {violations}"


def test_empty_follow_up_questions_is_not_a_rule_violation():
    # 파싱 실패 폴백(빈 리스트)은 test_diagnosis.py의 계약 테스트가 이미 다룬다 — 여기선 통과 취급.
    violations = check_follow_up_rules(GOLDEN_PROFILES["cafe_full"], _result())
    assert violations == {"hard": [], "soft": []}


# ------------------------------------------------------------------
# HARD 위반 — SYSTEM이 명시한 형식 규칙
# ------------------------------------------------------------------

def test_too_few_questions_is_hard_violation():
    result = _result(_q("q1", "질문 하나뿐"))
    violations = check_follow_up_rules(GOLDEN_PROFILES["cafe_full"], result)
    assert any("개수" in v for v in violations["hard"])


def test_too_many_questions_is_hard_violation():
    result = _result(*[_q(f"q{i}", f"질문 {i}") for i in range(5)])
    violations = check_follow_up_rules(GOLDEN_PROFILES["cafe_full"], result)
    assert any("개수" in v for v in violations["hard"])


def test_choice_without_enough_options_is_hard_violation():
    result = _result(
        _q("q1", "정상 질문", options=["A", "B", "C"]),
        _q("q2", "옵션 부족", options=["A", "B"]),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["cafe_full"], result)
    assert any("options가 3~5개가 아님" in v for v in violations["hard"])


def test_text_type_with_options_is_hard_violation():
    result = _result(
        _q("q1", "정상 질문", options=["A", "B", "C"]),
        {"id": "q2", "question": "text인데 옵션 있음", "type": "text", "options": ["A", "B"]},
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["cafe_full"], result)
    assert any("text인데 options가 있음" in v for v in violations["hard"])


def test_duplicate_id_is_hard_violation():
    result = _result(
        _q("q1", "첫 질문", options=["A", "B", "C"]),
        _q("q1", "둘째 질문인데 id가 같음", options=["A", "B", "C"]),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["cafe_full"], result)
    assert any("id 중복" in v for v in violations["hard"])


def test_invalid_type_is_hard_violation():
    result = _result(
        _q("q1", "정상 질문", options=["A", "B", "C"]),
        {"id": "q2", "question": "이상한 타입", "type": "essay"},
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["cafe_full"], result)
    assert any("choice/text가 아님" in v for v in violations["hard"])


# ------------------------------------------------------------------
# SOFT 위반 — 이미 채워진 필드를 다시 묻는 것으로 보이는 경우(휴리스틱)
# ------------------------------------------------------------------

def test_reasking_filled_revenue_field_is_soft_violation():
    # cafe_full은 monthly_revenue_band가 채워져 있음 — "매출"을 다시 물으면 SOFT 플래그.
    result = _result(
        _q("q1", "현재 매출 규모는 어느 정도인가요?", options=["적다", "보통", "많다"]),
        _q("q2", "가장 큰 고민을 적어주세요", "text"),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["cafe_full"], result)
    assert any("monthly_revenue_band" in v for v in violations["soft"])
    assert violations["hard"] == []  # 형식 자체는 규칙 위반이 아님 — SOFT로만 분리


def test_asking_unfilled_field_is_not_a_violation():
    # restaurant_minimal은 monthly_revenue_band가 빈 값 — 매출을 물어도 문제 없음.
    result = _result(
        _q("q1", "현재 매출 규모는 어느 정도인가요?", options=["적다", "보통", "많다"]),
        _q("q2", "가장 큰 고민을 적어주세요", "text"),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["restaurant_minimal"], result)
    assert violations == {"hard": [], "soft": []}


def test_unknown_marker_values_count_as_unfilled():
    # retail_unknown_finance는 tax_delinquency='UNKNOWN_UNCONFIRMED' — 채워진 값 취급하면 안 됨.
    result = _result(
        _q("q1", "세금 체납 이력이 있나요?", options=["있다", "없다", "모른다"]),
        _q("q2", "가장 큰 고민을 적어주세요", "text"),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["retail_unknown_finance"], result)
    assert violations == {"hard": [], "soft": []}


# ------------------------------------------------------------------
# 포괄 카테고리 값("기타"·"서비스업") — 실측(2026-08-02 골든셋 2회)에서 모델이 정확히
# 세분화 재질문을 만들었는데도 오탐으로 잡혔던 케이스. _is_filled()의 _GENERIC_CATEGORY_VALUES가
# 이걸 미채움으로 취급해야 한다.
# ------------------------------------------------------------------

def test_etc_industry_is_not_treated_as_filled():
    # etc_industry_recovering의 industry="기타" — 업종을 구체화하는 재질문은 위반이 아니다.
    result = _result(
        _q("q1", "구체적으로 어떤 업종(무엇을 파는 가게)인지 한 줄로 알려주세요", "text"),
        _q("q2", "가장 큰 고민을 적어주세요", "text"),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["etc_industry_recovering"], result)
    assert violations == {"hard": [], "soft": []}


def test_service_industry_is_not_treated_as_filled():
    # startup_early의 industry="서비스업" — 실측에서 실제로 나온 재질문과 동일한 문구.
    result = _result(
        _q("q1", "지금 사장님이 하시는 서비스업은 어떤 업종에 가장 가깝나요?",
           options=["교육", "미용", "청소", "기타"]),
        _q("q2", "가장 큰 고민을 적어주세요", "text"),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["startup_early"], result)
    assert violations == {"hard": [], "soft": []}


def test_specific_industry_value_still_flags_reask():
    # cafe_full의 industry="카페/디저트"는 구체적인 값이라, 이걸 다시 물으면 여전히 SOFT여야 한다 —
    # _GENERIC_CATEGORY_VALUES 예외가 모든 업종 재질문을 무력화하면 안 된다는 회귀 방지.
    result = _result(
        _q("q1", "어떤 업종을 운영하고 계신가요?", options=["카페", "식당", "소매", "기타"]),
        _q("q2", "가장 큰 고민을 적어주세요", "text"),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["cafe_full"], result)
    assert any("industry" in v for v in violations["soft"])


# ------------------------------------------------------------------
# 정밀화 질문(_REFINEMENT_MARKERS) — v1·v2 실측에서 실제로 나온 문구를 그대로 재현해
# 더는 SOFT로 안 잡히는지 검증한다.
# ------------------------------------------------------------------

def test_revenue_trend_question_is_not_flagged():
    # v2 cafe_full 실측: "최근 6개월 매출 흐름은 어떤가요?" — 구간값이 아니라 추이를 물음.
    result = _result(
        _q("q1", "최근 6개월 매출 흐름은 어떤가요?", options=["늘었다", "비슷하다", "줄었다"]),
        _q("q2", "가장 큰 고민을 적어주세요", "text"),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["cafe_full"], result)
    assert violations == {"hard": [], "soft": []}


def test_revenue_comparison_question_is_not_flagged():
    # v2 lodging_high_revenue 실측: "현재 매출이 작년 같은 기간과 비교해 어떤가요?"
    result = _result(
        _q("q1", "현재 매출이 작년 같은 기간과 비교해 어떤가요?", options=["늘었다", "비슷하다", "줄었다"]),
        _q("q2", "가장 큰 고민을 적어주세요", "text"),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["lodging_high_revenue"], result)
    assert violations == {"hard": [], "soft": []}


def test_seasonal_revenue_variance_question_is_not_flagged():
    # v2 lodging_high_revenue 실측: "계절별 매출 편차가 얼마나 큰지 알려주세요."
    result = _result(
        _q("q1", "숙박업 운영에서 계절별 매출 편차가 얼마나 큰지 알려주세요.", "text"),
        _q("q2", "가장 큰 고민을 적어주세요", "text"),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["lodging_high_revenue"], result)
    assert violations == {"hard": [], "soft": []}


def test_overdue_resolution_timing_question_is_not_flagged():
    # v1 lodging_high_revenue 실측: "과거 연체가 해결된 시점은 언제쯤인가요?"
    result = _result(
        _q("q1", "과거 연체가 해결된 시점은 언제쯤인가요?", "text"),
        _q("q2", "가장 큰 고민을 적어주세요", "text"),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["lodging_high_revenue"], result)
    assert violations == {"hard": [], "soft": []}


def test_tax_delinquency_arrangement_question_is_not_flagged():
    # v2 manufacturing_delinquent 실측: "체납된 세금은 분납·납부유예 등을 신청해 조정 중이신가요?"
    result = _result(
        _q("q1", "체납된 세금은 분납·납부유예 등을 신청해 조정 중이신가요?",
           options=["예", "아니오", "모름"]),
        _q("q2", "가장 큰 고민을 적어주세요", "text"),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["manufacturing_delinquent"], result)
    assert violations == {"hard": [], "soft": []}


def test_plain_revenue_restate_is_still_flagged():
    # 정밀화 신호 단어가 전혀 없는 순수 재진술은 여전히 SOFT여야 한다 — 예외 목록이
    # "매출"이 들어간 모든 질문을 무력화하면 안 된다는 회귀 방지.
    result = _result(
        _q("q1", "현재 매출 규모는 어느 정도인가요?", options=["적다", "보통", "많다"]),
        _q("q2", "가장 큰 고민을 적어주세요", "text"),
    )
    violations = check_follow_up_rules(GOLDEN_PROFILES["cafe_full"], result)
    assert any("monthly_revenue_band" in v for v in violations["soft"])
