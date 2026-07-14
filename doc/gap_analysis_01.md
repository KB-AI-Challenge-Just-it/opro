# 갭 분석 — 스펙 vs 실제 구현 (2026-07-14)

> **분석 기준**: `work_breakdown01.md` §2 API 계약 · §3 작업 패키지 · `doc/decisions/001-notification-channel-kakao.md`
> **주차 추정**: S4(`latestMetric`) 2026-07-13 완료, S2·S3 진행 중, S5/S6 미착수 → **2주차 진행 중**
> **의도적 제외 목록** (이슈 대상 아님): 인증/로그인, 알림톡·친구톡·FCM, WebSocket, 신청서 자동 제출, HWP 서버사이드 생성

---

## 1. 구현 상태 × 스펙 갭 요약표

| 작업 | 스펙 상태 | 실제 구현 | 갭 유형 |
|------|-----------|-----------|---------|
| S1 스키마 | ✅ | ✅ | — |
| S2 Bizinfo 수집기 | 🔶 | 구현 있으나 `apply_start/apply_end/detail_url` INSERT 누락 | **버그** |
| S2 ECOS 수집기 | 🔶 | 빈 스텁 (`return 0`) | 미구현 |
| S2 Sbiz 수집기 | 🔶 | 빈 스텁 (`return 0`) | 미구현 |
| S3 온보딩 API | 🔶 | 저장·조회 있음, 검증/국세청 TODO | 부분 미구현 |
| S3 엔티티 (03 컬럼) | ❌ | `market_region_code/market_industry_code` JPA 엔티티에 없음 | **버그** (상권 트리거 경로 막힘) |
| S3 `@CreationTimestamp` | ❌ | `createdAt` 어노테이션 없음 | 버그 |
| S4 TriggerEngine | ✅ | 구현 완료 | 조인이 `p.industry = r.industry` 한글 완전일치 → 개선 필요 |
| S4 ddl-auto | 문서: validate | 코드: `none` | 설정 갭 |
| S5 Pipeline | 🔶 | L3→L4→L5 흐름 있음 | `evidence` 미저장, `notification insert` 없음, `pushed_at` 갱신 없음, 예외처리 없음 |
| S6 알림 API | ⬜ | 패키지 없음 | **미착수** |
| S7 카카오 | ⬜ | 없음 | 미착수 (ADR 001에 상세 설계 있음) |
| S8 리포트 조회 | ✅ | ✅ | — |
| S9 초안 API | ✅ | ✅ (뼈대) | — |
| E1 활성 공고 필터 | 🔶 | 전량 인덱싱 | 마감 공고 포함됨 |
| E2 Chroma 임베딩 함수 | ❌ | `get_or_create_collection(name)` — 함수 미지정 | 영어 기본 모델로 한국어 임베딩 중 |
| E2 evidence 생성 | ❌ | `/matching` 응답에 `evidence` 필드 없음 | §2-2 계약 불완전 |
| E3 원인분석 | ✅ | 구현됨, JSON 파싱 폴백 있음 | — |
| E4 리포트 생성 | ✅ | 구현됨 | Q8 상세도 조정 미적용 |
| W1 온보딩 UI | 🔶 | 기본 폼 있음 | Q6 드롭다운 없음, 제출 후 이동 없음 |
| W2 알림 UI | ⬜ | 없음 | **미착수** |
| W3 리포트 뷰어 | 🔶 | pre 태그 원문 노출 | 마크다운 렌더러 없음, evidence/마감일 없음 |
| pgvector vs Chroma | 오픈 결정 | extension 있으나 벡터 컬럼 0개 | 아키텍처 결정 미완료 |

---

## 2. 인터페이스 계약 이행 현황 (§2)

### §2-1 api-core 외부 API (호출자: web)

