version.01 (dependency_graph01 기반)

# 업무 분할 · API 계약 · AI 하네스 컨텍스트 가이드

> **이 문서의 용도**: `dependency_graph01.md`의 노드를 실행 가능한 작업 단위로 분해하고,
> 2인 개발자(A·B)의 분담과 각 작업을 AI 하네스(Claude Code 등)에 시킬 때 주입할 컨텍스트를 정의한다.
> **이 문서 자체가 AI에게 주는 1차 컨텍스트다.** 작업을 시작할 때는
> ① §1 경계 원칙 ② §2 API 계약 ③ 해당 작업의 §3 행(현재 상태·DoD) ④ §6 컨텍스트 패킷을 함께 제공한다.

---

## 1. 서비스 경계 원칙 — 모든 작업의 공통 컨텍스트

| 서비스 | 포트 | 역할 | 절대 규칙 |
| --- | --- | --- | --- |
| **api-core** (Spring Boot 3, Java 21) | 8080 | **유일한 데이터 오너.** 수집·저장·조회·트리거 판정·스케줄링·파이프라인 지휘·알림 | Claude API를 직접 호출하지 않는다. AI가 필요하면 반드시 `AiEngineClient`를 거친다 |
| **ai-engine** (FastAPI, Python) | 8000 | **stateless AI 서비스.** Spring이 컨텍스트를 담아 호출하면 Claude 결과만 반환 | 비즈니스 테이블(`business_profile`, `report` 등)을 직접 조회·저장하지 않는다. **유일한 예외**: `/index/rebuild`가 `policy_announcement`를 읽어 BM25·Chroma 구성 |
| **web** (Next.js App Router) | 3000 | 온보딩 질문지, 알림 수신, 리포트 뷰어 | **Spring(:8080)만 호출한다.** ai-engine(:8000) 직접 호출 금지 |

### AI 하네스가 흔히 저지르는 위반 (명시적 금지사항)

- ❌ ai-engine에서 `business_profile`을 SELECT — 프로필은 Spring이 요청 body에 담아 보낸다
- ❌ Spring 코드에 `anthropic` SDK 의존성 추가
- ❌ web에서 `http://localhost:8000` 호출
- ❌ 업종·지역을 코드에 하드코딩 — PRD §2 "확장 가능성 증명"의 감점 요인. 반드시 `threshold_rule` 테이블·프로필 컬럼·환경변수로 파라미터화
- ❌ 신청서 자동 제출 기능 구현 — PRD §5-3: 초안 생성까지만, 제출은 사용자 책임 영역
- ❌ 스키마 변경을 JPA `ddl-auto` 등으로 우회 — 스키마 단일 소스는 `db/init/*.sql` (01→02→03 순서 실행)

---

## 2. API 계약 — 두 개발자 간 고정 지점

계약 변경은 반드시 상대 개발자와 합의 후 이 문서를 먼저 갱신하고 코드를 수정한다.
(AI 하네스에 "이 계약과 다른 응답 스키마를 만들지 마라"를 명시할 것)

### 2-1. api-core 외부 API (호출자: web)

| 메서드 · 경로 | 상태 | 설명 |
| --- | --- | --- |
| `POST /api/onboarding` | ✅ 구현 (검증·국세청 조회 TODO) | 질문지 제출 → 프로필 생성 |
| `GET /api/onboarding/{id}` | ✅ 구현 | 프로필 조회 |
| `GET /api/reports?profileId={id}` | ✅ 구현 | 리포트 목록 (최신순) |
| `GET /api/reports/{id}` | ✅ 구현 | 리포트 단건 (뷰어) |
| `GET /api/notifications?profileId={id}&status=UNREAD` | ⬜ 미구현 (P1) | 알림 폴링 — `notification` 테이블(03 스키마) |
| `PATCH /api/notifications/{id}/read` | ⬜ 미구현 (P1) | 읽음 처리 (`status=READ`, `read_at=now()`) |
| `POST /api/agent/check/{profileId}` | ✅ 구현 | 데모용 즉시 트리거 평가·파이프라인 실행 |
| `POST /api/agent/draft?reportId=&pblancId=` | ✅ 구현 | 신청서 초안 생성·저장 (P3) |

