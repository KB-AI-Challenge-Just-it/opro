-- 13: 죽은 기능 제거 — SbizCollector·market_context (이슈 #141)
--  SbizCollector가 채우는 market_snapshot.region_code(하드코딩된 데모값 "A1001")와
--  온보딩이 실제로 채우는 business_profile.market_region_code(빈 문자열 또는
--  OnboardingController의 목업값 "11440")가 애초에 다른 체계라 절대 매칭되지 않는다 —
--  데모 시드 프로필(04_seed_demo.sql)만 우연히 일치했다. 실사용자에게는 항상 null로
--  조용히 생략되던 기능이라(에러 없음) 걷어낸다.
--  주의(QA): 이미 초기화된 DB(pg-data 볼륨 존재)에는 이 파일이 자동 반영되지 않는다 —
--            아래와 동일한 DDL을 로컬 DB에 직접 실행해야 한다.
ALTER TABLE business_profile
  DROP COLUMN IF EXISTS market_region_code,
  DROP COLUMN IF EXISTS market_industry_code;

DROP TABLE IF EXISTS market_snapshot;
