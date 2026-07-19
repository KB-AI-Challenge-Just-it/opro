# 시스템 개요 · 플로우 · 기술 스택

> **이 문서의 용도**: 2026-07-19 기준 `ai-engine` / `api-core` / `web` 3서비스의 실제 코드를 근거로 전체 흐름과 사용 기술을 정리한다.
> 작업 단위별 상태·API 계약은 `doc/work_breakdown01.md`가 단일 소스이며, 로컬 실행 절차는 `doc/local_test_guide.md`가 단일 소스다. 이 문서는 그 둘을 "왜 이렇게 동작하는가" 관점에서 잇는 보조 문서다.

---

## 1. 먼저: 사용자가 이해한 플로우 확인

> "사용자가 정보를 입력하면 → API를 통해 공고를 자동으로 찾아서 해당 공고와 링크를 찾아주고 리포트를 작성해주는 플로우"

**절반만 맞다.** 온보딩 입력은 "프로필 등록"일 뿐, 그 자체로 공고 매칭이나 리포트 생성을 트리거하지 않는다. 코드상 실제 흐름은 다음과 같다:

1. 사용자가 온보딩 질문지를 제출하면 `business_profile` 행 하나가 생성될 뿐이다 (`OnboardingController.submit` → `repository.save`, 트리거 로직 없음).
2. **별도로** 매일 06:00 스케줄러(`ScheduledJobs.dailyRun`) 또는 데모용 수동 호출(`POST /api/agent/check/{profileId}`)이 그 프로필의 **상권 지표·경기지표가 임계값을 넘었는지**(`TriggerEngine.evaluate`)를 확인한다. 이건 LLM이 아니라 규칙 기반 결정론 로직이다 (예: "반경 500m 신규 경쟁점 ≥3곳", "유동인구 -15% 이상").
3. 임계값을 넘고, 최근 14일 내 동일 트리거로 이미 알림을 보낸 적이 없으면 → 그때 비로소 `PipelineService.run()`이 시작된다: Claude(Sonnet)가 원인을 분석하고, **"이 상황에 정책자금 매칭이 필요한가?"까지 Claude가 판단**한다(`needs_funding_match`).
4. 필요하다고 판단된 경우에만 하이브리드 RAG로 공고를 검색하고, 근거(`evidence`)와 함께 리포트에 포함한다. 필요 없다고 판단되면 원인 설명만 담긴 리포트가 나간다.
5. 즉 트리거의 방아쇠는 "사용자 입력"이 아니라 "그 사용자의 상권/경기 지표 변화"이고, 공고 매칭은 "항상 실행"이 아니라 "Claude가 필요하다고 판단할 때만 실행"된다.

한 줄 요약: **프로필 등록(입력) → (비동기·별도 트리거) 지표 이상 감지 → 원인 분석 → (필요시) 정책자금 매칭 → 리포트 작성 → 알림**. "입력하면 바로 공고를 찾아준다"는 온디맨드 검색 서비스가 아니라, **상시 모니터링형 경보 에이전트**에 가깝다.

---

## 2. 전체 아키텍처

