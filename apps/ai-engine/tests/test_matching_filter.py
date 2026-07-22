"""이슈 #67 — /matching 지역·업종 하드 필터 + evidence 재설계 단위 검증.
app.main(무거운 의존)을 로드하지 않도록 서비스 함수를 직접 호출하고,
BM25∥벡터 검색과 DB 조회는 patch로 대체한다."""
from unittest.mock import MagicMock, patch

from app.services.rag import hybrid_search

# 컬럼 순서: title, apply_end, detail_url, target, support_field, summary_html, region
ROWS = {
    "BUSAN-CAFE": ("부산 카페 운전자금", "2026-08-30", "http://x/1",
                   "소상공인 (상시근로자 5인 미만)", "금융", "<p>카페·외식업 우대</p>", "부산광역시"),
    "DAEGU-MFG": ("대구 제조업 시설자금", "2026-08-30", "http://x/2",
                  "대구 소재 제조업체", "금융", "<p>제조업 대상</p>", "대구광역시"),
    "NATIONAL": ("전국 소상공인 경영안정자금", "2026-08-30", "http://x/3",
                 "전국 소상공인", "금융", "<p>업종 무관</p>", "전국"),
    "DEFENSE": ("방산 강소기업 R&D", "2026-08-30", "http://x/4",
                "방산업체 및 방위산업 참여기업", "기술", "<p>방산 분야 한정</p>", "부산광역시"),
    "TAX-EXCL": ("성실납세 소상공인 자금", "2026-08-30", "http://x/5",
                 "국세 체납이 없는 소상공인", "금융", "<p>체납 시 지원 제외</p>", "부산광역시"),
    # 이슈 #74 골든 케이스용 — region이 구/군까지 한정하는 공고 vs 시/도 광역 공고
    "DAEGU-BUKGU": ("대구 북구 소상공인 자금", "2026-08-30", "http://x/6",
                    "소상공인", "금융", "<p>업종 무관</p>", "대구광역시 북구 소재 사업장"),
    "DAEGU-SUSEONG": ("대구 수성구 소상공인 자금", "2026-08-30", "http://x/7",
                      "소상공인", "금융", "<p>업종 무관</p>", "대구광역시 수성구 소재 사업장"),
    "DAEGU-WIDE": ("대구 광역 소상공인 자금", "2026-08-30", "http://x/8",
                   "소상공인", "금융", "<p>업종 무관</p>", "대구광역시"),
    # region은 순수 행정구역명이 아니라 jrsdInsttNm(기관명) raw값 — "연구원"의 "연구"(연+구)가
    # 구/군으로 오탐돼 정상 공고가 오배제되던 회귀(#74 재작업) 고정용.
    "SEOUL-INST": ("서울연구원 소상공인 지원", "2026-08-30", "http://x/9",
                   "소상공인", "금융", "<p>업종 무관</p>", "서울연구원"),
    "DAEGU-INST": ("대구경북연구원 소상공인 지원", "2026-08-30", "http://x/10",
                   "소상공인", "금융", "<p>업종 무관</p>", "대구경북연구원"),
}

# 프로필: 대구 수성구 (업종 필터는 통과하도록 industry 미지정)
DAEGU_SUSEONG_PROFILE = {
    "region_sido": "대구", "region_sigungu": "수성구",
    "tax_delinquency": "없음", "overdue_status": "없음",
}

BUSAN_CAFE_PROFILE = {
    "region_sido": "부산광역시", "region_sigungu": "금정구", "industry": "카페/디저트",
    "tax_delinquency": "없음", "overdue_status": "없음",
}


def _fake_conn():
    conn = MagicMock()

    def execute(sql, params=None):
        r = MagicMock()
        r.fetchone.return_value = ROWS.get(params[0]) if params else None
        return r

    conn.execute.side_effect = execute
    cm = MagicMock()
    cm.__enter__.return_value = conn
    cm.__exit__.return_value = False
    return cm


def _run(profile, ids, top_k=5):
    ranks = [(pid, i + 1) for i, pid in enumerate(ids)]
    with patch.object(hybrid_search, "transform",
                      return_value={"bm25_query": "q", "vector_query": "q"}), \
         patch.object(hybrid_search.bm25_index, "search", return_value=ranks), \
         patch.object(hybrid_search.vector_search, "search", return_value=ranks), \
         patch.object(hybrid_search.pool, "connection", return_value=_fake_conn()):
        return hybrid_search.hybrid_match("cause", profile, top_k)


def test_region_hard_filter_excludes_other_region_before_topk():
    out = _run(BUSAN_CAFE_PROFILE, ["BUSAN-CAFE", "DAEGU-MFG"])
    ids = [m["pblanc_id"] for m in out]
    assert ids == ["BUSAN-CAFE"]  # 대구 공고는 top_k 절단 이전에 제외


def test_national_announcement_always_passes():
    out = _run(BUSAN_CAFE_PROFILE, ["NATIONAL"])
    assert [m["pblanc_id"] for m in out] == ["NATIONAL"]
    assert out[0]["evidence"].startswith("전국 대상 공고")


def test_industry_hard_filter_excludes_unrelated_restricted_industry():
    out = _run(BUSAN_CAFE_PROFILE, ["DEFENSE", "BUSAN-CAFE"])
    assert [m["pblanc_id"] for m in out] == ["BUSAN-CAFE"]  # 방산 한정 → 카페 프로필 제외


