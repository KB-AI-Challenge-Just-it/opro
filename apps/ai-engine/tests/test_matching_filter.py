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
    # 이슈 #92 골든 케이스 — region 컬럼엔 구/군이 없고("대구광역시") title 앞부분에만 구/군이
    # 있는 실제 관찰 공고 3건(대괄호 태그 직후 또는 4자리 연도 인접에 구/군 토큰).
    "T92-BUKGU": ("[대구] 북구 2026년 하반기 소상공인 경영안정자금 지원사업 공고",
                  "2026-08-30", "http://x/11", "소상공인", "금융", "<p>업종 무관</p>", "대구광역시"),
    "T92-DONGGU": ("[대구] 2026년 동구 소상공인 경영안정자금 지원사업 공고",
                   "2026-08-30", "http://x/12", "소상공인", "금융", "<p>업종 무관</p>", "대구광역시"),
    "T92-DALSEONG": ("[대구] 달성군 2026년 소상공인 경영안정자금 지원사업 공고",
                     "2026-08-30", "http://x/13", "소상공인", "금융", "<p>업종 무관</p>", "대구광역시"),
    # 구/군 토큰 없는 정상 광역 공고 — title에 연도/구·군 없음 → 통과 유지.
    "T92-WIDE": ("[대구] 가치 업고(UP-GO) 마일리지 사업 문화공간 조성 프로그램 모집 공고",
                 "2026-08-30", "http://x/14", "소상공인", "금융", "<p>업종 무관</p>", "대구광역시"),
    # 반례 ①: "연구개발"이 좁힌 창(대괄호~연도+연도직후 한 토큰) '밖'에 있음 → 오탐 없이 통과.
    "T92-RND": ("[대구] 2026년 소상공인 R&D 연구개발 지원사업 공고",
                "2026-08-30", "http://x/15", "소상공인", "금융", "<p>업종 무관</p>", "대구광역시"),
    # 반례 ②: 창 안에 "연구"가 단독 토큰으로 들어와도 stopword로 걸러 통과(과잉 배제 방지).
    "T92-YEONGU": ("[대구] 연구 2026년 소상공인 지원사업 공고",
                   "2026-08-30", "http://x/16", "소상공인", "금융", "<p>업종 무관</p>", "대구광역시"),
    # 매칭 케이스: title 구/군이 프로필 sigungu(남구)와 일치 → 통과.
    "T92-NAMGU": ("[대구] 남구 2026년 소상공인 경영안정자금 지원사업 공고",
                  "2026-08-30", "http://x/17", "소상공인", "금융", "<p>업종 무관</p>", "대구광역시"),
    # 이슈 #99 골든: 연도 표기가 아예 없는 실제 오매칭 공고 — region="대구광역시"라 구/군이
    # 없고 title에도 연도 앵커가 없어 예전엔 과소 배제로 남구 프로필에 오매칭됐다. 대괄호
    # 태그 직후 첫 토큰이 '북구' → 폴백으로 배제돼야 한다.
    "T99-NOYEAR-BUKGU": ("[대구] 북구 먹거리골목 외식업소 디지털 주문시스템 설치 지원사업 참여업소 모집 재공고",
                         "2026-08-30", "http://x/18", "소상공인", "금융", "<p>업종 무관</p>", "대구광역시"),
    # 이슈 #99 반례: 연도도 구/군도 없는 정상 광역 공고 — 대괄호 태그 직후 첫 토큰이 '소상공인'
    # (구/군 아님)이라 폴백에서도 걸리지 않고 통과 유지(과잉 배제 방지).
    "T99-NOYEAR-WIDE": ("[대구] 소상공인 디지털 전환 지원사업",
                        "2026-08-30", "http://x/19", "소상공인", "금융", "<p>업종 무관</p>", "대구광역시"),
}

