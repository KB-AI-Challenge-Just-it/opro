-- 데모 페르소나: 강남 카페 사장님 (AC 검증 + 데모용)
-- 전제: 03_schema_additions.sql에서 app_user(id=1) 시드 완료

INSERT INTO business_profile (
    user_id, industry, entity_type, operating_period, monthly_revenue_band,
    employee_band, region_sido, region_sigungu, biz_status
) VALUES (
    1, '카페/디저트', '개인(일반)', '3년~5년', '2000만~5000만원',
    '1~4명', '서울', '강남구', 'ACTIVE'
);
