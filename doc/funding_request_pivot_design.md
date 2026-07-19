# 사용자 질문 기반 정책자금 매칭 — 피벗 설계 (2026-07-19)

> 요구사항 변경: 기존 "모니터링→트리거→푸시" 중심에서 **사용자 주도(pull) 흐름**을 주 UX로 전환.
> 아키텍처 어드바이저 검토 완료 반영본. 경계 원칙·계약의 상위 문서는 `doc/work_breakdown01.md` §1.

---

## 1. 요구사항 요약

1. 사용자가 프론트에서 **11개 질문**(`q.md`)에 답변: ①업종 ②사업장 위치 ③업력 ④직원수 ⑤작년 연매출(업력 1년 미만은 최근 한 달 평균) ⑥영업 상태 ⑦세금 체납 ⑧대출·카드 연체 ⑨정책자금 수령 이력 ⑩자금 필요 이유 ⑪필요 금액
2. 서버가 답변으로 알맞은 공고를 찾고 **공고 링크(detail_url) 필수 제공**
3. 상세 화면 "초안 생성하기" 버튼 → 공고 신청서류 크롤링 후 초안 생성
4. 신규 화면: **제출 목록**(내 질문 이력) + **제출 상세**(답변 + 매칭 공고 + 초안)

## 2. 사용자 흐름

```
질문지(11문항) 작성 → 제출
  → [Spring] 자격 스크리닝(규칙 기반, LLM 없음)
      ├─ 결격 → 안내 메시지 (매칭 미실행, status=INELIGIBLE)
      └─ 통과 → [ai-engine /matching] 하이브리드 RAG → 매칭 결과 저장 (status=MATCHED)
  → 상세 화면: 매칭 공고 카드(제목·링크·마감일·근거)
      → "초안 생성하기" 클릭 → [Spring] 저장된 크롤 텍스트 조회 → [ai-engine /draft] 섹션 생성 → 상세에 표시
목록 화면: 내 제출 이력 (status 뱃지 포함) → 클릭 시 상세
```

기존 모니터링 파이프라인(트리거→분석→리포트→알림 벨)은 **삭제하지 않고 보조 트랙으로 유지** — 이미 E2E 검증됐고 데모 차별화 요소.

## 3. 설계 결정 (어드바이저 판정 반영)

### 3-1. 데이터 모델 — 신규 `db/init/05_funding_request.sql`

기존 `funding_match`는 `analysis_id` FK(트리거 파이프라인 전용)라 재사용 부적합 → 신규 테이블. **JPA ddl-auto 금지, 번호순 SQL이 스키마 단일소스**(§1).

```sql
CREATE TABLE funding_request (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES app_user(id),
  answers    JSONB NOT NULL,           -- 11문항 전체 {"industry": "...", "location": "...", ...}
  status     TEXT NOT NULL DEFAULT 'PENDING'
             CHECK (status IN ('PENDING','INELIGIBLE','MATCHED','FAILED')),
  gate_message TEXT,                   -- 결격 시 안내 문구 (재도전 자금 예외 포함)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE funding_request_match (
  id          BIGSERIAL PRIMARY KEY,
  request_id  BIGINT NOT NULL REFERENCES funding_request(id),
  pblanc_id   TEXT NOT NULL REFERENCES policy_announcement(pblanc_id),
  match_rank  INT,
  bm25_rank   INT,
  vector_rank INT,
  rrf_score   NUMERIC,
  evidence    TEXT
);

-- 초안은 기존 application_draft 재활용: report_id가 이미 nullable이므로
ALTER TABLE application_draft ADD COLUMN request_id BIGINT REFERENCES funding_request(id);
ALTER TABLE application_draft ADD CONSTRAINT chk_draft_origin
  CHECK ((report_id IS NOT NULL) <> (request_id IS NOT NULL));   -- 정확히 한쪽만
```

**answers는 JSONB** (컬럼 전개 대신): 상세 화면에서 통째로 표시, SQL WHERE 필터 불필요(자격 판정은 앱 코드에서 키 접근), 질문지 변경 시 마이그레이션 회피. 1인 개발+데드라인에 명확히 우위.

**status를 지금 모델링하는 이유** — "스키마는 비동기, 구현은 동기" 헤지: 컨트롤러는 동기로 구현하되, 리허설에서 warm-path 지연이 ~20초를 넘으면 마이그레이션 없이 202+폴링(기존 NotificationBell 30초 폴링 패턴 재사용)으로 전환한다. FAILED 영속화 덕에 매칭 예외 시에도 request가 목록에 남는다.