| 엔드포인트 | 계약 상태 | 구현 상태 |
|-----------|----------|----------|
| `POST /api/onboarding` | ✅ 동결 | ✅ 구현 |
| `GET /api/onboarding/{id}` | ✅ 동결 | ✅ 구현 |
| `GET /api/reports?profileId={id}` | ✅ 동결 | ✅ 구현 |
| `GET /api/reports/{id}` | ✅ 동결 | ✅ 구현 |
| `GET /api/notifications?profileId={id}&status=UNREAD` | ✅ 동결 | ❌ **미구현** |
| `PATCH /api/notifications/{id}/read` | ✅ 동결 | ❌ **미구현** |
| `POST /api/agent/check/{profileId}` | ✅ 동결 | ✅ 구현 |
| `POST /api/agent/draft?reportId=&pblancId=` | ✅ 동결 | ✅ 구현 |

### §2-2 ai-engine 내부 API (호출자: Spring AiEngineClient)

| 엔드포인트 | 계약 상태 | 구현 상태 |
|-----------|----------|----------|
| `POST /screen` | ✅ 동결 | ✅ 구현 |
| `POST /analysis` | ✅ 동결 | ✅ 구현 |
| `POST /matching` | 🔶 **계약 불완전** — `evidence` 필드 정의 안 됨 | 🔶 구현됨, evidence 없음 |
| `POST /report/generate` | ✅ 동결 | ✅ 구현 |
| `POST /draft` | ✅ 동결 | ✅ 구현 |
| `POST /index/rebuild` | ✅ 동결 | ✅ 구현 |

### §2-3 policy_announcement DDL (공유 테이블)

| 컬럼 | 스키마 정의 | BizinfoCollector INSERT |
|------|------------|------------------------|
| `pblanc_id` | ✅ | ✅ |
| `title` | ✅ | ✅ |
| `summary_html` | ✅ | ✅ |
| `apply_start` | ✅ | ❌ **누락** |
| `apply_end` | ✅ | ❌ **누락** |
| `detail_url` | ✅ | ❌ **누락** |

`apply_end`, `detail_url`은 `hybrid_search.py`가 SELECT해서 `/matching` 응답으로 반환하는 필드다. 수집 단계에서 저장 안 되면 RAG 결과에서 마감일·링크가 전부 null로 노출된다.

---

## 3. 이슈 초안 (15건)

> **라벨 규칙**: `priority/P0~P3`, `layer/0~6`, `area/backend|ai|frontend`
> **마일스톤**: 실제 주차 일정은 팀 확인 후 지정

---

### #1 — [버그] BizinfoCollector `apply_start/apply_end/detail_url` INSERT 누락

**우선순위**: P1 | **Layer**: 2 | **영역**: backend  
**관련 계약**: §2-3  
**의존**: 없음

**설명**
`BizinfoCollector.collect()`의 INSERT 구문에 `apply_start`, `apply_end`, `detail_url` 3개 컬럼이 빠져 있다. 기업마당 API 응답에 해당 필드가 있음에도 바인딩하지 않아 수집 직후부터 null이 된다. `hybrid_search.py`가 이 두 컬럼을 SELECT해서 반환하므로 RAG 결과에서 마감일·링크가 전부 null로 노출된다.

**Acceptance Criteria**
- [ ] INSERT 구문에 `apply_start`, `apply_end`, `detail_url` 컬럼 추가
- [ ] 기업마당 응답 JSON 필드명 매핑 확인 및 바인딩
- [ ] 수집 후 `SELECT apply_end, detail_url FROM policy_announcement LIMIT 5` 에서 null 없음

---

### #2 — [구현] S2 ECOS 수집기 — 경기지표 적재

**우선순위**: P1 | **Layer**: 2 | **영역**: backend  
**관련 계약**: TriggerEngine `_change_bp/_change_pct` 명명 규칙 (work_breakdown §3 S4)  
**의존**: 없음 (API 키 발급 선행)

