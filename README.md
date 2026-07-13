# 소상공인 금융 지원 에이전트 (v1.2 기반 MVP)

상시 모니터링 → 임계값 트리거 → Claude 원인 분석 → 하이브리드 RAG 정책자금 매칭 → 리포트 push → (확장) 신청서류 초안 생성

## 모노레포 구조

```
biz-agent/
├── apps/
│   ├── api-core/      # Spring Boot 3 (Java 21) — 백엔드 전담: 프로필/리포트 CRUD, L1 수집,
│   │                  #   L2 규칙 트리거·중복방지, 파이프라인 오케스트레이션, 일일 스케줄러, push
│   ├── ai-engine/     # FastAPI (Python) — AI 전담: Haiku 스크리닝/쿼리변환,
│   │                  #   Sonnet 원인분석/리포트/초안, 하이브리드 RAG(BM25+벡터+RRF), 인덱싱
│   └── web/           # Next.js (App Router) — 온보딩 질문지, 리포트 뷰어
├── db/init/           # PostgreSQL 초기 스키마 (pgvector 포함) — 스키마 단일 소스
├── docker-compose.yml # postgres(pgvector) + chroma + 3개 앱
└── .env.example
```

## 역할 경계 (Spring = 백엔드, Python = AI)

- **Spring(api-core)이 유일한 데이터 오너**: 수집·저장·조회·트리거 판정·스케줄링·push 전부 담당
- **Python(ai-engine)은 stateless AI 서비스**: Spring이 컨텍스트(프로필·트리거·공고)를 담아 호출하면 Claude 결과만 반환. 예외적으로 인덱싱(`/index/rebuild`)만 Postgres를 직접 읽어 BM25·Chroma를 구성

## 아키텍처 ↔ 다이어그램 레이어 매핑

| 레이어 | 담당 | 위치 |
| --- | --- | --- |
| L1 데이터 소스 수집 | Spring `@Scheduled` 배치 | `api-core/.../collect/` |
| L2 트리거 (규칙 게이트: 임계값·중복방지) | Spring 결정론 룰 | `api-core/.../trigger/TriggerEngine.java` |
| L2 1차 스크리닝(선택, Haiku) | Python | `ai-engine/app/services/screening.py` |
| L3 원인 분석 + 매칭 필요 판단 (Sonnet) | Python | `ai-engine/app/services/cause_analysis.py` |
| L4 하이브리드 RAG (쿼리변환→BM25∥벡터→RRF) | Python | `ai-engine/app/services/rag/` |
| L5 리포트 생성 (Sonnet, 합성·앙상블 아님) | Python 생성 → Spring 저장·push | `report_gen.py` → `PipelineService` |
| 오케스트레이션 (L3→L4→L5 지휘) | Spring | `api-core/.../pipeline/PipelineService.java` |
| 확장(5-3) 신청서류 초안 | Python 생성 → Spring 저장 | `draft_engine.py` → `AgentController` |

## DB 역할 분담

- **PostgreSQL (+pgvector)**: 프로필, 수집 원본, 트리거 이벤트, 분석 결과, 리포트, 알림 이력(중복 방지 키)
- **Chroma**: 정책자금 공고문 임베딩 (벡터 검색 축). BM25 인덱스는 ai-engine 프로세스 내(kiwi 형태소 + rank_bm25)

## 빠른 시작

```bash
cp .env.example .env   # ANTHROPIC_API_KEY 등 채우기
docker compose up -d postgres chroma
# 각 앱 로컬 실행
cd apps/ai-engine && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
cd apps/api-core  && ./gradlew bootRun          # :8080
cd apps/web       && npm i && npm run dev       # :3000
```

## 요청 흐름

web(3000) → api-core(8080, 저장·인증) → ai-engine(8000, AI 파이프라인) → postgres/chroma
배치: Spring @Scheduled(매일 06:00) → 수집 → ai-engine /index/rebuild → 트리거 평가 → 파이프라인 → 리포트 저장·push
데모: POST /api/agent/check/{profileId} 로 즉시 실행 가능

## 아키텍처 구조도

<img width="4632" height="8192" alt="Hybrid RAG Matching Pipeline-2026-07-10-084558" src="https://github.com/user-attachments/assets/ea7b36fc-c6cb-41ca-9944-43e6b1475b1b" />


```mermaid
flowchart TB
  subgraph L1["Layer 1 · 데이터 소스"]
    A1["상권 API"]
    A2["경기지표 API"]
    A3["소비트렌드 (대체지표)"]
    A4["정책자금 DB"]
  end

  subgraph L2["Layer 2 · 모니터링 · 트리거 엔진 (규칙 기반 게이트)"]
    B1["배치 모니터링<br>Batch API 적용 · 50% 할인"]
    B0["1차 스크리닝 (선택)<br>Haiku · 저비용·고속"]
    B2{"임계값 초과?"}
    DEDUP{"최근 동일 트리거로<br>이미 알림 발송?"}
  end

  subgraph L3["Layer 3 · AI 추론 (Claude가 다음 행동까지 판단)"]
    C1["원인 분석<br>Sonnet · 추론 품질 우선"]
    NEED{"정책자금 매칭<br>필요한가? (Claude 판단)"}
  end

  subgraph L4["Layer 4 · 하이브리드 RAG 매칭 (앙상블 지점)"]
    D2["쿼리 변환<br>Haiku · 단순 변환 작업"]
    D1[("정책자금 벡터DB<br>임베딩")]
    D4[("BM25 인덱스<br>형태소 분석 토큰화")]
    Dvec["벡터 검색<br>시맨틱 유사도"]
    Dbm25["BM25 검색<br>정확 용어·숫자 매칭"]
    Dfusion{{"RRF 결합<br>두 순위를 하나로 앙상블"}}
  end

  subgraph L5["Layer 5 · 리포트 생성 · 전달 (합성 · 앙상블 아님)"]
    E1["리포트 생성<br>Sonnet · 최종 결과물 품질"]
    E2["사장님에게 Push"]
  end

  A1 --> B1
  A2 --> B1
  A3 --> B1
  A4 --> B1
  A4 -. 사전 임베딩 .-> D1
  A4 -. 형태소 분석·인덱싱 .-> D4

  B1 --> B0
  B0 --> B2
  B2 -- 미달: 다음 주기 대기 --> B1
  B2 -- 초과 --> DEDUP
  DEDUP -- 중복: 알림 생략 --> B1
  DEDUP -- 신규: 진행 --> C1

  C1 --> NEED
  NEED -- 필요 --> D2
  NEED -- 불필요: 매칭 생략 --> E1
  C1 -- 원인 텍스트는 항상 리포트에 포함 --> E1

  D2 --> Dvec
  D2 --> Dbm25
  D1 --> Dvec
  D4 --> Dbm25
  Dvec --> Dfusion
  Dbm25 --> Dfusion
  Dfusion --> E1

  E1 --> E2

  CACHE[["프롬프트 캐싱 적용<br>업종별 임계값 테이블<br>정책자금 시스템 프롬프트"]] -.-> B2
  CACHE -.-> D2
```