### 3-2. 자격 스크리닝 — 데이터 주도 소프트 게이트 (Spring, LLM 없음)

⑥폐업 ⑦체납 ⑧연체는 대부분 정책자금의 결격사유지만, **재도전·재기지원 자금은 오히려 이들이 대상**이라 무조건 하드 결격은 사실 오류이자 §1 하드코딩 금지 위반.

- 규칙은 하드코딩 boolean이 아니라 **데이터(테이블 or 설정)로**: 예) `eligibility_rule(answer_key, blocking_value, message)` 시드.
- 결격 시: 매칭 미실행, `status=INELIGIBLE`, `gate_message`에 "일반 자금은 어려우나 재도전 특화 자금은 가능할 수 있습니다" 류 예외 안내.
- 게이트의 근거는 비용 절감(미미함)이 아니라 **즉시 피드백 UX**.

### 3-3. 매칭 흐름 — `/matching` 무변경 재사용

`/matching`은 **이미 `profile_hint`·`top_k`를 받는다**(`matching.py:8-11`) — Java 클라이언트만 안 보내고 있었음(`AiEngineClient.java`). ai-engine 수정 0.

- L3 원인분석·L5 리포트는 이 흐름에서 **생략** (트리거가 없으니 원인분석 무의미, Claude 비용도 절감).
- `query_transform`의 SYSTEM 프롬프트가 "상황 설명" 입력을 전제하므로 **11문항 blob을 그대로 넣지 말 것** — Spring이 ⑩용도+⑪금액+①업종+②지역으로 짧은 자연어 요약을 조립해 `cause_text`로, ①②를 `profile_hint`로 전달.
  - 예: `"강남구에서 카페를 운영 중이며, 경쟁 심화로 인한 운영자금 3천만원이 필요합니다"`
- **트랜잭션 경계 주의**: `POST /requests`는 PENDING insert 후 즉시 커밋 → `/matching` 호출은 **트랜잭션·커넥션 밖**에서 → 결과 저장은 새 트랜잭션. 느린 콜(실측 최대 3분)이 커넥션 풀을 점유해 모니터링 파이프라인까지 막는 것 방지.

### 3-4. 서류 크롤링 — 스코프 사다리 + 사전 크롤링

| 레벨 | 내용 | 판정 |
|---|---|---|
| L0 | `summary_html` 기반 초안 (현재 `/draft` 동작) | **항상 폴백** — 이미 구현됨 |
| L1 | `detail_url` HTML 크롤 → 제출서류 안내 텍스트 추출 → `/draft` 컨텍스트 보강 | **MVP 목표** |
| L2 | hwp/pdf 첨부 파싱 (fitz/camelot) | **범위 밖** (스트레치) |

- **소재지**: Spring이 시드/인덱싱 시점에 **사전 크롤링 + DB persist**(`policy_announcement.raw` 또는 신규 컬럼) → ai-engine은 무상태로 저장된 텍스트를 받아 파싱/초안만. 버튼 클릭 시 정부 사이트 실시간 의존 없음 → **데모 중 외부 사이트 지연/다운 리스크 원천 차단**.
- 크롤 텍스트가 없으면 summary_html 폴백 — 초안 버튼은 어떤 경우에도 동작.

### 3-5. API 계약 (전부 Spring :8080, web은 Spring만 호출)

| 메서드 | 경로 | 동작 |
|---|---|---|
| POST | `/api/funding/requests` | 제출 → 스크리닝 → (통과 시) 매칭 → `{id, status, gateMessage?, matches[]}` 동기 반환 |
| GET | `/api/funding/requests?userId=1` | 내 제출 목록 (id, 요약, status, createdAt) |
| GET | `/api/funding/requests/{id}` | 상세: answers + matches(제목·**detailUrl**·마감일·근거) + drafts |
| POST | `/api/funding/requests/{id}/drafts?pblancId=` | 초안 생성 (저장 크롤 텍스트 → `/draft`) |

- matches의 `detailUrl`은 **필수 계약** — `policy_announcement.detail_url`이 nullable이므로 매칭 결과 조립 시 null 필터 또는 보장 로직 필요.
- 상세 조회 JOIN은 기존 `ReportController`의 `funding_match ⋈ policy_announcement` 형태를 그대로 복사 (같은 shape).

### 3-6. 온보딩 Q1~Q9 vs 신규 11문항 — **분리 (통합 금지)**

