-- 계정 단위 알림 수신 분(0~59). 기본 0분. preferred_notify_hour와 조합해
-- "몇 시 몇 분"까지 분 단위로 알림 예약을 지원한다(이슈: 시 단위만으로는
-- 정각까지 최대 59분을 기다려야 해서 세밀한 예약이 불가능했음).
ALTER TABLE app_user ADD COLUMN preferred_notify_minute SMALLINT NOT NULL DEFAULT 0
  CHECK (preferred_notify_minute BETWEEN 0 AND 59);