**설명**
`EcosCollector`가 빈 스텁(`return 0`)이다. ECOS OpenAPI에서 기준금리·물가·BSI를 수집해 `econ_indicator` 테이블에 적재한다. `TriggerEngine.latestEconMetric()`이 `<indicator_code>_change_bp|_change_pct` 규칙으로 조회하므로 `indicator_code`가 이 규칙에 맞아야 한다(예: 기준금리 → `base_rate`).

**Acceptance Criteria**
- [ ] `ECOS_API_KEY` 빈 키 시 수집 생략 (배치를 죽이지 않음)
- [ ] `econ_indicator(indicator_code, value, observed_at)` UNIQUE 제약 준수 (`ON CONFLICT DO UPDATE`)
- [ ] `indicator_code`가 TriggerEngine 명명 규칙과 일치 (접미사 제거 형태)
- [ ] `dailyRun()` 후 `econ_indicator` 테이블에 1건 이상 적재 확인

---

### #3 — [구현] S2 Sbiz 수집기 — 상권 지표 적재

**우선순위**: P1 | **Layer**: 2 | **영역**: backend  
**관련 계약**: `market_snapshot(region_code, industry_code, metric JSONB)` DDL; metric 키 = threshold_rule.metric_key  
**의존**: 없음 (API 키 발급 리드타임 주의)

**설명**
`SbizCollector`가 빈 스텁이다. 소진공 상권정보 API로 반경 500m 경쟁강도·유동인구·매출추이를 수집해 `market_snapshot`에 적재한다. PRD "실연동 ≥3" 게이트에서 bizinfo + ECOS = 2, Sbiz가 세 번째다. metric JSONB 키는 `threshold_rule.metric_key`와 반드시 일치해야 한다 — `seed_demo.sql`의 `new_competitors_500m`, `foot_traffic_delta_pct` 참조.

**Acceptance Criteria**
- [ ] `SBIZ_API_KEY` 빈 키 시 수집 생략 (배치 독립성)
- [ ] `uq_market_snapshot_daily UNIQUE(region_code, industry_code, snapshot_date)` 준수
- [ ] metric JSONB 키가 `02_seed_thresholds.sql`의 `metric_key` 값과 일치
- [ ] 수집 후 `TriggerEngine.evaluate()` 에서 상권 지표 트리거 1건 이상 발동 확인

---

### #4 — [코드픽스] S3·S4 엔티티 보완 + TriggerEngine 업종 조인 개선

**우선순위**: P1 | **Layer**: 3 | **영역**: backend  
**관련 계약**: §2-1 `POST /api/onboarding` (내부 필드 추가)  
**의존**: 없음 (독립 픽스 3건)

**설명**
work_breakdown01 §3에서 확인된 미완료 코드 픽스 3건:

1. **`BusinessProfile` 엔티티 03 컬럼 누락**: `03_schema_additions.sql`이 `market_region_code`, `market_industry_code`를 추가했으나 JPA 엔티티에 없어 온보딩 저장 시 null 유지. `TriggerEngine.latestMarketMetric()`이 이 값에 의존하므로 상권 트리거 경로가 막혀 있다.

2. **`@CreationTimestamp` 누락**: `BusinessProfile.createdAt`에 어노테이션이 없어 JPA INSERT 시 `created_at`에 null이 바인딩되어 DB DEFAULT가 무시된다.

3. **TriggerEngine 업종 조인 취약**: `p.industry = r.industry` 한글 완전일치 조인. web이 보내는 문자열과 `threshold_rule.industry`가 정확히 일치해야만 룰이 잡힘. `market_industry_code` 기준 조인으로 경화 필요.

**Acceptance Criteria**
- [ ] `BusinessProfile` 엔티티에 `marketRegionCode`, `marketIndustryCode` 필드 추가 (nullable)
- [ ] `createdAt`에 `@CreationTimestamp` (또는 `@Column(insertable=false)`) 적용, INSERT 후 null 아님
- [ ] `TriggerEngine.evaluate()` · `ruleWindowDays()` 조인이 `market_industry_code` 기준으로 변경
- [ ] `seed_demo.sql` 시드 후 `POST /api/agent/check/1` 에서 트리거 1건 이상 발동

