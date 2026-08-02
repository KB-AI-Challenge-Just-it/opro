"""diagnosis.py 재질문 튜닝용 골든 프로필 8종 — 업종·정보완결도·재무상태 조합을 다르게 해
재질문이 나올 만한 폭을 덮는다. test_diagnosis_rules.py(하드 룰 채점기 검증)와
scripts/eval_diagnosis_golden.py(실제 Opus 호출 베이스라인)가 같은 세트를 공유한다."""

GOLDEN_PROFILES: dict[str, dict] = {
    # revenue_basis는 onboarding/page.tsx의 ANNUAL_BANDS(["1~3년","3~7년","7년 이상"]) 규칙과
    # 동일하게 operating_period로부터 파생시켰다 — 실제 온보딩과 같은 조합만 나오게 하기 위함.
    "cafe_full": {
        "industry": "카페/디저트", "region_sido": "서울", "region_sigungu": "마포구",
        "operating_period": "1~3년", "revenue_basis": "ANNUAL",
        "monthly_revenue_band": "1억~3억", "employee_band": "1~4명",
        "funding_purpose": ["운영", "시설"], "tax_delinquency": "없음", "overdue_status": "없음",
        "funding_experience": "없음", "funding_amount_band": "1천만~5천만",
    },
    "restaurant_minimal": {
        "industry": "음식점/외식업", "region_sido": "부산", "region_sigungu": "해운대구",
        "operating_period": "2개월~1년", "revenue_basis": "MONTHLY",
        "monthly_revenue_band": "", "employee_band": "",
        "funding_purpose": [], "tax_delinquency": "잘 모름", "overdue_status": "잘 모름",
        "funding_experience": "잘 모름", "funding_amount_band": "",
    },
    "manufacturing_delinquent": {
        "industry": "제조/가공업", "region_sido": "경기", "region_sigungu": "안산시 단원구",
        "operating_period": "7년 이상", "revenue_basis": "ANNUAL",
        "monthly_revenue_band": "3천만~1억", "employee_band": "5~9명",
        "funding_purpose": ["대환"], "tax_delinquency": "있음", "overdue_status": "현재 연체 중",
        "funding_experience": "있음", "funding_amount_band": "1억 이상",
    },
    "startup_early": {
        "industry": "서비스업", "region_sido": "대구", "region_sigungu": "수성구",
        "operating_period": "2개월 미만", "revenue_basis": "MONTHLY",
        "monthly_revenue_band": "500만 미만", "employee_band": "없음(혼자)",
        "funding_purpose": ["창업"], "tax_delinquency": "없음", "overdue_status": "없음",
        "funding_experience": "없음", "funding_amount_band": "1천만 이하",
    },
    "retail_unknown_finance": {
        "industry": "소매/유통", "region_sido": "인천", "region_sigungu": "남동구",
        "operating_period": "3~7년", "revenue_basis": "ANNUAL",
        "monthly_revenue_band": "5천만~1억", "employee_band": "1~4명",
        "funding_purpose": ["잘 모르겠어요"], "tax_delinquency": "UNKNOWN_UNCONFIRMED",
        "overdue_status": "잘 모름", "funding_experience": "잘 모름", "funding_amount_band": "5천만~1억",
    },
    "lodging_high_revenue": {
        "industry": "숙박업", "region_sido": "제주", "region_sigungu": "서귀포시",
        "operating_period": "7년 이상", "revenue_basis": "ANNUAL",
        "monthly_revenue_band": "10억 이상", "employee_band": "10명 이상",
        "funding_purpose": ["시설"], "tax_delinquency": "없음", "overdue_status": "있었지만 해결",
        "funding_experience": "있음", "funding_amount_band": "1억 이상",
    },
    "education_no_region_detail": {
        "industry": "교육/학원", "region_sido": "충남", "region_sigungu": "",
        "operating_period": "1~3년", "revenue_basis": "ANNUAL",
        "monthly_revenue_band": "1천만~3천만", "employee_band": "1~4명",
        "funding_purpose": ["운영"], "tax_delinquency": "없음", "overdue_status": "없음",
        "funding_experience": "없음", "funding_amount_band": "1천만~5천만",
    },
    "etc_industry_recovering": {
        "industry": "기타", "region_sido": "전남", "region_sigungu": "여수시",
        "operating_period": "3~7년", "revenue_basis": "ANNUAL",
        "monthly_revenue_band": "500만~1천만", "employee_band": "없음(혼자)",
        "funding_purpose": ["대환", "운영"], "tax_delinquency": "없음", "overdue_status": "있었지만 해결",
        "funding_experience": "잘 모름", "funding_amount_band": "1천만~5천만",
    },
}
