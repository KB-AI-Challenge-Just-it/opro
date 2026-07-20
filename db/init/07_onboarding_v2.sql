-- 07: 온보딩 v2 — doc/onboarding.md 질문 흐름으로 전면 교체 (기존 Q1~Q9 폐쇄형 질문지 대체).
--  배경: entity_type(Q2)은 새 플로우에서 더 이상 묻지 않아 NOT NULL 제약을 해제한다.
--        concerns(TEXT[])는 새 buildQuery가 fundingPurpose/체납·연체 신호로 대체하므로
--        컬럼은 남기되(마이그레이션 리스크 최소화) 새 코드에서 read/write하지 않는다.
--        신규 컬럼은 화면4(매출 기준 자동분기)·화면5(체납)·화면6(연체)·화면7(수혜이력 유지)·
--        화면8(자금용도, 신규 buildQuery 핵심 입력)·화면9(희망금액)에 대응한다.
--  실행 순서: docker-entrypoint-initdb.d 가 파일명 알파벳순으로 01..07 실행 (initdb-only-on-empty-volume 은 06 참고).
ALTER TABLE business_profile ALTER COLUMN entity_type DROP NOT NULL;

ALTER TABLE business_profile ADD COLUMN nts_verified BOOLEAN DEFAULT false;         -- 국세청 상태조회 배지 (목업 응답에서 true)
ALTER TABLE business_profile ADD COLUMN revenue_basis TEXT DEFAULT 'ANNUAL';        -- 'ANNUAL' | 'MONTHLY' (업력 1년 미만 자동 전환)
ALTER TABLE business_profile ADD COLUMN tax_delinquency TEXT;                       -- NONE / YES / UNKNOWN_CONFIRMED / UNKNOWN_UNCONFIRMED
ALTER TABLE business_profile ADD COLUMN overdue_status TEXT;                        -- NONE / RESOLVED / CURRENT / UNKNOWN_...
ALTER TABLE business_profile ADD COLUMN funding_purpose TEXT[] DEFAULT '{}';        -- 운영/시설/창업/대환/잘모름 (복수선택, 신규 buildQuery 핵심 입력)
ALTER TABLE business_profile ADD COLUMN funding_amount_band TEXT;                   -- 희망 자금 규모 구간