---

### #5 — [설정] `ddl-auto: none` → `validate` 변경

**우선순위**: P0 | **Layer**: 0 | **영역**: backend  
**관련 계약**: 스키마 단일 소스 규칙 (work_breakdown §1)  
**의존**: #4 선행 (엔티티 03 컬럼 추가 후 validate 통과)

**설명**
`application.yml`의 `ddl-auto: none`은 JPA가 DDL을 실행하지 않을 뿐, 스키마 불일치를 감지하지 않는다. `validate`로 바꾸면 엔티티↔테이블 컬럼 불일치 시 기동이 실패해 드리프트를 조기에 발견할 수 있다. #4 적용 후 변경해야 validate를 통과한다.

**Acceptance Criteria**
- [ ] `ddl-auto: validate` 설정
- [ ] `docker compose up api-core` 정상 기동 확인
- [ ] 엔티티에 없는 컬럼을 추가 시 기동 실패하는지 확인 (선택)

---

### #6 — [구현] E1 활성 공고 필터 — 마감 공고 인덱스 제외

**우선순위**: P1 | **Layer**: 3 | **영역**: ai  
**관련 계약**: §2-3 (`policy_announcement.apply_end`)  
**의존**: #1 권장 선행 (apply_end 실데이터 적재 후 필터 효과 확인)

**설명**
`indexing.py`의 `rebuild_indexes()`가 `policy_announcement` 전량을 인덱싱한다. 마감된 공고도 BM25·Chroma 매칭 후보에 포함되어 사용자에게 신청 불가 공고가 추천될 수 있다. 실수집 데이터가 유입되기 전에 필터를 먼저 추가해야 인덱스 오염을 막을 수 있다.

**Acceptance Criteria**
- [ ] `rebuild_indexes()` SQL에 `WHERE apply_end >= CURRENT_DATE OR apply_end IS NULL` 필터 추가
- [ ] `seed_demo.sql`의 DEMO-0003 (마감 3일 후) 케이스가 인덱스에서 제외 확인
- [ ] `/index/rebuild` 응답 `{"indexed": N}` 에서 마감 공고 수 제외 확인

---

### #7 — [구현] E2 Chroma 한국어 임베딩 함수 명시

**우선순위**: P1 | **Layer**: 3 | **영역**: ai  
**관련 계약**: 없음 (Chroma 내부 구현)  
**의존**: 없음

**설명**
`vectorstore.py`에서 `get_or_create_collection(name)`을 임베딩 함수 없이 호출한다. Chroma 기본값은 `all-MiniLM-L6-v2`(영어 특화 모델)이다. 한국어 정책 공고를 이 모델로 임베딩하면 벡터 축이 열화되어 시맨틱 검색 품질이 저하된다. `rag-conventions` 스킬에서 "최우선·추가 발견" 항목으로 명시된 사항.

**Acceptance Criteria**
- [ ] `get_collection()` 호출 시 한국어 모델 임베딩 함수 명시 (rag-conventions 스킬 권고 모델 참고)
- [ ] `requirements.txt` 의존성 추가
- [ ] `/index/rebuild` 후 `POST /matching` 에서 한국어 쿼리로 의미 있는 결과 반환 확인

---

### #8 — [구현] E2 `/matching` 응답 `evidence` 필드 추가 (§2-2 계약 갱신 선행)

**우선순위**: P1 | **Layer**: 4 | **영역**: ai  
**관련 계약**: §2-2 `/matching` 응답 스키마, §2-3 `funding_match.evidence`  
**의존**: §6 계약 변경 절차 (work_breakdown01 §2-2 문서 먼저 갱신)