```mermaid
flowchart TB
    subgraph web["web (Next.js 14, :3000)"]
        W1[온보딩 질문지<br/>app/onboarding]
        W2[리포트 목록/뷰어<br/>app/page, app/reports/id]
        W3[알림 벨<br/>NotificationBell.tsx]
    end

    subgraph spring["api-core (Spring Boot 3 / Java 21, :8080) — 유일한 데이터 오너"]
        ONB[OnboardingController]
        SCHED["ScheduledJobs<br/>(매일 06:00 cron)"]
        AGENT["AgentController<br/>/api/agent/check/id (데모 수동 트리거)"]
        TRIG[TriggerEngine<br/>규칙 기반, LLM 미사용]
        PIPE[PipelineService<br/>오케스트레이션]
        NOTI[NotificationController + Sender]
        KAKAO[Kakao OAuth/MemoSender]
        REP[ReportController]
        COLLECT["Collectors<br/>Bizinfo(구현) / ECOS·Sbiz(스텁)"]
        CLIENT[AiEngineClient]
    end

    subgraph ai["ai-engine (FastAPI/Python, :8000) — stateless AI 전용"]
        AN["/analysis (Sonnet)<br/>원인분석 + 매칭필요 판단"]
        MATCH["/matching<br/>하이브리드 RAG"]
        RPT["/report/generate (Sonnet)"]
        IDX["/index/rebuild<br/>BM25+Chroma 재구성"]
    end

    subgraph data["데이터 계층"]
        PG[(PostgreSQL 16<br/>단일 소스 스키마)]
        CHROMA[(Chroma<br/>벡터 컬렉션)]
    end

    subgraph ext["외부"]
        ANTH[Anthropic API<br/>Claude Sonnet/Haiku]
        BIZINFO[공공데이터 Bizinfo API]
        KAKAOAPI[Kakao 나에게 보내기 API]
    end

    W1 -->|POST /api/onboarding| ONB --> PG
    W2 -->|GET /api/reports| REP --> PG
    W3 -->|GET /api/notifications 30초 폴링| NOTI --> PG

    SCHED --> COLLECT --> PG
    SCHED --> CLIENT
    AGENT --> TRIG
    TRIG -->|threshold_rule vs market_snapshot/econ_indicator| PG
    TRIG --> PIPE
    PIPE --> CLIENT

    CLIENT -->|POST /analysis| AN --> ANTH
    CLIENT -->|POST /matching (필요시만)| MATCH
    CLIENT -->|POST /report/generate| RPT --> ANTH
    CLIENT -->|POST /index/rebuild| IDX

    MATCH --> PG
    MATCH --> CHROMA
    IDX --> PG
    IDX --> CHROMA

    PIPE -->|analysis_result/funding_match/report/notification INSERT| PG
    PIPE --> NOTI
    NOTI --> KAKAO --> KAKAOAPI
    COLLECT --> BIZINFO
```

### 서비스 경계 (절대 규칙)

| 서비스 | 역할 | 금지 |
| --- | --- | --- |
| **api-core** (:8080) | 유일한 데이터 오너 — 수집·저장·조회·트리거 판정·스케줄링·파이프라인 지휘·알림 | Claude API 직접 호출 금지, 반드시 `AiEngineClient` 경유 |
| **ai-engine** (:8000) | stateless AI 서비스 — Claude 호출 + RAG만 | `business_profile`/`report` 등 비즈니스 테이블 직접 조회·저장 금지 (유일한 예외: `/index/rebuild`가 `policy_announcement` 읽음) |
| **web** (:3000) | 온보딩 UI·알림·리포트 뷰어 | api-core(:8080)만 호출, ai-engine(:8000) 직접 호출 금지 |

---

## 3. 단계별 상세 플로우

### STEP A — 온보딩 (입력)
- `web/app/onboarding/page.tsx` → `POST http://localhost:8080/api/onboarding`
- `OnboardingController.submit()` → JPA `save()` → `business_profile` 테이블에 저장, id 반환.
- **주의**: web UI로 만든 프로필은 `market_region_code`/`market_industry_code`가 비어 있어(코드 매핑 TODO 상태) 트리거가 절대 붙지 않는다. 데모는 시드 프로필(id=1, `db/init/04_seed_demo.sql`)로 진행해야 함.
- 제출 후 카카오 "나에게 보내기" 동의(선택) 화면 → 동의 시 `GET /api/kakao/oauth/authorize?profileId=` 로 브라우저 리다이렉트.

### STEP B — 데이터 수집 (백그라운드, 사용자 입력과 무관)
- `ScheduledJobs.dailyRun()` (매일 06:00 KST): `BizinfoCollector`(구현됨, 정책자금 공고) + `EcosCollector`/`SbizCollector`(현재 스텁 — API 키 발급 전) 실행.
- 수집 후 `AiEngineClient.rebuildIndexes()` → ai-engine `/index/rebuild`가 `policy_announcement`를 읽어 BM25(kiwi 형태소)와 Chroma 벡터 인덱스를 재구성. **활성 공고만**(`apply_end >= CURRENT_DATE OR apply_end IS NULL`) 인덱싱 대상.

