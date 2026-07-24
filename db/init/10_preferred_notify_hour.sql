-- 10: business_profile 에 알림 수신 희망 시각(preferred_notify_hour) 추가 (이슈 #110)
--  배경: 기존 배치는 매일 06:00 에 수집 + 전 활성 프로필 매칭을 한 번에 돌렸다.
--        사용자가 07~23시 중 알림 받을 시각을 고르면, 그 시각의 hourlyMatchTrigger 만
--        해당 프로필을 매칭·알림하도록 분리한다(수집은 여전히 06:00 공용 1회).
--  실행 순서: docker-entrypoint-initdb.d 가 파일명 알파벳순으로 01..10 을 최초 1회 실행.
--  주의(QA): pg-data/ 볼륨이 이미 존재하면 이 파일은 재적용되지 않는다
--            (initdb 는 빈 데이터 디렉토리에서만 동작). 이미 배포된 DB 는 수동 마이그레이션 필요.
--  기본값 9: 마이그레이션 이전 기존 row 는 오전 9시로 채워진다.
ALTER TABLE business_profile ADD COLUMN preferred_notify_hour SMALLINT NOT NULL DEFAULT 9
  CHECK (preferred_notify_hour BETWEEN 7 AND 23);