**설명**
`01_schema.sql`의 `funding_match.evidence TEXT` 컬럼이 정의되어 있으나 데이터 흐름이 끊겨 있다. ai-engine `/matching` 응답에 `evidence`가 없으므로 `PipelineService`도 저장하지 못한다. 리포트 뷰어에서 "왜 맞는지" 근거 표시가 불가능한 상태.

계약 변경 절차(§6): work_breakdown01 §2-2 표의 `/matching` 응답 예시에 `evidence: str` 추가 후 구현.

**Acceptance Criteria**
- [ ] work_breakdown01 §2-2 `/matching` 응답 예시에 `evidence` 필드 추가 (문서 먼저)
- [ ] `hybrid_match()` 반환 dict에 `evidence: str` 필드 포함
- [ ] `POST /matching` curl 응답에서 `evidence` 필드 비어있지 않음
- [ ] evidence 저장은 #9(S5)에서 검증

---

### #9 — [구현] S5 PipelineService 완성 — evidence 저장 + notification insert + pushed_at + 예외처리

**우선순위**: P1 | **Layer**: 5 | **영역**: backend  
**관련 계약**: §2-2 `/matching` 응답 (evidence 포함), §2-1 notification 스키마  
**의존**: #8 (evidence 생성 선행)

**설명**
`PipelineService.run()`에 4가지 누락:

1. `funding_match` INSERT에 `evidence` 컬럼 없음
2. 파이프라인 말미에 `notification` INSERT 없음 → S6 폴링 API를 만들어도 읽을 데이터가 없음
3. `report.pushed_at` 갱신 없음
4. ai-engine 호출 예외가 배치 전체를 중단 → 수집기 독립성 원칙 위반

**Acceptance Criteria**
- [ ] `funding_match` INSERT에 `evidence` 컬럼 추가
- [ ] 리포트 저장 후 `notification(profile_id, report_id, type='REPORT', title, body)` INSERT
- [ ] `UPDATE report SET pushed_at = now() WHERE id = ?` 실행
- [ ] `aiEngine.analyze()` / `aiEngine.generateReport()` 예외 시 해당 프로필만 skip, 배치 계속
- [ ] `POST /api/agent/check/1` 후 `notification` 테이블에 1건 이상 삽입 확인

---

### #10 — [구현] S6 알림 API — `GET /api/notifications` + `PATCH .../read`

**우선순위**: P1 | **Layer**: 5 | **영역**: backend  
**관련 계약**: §2-1 (`GET /api/notifications`, `PATCH /api/notifications/{id}/read`)  
**의존**: #9 (notification INSERT 선행)

**설명**
§2-1에 정의된 두 알림 엔드포인트가 미착수. `notification` 패키지 자체가 없다. 이 API 없이는 W2 알림 UI가 mock 이상으로 진행되지 않는다.

응답 스키마는 work_breakdown01 §2-1 JSON 예시를 준수한다:
```json
{"id": 10, "profileId": 1, "reportId": 7, "type": "REPORT",
 "title": "...", "body": "...", "status": "UNREAD", "createdAt": "..."}
```

**Acceptance Criteria**
- [ ] `notification` 패키지 신규 생성 (Controller, Entity/Projection, Repository)
- [ ] `GET /api/notifications?profileId=1&status=UNREAD` → 배열 반환, 빈 배열 허용
- [ ] `PATCH /api/notifications/1/read` → `status=READ`, `read_at` 갱신 확인
- [ ] §2-1 응답 JSON 필드(`id, profileId, reportId, type, title, body, status, createdAt`) 전부 포함
- [ ] `idx_notification_poll` 인덱스 활용 쿼리 (`EXPLAIN` 확인)

---

### #11 — [구현] W2 알림 UI — 벨 아이콘 + 폴링 + 토스트

**우선순위**: P1~P2 | **Layer**: 5 | **영역**: frontend  
**관련 계약**: §2-1 (`GET /api/notifications` 응답 스키마)  
**의존**: #10 (실 API; §2-1 mock으로 선행 개발 가능)