# 프로필: 대구 남구 (이슈 #92 — region 컬럼엔 구/군이 없는 타 구/군 공고를 title로 배제)
DAEGU_NAMGU_PROFILE = {
    "region_sido": "대구", "region_sigungu": "남구",
    "tax_delinquency": "없음", "overdue_status": "없음",
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


def test_match_score_full_when_all_three_checks_pass():
    # 지역 일치 + 업종 정확 일치(카페) + 리스크 경고 없음 → 3/3 = 100.
    out = _run(BUSAN_CAFE_PROFILE, ["BUSAN-CAFE"])
    assert out[0]["match_score"] == 100


def test_match_score_two_thirds_when_industry_unrestricted():
    # 전국·업종 무관 공고 → 지역 통과 + 리스크 없음이지만 "업종 제한 없음"은 미충족 → 2/3 = 67.
    out = _run(BUSAN_CAFE_PROFILE, ["NATIONAL"])
    assert out[0]["match_score"] == 67


def test_match_score_one_third_when_industry_unrestricted_and_risk_warning():
    # 업종 제한 없음 + 세금체납 경고 둘 다 미충족, 지역만 통과 → 1/3 = 33.
    profile = {**BUSAN_CAFE_PROFILE, "tax_delinquency": "있음"}
    out = _run(profile, ["TAX-EXCL"])
    assert out[0]["match_score"] == 33


def test_title_only_district_excludes_other_gugun():
    # 이슈 #92 골든: region="대구광역시"라 구/군 정보가 없지만 title 앞부분이 북구/동구/달성군을
    # 한정 → 남구 프로필에서 3건 모두 제외돼야 한다(top_k 절단 전).
    out = _run(DAEGU_NAMGU_PROFILE, ["T92-BUKGU", "T92-DONGGU", "T92-DALSEONG"])
    assert out == []


def test_title_wide_announcement_without_district_passes():
    # 구/군 토큰 없는 정상 광역 공고는 여전히 통과(회귀 방지).
    out = _run(DAEGU_NAMGU_PROFILE, ["T92-WIDE"])
    assert [m["pblanc_id"] for m in out] == ["T92-WIDE"]


def test_title_matching_district_passes():
    # title 구/군이 프로필 sigungu(남구)와 일치하면 통과.
    out = _run(DAEGU_NAMGU_PROFILE, ["T92-NAMGU"])
    assert [m["pblanc_id"] for m in out] == ["T92-NAMGU"]


def test_title_research_word_outside_window_not_misread():
    # 반례: "연구개발"이 좁힌 창 밖(연도 직후 여러 토큰 뒤)에 있으면 구/군으로 오탐하지 않고 통과.
    out = _run(DAEGU_NAMGU_PROFILE, ["T92-RND"])
    assert [m["pblanc_id"] for m in out] == ["T92-RND"]


def test_title_research_word_inside_window_filtered_by_stopword():
    # 반례: 좁힌 창 안에 "연구"가 단독 토큰으로 있어도 stopword로 걸러 통과(과잉 배제 방지).
    out = _run(DAEGU_NAMGU_PROFILE, ["T92-YEONGU"])
    assert [m["pblanc_id"] for m in out] == ["T92-YEONGU"]


def test_title_noyear_bracket_district_excludes_other_gugun():
    # 이슈 #99: 연도 앵커가 없는 제목이라도 대괄호 태그 직후 첫 토큰이 '북구'면 남구 프로필에서 제외.
    out = _run(DAEGU_NAMGU_PROFILE, ["T99-NOYEAR-BUKGU"])
    assert out == []


def test_title_noyear_wide_announcement_passes():
    # 이슈 #99 반례: 연도도 구/군도 없는 정상 광역 공고(태그 직후 '소상공인')는 통과 유지.
    out = _run(DAEGU_NAMGU_PROFILE, ["T99-NOYEAR-WIDE"])
    assert [m["pblanc_id"] for m in out] == ["T99-NOYEAR-WIDE"]


def test_topk_cut_applies_after_filter():
    # 통과 후보 3건, top_k=2 → 2건만
    out = _run(BUSAN_CAFE_PROFILE, ["NATIONAL", "BUSAN-CAFE", "DAEGU-MFG"], top_k=2)
    assert len(out) == 2
    assert [m["pblanc_id"] for m in out] == ["NATIONAL", "BUSAN-CAFE"]
