-- ⚠️⚠️ 배포 순서 주의: 이 DDL을 "새 jar보다 먼저" 적용해야 한다. ⚠️⚠️
--   새 코드는 policy_announcement.source를 조회·삽입한다:
--     · ReportController 매칭 쿼리가 pa.source를 SELECT → 컬럼이 없으면 BadSqlGrammarException으로
--       GET /api/reports/{id} 가 500. 리포트 뷰어(핵심 플로우)가 통째로 죽는다.
--     · BizinfoCollector INSERT가 source를 명시 → 일일 수집도 실패.
--   JPA ddl-auto: validate는 이걸 못 잡는다(엔티티↔테이블만 검증하고 쿼리↔테이블은 안 본다).
--   즉 앱은 정상 기동한 뒤 "요청이 들어올 때" 터진다. 반드시 DDL 먼저.
--
-- 공고 출처 구분 컬럼 — 기업마당(BIZINFO) 외에 대구창업허브(DAEGU_DASH) 수집기가 추가되면서,
-- 같은 policy_announcement 테이블에 서로 다른 출처의 공고가 섞이게 됐다. 프론트가 출처 배지를
-- 그리고(ReportController가 pa.source를 매칭 응답에 실어 내린다), 운영 중 출처별 적재량을
-- 확인할 수 있도록 값을 명시적으로 남긴다.
--
-- 값 도메인: 'BIZINFO' | 'DAEGU_DASH'
--   - pblanc_id 충돌은 수집기 쪽 접두사로 막는다(DAEGU_DASH는 'DAEGU_' + project_id).
--
-- ⚠️ 이미 배포된 DB 주의: db/init/*.sql은 컨테이너 초기 기동 시 1회만 실행된다.
--    이미 데이터가 들어있는 DB에는 이 파일이 자동 적용되지 않으므로 아래를 수동 실행할 것:
--      docker compose exec -T postgres psql -U bizagent -d bizagent < db/init/14_announcement_source.sql
--    (IF NOT EXISTS라 재실행해도 안전하다.)

-- 기존 행은 전부 기업마당 수집분이므로 기본값 'BIZINFO'가 곧 정확한 백필 값이다.
-- PG11+ 에서 DEFAULT 있는 NOT NULL 컬럼 추가는 테이블 재작성 없이 카탈로그만 갱신한다.
ALTER TABLE policy_announcement
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'BIZINFO';

COMMENT ON COLUMN policy_announcement.source IS '공고 출처: BIZINFO(기업마당) | DAEGU_DASH(대구창업허브)';

-- 인덱스는 두지 않는다 — 카디널리티가 2뿐이고, 현재 조회 경로(ReportController)는 이 컬럼을
-- 투영(SELECT)만 하고 필터 조건으로 쓰지 않는다. 출처별 필터가 실제로 생기면 그때 추가할 것.
