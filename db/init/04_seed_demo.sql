-- 데모 페르소나: 강남 카페 사장님 (AC 검증 + 데모용)
-- 전제: 03_schema_additions.sql에서 app_user(id=1) 시드 완료

INSERT INTO business_profile (
    user_id, industry, entity_type, operating_period, monthly_revenue_band,
    employee_band, region_sido, region_sigungu, biz_status,
    market_region_code, market_industry_code
) VALUES (
    1, '카페/디저트', '개인(일반)', '3년~5년', '2000만~5000만원',
    '1~4명', '서울', '강남구', 'ACTIVE',
    'A1001', '카페/디저트'
);

-- new_competitors_500m = 5 → GTE 3 임계값 초과 → 트리거 발동
INSERT INTO market_snapshot (region_code, industry_code, metric, snapshot_date)
VALUES (
    'A1001', '카페/디저트',
    '{"new_competitors_500m": 5, "foot_traffic_delta_pct": 0}',
    CURRENT_DATE
);
