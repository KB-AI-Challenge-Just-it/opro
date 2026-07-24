-- 계정 단위 알림 수신 시간 (07~23시). 기본 09시.
-- 질문지(business_profile)마다가 아니라 계정(app_user) 전체에 1회 설정.
ALTER TABLE app_user ADD COLUMN preferred_notify_hour SMALLINT NOT NULL DEFAULT 9
  CHECK (preferred_notify_hour BETWEEN 7 AND 23);
