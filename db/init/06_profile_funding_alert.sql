-- 06: 프로필 기반 정책자금 능동 매칭의 새 dedup 게이트 (이슈 #29)
--  배경: 상권/경기 임계값 기반 TriggerEngine(trigger_event dedup)을 폐지하고,
--        온보딩 프로필(업종·지역·고민)로 정책자금 공고를 능동 매칭하는 것을 유일한 트리거로 삼는다.
--  실행 순서: docker-entrypoint-initdb.d 가 파일명 알파벳순으로 01..06 를 최초 1회 실행.
--  주의(QA): pg-data/ 볼륨이 이미 존재하면 이 파일은 재적용되지 않는다
--            (initdb 는 빈 데이터 디렉토리에서만 동작). 로컬에서 이 스키마를 반영하려면
--            postgres 볼륨 재생성이 필요하다.
--
-- (profile_id, pblanc_id) 조합이 이미 있으면 재알림하지 않는다 — 파이프라인은 이 게이트를
-- 통과한 "신규 공고"에만 대해 분석·리포트·알림을 수행한다. 매일 전체 재매칭해도 결과적으로
-- 새 매칭만 통과한다(별도 diff 로직 불필요).
CREATE TABLE profile_funding_alert (
  id          BIGSERIAL PRIMARY KEY,
  profile_id  BIGINT NOT NULL REFERENCES business_profile(id),
  pblanc_id   TEXT NOT NULL REFERENCES policy_announcement(pblanc_id),
  notified_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (profile_id, pblanc_id)
);
