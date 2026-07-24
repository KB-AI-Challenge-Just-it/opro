# 대화형 2-콜 컨설팅 플로우 — 설계 문서

**작성일**: 2026-07-23
**상태**: 승인됨 (브레인스토밍 완료, 구현 계획 대기)
**관련 기획**: `doc/prd.md` (§4 서비스 흐름, §5-2 파이프라인)

---

## 1. 목적

온보딩 직후 "첫 리포트"를 한 번에 백그라운드로 생성하던 방식을, **사용자와 상호작용하는
2단계 LLM 호출 플로우**로 교체한다.

- **콜1 (개인화)**: 사장님의 상황을 뾰족하게 진단하고, 진단에서 불확실했던 지점을 검증 재질문으로 되묻는다.
- **대기 구간**: 사장님이 진단 리포트를 읽고(읽을거리) 재질문에 답하는 동안, 콜1→콜2 사이의
  "기다리는 지루함"이 능동적 활동으로 자연스럽게 대체된다.
- **콜2 (전문화)**: 진단 + 재질문 답변을 근거로 기존 정책자금 매칭·리포트 파이프라인을
  더 풍부하게 돌려 최종 리포트를 만든다.

**전략적 배경**: 박리다매가 아닌 프리미엄 전략. 토큰/비용이 더 들더라도 개인화·전문화 품질을
극대화해 대회 우승을 목표로 한다.

---

## 2. 확정된 결정 사항 (브레인스토밍 합의)

| 항목 | 결정 |
| --- | --- |
| 플로우 위치 | 온보딩 직후 '첫 리포트' 생성 과정 자체를 이 2-콜 플로우로 교체 |
| 콜1 결과물 | 경영 진단 리포트(읽을거리) + 검증 재질문 |
| 타이밍 | **순차 게이팅** — 재질문 답변을 받아야 콜2 시작 (답변이 콜2에 100% 반영) |
| 재질문 형태 | 폐쇄형(객관식) + 필요시 자유서술 혼합, 2~4개 |
| 콜1 진단 입력 | 온보딩 답변 + 상권(`market_snapshot`)/경기지표(`econ_indicator`) 실데이터 결합 |
| 아키텍처 | **A안** — Spring 오케스트레이션 + 2 엔드포인트 + 세션 상태 테이블 |

---

## 3. 전체 플로우 (상태 머신)

```
온보딩 제출
  └─▶ POST /api/consult/diagnose ──▶ [콜1: 진단]  (ai-engine POST /diagnose)
        └─▶ consultation_session 저장 (status=DIAGNOSED) + 진단리포트·재질문 반환
              └─▶ [화면] 진단 읽기 + 재질문 답변   ← 대기를 능동활동으로 대체
                    └─▶ POST /api/consult/specialize (답변 or 스킵)
                          └─▶ [콜2: 전문화] = 기존 매칭→explain_fit→리포트 재사용
                                └─▶ session status=COMPLETED + 최종 리포트 → 알림
```

상태 전이: `(없음) → DIAGNOSED → COMPLETED`. 실패 시 상태 유지 + 재시도 경로.

---

## 4. 콜1 — 개인화 진단 (신규 `ai-engine POST /diagnose`)

**서비스 경계 준수**: ai-engine은 stateless를 유지한다. `market_snapshot`/`econ_indicator`/프로필을
직접 조회하지 않고, Spring이 지역·업종으로 필터해 요청 body에 담아 전달한다.

### 입력 (Spring → ai-engine)
```json
{
  "profile": { /* business_profile 컬럼 (업종·지역·매출·리스크 등) */ },
  "market_context": { /* market_snapshot 중 해당 지역·업종 metric */ },
  "econ_context": { /* econ_indicator 중 금리·업종 BSI 등 */ }
}
```

### 출력 (ai-engine → Spring)
```json
{
  "diagnosis": "경영 진단 리포트 본문 (강점·리스크·현 상황 해석, 사장님이 읽는 텍스트)",
  "follow_up_questions": [
    { "id": "q1", "question": "...", "type": "choice", "options": ["...", "..."] },
    { "id": "q2", "question": "...", "type": "text" }
  ]
}
```

- `diagnosis`: 사장님이 읽는 본문. 진단이 곧 갭 구간의 "읽을거리"다.
- `follow_up_questions`: 2~4개. 진단에서 **불확실했던 지점**을 콕 집어 되묻는다. `type`은
  `choice`(폐쇄형, `options` 포함) 또는 `text`(자유서술) 혼합.