## 전체 ERD

스키마 단일 소스는 `db/init/*.sql` (01 기본 스키마 → 02 임계값 시드 → 03 보완: 사용자·알림·인덱스·무결성). 아래는 전체 테이블 관계도.

```mermaid
erDiagram
    app_user ||--o{ business_profile : "user_id"
    business_profile ||--o{ trigger_event : "profile_id"
    threshold_rule ||--o{ trigger_event : "rule_id"
    trigger_event ||--o{ analysis_result : "trigger_event_id"
    analysis_result ||--o{ funding_match : "analysis_id"
    policy_announcement ||--o{ funding_match : "pblanc_id"
    business_profile ||--o{ report : "profile_id"
    analysis_result ||--o{ report : "analysis_id"
    report ||--o{ application_draft : "report_id"
    policy_announcement ||--o{ application_draft : "pblanc_id"
    business_profile ||--o{ notification : "profile_id"
    report ||--o{ notification : "report_id"
    notification ||--o{ notification_delivery : "notification_id"

    app_user {
        bigserial id PK
        text email UK
        text display_name
        timestamptz created_at
    }

    business_profile {
        bigserial id PK
        bigint user_id FK
        text industry "Q1"
        text entity_type "Q2"
        text operating_period "Q3"
        text monthly_revenue_band "Q4"
        text employee_band "Q5"
        text region_sido "Q6"
        text region_sigungu "Q6"
        text_array concerns "Q7 최대 2개"
        text funding_experience "Q8"
        char biz_reg_no "Q9 숫자 10자리"
        text biz_status "ACTIVE/CLOSED/SUSPENDED"
        text market_region_code "상권 API 지역코드 (03)"
        text market_industry_code "상권 API 업종코드 (03)"
        timestamptz created_at
        timestamptz updated_at "자동 갱신 (03)"
    }

    market_snapshot {
        bigserial id PK
        text region_code
        text industry_code
        jsonb metric "경쟁강도·유동인구·매출추이"
        date snapshot_date "일 1회 UNIQUE (03)"
        timestamptz collected_at
    }

    econ_indicator {
        bigserial id PK
        text indicator_code "기준금리·물가·BSI"
        numeric value
        date observed_at
        timestamptz collected_at
    }

    policy_announcement {
        text pblanc_id PK "기업마당 공고ID upsert"
        text title
        text summary_html
        text support_field
        text target
        text region
        date apply_start
        date apply_end
        text detail_url
        text_array attachment_urls
        text_array hashtags
        jsonb raw
        timestamptz first_seen_at
        timestamptz last_seen_at
    }

    threshold_rule {
        bigserial id PK
        text industry
        text metric_key
        text operator "GT/GTE/LT/LTE/ABS_GTE"
        numeric threshold
        int window_days
        boolean enabled
    }

    trigger_event {
        bigserial id PK
        bigint profile_id FK
        bigint rule_id FK
        text metric_key
        numeric observed_value
        text dedup_key "중복 알림 게이트"
        text status "NEW/DUPLICATE_SKIPPED/PROCESSED"
        timestamptz created_at
    }

    analysis_result {
        bigserial id PK
        bigint trigger_event_id FK
        text cause_text "항상 리포트에 포함"
        boolean needs_funding_match "Claude 판단"
        text model
        timestamptz created_at
    }

    funding_match {
        bigserial id PK
        bigint analysis_id FK
        text pblanc_id FK
        int bm25_rank
        int vector_rank
        numeric rrf_score
        text evidence "왜 맞는지 근거"
    }

    report {
        bigserial id PK
        bigint profile_id FK
        bigint analysis_id FK
        text body_md
        timestamptz pushed_at
        timestamptz created_at
    }

    application_draft {
        bigserial id PK
        bigint report_id FK
        text pblanc_id FK
        jsonb sections "사업개요·신청사유 등"
        text status "DRAFT/REVIEWED/SUBMITTED"
        timestamptz created_at
    }

    notification {
        bigserial id PK
        bigint profile_id FK
        bigint report_id FK
        text type "REPORT/SYSTEM"
        text title
        text body
        text status "UNREAD/READ"
        timestamptz read_at
        timestamptz created_at
    }

    notification_delivery {
        bigserial id PK
        bigint notification_id FK
        text channel "KAKAO_MEMO/FCM/ALIMTALK"
        text status "PENDING/SENT/FAILED"
        text error
        timestamptz sent_at
        timestamptz created_at
    }
```