- 성격이 다름: ⑥⑦⑧은 시점성, ⑩⑪은 자금 필요 시마다 변동 → **request-scoped**. `business_profile`은 profile-scoped이고 모니터링 파이프라인(`PipelineService`)이 의존.
- 밴드 입도 불일치: 신규 ⑤는 연매출, 기존 Q4는 월매출 — 강제 통합은 낭비.
- 프로필이 이미 있으면 ①~④ **프리필**(선택 사항).

### 3-7. 프론트 (3개 화면 신규)

1. **질문지** `/funding/new` — 11문항 (①③④⑥⑦⑧⑨ 선택형, ②⑩⑪ 입력형), 제출 시 **로딩 상태 필수**(동기 매칭이 수십 초 가능)
2. **목록** `/funding` — 제출 이력 + status 뱃지 (INELIGIBLE은 안내 문구 미리보기)
3. **상세** `/funding/[id]` — 답변 요약 + 매칭 카드(제목 링크·마감일·근거) + 카드별 "초안 생성하기" 버튼 + 생성된 초안 섹션 뷰 (기존 리포트 상세의 카드 UI 재사용)

## 4. 구현 순서 (1인, 의존성순)

- **P0 스키마**: `db/init/05_funding_request.sql` (위 DDL) — 모든 작업 언블록
- **P1 백엔드 코어 (AI 없이)**: 엔티티/레포 → `POST /requests`(PENDING 커밋) → 자격 규칙 시드+스크리닝 → `GET` 목록/상세
- **P2 매칭 배선**: `AiEngineClient.match()`에 `profile_hint`·`top_k` 전달 추가 → answers→쿼리 조립 → 트랜잭션 밖 호출 → 결과 저장+status 갱신
- **P3 프론트**: 질문지+로딩 → 목록 → 상세
- **P4 초안/크롤**: 사전 크롤 스크립트(Spring) → draft 엔드포인트(request_id) → 초안 뷰. summary_html 폴백
- **P5 폴리시/런북**: 사전 워밍업, 더블서브밋 방지, detail_url null 필터

## 5. 테스트 시나리오 변경 (checkpoint 가이드 대비)

**유지(보조 트랙으로 강등)**: 모니터링 트리거 curl → 알림 벨 → 리포트 (기존 가이드 1-4, 2-1)

**신규 추가**:

| # | 시나리오 | 확인 |
|---|---|---|
| N1 | Pull 정상경로 | 자격 통과 answers로 POST → matches[] 전원 `detailUrl` non-null, 목록·상세 표시 |
| N2 | 자격 결격 | 폐업/체납/연체 answers → `INELIGIBLE` + 안내 메시지(재도전 예외 문구), **매칭 미실행**(`funding_request_match` 0행, 빠른 응답) |
| N3 | 링크 존재 검증 | detail_url null인 공고가 매칭돼도 응답에서 걸러지거나 보장되는지 (해피패스만 보지 말 것) |
| N4 | 크롤 폴백 | 저장 크롤 텍스트 없는 공고에서 초안 생성 → summary_html 기반으로 정상 생성 |
| N5 | 콜드스타트 | 재기동 직후 첫 매칭 — 사전 워밍업 수행 여부에 따른 지연 실측, 브라우저 대기 확인 |
| N6 | 더블 서브밋 | 제출 버튼 연타 → 매칭 2회 실행 안 됨 |
| N7 | 실패 영속화 | ai-engine 죽인 상태로 제출 → `FAILED`로 목록에 남고 UI 안내 |

## 6. 리스크 & 데모 런북

1. **콜드 bge-m3 로드 = 최대 데모 리스크** (실측 3분 경로) → **데모 시작 전 워밍업 필수**: `POST /index/rebuild` 또는 더미 `/matching` 1회로 모델 선로딩. 런북 첫 항목.
2. Uvicorn 단일 워커 + CPU 임베딩 → 데모 중 **동시 제출 금지**.
3. RRF는 관련도 임계값이 없어 무관한 공고도 top_k로 반환 — 데모 코퍼스에선 무방하나 인지할 것.
4. 인증 부재 — 목록·상세는 반드시 `userId` 스코핑.
5. 정부 detail_url 만료 가능성 — 시드 데이터는 무방.
6. **경계 원칙 위반 금지 재확인**: 신규 테이블은 05_*.sql로(ddl-auto 금지) · ai-engine의 business_profile 직접 조회 금지(Spring이 컨텍스트 주입) · web의 :8000 직접 호출 금지.