**설명**
알림 벨·토스트·폴링이 전혀 없다. `layout.tsx`가 단순 HTML 레이아웃만 있어 전역 알림 컴포넌트를 붙일 위치가 필요하다. 폴링 주기는 30초(5초 미만 금지). S6 완성 전에 §2-1 계약 JSON을 mock으로 세워 선행 개발 가능하다.

**Acceptance Criteria**
- [ ] layout에 벨 아이콘 + 미읽음 배지(숫자) 추가
- [ ] 30초 폴링으로 `GET /api/notifications?profileId=1&status=UNREAD` 호출
- [ ] 신규 알림 감지 시 배지 업데이트
- [ ] 알림 클릭 → `/reports/{reportId}` 이동
- [ ] `PATCH .../read` 호출로 읽음 처리
- [ ] 웹이 ai-engine(`:8000`) 직접 호출하지 않음

---

### #12 — [구현] S7 카카오 "나에게 보내기" — 데모 강화 레이어

**우선순위**: P1.5 | **Layer**: 5 | **영역**: backend + frontend  
**관련 계약**: ADR 001  
**의존**: #10 (S6 notification insert 선행 필수)

**설명**
ADR 001에서 상세 설계된 카카오 나에게 보내기 구현. `kakao_token` 테이블 DDL이 `03_schema_additions.sql`에 없으므로 `04_schema.sql`로 추가 필요. (`notification_delivery`는 03에 이미 있으므로 중복 추가 금지)

ADR 001 §5 운영 함정 주의:
- 발송 직전 리프레시 토큰으로 액세스 토큰 갱신 필수 (온보딩 당시 토큰은 당일 만료)
- 발송 실패가 파이프라인 롤백하면 안 됨 — try-catch 로그만
- `notification INSERT` 가 먼저, 카톡 발송이 나중
- `NotificationSender` 인터페이스 뒤에 구현 숨기기 (KB push 채널 교체 대비)

**Acceptance Criteria**
- [ ] `db/init/04_schema.sql`에 `kakao_token` 테이블 추가
- [ ] Spring: OAuth 동의 → 토큰 저장 플로우
- [ ] Spring: `KakaoMemoSender` — 발송 직전 토큰 갱신, 실패 시 catch + log
- [ ] Spring: `PipelineService`에 notification insert 후 `KakaoMemoSender.send()` 호출
- [ ] Web: 온보딩 마지막에 "카카오톡 알림 받기" 동의 버튼
- [ ] `notification_delivery` 테이블에 `channel='KAKAO_MEMO'`, `status='SENT'/'FAILED'` 기록
- [ ] 카톡 발송 실패해도 `POST /api/agent/check/1` 응답 정상

---

### #13 — [개선] W3 리포트 뷰어 마크다운 렌더러 + evidence·마감일 표시

**우선순위**: P2 | **Layer**: 5 | **영역**: frontend  
**관련 계약**: §2-1 `GET /api/reports/{id}`  
**의존**: #8 (evidence 생성), #9 (evidence 저장) — 데이터 있어야 의미 있음

**설명**
`pre` 태그로 마크다운 원문을 노출 중이다. 데모 화면에서 가독성이 떨어진다. `react-markdown` 등으로 렌더링하고, 매칭 공고의 마감일(`apply_end`)·근거(`evidence`)·링크(`detail_url`)를 표시 영역에 추가한다.

**Acceptance Criteria**
- [ ] `bodyMd` 마크다운 렌더링 (헤더, 굵게, 목록 최소 지원)
- [ ] 매칭 공고 목록에 마감일(`apply_end`) + 링크(`detail_url`) 표시
- [ ] `evidence` 텍스트 표시 영역 추가 (데이터 없으면 숨김)

---

### #14 — [개선] W1 온보딩 제출 후 이동 흐름

