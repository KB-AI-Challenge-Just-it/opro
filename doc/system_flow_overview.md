# 시스템 개요 · 플로우 · 기술 스택

> **이 문서의 용도**: `ai-engine` / `api-core` / `web` 3서비스의 전체 흐름과 사용 기술을 정리한다.
> 작업 단위별 상태·API 계약은 `doc/work_breakdown01.md`가 단일 소스이며, 로컬 실행 절차는 `doc/local_test_guide.md`가 단일 소스다. 이 문서는 그 둘을 "왜 이렇게 동작하는가" 관점에서 잇는 보조 문서다.

> ⚠️ **2026-07-19 개편 반영 — 목표 아키텍처 (구현 전)**: 이 문서는 이슈 [#29](https://github.com/KB-AI-Challenge-Just-it/opro/issues/29)에서 결정된 **목표 구조**를 서술한다. 실제 코드(`TriggerEngine.java`, `threshold_rule` 등)는 아직 개편 이전 버전(상권/경기 지표 임계값 트리거)으로 동작 중이다. 구현 착수 전 설계 스냅샷으로 취급할 것 — "코드가 이렇게 동작한다"가 아니라 "코드가 이렇게 동작하도록 바꾼다"는 문서다. 개편 전 구조가 필요하면 git 히스토리의 이전 버전을 참고.

---

## 1. 플로우 확인

> "사용자가 정보를 입력하면 → API를 통해 공고를 자동으로 찾아서 해당 공고와 링크를 찾아주고 리포트를 작성해주는 플로우"

**개편 후엔 이 이해가 맞다.** (개편 전에는 "지표 변화가 방아쇠"였고 온보딩 입력은 프로필 저장에 그쳤지만, 이슈 #29로 그 지표 임계값 트리거를 폐지하고 아래 구조로 바꾼다.)

1. 사용자가 온보딩 질문지를 제출하면 `business_profile`이 생성되고, **그 직후(동기) 프로필 기반 매칭이 바로 실행**된다 — 업종·지역·고민(Q7)으로 조립한 쿼리를 하이브리드 RAG(`/matching`)에 그대로 태운다. 별도의 "원인 텍스트"나 지표 관측값이 있어야 시작되는 게 아니다.
2. 매칭된 공고가 있으면 Claude(Sonnet)가 "왜 이 프로필에 이 공고가 맞는지" 설명을 생성하고, 리포트로 만들어 알림을 보낸다. 매칭이 없으면 알림 없이 조용히 끝난다.
3. **이후에도 계속 모니터링한다**: 매일 배치가 새 정책자금 공고를 수집·인덱싱한 뒤, **신규/변경된 공고만** 대상으로 전체 활성 프로필을 다시 매칭한다. 이미 그 프로필에게 알려준 공고(프로필·공고 조합 이력)는 다시 알리지 않는다.
4. 상권/경기 지표 임계값 감시(구 `TriggerEngine`)는 트리거 경로에서 제거된다 — "경영 위기 감지"가 아니라 "당신에게 맞는 자금이 있다/새로 나왔다"가 유일한 트리거다.

한 줄 요약: **온보딩 입력 → (동기) 프로필 기반 즉시 매칭 → 리포트·알림 → (배치) 신규 공고 등록 시 재매칭 → 신규 매칭 시 알림**. 온디맨드 1회 검색이 아니라 **프로필 기반 상시 매칭 모니터링 에이전트**다.

---

## 2. 전체 아키텍처 (목표)

```mermaid
flowchart TB
    subgraph web["web (Next.js 14, :3000)"]
        W1[온보딩 질문지<br/>app/onboarding]
        W2[리포트 목록/뷰어<br/>app/page, app/reports/id]
        W3[알림 벨<br/>NotificationBell.tsx]
    end

    subgraph spring["api-core (Spring Boot 3 / Java 21, :8080) — 유일한 데이터 오너"]
        ONB[OnboardingController]
        SCHED["ScheduledJobs<br/>(매일 06:00 cron: 수집→인덱싱→신규공고 재매칭)"]
        MATCHTRIG["ProfileMatchTrigger (신설)<br/>온보딩 직후 1회성 + 신규공고 재매칭"]
        DEDUP[("profile_funding_alert (신설)<br/>프로필×공고 알림 이력")]
        PIPE[PipelineService<br/>오케스트레이션]
        NOTI[NotificationController + Sender]
        KAKAO[Kakao OAuth/MemoSender]
        REP[ReportController]
        COLLECT["Collectors<br/>Bizinfo(구현) / Sbiz(상권, 근거 보강용)"]
        CLIENT[AiEngineClient]
    end

    subgraph ai["ai-engine (FastAPI/Python, :8000) — stateless AI 전용"]
        FIT["/analysis (Sonnet, 역할 재정의)<br/>'왜 이 공고가 프로필에 맞는지' 설명"]
        MATCH["/matching<br/>하이브리드 RAG (프로필 필드 직접 쿼리)"]
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
    ONB -->|저장 직후 동기 호출| MATCHTRIG
    W2 -->|GET /api/reports| REP --> PG
    W3 -->|GET /api/notifications 30초 폴링| NOTI --> PG

    SCHED --> COLLECT --> PG
    SCHED --> CLIENT
    SCHED -->|신규/변경 공고만 대상| MATCHTRIG
    MATCHTRIG -->|프로필 필드로 쿼리 조립| PIPE
    MATCHTRIG -.->|이미 알린 조합인지 확인| DEDUP
    PIPE --> CLIENT

    CLIENT -->|POST /matching| MATCH
    CLIENT -->|POST /analysis (매칭 있을 때만)| FIT --> ANTH
    CLIENT -->|POST /report/generate| RPT --> ANTH
    CLIENT -->|POST /index/rebuild| IDX

    MATCH --> PG
    MATCH --> CHROMA
    IDX --> PG
    IDX --> CHROMA

    PIPE -->|funding_match/report/notification INSERT + DEDUP 기록| PG
    PIPE --> NOTI
    NOTI --> KAKAO --> KAKAOAPI
    COLLECT --> BIZINFO
```

### 서비스 경계 (절대 규칙 — 개편과 무관하게 유지)

| 서비스 | 역할 | 금지 |
| --- | --- | --- |
| **api-core** (:8080) | 유일한 데이터 오너 — 수집·저장·조회·트리거 판정·스케줄링·파이프라인 지휘·알림 | Claude API 직접 호출 금지, 반드시 `AiEngineClient` 경유 |
| **ai-engine** (:8000) | stateless AI 서비스 — Claude 호출 + RAG만 | `business_profile`/`report` 등 비즈니스 테이블 직접 조회·저장 금지 (유일한 예외: `/index/rebuild`가 `policy_announcement` 읽음) |
| **web** (:3000) | 온보딩 UI·알림·리포트 뷰어 | api-core(:8080)만 호출, ai-engine(:8000) 직접 호출 금지 |

---

## 3. 단계별 상세 플로우 (목표)

### STEP A — 온보딩 + 즉시 매칭
- `web/app/onboarding/page.tsx` → `POST http://localhost:8080/api/onboarding` → `business_profile` 저장.
- **(신설)** 저장 직후 동기로 `ProfileMatchTrigger`가 실행된다: 업종(`industry`)·지역(`region_sido`/`region_sigungu`)·고민(`concerns`, Q7)을 조합한 쿼리를 그대로 `/matching`에 전달. Claude 호출이 포함돼 응답이 수 초~수십 초 걸릴 수 있음(MVP 규모라 동기 허용, 지연이 문제되면 추후 비동기 전환).
- 제출 후 카카오 "나에게 보내기" 동의(선택) 화면은 기존과 동일.

### STEP B — 데이터 수집 + 인덱싱 (배치, 사용자 입력과 무관)
- `ScheduledJobs.dailyRun()` (매일 06:00 KST): `BizinfoCollector`(정책자금 공고) 실행. `SbizCollector`(상권 데이터)는 트리거 용도로는 더 이상 쓰지 않지만, 매칭 근거 보강 자료로 남긴다(§6 참고).
- 수집 후 `/index/rebuild`가 활성 공고(`apply_end >= CURRENT_DATE OR apply_end IS NULL`)를 BM25(kiwi 형태소)·Chroma 벡터 인덱스로 재구성.

### STEP C — 신규 공고 재매칭 (배치 트리거)
- 인덱싱 직후, **이번 회차에 새로 들어오거나 갱신된 공고**(`policy_announcement.first_seen_at`/`last_seen_at` 기준)만 골라 전체 활성 프로필(`biz_status='ACTIVE'`) 대상으로 재매칭 실행.
- 각 프로필-공고 매칭 결과를 `profile_funding_alert`(신설 이력 테이블)와 대조해 **이미 알린 조합이면 스킵**, 신규 조합이면 진행.
- 순수 매칭 트리거이며 지표 임계값·LLM 판단 없이 "새로 매칭되는 공고가 있는가"만 본다.

### STEP D — 정책자금 매칭 (L4, 하이브리드 RAG — 변경 없음, 입력만 바뀜)
- `AiEngineClient.match()` → `POST /matching` → `hybrid_search.hybrid_match()`. 내부 로직(쿼리변환 → BM25 ∥ 벡터 → RRF)은 그대로 재사용하되, **입력이 `cause_text`(원인분석 결과)가 아니라 프로필 필드 조합**으로 바뀐다.
  1. **쿼리 변환** (Haiku): 이제 "프로필 요약"을 BM25용 키워드 쿼리 + 벡터용 자연어 쿼리로 변환 (기존 로직 그대로 재사용 가능 — 입력 텍스트만 바뀜).
  2. **BM25 검색**: kiwi 형태소 분석 + `rank_bm25.BM25Okapi`.
  3. **벡터 검색**: Chroma + `BAAI/bge-m3`.
  4. **RRF 융합**: `1/(60+rank)` 합산, top_k(기본 5).
  5. `evidence`(왜 맞는지 근거 문장) 생성은 그대로.

### STEP E — 적합성 설명 (L3 재정의, Claude Sonnet — 매칭 있을 때만)
- 기존 "원인 분석"(지표가 왜 이렇게 나왔는지)에서 **"이 공고가 왜 이 프로필에 맞는지" 설명**으로 역할이 바뀐다.
- 입력: 프로필 + 매칭된 공고 목록 (+ 선택적으로 `market_snapshot`의 상권 데이터를 보조 근거로 포함 — 예: "이 상권은 경쟁이 치열해 경영안정자금이 특히 유효").
- 매칭이 없으면 이 단계 자체가 생략된다(알림도 안 나감).

### STEP F — 리포트 생성 (L5, Claude Sonnet — 변경 없음)
- `report_gen.py`가 "① 매칭된 공고 안내 ② 왜 맞는지 근거" 구조의 마크다운을 생성, `report` 테이블에 저장.

### STEP G — 알림 + 이력 기록
- `notification` INSERT (인앱), 카카오 동의자는 `KakaoMemoSender`로 미러 발송 — 기존과 동일.
- **(신설)** `profile_funding_alert`에 (profile_id, pblanc_id) 기록 → 다음 배치에서 동일 조합 중복 알림 방지.

### STEP H — 사용자 확인 (web, 변경 없음)
- `NotificationBell.tsx` 30초 폴링 → 토스트/배지 → 클릭 시 리포트 뷰어 이동.
- `app/reports/[id]/page.tsx`가 적합성 설명 + 매칭된 공고 카드(제목·마감일·근거·원문 링크) 표시.

### (선택) STEP I — 신청서 초안 (P3, 변경 없음)
- `POST /api/agent/draft?reportId=&pblancId=` → ai-engine `/draft` → 섹션 초안 생성. 자동 제출 없음, "검토 후 직접 제출" 고지 유지.

---

## 4. 기술 스택 — 어디에 무엇이 쓰이는가

| 레이어 / 위치 | 기술 | 역할 |
| --- | --- | --- |
| **web** (`apps/web`) | Next.js 14 (App Router) · React 18 · TypeScript | 온보딩 폼, 리포트 뷰어(경량 자체 마크다운 렌더러), 알림 벨(폴링) |
| **api-core** (`apps/api-core`) | Spring Boot 3.3.2 · Java 21 | REST API, `JdbcTemplate` 기반 직접 SQL + JPA(프로필·리포트 엔티티 일부), `@Scheduled` cron 배치 |
| **api-core → ai-engine** | `WebClient` (Spring WebFlux, 동기 `.block()` 호출) | HTTP JSON POST 연동, PgArray→List 직렬화 새니타이즈 |
| **트리거 로직** (`ProfileMatchTrigger`, 신설) | 순수 자바 로직, LLM 미사용 | "새로 매칭되는 (프로필, 공고) 조합이 있는가"만 판정. `profile_funding_alert` 이력 테이블로 dedup — 지표 임계값 규칙(`threshold_rule`) 없이 동작 |
| **ai-engine** (`apps/ai-engine`) | FastAPI · Python · Pydantic Settings | L3~L5 라우터, `psycopg[pool]`로 Postgres 커넥션 풀 |
| **LLM 호출** (`anthropic_client.py`) | Anthropic SDK (`anthropic>=0.34`) | 프롬프트 캐싱(`cache_control: ephemeral`)으로 반복 시스템 프롬프트 비용 절감 |
| **모델 라우팅** (`config.py`) | Claude Haiku 4.5 — L4 쿼리변환(저비용·단순 작업)<br/>Claude Sonnet — L3 적합성 설명·L5 리포트·초안(추론 품질 우선) | 비용/품질 라우팅 |
| **키워드 검색(BM25)** | `rank-bm25` (Okapi BM25) + `kiwipiepy`(한국어 형태소 분석) | 정확 용어·숫자(마감일·금액 등) 매칭 |
| **벡터 검색** | ChromaDB (HTTP 클라이언트) + `sentence-transformers` (`BAAI/bge-m3`, 1024차원 다국어 임베딩) | 시맨틱 유사도 — 한국어 특화 임베딩 명시로 기본값(영어 특화) 열화 회피 |
| **검색 융합** | RRF (Reciprocal Rank Fusion, k=60) | BM25 순위 + 벡터 순위를 점수 합산으로 결합 |
| **데이터베이스** | PostgreSQL 16 | 단일 데이터 오너. `db/init/01~05*.sql` 순서 적용이 스키마 단일 소스 (+ 신설 `profile_funding_alert`) |
| **인프라** | Docker Compose (5개 서비스: postgres, chroma, ai-engine, api-core, web) | 로컬 전체 스택 기동 |
| **알림 채널** | Kakao "나에게 보내기" API (OAuth2 + memo API) | 인앱 알림의 미러 채널, 실패해도 핵심 플로우에 영향 없도록 격리 |
| **외부 데이터 수집** | 공공데이터 Bizinfo API(구현) · Sbiz 상권정보 API(매칭 근거 보강용으로 격하) | 정책자금 공고·상권 스냅샷 수집 |

---

## 5. 웹 상에서 전체 플로우 테스트하는 방법 (목표 — 구현 후 갱신 필요)

개편 완료 후에는 `doc/local_test_guide.md`의 STEP 2~7(수동 curl 트리거)이 아래처럼 바뀔 것으로 예상된다 — **구현 착수 시 그 문서도 함께 갱신할 것**:

1. `.env` 준비, `docker compose up -d --build`는 동일.
2. 데모 공고 시드 + `/index/rebuild`는 동일.
3. **웹 UI에서 온보딩 질문지 제출** → 그 자리에서(동기) 프로필 기반 매칭이 실행되고, 매칭되면 곧바로 리포트가 생긴다 — 개편 전과 달리 **`curl /api/agent/check/1` 같은 별도 강제 발동이 필요 없어진다.** 이게 이번 개편의 체감 변화 중 하나: "웹 UI만으로 전체 파이프라인 확인 가능."
4. 신규 공고 재매칭(배치)은 여전히 스케줄러 기반이라, 데모 중 즉시 확인하려면 배치를 수동 트리거하는 엔드포인트가 필요할 수 있음 (구현 시 결정).
5. 리포트 화면, 알림 벨, 카카오 미러 확인은 기존과 동일.

---

## 6. 개편으로 정리되는 항목 (이슈 #29 근거)

- **폐기**: `TriggerEngine.java`의 임계값 평가 로직, `threshold_rule` 테이블, `EcosCollector`(경기지표) — 프로필 기반 매칭에서 개별 사용자와 무관한 전국 단위 거시지표는 근거로 쓰기 어렵다.
- **격하 (트리거 → 근거 보강)**: `SbizCollector`/`market_snapshot`(상권 데이터) — 더 이상 트리거를 발동시키지 않지만, "이 상권 상황이 이래서 이 자금이 유효하다" 서술의 보조 재료로 STEP E에 남긴다.
- **신설 필요**: `profile_funding_alert`(프로필×공고 알림 이력 테이블, dedup용), `ProfileMatchTrigger`(온보딩 직후 + 배치 재매칭 로직).
- **역할 재정의**: L3(`cause_analysis.py`) — "지표 원인 설명"에서 "매칭 적합성 설명"으로. 입력·시스템 프롬프트 전면 수정 필요.
- **그대로 유지**: L4 하이브리드 RAG 내부 로직(BM25/벡터/RRF), L5 리포트 생성, 알림·카카오 미러, 서비스 경계 원칙.
- **아직 미확정 (이슈 #29 오픈 결정)**: 온보딩 직후 매칭의 동기/비동기 여부, 배치 재매칭의 정확한 실행 지점.