**계약 예시 — `GET /api/reports/{id}` 응답** (ReportDetail, camelCase, feat/#14에서 확장):

```json
{
  "id": 7,
  "profileId": 1,
  "bodyMd": "## 분석 결과\n...",
  "pushedAt": "2026-07-16T06:01:00+09:00",
  "createdAt": "2026-07-16T06:01:00+09:00",
  "matches": [
    {
      "pblancId": "abc123",
      "title": "소상공인 경영안정자금",
      "evidence": "마포구 카페 업종 대상, 매출 감소 사유 해당",
      "applyEnd": "2026-08-31",
      "detailUrl": "https://www.bizinfo.go.kr/..."
    }
  ]
}
```

**계약 예시 — `POST /api/onboarding` 요청** (BusinessProfile, camelCase):

```json
{
  "userId": 1,
  "industry": "카페/디저트",
  "entityType": "개인(일반과세자)",
  "operatingPeriod": "1~3년",
  "monthlyRevenueBand": "1,500만~3,000만",
  "employeeBand": "1~2명",
  "regionSido": "서울특별시",
  "regionSigungu": "마포구",
  "concerns": ["주변 경쟁 심화", "자금 조달 어려움"],
  "fundingExperience": "알아본 적은 있지만 신청은 안 해봄",
  "bizRegNo": "1234567890"
}
```

**계약 예시 — `GET /api/notifications` 응답** (미구현, 이 스키마로 고정):

```json
[
  {
    "id": 10,
    "profileId": 1,
    "reportId": 7,
    "type": "REPORT",
    "title": "반경 500m 신규 경쟁점 3곳 — 대응 리포트 도착",
    "body": "원인 분석과 신청 가능한 정책자금 2건을 정리했어요.",
    "status": "UNREAD",
    "createdAt": "2026-07-12T06:01:00+09:00"
  }
]
```

### 2-2. ai-engine 내부 API (호출자: Spring `AiEngineClient`만)

| 메서드 · 경로 | 상태 | 레이어 | 요청 → 응답 |
| --- | --- | --- | --- |
| `POST /screen` | ✅ | L2 보조 (Haiku, 선택) | `{signal_summary}` → `{worth_alerting: bool}` |
| `POST /analysis` | ✅ | L3 원인분석 (Sonnet) | `{profile, trigger_context}` → `{cause_text, needs_funding_match, match_hint}` |
| `POST /matching` | ✅ | L4 하이브리드 RAG | `{cause_text, profile_hint?, top_k?=5}` → `{matches: [{pblanc_id, title, apply_end, detail_url, evidence: str, rrf_score, bm25_rank, vector_rank}]}` |
| `POST /report/generate` | ✅ | L5 리포트 (Sonnet) | `{cause_text, matches[]}` → `{body_md}` |
| `POST /draft` | ✅ | 확장 5-3 (Sonnet) | `{announcement, profile, cause_text}` → `{sections, notice}` |
| `POST /index/rebuild` | ✅ | 인덱싱 | `{}` → `{indexed: int}` — 유일하게 Postgres 직접 읽음 |
| `GET /health` | ✅ | — | `{status: "ok"}` |

**호출 방향은 항상 Spring → ai-engine 단방향.** ai-engine이 Spring을 콜백하지 않는다 (재시도·저장·상태 관리는 전부 Spring 책임).

### 2-3. 세 번째 동결 계약 — `policy_announcement` DDL (Spring ↔ ai-engine 공유 테이블)

ai-engine이 유일하게 직접 읽는 테이블이다 (`indexing.py`, `hybrid_search.py`). 사용 컬럼: `pblanc_id, title, summary_html, apply_end, detail_url`. 이 컬럼들의 이름·타입 변경은 B의 인덱싱·매칭을 즉시 깨뜨리므로 **A·B 합의 없이 변경 금지.** (Chroma 컬렉션·BM25 인덱스 구조는 B의 내부 구현이므로 계약이 아니다)

---

## 3. 작업 패키지 — 의존성 그래프 노드 → 실행 단위

상태: ✅ 구현됨 · 🔶 뼈대만 (핵심 로직 미완) · ⬜ 미착수

### 🟩 Spring api-core (담당: A)

| ID | 노드 | 우선순위 | 선행 | 상태 | 남은 작업 |
| --- | --- | --- | --- | --- | --- |
| S1 | SCHEMA · DB 스키마 확정 | P0 | — | ✅ | `01+02+03.sql` 완료. notification 테이블은 03에서 추가됨 |
| S2 | COLLECT · 수집기 | P0 | S1 | 🔶 | Bizinfo ✅ (단, `apply_start/apply_end/detail_url` 필드 미매핑 — RAG 결과의 마감일·링크가 null로 나옴). **ECOS·상권(Sbiz) 수집기는 스텁** — API 키 발급 후 구현 |
| S3 | ONBOARD · 온보딩 API | P1 | S1 | 🔶 | 저장·조회 ✅. 입력 검증, Q9 국세청 상태조회, `market_region_code/market_industry_code` 매핑 저장 |
| S4 | TRIGGER · 트리거 엔진 | P1 | S3 | ✅ | `latestMetric()` 구현 완료 (2026-07-13, QA 통과 — `_workspace/qa_S4.md`): 상권 스냅샷 JSONB 조회 + 경기지표 `_change_bp/_change_pct` 명명 규칙 폴백. **계약**: EcosCollector는 `indicator_code`를 이 명명 규칙에 맞춰 적재할 것 (⑤ 작업 시 참조) |
| S5 | PIPELINE · 오케스트레이션 | P1 | S4 | 🔶 | L3→L4→L5 흐름 ✅. 누락: `funding_match.evidence` 저장, **notification insert (S6 연동)**, `report.pushed_at` 갱신, ai-engine 장애 시 예외 처리 |
| S6 | NOTI+POLL · 알림 생성·폴링 API | P1 | S5 | ✅ | `notification` 패키지 구현 완료 (feat/#11, 2026-07-16). PipelineService notification INSERT + GET/PATCH API. QA PASS — `_workspace/qa_S6.md` |
| S7 | KAKAO · 나에게 보내기 | P1.5 | S6 | ⬜ | 데모 강화 레이어. `notification_delivery`에 발송 이력 기록 |
| S8 | REPORT_API · 리포트 조회 | P1 | S5 | ✅ | — |
| S9 | DRAFT_API · 초안 요청·저장 | P3 | ⭐ 마일스톤 후 | ✅ | 뼈대 완료. 3주차 E2E 완주 전에는 손대지 않는다 |
| S10 | PUSH · FCM/알림톡 | P3 | ⭐ 마일스톤 후 | ⬜ | KB 인프라 승계 전제 — MVP 범위 밖, 설계 메모만 |

**A 레인 코드 픽스 (스키마와 별개 — 어드바이저 검토에서 확인된 실버그):**

1. `BusinessProfile.createdAt`에 `@CreationTimestamp`(또는 `@Column(insertable=false)`) 추가 — 현재 JPA insert에 `created_at` 컬럼이 NULL로 포함돼 DB DEFAULT가 무시된다. `updatedAt`은 미매핑이라 03의 DB 트리거가 커버
2. `TriggerEngine`의 룰 조인이 한글 완전일치(`p.industry = r.industry`) — web이 정확히 같은 문자열을 보내야만 동작하는 취약 구조. `market_industry_code`(03 신설) 표준키 조인으로 경화
3. `spring.jpa.hibernate.ddl-auto=validate` 고정 — 스키마 단일 소스는 `db/init/*.sql`, JPA auto-DDL 드리프트 금지

**데모 데이터 경고**: ECOS·Sbiz 수집기가 스텁인 동안은 `econ_indicator`·`market_snapshot`이 비어 있어 **트리거가 절대 발동할 수 없다.** S4 개발·데모 리허설용으로 A가 수동 시드 스크립트(예: `db/seed_demo.sql` — 데모 프로필의 지역·업종 코드에 맞춘 스냅샷 몇 행)를 만들어 B와 공유할 것.

### 🟦 FastAPI ai-engine (담당: B)

| ID | 노드 | 우선순위 | 선행 | 상태 | 남은 작업 |
| --- | --- | --- | --- | --- | --- |
| E1 | INDEX · BM25+Chroma 인덱싱 | P1 | S2 | 🔶 | **활성 공고 필터 추가** — 현재 전량 인덱싱이라 마감 지난 공고도 매칭 후보에 들어감 (`apply_end >= CURRENT_DATE OR apply_end IS NULL` 필터, 스키마가 아닌 로직 갭). 공고 수 증가 시 임베딩 배치 처리·소요시간 확인 |
| E2 | RAG · 하이브리드 매칭 | P1 | E1 | 🔶 | 골격 완료. **품질 튜닝이 본작업**: ① `evidence`("왜 맞는지" 근거 문장) 생성 추가 — 스키마(`funding_match.evidence`)와 그래프가 요구하나 현재 응답에 없음 ② **Chroma 임베딩 함수 명시** — 현재 미지정이라 기본값(all-MiniLM, 영어 모델)으로 한국어 공고를 임베딩 중 → 벡터 축 열화 (`rag-conventions` 스킬 참고) ③ 데모 쿼리 top-5 적합률 평가 |
| E3 | L3 · 원인분석 프롬프트 | P1 | — | ✅ | 골격 완료. 프로필·트리거 조합별 프롬프트 고도화, JSON 파싱 실패 폴백 개선 |
| E4 | L5 · 리포트 생성 프롬프트 | P1 | E3 | ✅ | 골격 완료. "사장님 언어" 톤 튜닝, Q8(신청 경험)에 따른 설명 상세도 조정 |
| E5 | DRAFT · 초안 섹션 생성 | P3 | ⭐ 마일스톤 후 | ✅ | 데모용 공고 1~2건의 실제 신청서 양식(hwp/pdf) 확보 후 섹션 구조 맞춤 |

### 🟨 Next.js web (담당: B)

| ID | 노드 | 우선순위 | 선행 | 상태 | 남은 작업 |
| --- | --- | --- | --- | --- | --- |
| W1 | ONBOARD_UI · 온보딩 질문지 | P2 | §2-1 계약 | ✅ | Q6 시/군/구 드롭다운 데이터 보강, 제출 후 이동 흐름 |
| W2 | NOTI_UI · 벨 아이콘+토스트 | P1~P2 | S6 계약 | ⬜ | `GET /api/notifications` 폴링(예: 30초), 미읽음 배지, 클릭 → 리포트 뷰어 이동. **S6 완성 전에도 §2-1 계약 JSON으로 mock 개발 가능** |
| W3 | REPORT_UI · 리포트 뷰어 | P2 | S8 | ✅ | 매칭 근거(`evidence`)·마감일 표시 보강 |

### 크리티컬 패스 (3주차 ⭐ E2E 마일스톤 기준)

```
S2(상권·ECOS 수집) → S4(latestMetric) → S5(evidence·알림 연동) → S6(알림 API) → W2(알림 UI) → ⭐
```

전부 A 레인(S2~S6)에 몰려 있으므로 **A의 S4가 최우선**, B는 그동안 E2 품질 튜닝과 W2 mock 선행 개발로 병렬화한다.

---

## 4. 2인 분담 — 개발자 A · B

> **2026-07-13 업데이트**: 1인 개발 체제로 전환됐다 — **§7이 이 섹션을 대체한다.** A/B 인적 분담·상호 승인은 무효가 됐지만, 레인 경계·계약 동결·크리티컬 패스는 AI 하네스 규율로 승계됐다 (§7 참고). 아래는 히스토리로 보존.

### 분담안 (구 버전)

| | 개발자 A | 개발자 B |
| --- | --- | --- |
| **레인** | 🟩 Spring api-core + DB 스키마 전체 | 🟦 ai-engine + 🟨 web 전체 |
| **작업** | S1~S10 | E1~E5, W1~W3 |
| **스택** | Java 21, Spring Boot 3, PostgreSQL | Python/FastAPI, Anthropic SDK, Chroma, Next.js/TS |
| **정체성** | 데이터 오너·오케스트레이터 | AI 품질 + 사용자 경험 |

**근거**: ① 의존성 그래프의 레인 경계와 1:1 대응 → 통합 지점이 §2의 HTTP 계약 두 곳으로 최소화 ② 언어 스택이 겹치지 않아 컨텍스트 스위칭 없음 ③ ai-engine과 web은 둘 다 "Spring이 완성되지 않아도 mock으로 진행 가능"한 레인이라 한 사람(B)이 병렬로 잡기 좋음.

**대안 (기각)**: "A=백엔드 전체(Spring+FastAPI), B=프론트+프롬프트"는 B의 업무량이 얇고 A가 크리티컬 패스와 RAG를 둘 다 쥐어 병목이 된다. 기능 수직 분할(사람별로 기능을 끝까지)은 2인·4주에선 크로스스택 경합과 머지 충돌만 늘린다. 현 레인 분할이 부하 균형·계약 명확성 모두 우수.

**어드바이저 조정 2건 (반영됨)**:

- **A의 1주차 P0 = 스키마 확정 + §2 API 계약 동결(스텁 응답 포함)을 최우선.** 크리티컬 패스(S2→S4→S5→S6)가 전부 A 레인에 몰려 있고 B의 두 서브레인(ai-engine·web)이 모두 A의 하류다. 계약을 먼저 동결해야 A가 늦어져도 B가 양쪽에서 언블록된다
- **B는 듀얼스택 동시 병행 금지.** ai-engine(크리티컬 패스에 붙는 쪽)을 먼저, web은 A의 REST가 나온 뒤 통합 순서로. web은 계약 동결 후엔 순수 통합·저위험 작업이므로, 3주차에 먼저 여유가 생긴 쪽이 NOTI_UI·ONBOARD_UI 글루를 나눠 갖는 **공유 레인**으로 취급해도 좋다

### 주차별 계획 (PRD §7의 4주 일정에 매핑, 현재 뼈대 완료 상태 기준)

| 주차 | A (api-core) | B (ai-engine + web) | 동기화 지점 |
| --- | --- | --- | --- |
| 2주차 | S2 상권·ECOS 수집기 → S4 `latestMetric()` → S3 검증·코드매핑 | E3·E4 프롬프트 고도화, E2 evidence 추가·품질 평가셋 구축 | **계약 리뷰 30분**: `/matching` 응답에 `evidence` 필드 추가 합의 |
| 3주차 | S5 파이프라인 마감(evidence·pushed_at) → S6 알림 API → S7 카카오 | W2 알림 UI(mock 선행) → 실API 연결, W3 근거 표시 보강 | **⭐ 조인트 E2E 리허설**: `POST /api/agent/check/1` → 알림 → 리포트 뷰어까지 실데이터 완주 |
| 4주차 | 버그픽스·`job_run` 관측성, (여유 시) S9 초안 플로우 검증 | E5 데모 공고 양식 기반 초안 튜닝, 리포트 포맷 다듬기 | 데모 시나리오 리허설 2회 |

**PRD §7 전제 재확인**: 3주차 E2E 미완주 시 4주차 확장(S9·E5·S10) 전면 보류, 안정화 전량 투입.

### Mock 전략 — 상대를 기다리지 않기 위한 규칙

- **A가 ai-engine 없이 개발**: `AiEngineClient`를 프로파일 분기(`@Profile("stub")`)로 고정 JSON 반환하게 하거나, ai-engine의 `/analysis` 등이 이미 떠 있으므로 로컬 실행이 더 간단. Claude 키 없이 돌릴 때만 스텁 사용
- **B가 Spring 없이 ai-engine 개발**: 각 라우터는 컨텍스트 입력형이므로 §2-2 계약의 요청 JSON을 fixture로 두고 `pytest`/`curl`로 단독 개발. 단 `/index/rebuild`·`/matching`은 Postgres·Chroma 필요 → `docker compose up -d postgres chroma` + `02_seed` 수준의 공고 시드로 해결
- **B가 Spring 없이 web 개발**: §2-1 계약 JSON을 Next.js route handler(`app/api/mock/...`)로 세워 `NEXT_PUBLIC_API_BASE_URL`만 바꿔 개발, 통합 시 원복

---

## 5. AI 하네스 컨텍스트 제공 가이드

### 원칙: 작업마다 "컨텍스트 패킷"을 구성한다

```
컨텍스트 패킷 = ① 이 문서 §1(경계·금지) + §2(계약)      ← 항상 포함
              + ② PRD 관련 섹션                        ← 작업별 선택
              + ③ db/init/01+03 스키마 (해당 테이블)
              + ④ 수정 대상·참조 소스 파일 경로
              + ⑤ 해당 작업의 DoD(§3 행)
              + ⑥ "하지 말 것" (아래 표)
```

- **좁게 준다**: 저장소 전체를 던지지 말고 아래 표의 파일만. 상대 레인은 구현이 아니라 **인터페이스만** 준다 (예: B의 ai-engine 작업엔 `AiEngineClient.java`를 "호출자 계약"으로 주되 Spring 파이프라인 내부는 제외)
- **계약을 불변으로 선언한다**: "응답 JSON 스키마는 §2와 다르게 만들지 마라", "스펙 갱신 없이 새 엔드포인트를 만들지 마라"를 프롬프트에 명시
- **파일 allow-list로 스코프를 물리적으로 고정한다**: A 세션은 `apps/api-core/**`+`db/**`, B 세션은 `apps/ai-engine/**`+`apps/web/**`만 편집 허용 — 크로스레인 "도움 편집"발 머지 충돌 예방
- **AI 판단 작업(E2~E5)엔 골든 I/O 예시 1~2쌍**(입력 JSON → 기대 출력 JSON)을 함께 준다 — 프롬프트·RAG는 산문 스펙보다 예시에서 성능이 나온다
- **판단 작업엔 '왜', 통합 작업엔 '인터페이스'**: L3·L5 프롬프트 작업엔 PRD의 페르소나·톤(§3·§4-1·§5)을, 배관 작업엔 §2 계약만 주면 충분하다
- **검증을 요구한다**: 각 작업의 DoD를 그대로 완료 조건으로 제시 ("`curl`로 응답 확인 후 결과 붙여라")
- **만들지 말 것을 매 프롬프트에 명시한다**: 인증 ❌ · 실제 push(FCM/알림톡) ❌ (스텁까지만) · 초안 자동 제출 ❌ (PRD §5-3) · pgvector 임베딩 구현 ❌ (벡터는 Chroma) — 스코프 크립 차단

### 작업별 컨텍스트 패킷

| 작업 | PRD 섹션 | 스키마 | 소스 파일 | 하지 말 것 |
| --- | --- | --- | --- | --- |
| S2 수집기 | §5-1 데이터 축, §9 리스크 | `market_snapshot`, `econ_indicator`, `policy_announcement` | `collect/*.java`, `ScheduledJobs.java` | 수집 실패 시 배치 전체 중단 금지(축별 독립), 원본 `raw` 유실 금지 |
| S4 트리거 | §5-2 변화 감지 | `threshold_rule`, `trigger_event`, `market_snapshot`, `econ_indicator` | `TriggerEngine.java`, `02_seed_thresholds.sql` | LLM 호출 금지(결정론 규칙만), 임계값 하드코딩 금지 |
| S5 파이프라인 | §5-2 파이프라인 | `analysis_result`, `funding_match`, `report`, `notification` | `PipelineService.java`, `AiEngineClient.java` | ai-engine 응답 스키마 임의 변경 금지 |
| S6 알림 | 그래프 NOTI·POLL | `notification` | 신규 `notification/` 패키지, `PipelineService.java` | §2-1 응답 계약 변경 금지 |
| E2 RAG | §5-2 정책자금 매칭 | `policy_announcement`, `funding_match` | `services/rag/*`, `routers/matching.py` | 비즈니스 테이블 조회 금지(공고 메타 제외), top_k 하드코딩 금지 |
| E3·E4 프롬프트 | §5-2, §4-1(Q7·Q8 활용처) | — | `cause_analysis.py`, `report_gen.py`, `anthropic_client.py` | 프로필 DB 직접 조회 금지(입력으로만), JSON 외 출력 형식 금지 |
| E5 초안 | §5-3 전체 | `application_draft` | `draft_engine.py`, `routers/draft.py` | 자동 제출 기능 금지, "검토 후 제출" 고지 제거 금지 |
| W2 알림 UI | §4 흐름 5~6 | — | `app/` 하위, `lib/api.ts` | :8000 호출 금지, 폴링 주기 5초 미만 금지 |

### 저장소 차원 권장 사항

`§1 경계 원칙 + 금지사항`을 저장소 루트 `CLAUDE.md`(또는 `AGENTS.md`)로 추출해 두면 두 개발자의 AI 하네스가 세션마다 자동으로 경계를 인지한다. A·B 각자 프롬프트에 반복해서 붙여넣는 비용이 사라진다.

---

## 6. 계약 변경 절차 (A ↔ B)

1. 변경 필요 발견 → 이 문서 §2 표와 JSON 예시를 먼저 수정한 PR/커밋
2. 상대 개발자 확인 (비동기 OK, 단 머지 전 필수)
3. 양쪽 코드 반영 — Spring DTO/`AiEngineClient`와 FastAPI `BaseModel`을 같은 커밋 주기에 맞춘다
4. 조인트 E2E(`POST /api/agent/check/1`)로 회귀 확인

---

## 7. 1인 개발 전환 (2026-07-13, 어드바이저 2차 검토 반영)

뼈대(3서비스 스캐폴딩·스키마·계약)가 이미 서 있고 AI 하네스로 레버리지를 걸 수 있으므로 1인 개발이 타당하다. 2인 체계의 산출물 중 **무엇이 승계되고 무엇이 폐기되는지**가 핵심이다.

### 승계 / 폐기

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| §2 API 계약 동결 | **승계 — 오히려 격상** | 인적 계약 → **AI 세션 간 드리프트 방지 앵커.** 매 세션은 컨텍스트가 리셋되어 응답 스키마를 조용히 바꾸거나 엔드포인트를 지어낼 수 있다. §2가 세 서비스의 정합을 잡는 유일한 고정점 |
| §1 경계·금지 + 레인 allow-list | 승계 (목적 전환) | 머지 충돌 방지 → 단일 세션의 산발적 크로스레인 편집(blast radius) 제어 |
| §3 크리티컬 패스 | 승계 | 사람이 아닌 의존성 문제 — 이제 단일 트랙의 실행 순서 그 자체 |
| §6 계약 변경 메커니즘 | 승계 (승인 게이트 제외) | "문서 먼저 → 양쪽 동시 수정 → E2E" 규율은 유지, 상대 승인만 삭제 |
| Mock/stub 전략 | 축소 승계 | "상대 대기 회피" 용도 소멸. ① API 키·토큰 비용 없이 배관 작업 ② 결정론 E2E 용도만 잔존 |
| §4 A/B 인적 분담, 상호 승인 | **폐기** | §7 실행 순서와 하네스가 대체 |

### 1인 단일 트랙 실행 순서

| 순서 | 작업 | 레인 | DoD 요점 |
| --- | --- | --- | --- |
| ① | 데모 시드(**프로필 상권 코드 포함**) + S4 `latestMetric()` + 시드 공고 `/index/rebuild` 1회 + `/matching` 스모크 | backend | 시드만으로 트리거 발동 → `analysis_result` 저장. 시드의 `metric` JSON 모양은 실제 상권 API 스키마 형태로 — ⑤에서 재작업 방지. **상권 API 키 신청도 이 시점에** (리드타임 디리스크) |
| ② | E2 evidence 생성 + **Chroma 임베딩 함수 명시**(ai) ∥ S5 마감: evidence 저장·`pushed_at`·알림 insert(backend) + S6 알림 API | ai + backend | evidence는 **생성(E2)과 저장(S5)을 같은 사이클로** — ⑤에 두면 의존성 역전. `/matching` 응답에 `evidence` 추가는 §2-2 문서 먼저 (§6 절차) |
| ③ | W2 알림 UI (폴링·배지·클릭→리포트) | web | **⭐ E2E 데모 가능 상태** — `POST /api/agent/check/1` → 알림 → 리포트 뷰어 완주 |
| ④ | E1 활성 공고 필터 | ai | **⑤ 실수집 유입 전에** — 마감 공고가 인덱스에 들어가기 시작한 뒤에는 늦다 |
| ⑤ | S2 실수집기: ECOS(난이도 낮음) → 상권 Sbiz | backend | PRD 성공 기준 "실연동 ≥3"의 게이트. bizinfo ✅ + ECOS = 2, **상권이 유일한 실연동 리스크** |
| ⑥ | E5 신청서 초안 (fitz+camelot 패턴, `rag-conventions` §4) | ai | 데모 공고 1~2건 양식 한정. hwp는 범위 밖 명시 |

### 실행 방법 — AI 하네스

구현 요청은 `dev-orchestrator` 스킬이 처리한다 ("다음 작업 진행해"). 에이전트 4종(backend-dev·ai-dev·web-dev·qa-verifier)이 레인별 컨텍스트 특화 + 저작·검증 분리를 구조적으로 강제하고, 오케스트레이터의 최중요 게이트는 **계약 영향 체크**(§2 변경 시 문서 먼저 → 양쪽 같은 사이클)다. 작업 패키지(S/E/W) 단위만 위임하고 자잘한 수정은 메인 스레드에서 직접 한다.

---

## 부록 — 아키텍처 어드바이저 검토 반영 내역 (2026-07-12)

**채택**: notification 테이블 필수(`report_id` FK·읽음 상태 포함) · 프로필 상권 코드 컬럼 필수(시드 임계값이 상권 지표 위주) · market_snapshot UNIQUE/조회 인덱스 권장 · **보류 판정으로 03에서 제외**: policy_announcement 인덱스(매칭은 in-process라 SQL 필터 없음), funding_match UNIQUE(현 플로우상 중복 불가), job_run 배치 이력(데모는 수동 실행+로그로 충분) · 마감 공고 인덱싱 문제는 스키마가 아닌 로직 갭(E1로 이관) · A 레인 코드 픽스 3건(§3) · A 계약 우선 동결·B 순차 진행(§4) · 골든 I/O·allow-list 하네스 원칙(§5)

**의견차 (사유 기록)**:

- `app_user`: 어드바이저는 인증 과설계를 경고하며 `user_id` nullable/드롭을 권장. → **인증 없는 4컬럼 테이블 + 데모 시드(id=1) + FK로 유지.** web이 항상 `userId: 1`을 보내는 현 구조에서 "존재하지 않는 테이블을 가리키는 죽은 컬럼"을 살아있는 참조로 바꾸는 최소 비용이고, 컨테이너 검증을 통과했다. 인증 구축은 여전히 범위 밖
- `updated_at` 처리: 어드바이저는 엔티티 어노테이션 단독을 권장. → 이 코드베이스는 `JdbcTemplate` 직접 쓰기 경로가 많아 **DB 트리거 유지 + 엔티티 `@CreationTimestamp` 픽스 병행** (트리거는 모든 쓰기 경로를 커버)

**오픈 결정 (팀 논의 필요)**:

- **pgvector vs Chroma 단일화**: `01_schema.sql`이 `CREATE EXTENSION vector`를 실행하지만 벡터 컬럼을 쓰는 테이블이 하나도 없다 — 임베딩은 전부 Chroma(`indexing.py`). 벡터스토어를 하나로 결정할 것: Chroma 유지 시 01에서 익스텐션 제거, pgvector 채택 시 Chroma 제거. PRD §11 오픈 이슈 "벡터DB 툴 선택"과 동일 건이며 README의 "pgvector+Chroma 병기" 표현도 그때 정리

### 2차 검토 (2026-07-13 — 1인 전환 · AFHackathon 노트북 · 하네스 구성)

§7(1인 전환·실행 순서), `.claude/skills/rag-conventions`(노트북 채택/기각 판정 전문), `.claude/skills/dev-orchestrator`(게이트 목록)에 반영 완료. 노트북 판정 요약 — **채택**: Chroma 임베딩 함수 명시(최우선·추가 발견), RAG 하이퍼파라미터 Settings 집중, 가중 RRF 옵션, fitz+camelot PDF 표 추출 패턴(E5 한정·재작성) / **기각**: 어미·접미사 토크나이즈 규칙, 청킹(460/55), 교집합+MinMax 가중융합(RRF 유지), llama_index/FAISS 스택 이식
