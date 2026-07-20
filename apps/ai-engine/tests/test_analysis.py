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


def test_analysis_returns_fit_text_and_no_legacy_fields():
    fake = '{"fit_text": "마포구 카페 사장님께 경영안정자금이 도움이 됩니다."}'
    with patch.object(cause_analysis, "call", return_value=fake):
        body = analyze(AnalyzeRequest(**GOLDEN_REQUEST))

    assert set(body.keys()) == {"fit_text"}
    assert isinstance(body["fit_text"], str) and body["fit_text"]
    for legacy in ("cause_text", "needs_funding_match", "match_hint"):
        assert legacy not in body


def test_analysis_falls_back_to_fit_text_on_non_json():
    with patch.object(cause_analysis, "call", return_value="JSON이 아닌 응답"):
        body = analyze(AnalyzeRequest(**GOLDEN_REQUEST))

    assert body == {"fit_text": "JSON이 아닌 응답"}


def test_analysis_market_context_optional_and_forwarded():
    # 없어도 동작
    with patch.object(cause_analysis, "call", return_value='{"fit_text": "ok"}'):
        assert analyze(AnalyzeRequest(**GOLDEN_REQUEST)) == {"fit_text": "ok"}

    # 있으면 LLM user payload에 실려야 한다
    req = AnalyzeRequest(**{**GOLDEN_REQUEST, "market_context": {"note": "x"}})
    with patch.object(cause_analysis, "call", return_value='{"fit_text": "ok"}') as mock_call:
        analyze(req)
    assert "market_context" in mock_call.call_args[0][2]