### 모델 / effort
- **Opus, 깊은 추론(xhigh)**. 개인화 품질이 전체 승부처이므로 여기에 토큰을 아끼지 않는다.

---

## 5. 콜2 — 전문화 (기존 파이프라인 재사용 + enrich)

- 기존 `ProfileMatchTrigger.buildQuery` 결과에 **진단 텍스트 + 재질문 답변**을 합성해
  더 풍부한 매칭 쿼리를 만든다.
- 이후 기존 경로 그대로: `hybrid_match` → `explain_fit`(analysis) → `report_gen`(report).
- 재질문 답변이 매칭 쿼리·근거에 실제 반영되어, "내 답이 결과를 바꿨다"는 서사를 만든다.
- 신규 LLM 라우터를 만들지 않고 **기존 matching/analysis/report 라우터를 재사용**한다.

---

## 6. 데이터 모델 (신규 테이블 `consultation_session`)

Spring이 소유(경계 원칙). 스키마 단일 소스는 `db/init/*.sql` 규칙에 따라 새 번호 파일로 추가한다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | bigserial PK | |
| `profile_id` | bigint FK → business_profile | |
| `status` | varchar | `DIAGNOSED` / `COMPLETED` |
| `diagnosis_text` | text | 콜1 진단 본문 |
| `follow_up_questions` | jsonb | 콜1이 생성한 재질문 배열 |
| `follow_up_answers` | jsonb | 사용자 답변 (스킵 시 빈 값) |
| `report_id` | bigint FK → report (nullable) | 콜2 완료 후 채워짐 |
| `created_at` | timestamptz | |

---

## 7. API 계약 (신규 api-core 엔드포인트 2개)

### `POST /api/consult/diagnose`
- **입력**: `{ profileId }`
- **동작**: 프로필 + 상권/경기 데이터 조회 → ai-engine `/diagnose` 호출 → 세션 저장(DIAGNOSED)
- **출력**: `{ sessionId, diagnosis, followUpQuestions }`

### `POST /api/consult/specialize`
- **입력**: `{ sessionId, answers: [{id, value}] | null(스킵) }`
- **동작**: 답변 저장 → 진단+답변으로 기존 매칭·리포트 파이프라인 실행 → 세션 COMPLETED
- **출력**: `{ sessionId, reportId, status }`

---

## 8. 대기 UX 설계

| 구간 | 처리 |
| --- | --- |
| **Wait A** (콜1 생성 중) | "토리가 사장님 상권·경영 상태를 분석 중…" 테마 로딩 (기대감 빌드업) |
| **갭 구간** (진단 표시 후) | 진단 리포트 = 읽을거리, 하단에 재질문 = 능동 답변. **원래의 지루한 대기를 흡수** |
| **Wait B** (콜2 생성 중) | "이 조건에 딱 맞는 정책자금을 찾는 중…" + 방금 답한 진단 요약 재노출 |

---

## 9. 스킵 / 에러 처리

- **재질문 스킵**: 답변 없이 콜2 진행 (진단만으로 매칭). 스킵 경로를 명시적으로 지원한다.
- **콜1/콜2 실패**: 기존 파이프라인 방어 패턴과 동일 — 원시 500 대신 실패 상태 반환, 재시도 경로 제공.

---

## 10. 데모 시나리오 (성공 기준)

- PRD §2에 따라 **1 업종 × 1 지역**으로 좁혀 end-to-end 완주.
- 심사위원 관점 "wow moment": 진단 → 재질문 답변 → 그 답변이 반영된 전문 리포트로
  이어지는 자연스러운 상호작용. 대기가 지루하지 않고 개인화가 뾰족함을 체감.

---

## 11. 서비스 경계 원칙 재확인 (CLAUDE.md 준수)

- ✅ api-core가 유일한 데이터 오너 — 상권/경기/프로필 조회 및 세션 저장 담당
- ✅ ai-engine은 stateless — 비즈니스 테이블 직접 조회 없이 Spring이 컨텍스트 전달
- ✅ web은 Spring(:8080)만 호출 — ai-engine 직접 호출 없음
- ✅ 업종·지역 하드코딩 없음 — 프로필 컬럼/파라미터로 처리