def test_evidence_is_region_industry_based_not_token_overlap():
    out = _run(BUSAN_CAFE_PROFILE, ["BUSAN-CAFE"])
    ev = out[0]["evidence"]
    assert "지역 일치(부산광역시 금정구)" in ev
    assert "업종 일치(카페/디저트 포함)" in ev
    assert "검색" not in ev and "「" not in ev  # 내부 쿼리 노출 문구 없음


def test_risk_warning_added_when_tax_delinquent_and_text_mentions_it():
    profile = {**BUSAN_CAFE_PROFILE, "tax_delinquency": "있음"}
    out = _run(profile, ["TAX-EXCL"])
    assert "⚠️ 세금체납 이력 시 배제 대상일 수 있음" in out[0]["evidence"]
    # 하지만 매칭 자체는 유지된다(경고일 뿐 하드 배제 아님)
    assert out[0]["pblanc_id"] == "TAX-EXCL"


def test_unknown_risk_status_does_not_warn():
    profile = {**BUSAN_CAFE_PROFILE, "tax_delinquency": "잘 모름"}
    out = _run(profile, ["TAX-EXCL"])
    assert "세금체납" not in out[0]["evidence"]


def test_resolved_overdue_does_not_warn():
    # "있었지만 해결"은 현재 리스크가 아니다 — "현재 연체 중"만 경고 대상.
    profile = {**BUSAN_CAFE_PROFILE, "overdue_status": "있었지만 해결"}
    out = _run(profile, ["TAX-EXCL"])
    assert "연체" not in out[0]["evidence"]


def test_empty_matches_when_nothing_passes_filter():
    out = _run(BUSAN_CAFE_PROFILE, ["DAEGU-MFG", "DEFENSE"])
    assert out == []  # 적합 공고 0건 → 빈 배열 정상 반환


def test_backward_compat_no_profile_disables_filter():
    out = _run(None, ["BUSAN-CAFE", "DAEGU-MFG"])
    assert {m["pblanc_id"] for m in out} == {"BUSAN-CAFE", "DAEGU-MFG"}  # 필터 없이 전부
    assert out[0]["evidence"]  # evidence는 여전히 생성됨(하위호환 문구)


def test_district_mismatch_excludes_other_gugun():
    # 이슈 #74: 수성구 프로필 vs '대구광역시 북구' 한정 공고 → 시/도만 같아선 부족, 제외.
    out = _run(DAEGU_SUSEONG_PROFILE, ["DAEGU-BUKGU"])
    assert out == []


def test_district_match_passes_when_gugun_equal():
    # 수성구 프로필 vs '대구광역시 수성구' 공고 → 구/군 일치로 통과.
    out = _run(DAEGU_SUSEONG_PROFILE, ["DAEGU-SUSEONG"])
    assert [m["pblanc_id"] for m in out] == ["DAEGU-SUSEONG"]
    assert "지역 일치(대구 수성구)" in out[0]["evidence"]


def test_wide_sido_announcement_passes_without_district():
    # 구/군 명시 없는 광역(시/도 단위) 공고는 기존처럼 시/도 일치로 통과(회귀 방지).
    out = _run(DAEGU_SUSEONG_PROFILE, ["DAEGU-WIDE"])
    assert [m["pblanc_id"] for m in out] == ["DAEGU-WIDE"]


def test_no_profile_sigungu_falls_back_to_sido_only():
    # 프로필에 구/군 정보가 없으면(sigungu None) 구/군 한정 공고도 시/도만으로 통과(과잉배제 방지).
    profile = {"region_sido": "대구", "tax_delinquency": "없음", "overdue_status": "없음"}
    out = _run(profile, ["DAEGU-BUKGU"])
    assert [m["pblanc_id"] for m in out] == ["DAEGU-BUKGU"]


def test_institution_name_region_not_misread_as_district():
    # 회귀(#74 재작업): region이 기관명("서울연구원")이면 "연구"의 구를 구/군으로 오탐하면 안 된다.
    # 프로필 sigungu(서초구)가 기관명에 없어도 정상적으로 시/도 일치로 통과해야 한다.
    profile = {"region_sido": "서울", "region_sigungu": "서초구",
               "tax_delinquency": "없음", "overdue_status": "없음"}
    out = _run(profile, ["SEOUL-INST"])
    assert [m["pblanc_id"] for m in out] == ["SEOUL-INST"]


def test_institution_name_region_with_sido_prefix_not_misread():
    # "대구경북연구원"도 마찬가지 — sido "대구"만으로 통과, 구/군 오탐 없음.
    out = _run(DAEGU_SUSEONG_PROFILE, ["DAEGU-INST"])
    assert [m["pblanc_id"] for m in out] == ["DAEGU-INST"]


def test_topk_cut_applies_after_filter():
    # 통과 후보 3건, top_k=2 → 2건만
    out = _run(BUSAN_CAFE_PROFILE, ["NATIONAL", "BUSAN-CAFE", "DAEGU-MFG"], top_k=2)
    assert len(out) == 2
    assert [m["pblanc_id"] for m in out] == ["NATIONAL", "BUSAN-CAFE"]