### STEP C — 트리거 평가 (경보의 방아쇠)
- 스케줄 배치가 전체 활성 프로필을 순회하거나, 데모용 `POST /api/agent/check/{profileId}`로 즉시 실행.
- `TriggerEngine.evaluate()`: 프로필의 업종 코드(`market_industry_code`)에 해당하는 `threshold_rule`을 조회 → 각 규칙의 `metric_key` 관측값을 `market_snapshot`(상권 스냅샷 JSONB) 우선, 없으면 `econ_indicator`(경기지표 변화율) 폴백으로 조회 → 임계값 비교(GT/GTE/LT/LTE/ABS_GTE).
- 조건 충족 시 `trigger_event` INSERT. 이어서 `isDuplicateAlert()`가 최근 14일 내 동일 `dedup_key`로 이미 처리된 이벤트가 있는지 확인 — 있으면 `DUPLICATE_SKIPPED`로 스킵(같은 문제로 매일 알림 폭탄 방지).
- 순수 규칙 기반이며 이 단계엔 LLM이 전혀 개입하지 않는다.

### STEP D — 원인 분석 (L3, Claude Sonnet)
- `PipelineService.run()`이 프로필 정보 + 트리거 컨텍스트(`metric_key`, `observed_value`)를 `AiEngineClient.analyze()`로 ai-engine `POST /analysis`에 전달.
- `cause_analysis.py`가 시스템 프롬프트로 Claude Sonnet(`claude-sonnet-4-6`)을 호출, "사장님이 이해할 언어로 원인 설명" + **"정책자금 매칭이 필요한가?"(`needs_funding_match`)** + `match_hint`(검색용 요약)를 JSON으로 반환.
- 결과는 `analysis_result` 테이블에 저장.

### STEP E — 정책자금 매칭 (L4, 하이브리드 RAG — needs_funding_match=true일 때만)
- `AiEngineClient.match()` → `POST /matching` → `hybrid_search.hybrid_match()`:
  1. **쿼리 변환** (Haiku, `query_transform.py`): 원인 텍스트를 BM25용 키워드 쿼리 + 벡터용 자연어 쿼리로 분리 변환.
  2. **BM25 검색** (`bm25_index.py`): kiwi 형태소 분석기로 토큰화 후 `rank_bm25.BM25Okapi`로 정확 용어/숫자 매칭 순위 산출.
  3. **벡터 검색** (`vector_search.py`): Chroma 컬렉션에 시맨틱 유사도 쿼리 (`BAAI/bge-m3` 다국어 임베딩 모델 — 한국어 지원, 1024차원).
  4. **RRF(Reciprocal Rank Fusion)**: 두 순위를 `1/(60+rank)` 합산 점수로 결합, top_k(기본 5) 선정.
  5. 각 매칭 건마다 `evidence`(왜 맞는지 근거 문장 — "키워드 검색 N위 + 의미 검색 M위으로 매칭")를 생성해 반환.
- `PipelineService`가 결과를 `funding_match` 테이블에 저장(`pblanc_id`, `bm25_rank`, `vector_rank`, `rrf_score`, `evidence`).

### STEP F — 리포트 생성 (L5, Claude Sonnet)
- `AiEngineClient.generateReport()` → `POST /report/generate` → `report_gen.py`가 Claude Sonnet으로 "① 지금 상황 ② 원인 ③ (매칭 있으면) 대응 가능한 정책자금과 근거" 구조의 마크다운(600자 이내)을 생성.
- `report` 테이블에 저장, `pushed_at` 갱신.

### STEP G — 알림
- `notification` 테이블에 INSERT (인앱 알림, `GET /api/notifications`로 폴링 노출).
- 사용자가 카카오 연동에 동의했다면 `KakaoMemoSender`가 "나에게 보내기"로 리포트 딥링크가 담긴 카카오톡 메시지도 발송 (실패해도 파이프라인·인앱 알림엔 영향 없음 — 이중으로 예외를 삼킴).
- `trigger_event` 상태를 `PROCESSED`로 갱신.

