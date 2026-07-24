"""콜1 /diagnose — 개인화 경영 진단 + 검증 재질문 계약 검증.
app.main(무거운 chromadb/torch 의존)을 로드하지 않도록 라우터/서비스를 직접 호출한다."""
from unittest.mock import patch

from app.routers.diagnose import DiagnoseRequest, diagnose_endpoint
from app.services import diagnosis

GOLDEN_REQUEST = {
    "profile": {
        "industry": "카페/디저트",
        "region_sido": "서울",
        "region_sigungu": "마포구",
        "monthly_revenue_band": "1억~3억",
        "employee_band": "1~4명",
        "funding_purpose": ["운영", "시설"],
        "tax_delinquency": "없음",
        "overdue_status": "없음",
    },
    "market_context": {"경쟁강도": "높음", "동일업종_점포수": 42},
    "econ_context": {"기준금리": 3.5},
}

VALID_LLM_JSON = (
    '{"diagnosis": "마포구 카페는 경쟁강도가 높은 상권입니다.", '
    '"follow_up_questions": ['
    '{"id": "q1", "question": "최근 3개월 매출이 줄었나요?", "type": "choice", '
    '"options": ["늘었다", "비슷하다", "줄었다"]}, '
    '{"id": "q2", "question": "가장 큰 고민을 적어주세요", "type": "text"}]}'
)


def test_diagnose_returns_diagnosis_and_follow_up_questions():
    with patch.object(diagnosis, "call", return_value=VALID_LLM_JSON):
        body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert set(body.keys()) == {"diagnosis", "follow_up_questions"}
    assert isinstance(body["diagnosis"], str) and body["diagnosis"]
    assert len(body["follow_up_questions"]) == 2
    assert body["follow_up_questions"][0]["type"] == "choice"
    assert body["follow_up_questions"][0]["options"] == ["늘었다", "비슷하다", "줄었다"]
    assert body["follow_up_questions"][1]["type"] == "text"


def test_diagnose_defaults_questions_when_llm_omits_them():
    # LLM이 diagnosis만 반환해도 follow_up_questions 키는 항상 존재해야 한다 (Spring 안전 접근).
    with patch.object(diagnosis, "call", return_value='{"diagnosis": "ok"}'):
        body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert body == {"diagnosis": "ok", "follow_up_questions": []}


def test_diagnose_falls_back_on_non_json():
    with patch.object(diagnosis, "call", return_value="JSON이 아닌 응답"):
        body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert body == {"diagnosis": "JSON이 아닌 응답", "follow_up_questions": []}


def test_diagnose_falls_back_on_valid_json_that_is_not_an_object():
    # LLM이 문법적으로는 유효하지만 object가 아닌 JSON(bare array 등)을 반환하면
    # json.loads는 성공하지만 parsed는 list라서 .setdefault가 없다 — AttributeError 없이 fallback해야 한다.
    with patch.object(diagnosis, "call", return_value='["a", "b"]'):
        body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert body == {"diagnosis": '["a", "b"]', "follow_up_questions": []}


def test_diagnose_strips_markdown_code_fence():
    fenced = "```json\n" + VALID_LLM_JSON + "\n```"
    with patch.object(diagnosis, "call", return_value=fenced):
        body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert body["diagnosis"] == "마포구 카페는 경쟁강도가 높은 상권입니다."
    assert len(body["follow_up_questions"]) == 2


def test_diagnose_mock_path_returns_valid_contract():
    with patch.object(diagnosis.settings, "mock_llm", True):
        body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert body["diagnosis"]
    assert len(body["follow_up_questions"]) >= 1
    for q in body["follow_up_questions"]:
        assert {"id", "question", "type"} <= set(q.keys())


def test_diagnose_does_not_use_prefill():
    # model_diagnosis(claude-opus-4-8)는 assistant 턴 프리필을 지원하지 않는다
    # (Anthropic API가 400 invalid_request_error로 거부 — 실측 확인). 다른 서비스가
    # 실수로 prefill을 넣으면 운영 중 요청 전체가 500으로 죽으므로 회귀 방지 고정.
    with patch.object(diagnosis, "call", return_value=VALID_LLM_JSON) as mock_call:
        diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))
    assert "prefill" not in mock_call.call_args.kwargs


def test_diagnose_falls_back_and_logs_on_non_json(caplog):
    import logging
    with caplog.at_level(logging.WARNING, logger="app.services.diagnosis"):
        with patch.object(diagnosis, "call", return_value="JSON이 아닌 순수 진단 문단입니다"):
            body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert body == {"diagnosis": "JSON이 아닌 순수 진단 문단입니다", "follow_up_questions": []}
    assert any("JSON 파싱 실패" in r.message for r in caplog.records)


def test_diagnose_lenient_extraction_strips_surrounding_prose():
    # 코드펜스 앞뒤로 군더더기 텍스트가 섞여도(모델이 프리필 뒤에 설명을 덧붙이는 경우)
    # 첫 '{'~마지막 '}'만 잘라 파싱에 성공해야 한다 — cause_analysis.py와 동일한 방어.
    fenced = "알겠습니다, 분석 결과입니다.\n```json\n" + VALID_LLM_JSON + "\n```\n이상입니다."
    with patch.object(diagnosis, "call", return_value=fenced):
        body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert body["diagnosis"] == "마포구 카페는 경쟁강도가 높은 상권입니다."
    assert len(body["follow_up_questions"]) == 2


def test_diagnose_contexts_are_optional_and_forwarded():
    # 컨텍스트 없이도 동작
    minimal = {"profile": GOLDEN_REQUEST["profile"]}
    with patch.object(diagnosis, "call", return_value='{"diagnosis": "ok"}'):
        assert diagnose_endpoint(DiagnoseRequest(**minimal)) == {
            "diagnosis": "ok", "follow_up_questions": []}

    # 있으면 LLM user payload에 실려야 한다
    with patch.object(diagnosis, "call", return_value='{"diagnosis": "ok"}') as mock_call:
        diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))
    user_payload = mock_call.call_args[0][2]
    assert "market_context" in user_payload
    assert "econ_context" in user_payload
