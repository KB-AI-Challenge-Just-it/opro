-- 05: 카카오 "나에게 보내기" 토큰 저장 (S7 · P1.5 데모 강화)
--  근거: doc/decisions/001-notification-channel-kakao.md §4-3
--  실행 순서: docker-entrypoint-initdb.d 가 파일명 알파벳순으로 01..05 를 1회 실행
--  (notification_delivery 테이블은 03_schema_additions.sql 에 이미 존재 — 여기서 건드리지 않음)
--
-- 온보딩 시 카카오 OAuth(scope: talk_message) 동의 → 액세스/리프레시 토큰을 프로필별 1행으로 저장.
-- 액세스 토큰은 수 시간 단위로 만료되므로 배치 발송 직전 refresh_token 으로 갱신한다(§5-1).
CREATE TABLE kakao_token (
  profile_id    BIGINT PRIMARY KEY REFERENCES business_profile(id),
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  refreshed_at  TIMESTAMPTZ DEFAULT now()
);