### STEP H — 사용자 확인 (web)
- `NotificationBell.tsx`가 30초 주기로 `GET /api/notifications?profileId=1&status=UNREAD` 폴링 → 새 알림이면 토스트 표시 + 벨 배지.
- 알림 클릭 → `PATCH /api/notifications/{id}/read` 후 `/reports/{reportId}`로 이동.
- `app/reports/[id]/page.tsx`가 `GET /api/reports/{id}` 호출 → 원인 설명(마크다운 렌더링) + 매칭된 공고 카드(제목·마감일·근거·원문 링크 `detailUrl`) 표시.

### (선택) STEP I — 신청서 초안 (P3, 마일스톤 후 확장 기능)
- `POST /api/agent/draft?reportId=&pblancId=` → ai-engine `/draft` (Claude Sonnet) → 사업개요·신청사유 등 섹션 초안 생성, `application_draft`에 저장. **자동 제출 기능은 의도적으로 없음** — "검토 후 직접 제출" 고지가 붙는다.

---

## 4. 기술 스택 — 어디에 무엇이 쓰이는가

| 레이어 / 위치 | 기술 | 역할 |
| --- | --- | --- |
| **web** (`apps/web`) | Next.js 14 (App Router) · React 18 · TypeScript | 온보딩 폼, 리포트 뷰어(경량 자체 마크다운 렌더러), 알림 벨(폴링) |
| **api-core** (`apps/api-core`) | Spring Boot 3.3.2 · Java 21 | REST API, `JdbcTemplate` 기반 직접 SQL(트리거·파이프라인) + JPA(프로필·리포트 엔티티 일부), `@Scheduled` cron 배치 |
| **api-core → ai-engine** | `WebClient` (Spring WebFlux, 동기 `.block()` 호출) | HTTP JSON POST 연동, PgArray→List 직렬화 새니타이즈 |
| **트리거 로직** (`TriggerEngine`) | 순수 자바 결정론 로직 | LLM 미사용. `threshold_rule` 테이블 + JSONB 연산자(`->>`)로 하드코딩 없이 파라미터화 |
| **ai-engine** (`apps/ai-engine`) | FastAPI · Python · Pydantic Settings | L2~L5 라우터, `psycopg[pool]`로 Postgres 커넥션 풀 |
| **LLM 호출** (`anthropic_client.py`) | Anthropic SDK (`anthropic>=0.34`) | 프롬프트 캐싱(`cache_control: ephemeral`)으로 반복 시스템 프롬프트 비용 절감 |
| **모델 라우팅** (`config.py`) | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — L2 스크리닝·L4 쿼리변환(저비용·단순 작업)<br/>Claude Sonnet (`claude-sonnet-4-6`) — L3 원인분석·L5 리포트·초안(추론 품질 우선) | 비용/품질 라우팅 — 판단이 필요한 작업만 Sonnet |
| **키워드 검색(BM25)** | `rank-bm25` (Okapi BM25) + `kiwipiepy`(한국어 형태소 분석) | 정확 용어·숫자(마감일·금액 등) 매칭 |
| **벡터 검색** | ChromaDB (HTTP 클라이언트) + `sentence-transformers` (`BAAI/bge-m3`, 1024차원 다국어 임베딩) | 시맨틱 유사도 — 임베딩 함수를 명시하지 않으면 Chroma 기본값(영어 특화 all-MiniLM)이 한국어를 열화시키는 문제를 회피 |
| **검색 융합** | RRF (Reciprocal Rank Fusion, k=60) | BM25 순위 + 벡터 순위를 점수 합산으로 결합 (교집합/가중합 대신 채택 — `rag-conventions` 스킬 참고) |
| **데이터베이스** | PostgreSQL 16 | 단일 데이터 오너. `db/init/01~05*.sql` 순서 적용이 스키마 단일 소스 |
| **인프라** | Docker Compose (5개 서비스: postgres, chroma, ai-engine, api-core, web) | 로컬 전체 스택 기동 |
| **알림 채널** | Kakao "나에게 보내기" API (OAuth2 + memo API) | 인앱 알림의 미러 채널, 실패해도 핵심 플로우에 영향 없도록 격리 |
| **외부 데이터 수집** | 공공데이터 Bizinfo API(구현) · ECOS·상권정보(Sbiz) API(스텁) | 정책자금 공고·경기지표·상권 스냅샷 수집 |

