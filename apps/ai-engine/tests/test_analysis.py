"""L3 /analysis — 적합성 설명 (이슈 #29 재정의) 계약 검증.
app.main(무거운 chromadb/torch 의존)을 로드하지 않도록 라우터/서비스를 직접 호출한다."""
from unittest.mock import patch

from app.routers.analysis import AnalyzeRequest, analyze
from app.services import cause_analysis

GOLDEN_REQUEST = {
    "profile": {
        "industry": "카페/디저트",
        "region_sido": "서울",
        "region_sigungu": "마포구",
        "concerns": ["주변 경쟁 심화", "자금 조달 어려움"],
    },
    "matches": [
        {
            "pblanc_id": "DEMO-0001",
            "title": "소상공인 경영안정자금",
            "evidence": "키워드 검색 1위 + 의미 검색 2위으로 매칭 (RRF 0.031)",
        }
    ],
}


def test_analysis_returns_fit_text_and_match_rationales():
    fake = ('{"fit_text": "마포구 카페 사장님께 경영안정자금이 도움이 됩니다.", '
            '"match_rationales": {"DEMO-0001": "지역 일치(마포구) · 카페 업종 경영안정자금 적합"}}')
    with patch.object(cause_analysis, "call", return_value=fake):
        body = analyze(AnalyzeRequest(**GOLDEN_REQUEST))

    assert set(body.keys()) == {"fit_text", "match_rationales"}
    assert isinstance(body["fit_text"], str) and body["fit_text"]
    assert body["match_rationales"]["DEMO-0001"]
    for legacy in ("cause_text", "needs_funding_match", "match_hint"):
        assert legacy not in body


def test_analysis_defaults_match_rationales_when_llm_omits_it():
    # LLM이 fit_text만 반환해도 match_rationales 키는 항상 존재해야 한다 (Spring 안전 접근).
    with patch.object(cause_analysis, "call", return_value='{"fit_text": "ok"}'):
        body = analyze(AnalyzeRequest(**GOLDEN_REQUEST))

    assert body == {"fit_text": "ok", "match_rationales": {}}


def test_analysis_falls_back_on_non_json_with_empty_rationales():
    with patch.object(cause_analysis, "call", return_value="JSON이 아닌 응답"):
        body = analyze(AnalyzeRequest(**GOLDEN_REQUEST))

    assert body == {"fit_text": "JSON이 아닌 응답", "match_rationales": {}}


def test_analysis_pure_json_codefence_parses(caplog):
    # 코드펜스만 감싼 순수 JSON — 기존처럼 정상 파싱, 경고 로그 없음.
    fake = ('```json\n{"fit_text": "경영안정자금이 적합합니다.", '
            '"match_rationales": {"DEMO-0001": "카페 업종 적합"}}\n```')
    with caplog.at_level("WARNING", logger="app.services.cause_analysis"):
        with patch.object(cause_analysis, "call", return_value=fake):
            body = analyze(AnalyzeRequest(**GOLDEN_REQUEST))

    assert body["fit_text"] == "경영안정자금이 적합합니다."
    assert body["match_rationales"]["DEMO-0001"] == "카페 업종 적합"
    assert not caplog.records


def test_analysis_lenient_extraction_strips_surrounding_prose():
    # 코드펜스 앞뒤로 군더더기 텍스트가 섞여도 관대한 추출로 파싱 성공해야 한다.
    fake = ('물론입니다!\n```json\n'
            '{"fit_text": "마포구 카페에 적합", "match_rationales": {"DEMO-0001": "지역 일치"}}'
            '\n```\n이상입니다.')
    with patch.object(cause_analysis, "call", return_value=fake):
        body = analyze(AnalyzeRequest(**GOLDEN_REQUEST))

    assert body["fit_text"] == "마포구 카페에 적합"
    assert body["match_rationales"]  # 비어있지 않음
    assert body["match_rationales"]["DEMO-0001"] == "지역 일치"


def test_analysis_broken_json_falls_back_and_logs(caplog):
    # 중괄호가 없는 완전히 깨진 응답 — 폴백 경로 + 경고 로그가 실제로 찍혀야 한다.
    with caplog.at_level("WARNING", logger="app.services.cause_analysis"):
        with patch.object(cause_analysis, "call", return_value="죄송하지만 답변드릴 수 없습니다"):
            body = analyze(AnalyzeRequest(**GOLDEN_REQUEST))

    assert body == {"fit_text": "죄송하지만 답변드릴 수 없습니다", "match_rationales": {}}
    assert any("JSON 파싱 실패" in r.message for r in caplog.records)


def test_analysis_mock_path_covers_all_pblanc_ids():
    req = {
        **GOLDEN_REQUEST,
        "matches": [
            {"pblanc_id": "DEMO-0001", "title": "소상공인 경영안정자금", "evidence": "x"},
            {"pblanc_id": "DEMO-0002", "title": "판로지원 바우처", "evidence": "y"},
        ],
    }
    with patch.object(cause_analysis.settings, "mock_llm", True):
        body = analyze(AnalyzeRequest(**req))

    assert "fit_text" in body
    assert set(body["match_rationales"].keys()) == {"DEMO-0001", "DEMO-0002"}
    assert all(v for v in body["match_rationales"].values())


def test_analysis_market_context_optional_and_forwarded():
    # 없어도 동작
    with patch.object(cause_analysis, "call", return_value='{"fit_text": "ok"}'):
        assert analyze(AnalyzeRequest(**GOLDEN_REQUEST)) == {"fit_text": "ok", "match_rationales": {}}

    # 있으면 LLM user payload에 실려야 한다
    req = AnalyzeRequest(**{**GOLDEN_REQUEST, "market_context": {"note": "x"}})
    with patch.object(cause_analysis, "call", return_value='{"fit_text": "ok"}') as mock_call:
        analyze(req)
    assert "market_context" in mock_call.call_args[0][2]