**우선순위**: P2 | **Layer**: 5 | **영역**: frontend  
**관련 계약**: §2-1 `POST /api/onboarding`  
**의존**: 없음

**설명**
`done=true`일 때 텍스트만 표시하고 이동이 없다. 제출 후 홈(`/`)으로 이동하거나 "에이전트가 지켜보는 중" 대기 화면을 보여주는 게 데모 흐름상 자연스럽다. 에러 시 사용자 안내도 없다.

**Acceptance Criteria**
- [ ] 온보딩 제출 성공 후 `/`(홈) 또는 대기 안내 페이지로 이동
- [ ] API 실패 시 에러 메시지 표시

---

### #15 — [결정] pgvector vs Chroma 단일화

**우선순위**: P1 (결정 선행, 구현에 영향) | **Layer**: 0 | **영역**: backend + ai  
**관련 계약**: §2-3, 스키마 단일 소스 원칙  
**의존**: 없음 (결정 후 #6·#7 구현 영향)

**설명**
work_breakdown01 부록의 오픈 결정. `01_schema.sql`이 `CREATE EXTENSION IF NOT EXISTS vector`를 실행하지만 벡터 컬럼을 쓰는 테이블이 없다. 임베딩은 전부 Chroma. README에는 "pgvector+Chroma 병기"로 표기되어 있어 정리가 필요하다.

- **Chroma 유지 선택 시**: `01_schema.sql`에서 `CREATE EXTENSION vector` 제거, README 정리, ADR 작성
- **pgvector 채택 시**: Chroma 제거, Spring에서 pgvector 쿼리 구현, ai-engine 대규모 변경 필요

MVP 타임라인을 고려하면 **Chroma 유지**가 유력하나 팀 결정 사항.

**Acceptance Criteria**
- [ ] 팀 결정 후 ADR 작성 (`doc/decisions/002-vectorstore-selection.md`)
- [ ] 선택에 따라 불필요한 extension 또는 Chroma 의존성 제거
- [ ] README 아키텍처 섹션 정리

---

## 4. 이슈 의존성 그래프

```
#1 (Bizinfo 필드) ────────────────────────────┐
#2 (ECOS 수집기) ──────┐                      │
#3 (Sbiz 수집기) ──────┤ 실수집 유입 전       ▼
#6 (활성 공고 필터) ◄──┘        #8 (evidence 생성) ──► #9 (S5 Pipeline)
#7 (Chroma 임베딩)                                           │
                                                             ▼
#4 (엔티티 픽스) ──────────────────────────────────► #9
#5 (ddl-auto) ←── #4 선행 필수                              │
                                                             ▼
                                                       #10 (S6 알림 API)
                                                       ┌─────┘
                                                       ▼
                                                 #11 (W2 알림 UI)

#10 → #12 (S7 카카오)
#8, #9 → #13 (W3 리포트 뷰어)
#15 (Chroma 결정) → #6, #7 구현 방향 영향
```

---

## 5. 의도적 제외 목록 (이슈 생성 불필요)

| 항목 | 근거 |
|------|------|
| 인증/로그인 | work_breakdown01 §부록: profileId 기반 데모 페르소나로 대체, KB 인프라 위임 |
| 알림톡·친구톡 | ADR 001: 사업자 인증·템플릿 심사 불가, 확장 로드맵 기재 |
| FCM 웹푸시 (S10) | work_breakdown01 §3 S10: P3, 마일스톤 후 |
| WebSocket | ADR 001 §2-1: 양방향 불필요, 기각 |
| 신청서 자동 제출 | work_breakdown01 §1 금지사항: PRD §5-3 초안 생성까지만 |
| HWP 서버사이드 생성 | CLAUDE.md: 서버사이드 생성 불가, docx/PDF가 MVP 산출물 |
| Q9 국세청 상태조회 | work_breakdown01 §3 S3: TODO, 우선순위 낮음 (P3 이하) |
