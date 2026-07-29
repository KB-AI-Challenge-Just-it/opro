-- E2E 검증용 데모 시드 (멱등 — 반복 실행 안전)
-- 전제: db/init 01→02→03 적용 완료 (app_user id=1, threshold_rule 카페/디저트 시드 존재)
-- market_snapshot·market_region_code 관련 시드는 이슈 #141로 제거됨(죽은 기능 — SbizCollector가
-- 채우는 코드와 온보딩이 채우는 코드가 애초에 다른 체계라 절대 매칭되지 않았음).

-- 1) 데모 프로필 (이대 상권 카페 페르소나 — PRD §3)
INSERT INTO business_profile
  (user_id, industry, entity_type, operating_period, monthly_revenue_band,
   employee_band, region_sido, region_sigungu, concerns, funding_experience)
SELECT 1, '카페/디저트', '개인(일반과세자)', '1~3년', '1,500만~3,000만',
       '1~2명', '서울특별시', '서대문구', ARRAY['주변 경쟁 심화','자금 조달 어려움'],
       '알아본 적은 있지만 신청은 안 해봄'
WHERE NOT EXISTS (
    SELECT 1 FROM business_profile
    WHERE region_sigungu = '서대문구' AND industry = '카페/디저트'
);

-- 2) 샘플 정책자금 공고 3건 (RAG 매칭 대상 — 시드 후 POST /index/rebuild 필수)
--    DEMO-0001·0002는 활성, DEMO-0003은 마감 처리 — rebuild_indexes()의 활성 공고
--    필터(apply_end >= CURRENT_DATE OR apply_end IS NULL) 검증용. indexed count는 2건.
INSERT INTO policy_announcement
  (pblanc_id, title, summary_html, support_field, target, region,
   apply_start, apply_end, detail_url, raw)
VALUES
 ('DEMO-0001', '소상공인 경쟁력 강화 특별자금 (경쟁 심화 업종)',
  '반경 상권 내 동일업종 경쟁 심화로 매출 감소가 우려되는 소상공인에게 저금리 운전자금을 지원합니다. 카페·외식업 우대.',
  '금융', '소상공인 (상시근로자 5인 미만)', '서울특별시',
  CURRENT_DATE - 10, CURRENT_DATE + 30,
  'https://www.bizinfo.go.kr/demo/0001', '{"demo": true}'::jsonb),
 ('DEMO-0002', '청년·초기 창업자 임대료 부담 완화 지원사업',
  '운영 3년 이내 초기 창업 소상공인의 고정비(임대료) 부담 완화를 위한 바우처 지원.',
  '금융', '창업 3년 이내 소상공인', '서울특별시',
  CURRENT_DATE - 5, CURRENT_DATE + 45,
  'https://www.bizinfo.go.kr/demo/0002', '{"demo": true}'::jsonb),
 ('DEMO-0003', '스마트상점 기술보급 사업 (마감됨 — 인덱스 제외 검증용)',
  '소상공인 점포에 스마트오더·키오스크 등 스마트기술 도입 비용을 지원합니다.',
  '기술', '소상공인', '전국',
  CURRENT_DATE - 40, CURRENT_DATE - 3,
  'https://www.bizinfo.go.kr/demo/0003', '{"demo": true}'::jsonb)
ON CONFLICT (pblanc_id) DO UPDATE SET last_seen_at = now();

-- 4) 재검증 시 dedup 게이트 초기화가 필요하면 아래 주석 해제
-- DELETE FROM trigger_event WHERE profile_id IN (SELECT id FROM business_profile WHERE region_sigungu = '서대문구' AND industry = '카페/디저트');
