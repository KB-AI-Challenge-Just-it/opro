-- v1.2 아키텍처 기준 초기 스키마
-- pgvector 익스텐션 제거 (ADR 002): 벡터스토어는 Chroma 단일화, pgvector 미사용

-- 온보딩 프로필 (기획서 4-1 폐쇄형 질문지)
CREATE TABLE business_profile (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL,
  industry        TEXT NOT NULL,          -- Q1 카페/디저트 등
  entity_type     TEXT NOT NULL,          -- Q2 개인(일반)/개인(간이)/법인
  operating_period TEXT NOT NULL,         -- Q3 구간
  monthly_revenue_band TEXT NOT NULL,     -- Q4 구간
  employee_band   TEXT NOT NULL,          -- Q5 구간
  region_sido     TEXT NOT NULL,          -- Q6
  region_sigungu  TEXT NOT NULL,
  concerns        TEXT[] DEFAULT '{}',    -- Q7 최대 2개
  funding_experience TEXT,                -- Q8
  biz_reg_no      VARCHAR(10),            -- Q9 (국세청 상태조회 연동) — JPA String 필드 기본 매핑(VARCHAR)과 일치시킴
  biz_status      TEXT DEFAULT 'ACTIVE',  -- 폐업 시 모니터링 중단
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- L1: 수집 원본 ---------------------------------------------------
CREATE TABLE market_snapshot (           -- 상권 API
  id BIGSERIAL PRIMARY KEY,
  region_code TEXT NOT NULL,
  industry_code TEXT NOT NULL,
  metric JSONB NOT NULL,                 -- 경쟁강도/유동인구/매출추이 등
  collected_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE econ_indicator (            -- ECOS/KOSIS
  id BIGSERIAL PRIMARY KEY,
  indicator_code TEXT NOT NULL,          -- 기준금리, 물가, BSI ...
  value NUMERIC NOT NULL,
  observed_at DATE NOT NULL,
  collected_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (indicator_code, observed_at)
);

CREATE TABLE policy_announcement (       -- 기업마당 정책자금
  pblanc_id TEXT PRIMARY KEY,            -- 공고ID 기준 upsert (일일 델타)
  title TEXT NOT NULL,
  summary_html TEXT,
  support_field TEXT,
  target TEXT,
  region TEXT,
  apply_start DATE,
  apply_end DATE,
  detail_url TEXT,
  attachment_urls TEXT[],
  hashtags TEXT[],
  raw JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at  TIMESTAMPTZ DEFAULT now()
);

-- L2: 임계값 테이블 + 트리거/알림 이력 -----------------------------
CREATE TABLE threshold_rule (
  id BIGSERIAL PRIMARY KEY,
  industry TEXT NOT NULL,                -- 업종별 임계값 (프롬프트 캐싱 대상 테이블)
  metric_key TEXT NOT NULL,              -- 예: new_competitors_500m
  operator TEXT NOT NULL,                -- GT / LT / DELTA_GT ...
  threshold NUMERIC NOT NULL,
  window_days INT DEFAULT 30,
  enabled BOOLEAN DEFAULT true
);

CREATE TABLE trigger_event (
  id BIGSERIAL PRIMARY KEY,
  profile_id BIGINT REFERENCES business_profile(id),
  rule_id BIGINT REFERENCES threshold_rule(id),
  metric_key TEXT NOT NULL,
  observed_value NUMERIC,
  dedup_key TEXT NOT NULL,               -- "최근 동일 트리거 이미 발송?" 게이트
  status TEXT DEFAULT 'NEW',             -- NEW / DUPLICATE_SKIPPED / PROCESSED
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_trigger_dedup ON trigger_event (profile_id, dedup_key, created_at DESC);

-- L3~L5: 분석·매칭·리포트 ------------------------------------------
CREATE TABLE analysis_result (
  id BIGSERIAL PRIMARY KEY,
  trigger_event_id BIGINT REFERENCES trigger_event(id),
  cause_text TEXT NOT NULL,              -- 원인 텍스트는 항상 리포트에 포함
  needs_funding_match BOOLEAN NOT NULL,  -- Claude 판단
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE funding_match (
  id BIGSERIAL PRIMARY KEY,
  analysis_id BIGINT REFERENCES analysis_result(id),
  pblanc_id TEXT REFERENCES policy_announcement(pblanc_id),
  bm25_rank INT,
  vector_rank INT,
  rrf_score NUMERIC,                     -- RRF 결합 점수
  evidence TEXT                          -- "왜 맞는지" 근거 문장
);

CREATE TABLE report (
  id BIGSERIAL PRIMARY KEY,
  profile_id BIGINT REFERENCES business_profile(id),
  analysis_id BIGINT REFERENCES analysis_result(id),
  body_md TEXT NOT NULL,
  pushed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 확장(5-3): 신청서류 초안
CREATE TABLE application_draft (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT REFERENCES report(id),
  pblanc_id TEXT REFERENCES policy_announcement(pblanc_id),
  sections JSONB NOT NULL,               -- {사업개요, 신청사유, 활용계획, 기대효과 ...}
  status TEXT DEFAULT 'DRAFT',           -- 검토·수정 후 사용자가 직접 제출
  created_at TIMESTAMPTZ DEFAULT now()
);