---

## 5. 웹 상에서 전체 플로우 테스트하는 방법

상세 명령은 `doc/local_test_guide.md`가 원본이다. 여기서는 "무엇을 확인하는 단계인지"만 요약한다 (커맨드는 그 문서를 그대로 따라가면 됨):

1. **`.env` 준비** — `cp .env.example .env` 후 `ANTHROPIC_API_KEY` 채움. 키 없이도 STEP 4의 "트리거 발동까지"는 확인 가능(리포트 생성은 Claude 호출이라 키 필요).
2. **`docker compose up -d --build`** — postgres·chroma·ai-engine·api-core·web 5개 컨테이너 기동. `curl localhost:8000/health`, `curl localhost:8080/api/reports?profileId=1`로 생존 확인.
3. **데모 시드 주입** — `.claude/skills/e2e-verify/scripts/seed_demo.sql`을 postgres에 적용 + `curl -X POST localhost:8000/index/rebuild`로 공고 인덱싱. 수집기가 스텁이라 시드 없이는 아무 것도 일어나지 않는다.
4. **웹 화면 확인** (`http://localhost:3000`) — 홈에서 "도착한 리포트 없음" 확인 → 온보딩 질문지 제출해보기(단, 이 프로필은 상권 코드가 없어 트리거는 안 붙음 — UI 흐름만 확인하는 용도).
5. **에이전트 강제 발동** — `curl -X POST localhost:8080/api/agent/check/1` (시드 프로필 1번). 이게 STEP C~G를 한 번에 실행하는 지점. 키가 있으면 감지→분석→매칭→리포트까지 수십 초 내 완주.
6. **리포트 확인** — `localhost:3000` 새로고침 → 리포트 링크 생성 확인 → 클릭해서 원인 설명 + 매칭된 정책자금(근거·마감일·링크) 확인.
7. **중복 방지 확인** — 같은 curl을 다시 실행하면 `DUPLICATE_SKIPPED` 응답 확인 (14일 dedup 윈도우).
8. **(선택) 신청서 초안** — `curl -X POST "localhost:8080/api/agent/draft?reportId=1&pblancId=DEMO-0001"`.

**웹 UI만으로 전체 파이프라인을 트리거할 방법은 현재 없다** — STEP 5(트리거 강제 발동)는 curl(또는 Postman)로만 가능하다. 이는 스케줄러가 사용자 액션이 아니라 시간/지표 기반으로 동작하도록 설계했기 때문이고, `POST /api/agent/check/{id}`는 "데모·수동 실행용"이라고 코드 주석에 명시돼 있다 (`AgentController.java:13`). web에 "지금 확인하기" 같은 버튼은 아직 없다.

---

## 6. 현재 상태에서 눈여겨볼 점 (MVP 갭)

- `market_industry_code`/`market_region_code`가 없는 프로필(웹으로 방금 만든 프로필 포함)은 트리거가 절대 발동하지 않는다 — 온보딩 API의 국세청 연동·코드 매핑이 TODO 상태(`OnboardingController.java:13`, `work_breakdown01.md` S3).
- ECOS·상권(Sbiz) 수집기가 스텁이라 실데이터로는 트리거 자체가 발동하지 않는다 — 데모는 반드시 시드 데이터 의존.
- `POST /matching`은 `needs_funding_match=true`일 때만 호출된다 — Claude의 판단에 따라 리포트에 정책자금이 아예 없을 수 있다.
