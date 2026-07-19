## 테이블 전체 맵 — 무엇을 저장하고, 왜 필요한가

> 스키마 단일소스: `db/init/01→02→03→(신규)05` 번호순 SQL. 아래는 피벗 이후 기준 전체 테이블의 역할과 대응 요구사항.

### 공용 기반

| 테이블 | 저장 내용 | 왜 필요한가 | 대응 요구사항 |
|---|---|---|---|
| `app_user` | 사용자 계정 (데모 계정 1건 시드) | `business_profile.user_id`·`funding_request.user_id` FK 무결성의 뿌리. 인증은 MVP 범위 밖이라 userId=1 고정 | 공용 — 목록/상세의 userId 스코핑 전제 |
| `policy_announcement` | 기업마당 공고 원본 (pblanc_id PK, 제목, summary_html, 대상, 지역, 신청기간, **detail_url**, attachment_urls, raw JSONB) | **두 트랙 모두의 매칭 대상 코퍼스.** `/index/rebuild`가 여기서 활성 공고만 읽어 BM25·Chroma 인덱스 구성. detail_url이 "공고 링크 필수 제공" 요구의 원천, raw/신규 컬럼이 사전 크롤 텍스트 저장처 | 신규 요구 2(공고 찾기+링크), 3(서류 크롤링) |

### 수집 레이어 (L1 — 모니터링 트랙의 입력)

| 테이블 | 저장 내용 | 왜 필요한가 | 대응 요구사항 |
|---|---|---|---|
| `market_snapshot` | 상권 API 수집값 (지역×업종별 metric JSONB — `new_competitors_500m` 등) | 트리거 엔진이 "경쟁 심화" 같은 변화를 감지하는 관측 데이터. JSONB 키 = `threshold_rule.metric_key` 계약 | 기존 PRD — 상시 모니터링 |
| `econ_indicator` | ECOS 경기지표 시계열 (기준금리·CPI·BSI, indicator_code×observed_at) | 상권 외 거시 지표 트리거(금리 인상 등)의 관측 데이터. window 내 변화량 계산용으로 관측점 2개 이상 필요 | 기존 PRD — 상시 모니터링 |
| `threshold_rule` | 업종별 임계값 규칙 (metric_key, operator, threshold, window_days) | **"임계값을 하드코딩하지 않는다"** 원칙의 구현체 — 트리거 조건이 코드가 아니라 데이터. 업종 추가 = 행 추가 | 기존 PRD — 규칙 기반 감지(§1 확장성) |

### 모니터링 트랙 (기존 PRD: 감지→분석→매칭→리포트→푸시)

| 테이블 | 저장 내용 | 왜 필요한가 | 대응 요구사항 |
|---|---|---|---|
| `business_profile` | 온보딩 Q1~Q9 답변 + 상권 매핑 코드(market_region_code/market_industry_code) | 모니터링의 **대상**. 트리거 평가 시 임계값 규칙과 조인되고, L3 원인분석의 개인화 컨텍스트로 Claude에 전달됨. 신규 11문항과 분리 유지(§3-6) | 기존 PRD — 프로필 기반 개인화 |
| `trigger_event` | 임계값 초과 이벤트 (metric_key, observed_value, **dedup_key**, status NEW/DUPLICATE_SKIPPED/PROCESSED) | 감지 사실의 기록이자 **14일 중복 알림 차단 게이트** — 같은 트리거로 Claude를 다시 태우지 않게 하는 비용·UX 방어선 | 기존 PRD — 중복 알림 방지 |
| `analysis_result` | L3 Claude 원인분석 (cause_text, needs_funding_match 판단, 사용 모델) | AI 판단의 감사 기록. cause_text가 L4 매칭 쿼리와 L5 리포트의 입력이 되고, needs_funding_match가 매칭 실행 여부를 결정 | 기존 PRD — 원인 분석 |
| `funding_match` | 트리거 파이프라인의 RAG 매칭 결과 (analysis_id FK, 순위·RRF 점수·evidence) | "왜 이 공고를 추천했나"의 근거 저장 — 리포트 상세의 매칭 카드 데이터. **analysis_id에 묶여 있어 pull 트랙에서 재사용 불가** → 05에서 별도 테이블 신설 이유 | 기존 PRD — 근거 있는 매칭 |
| `report` | L5 리포트 본문(body_md) + pushed_at | 사용자에게 전달되는 최종 산출물. 홈 목록·리포트 상세 화면의 원천 | 기존 PRD — 리포트 push |
| `notification` | 알림 (profile_id, report_id, UNREAD/READ) | 벨 30초 폴링(`GET /api/notifications`)의 데이터 — "리포트 도착"을 사용자에게 알리는 유일한 경로 | 기존 PRD — 알림/푸시 |
| `notification_delivery` | 채널별 발송 이력 (KAKAO_MEMO/FCM/ALIMTALK, 상태) | 외부 채널 발송 대비 스키마 선반영. **발송 코드는 미구현** — 지금은 빈 테이블이 정상 | 기존 PRD 확장(S7) — 미착수 |

### Pull 트랙 (신규 요구사항 — 이번 피벗에서 신설)

| 테이블 | 저장 내용 | 왜 필요한가 | 대응 요구사항 |
|---|---|---|---|
| `funding_request` *(05 신설)* | 11문항 답변 전체(answers JSONB) + status(PENDING/INELIGIBLE/MATCHED/FAILED) + gate_message | 사용자 제출의 단위이자 **목록/상세 화면의 원천**. status가 결격 안내·실패 영속화·비동기 전환 헤지를 전부 담당 | 신규 요구 1(질문 답변 수신), 4(제출 목록·상세 조회) |
| `funding_request_match` *(05 신설)* | pull 흐름의 매칭 결과 (request_id FK, pblanc_id, 순위·RRF·evidence) | 제출 상세에서 "이 답변에 이 공고들이 매칭됐다"를 재조회하려면 결과가 요청 단위로 남아야 함. `policy_announcement`와 조인해 제목·**detail_url**·마감일을 카드로 노출 | 신규 요구 2(공고 찾기+링크 제공) |
| `application_draft` *(request_id 컬럼 추가)* | 초안 섹션 JSONB ({사업개요, 신청사유, ...}) + 출처(report_id **또는** request_id 중 정확히 하나) | "초안 생성하기" 결과의 저장처 — 상세 재방문 시 재생성 없이 표시(Claude 재호출 방지). 두 트랙이 같은 테이블을 공유하되 CHECK 제약으로 출처를 구분 | 신규 요구 3(초안 생성), 기존 확장(5-3) |
| `eligibility_rule` *(05 신설, §3-2)* | 자격 게이트 규칙 (answer_key, 결격 값, 안내 메시지) | 결격 판정을 코드가 아닌 데이터로 — 재도전 자금 예외 문구 포함. `threshold_rule`과 같은 철학(§1 하드코딩 금지) | 신규 요구 1의 스크리닝 단계 |

### 한눈 요약

```
[공용]        app_user ─┬─ business_profile ──(모니터링 트랙)── trigger_event → analysis_result → funding_match
                        │                                                          └→ report → notification → notification_delivery
                        └─ funding_request ──(pull 트랙)── funding_request_match
                                     │                            │
[코퍼스]      policy_announcement ←──┴────────────────────────────┘   ←─ market_snapshot·econ_indicator·threshold_rule은 모니터링 입력
[초안 공유]   application_draft (report_id ⊕ request_id)
```
