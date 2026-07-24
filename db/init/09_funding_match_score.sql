-- 09: funding_match 에 매칭 적합도 점수(match_score) 추가 (이슈 #89)
--  배경: ai-engine hybrid_match() 가 각 매칭 dict 에 match_score(정수 0~100)를 반환한다 —
--        지역/업종/리스크 3개 체크리스트 충족률 기반 적합도. Spring 은 이 값을 그대로
--        funding_match 에 저장하고 리포트 상세 조회에 노출한다.
--  실행 순서: docker-entrypoint-initdb.d 가 파일명 알파벳순으로 01..09 를 최초 1회 실행.
--  주의(QA): pg-data/ 볼륨이 이미 존재하면 이 파일은 재적용되지 않는다
--            (initdb 는 빈 데이터 디렉토리에서만 동작). 이미 배포된 DB 는 수동 마이그레이션 필요.
--  nullable: 마이그레이션 이전에 생성된 기존 row 는 match_score 가 NULL 로 남는다.
ALTER TABLE funding_match ADD COLUMN match_score SMALLINT;
