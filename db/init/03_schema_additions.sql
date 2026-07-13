-- 03: 01_schema.sql 보완 (아키텍처 어드바이저 검토 반영 — 필수·권장 판정 항목만 포함)
--  근거: 의존성 그래프 P0 "DB 스키마 확정 — notification 테이블 포함",
--        TriggerEngine.latestMetric()의 market_snapshot 조회 경로, 수집 멱등성
--  실행 순서: docker-entrypoint-initdb.d 가 01 → 02 → 03 순으로 1회 실행
--  보류 판정으로 제외된 것: policy_announcement 인덱스(매칭은 in-process BM25/Chroma라 SQL 필터 없음),
--    funding_match UNIQUE(현재 플로우상 중복 생성 불가), job_run 배치 이력(데모는 수동 실행 + 로그로 충분)

-- ─────────────────────────────────────────────────────────
-- 1) 사용자 — business_profile.user_id 의 참조 대상 (01에서 누락)
--    인증은 MVP 범위 밖. web 온보딩이 항상 userId=1 을 보내므로(page.tsx)
--    데모 계정 1건을 시드해 NOT NULL 컬럼과 FK 무결성을 일치시킨다
-- ─────────────────────────────────────────────────────────
CREATE TABLE app_user (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT UNIQUE,
  display_name TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

INSERT INTO app_user (email, display_name) VALUES ('demo@biz-agent.local', '데모 사장님');

ALTER TABLE business_profile
  ADD CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES app_user(id);

-- ─────────────────────────────────────────────────────────
-- 2) 알림 [필수] — 의존성 그래프 P0 명시 항목.
--    NOTI(insert) → POLL(GET /api/notifications) → NOTI_UI(벨·토스트) 트랙 전체가 의존.
--    report_id: 알림 클릭 → 리포트 뷰어 이동 경로
-- ─────────────────────────────────────────────────────────
CREATE TABLE notification (
  id          BIGSERIAL PRIMARY KEY,
  profile_id  BIGINT NOT NULL REFERENCES business_profile(id),
  report_id   BIGINT REFERENCES report(id),
  type        TEXT NOT NULL DEFAULT 'REPORT'
              CHECK (type IN ('REPORT', 'SYSTEM')),
  title       TEXT NOT NULL,
  body        TEXT,
  status      TEXT NOT NULL DEFAULT 'UNREAD'
              CHECK (status IN ('UNREAD', 'READ')),
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);
-- 폴링 쿼리 전용: WHERE profile_id = ? AND status = 'UNREAD' ORDER BY created_at DESC
CREATE INDEX idx_notification_poll ON notification (profile_id, status, created_at DESC);

-- 채널별 발송 이력 — P1.5 카카오 나에게 보내기, P3 FCM·알림톡 승계 대비
CREATE TABLE notification_delivery (
  id              BIGSERIAL PRIMARY KEY,
  notification_id BIGINT NOT NULL REFERENCES notification(id),
  channel         TEXT NOT NULL CHECK (channel IN ('KAKAO_MEMO', 'FCM', 'ALIMTALK')),
  status          TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  error           TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────
-- 3) business_profile 보강
--    (a) [필수] 상권 API 코드 매핑: 프로필의 한글 라벨(region_sido/industry)만으로는
--        market_snapshot(region_code, industry_code)를 조회할 수 없음 — latestMetric() 필수 경로.
--        02 시드 임계값이 상권 지표(new_competitors_500m 등) 위주라 데모에 반드시 필요.
--        nullable — 데모 페르소나 프로필만 채워도 동작
--    (b) biz_status CHECK: 스케줄러가 WHERE biz_status='ACTIVE' 로 모니터링 대상을 고르므로
--        오타 값이 들어가면 조용히 모니터링에서 빠진다 — DB에서 차단
--    (c) updated_at 자동 갱신: JPA·JdbcTemplate 어느 경로로 갱신해도 동작하도록 DB 트리거로.
--        (별도 코드 픽스: BusinessProfile.createdAt 은 @CreationTimestamp 필요 — doc/work_breakdown01.md 참고)
-- ─────────────────────────────────────────────────────────
ALTER TABLE business_profile
  ADD COLUMN market_region_code   TEXT,   -- 소진공 상권정보 API 상권/행정동 코드
  ADD COLUMN market_industry_code TEXT;   -- 소진공 상권정보 API 업종코드

ALTER TABLE business_profile
  ADD CONSTRAINT chk_biz_status CHECK (biz_status IN ('ACTIVE', 'CLOSED', 'SUSPENDED'));

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profile_updated
  BEFORE UPDATE ON business_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────
-- 4) market_snapshot [권장] — econ_indicator 의 UNIQUE(indicator_code, observed_at) 패턴 미러.
--    일 1회 수집 멱등성 + latestMetric() 최신 지표 조회 인덱스
-- ─────────────────────────────────────────────────────────
ALTER TABLE market_snapshot
  ADD COLUMN snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE market_snapshot
  ADD CONSTRAINT uq_market_snapshot_daily UNIQUE (region_code, industry_code, snapshot_date);

CREATE INDEX idx_market_snapshot_lookup
  ON market_snapshot (region_code, industry_code, collected_at DESC);

-- ─────────────────────────────────────────────────────────
-- 5) 상태 무결성 · 조회 인덱스 (AI 하네스가 raw SQL 로 상태값을 쓰는 지점만 최소한으로)
-- ─────────────────────────────────────────────────────────
-- TriggerEngine 이 JdbcTemplate 로 직접 쓰는 상태값 — 오타 시 dedup 게이트가 무력화됨
ALTER TABLE trigger_event
  ADD CONSTRAINT chk_trigger_status
  CHECK (status IN ('NEW', 'DUPLICATE_SKIPPED', 'PROCESSED'));

-- GET /api/reports?profileId= (findByProfileIdOrderByCreatedAtDesc) 실쿼리 대응
CREATE INDEX idx_report_profile ON report (profile_id, created_at DESC);
