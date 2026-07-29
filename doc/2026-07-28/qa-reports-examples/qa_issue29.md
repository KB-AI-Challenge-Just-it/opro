# QA 리포트 — 이슈 #29 프로필 기반 능동 매칭 트리거 개편 (feat/#29)

- 검증 일자: 2026-07-20
- 검증 대상: 임계값 `TriggerEngine` 폐지 → 온보딩 프로필(업종·지역·고민) 기반 정책자금 능동 매칭을 유일한 트리거로 전환
- 검증 방식: 정적 교차 비교 + 실행 검증(Java 컴파일 / pytest / 실 Postgres 트랜잭션 검증) + **실 E2E(추가 세션, §8)**
- 판정: **PASS (E2E 조인트 완주 확인 완료)** — 경계면 정합·컴파일·유닛·SQL↔DDL 실행 검증 모두 통과. 사용자 승인으로 postgres 볼륨 재생성 후 실 파이프라인 완주까지 확인됨(§8).

---

## 판정 요약

| 심각도 | 항목 | 판정 |
| --- | --- | --- |
| — | Spring↔FastAPI `/analysis` 필드명(`fit_text`) 정합 | PASS (유닛 테스트로 실증) |
| — | SQL↔DDL 컬럼명·`ON CONFLICT`↔`UNIQUE` 정합 | PASS (실 Postgres 트랜잭션 검증) |
| — | 하드코딩 없음(업종·지역·고민은 프로필 값) | PASS |
| — | 아키텍처 불변식 3종 | PASS |
| — | Java 컴파일 / pytest(3건) | PASS |
| INFO | 계약 문서(§3 표 line 46) "응답 형태는 유지" 문구가 실제 재정의된 응답과 불일치 | 문서 이슈로 분리 |
| INFO | `EcosCollector`/`SbizCollector` 주석의 `TriggerEngine` 명명 언급 잔존 | 스코프 밖(지적만) |
| 미검증 | E2E step 3~5 (실 파이프라인 완주·dedup·온보딩) | 볼륨 재생성 필요 — 사용자 확인 요망 |

---

## 1. 경계면 교차 검증 — PASS

### 1-1. `buildQuery` 하드코딩 여부 — PASS
`ProfileMatchTrigger.java:40-56`. 업종(`industry`)·지역(`region_sigungu`/`region_sido`)·고민(`concerns`)을 전부 프로필 Map에서 꺼내 문자열 조합만 한다. 업종/지역 목록의 코드 내 하드코딩 없음. `sigungu` 우선, 없으면 `sido` fallback 하는 것 외에 분기 없음.

### 1-2. Spring↔FastAPI `/analysis` 필드명 정합 — PASS (실증)
- 생산자(Spring): `AiEngineClient.analyze()` → `POST /analysis` body `{profile, matches}`. 응답에서 `analysis.get("fit_text")` 읽음 (`PipelineService.java:42-43`).
- 소비자(FastAPI): `analysis.py` `AnalyzeRequest{profile, matches, market_context?}`, `cause_analysis.explain_fit()`가 `{"fit_text": ...}` 반환 (JSON 파싱 실패 시에도 `{"fit_text": raw}` fallback — 조용히 깨지는 키 불일치 없음).
- `market_context`는 Spring이 보내지 않지만 BaseModel 기본값 `None`이라 정상. 계약 §2-2의 `market_context?` optional과 일치.
- `pytest tests/test_analysis.py` 3건이 이 계약(키가 정확히 `{fit_text}`, legacy 키 부재, market_context 전달)을 실증.

### 1-3. 06 DDL ↔ SQL 정합 — PASS (실 Postgres 검증)
`db/init/06_profile_funding_alert.sql`의 `profile_funding_alert(profile_id, pblanc_id, notified_at)` + `UNIQUE(profile_id, pblanc_id)`가
- `ProfileMatchTrigger.java:72` `SELECT pblanc_id ... WHERE profile_id = ?`
- `PipelineService.java:88-91` `INSERT ... ON CONFLICT (profile_id, pblanc_id) DO NOTHING`
와 정확히 일치. 실 Postgres(트랜잭션 내 CREATE→INSERT→재INSERT→ROLLBACK)로 확인:
  - 1차 INSERT `INSERT 0 1`, 2차 INSERT `INSERT 0 0`(no-op), 최종 count=1 → **`ON CONFLICT` 타깃이 UNIQUE 제약과 정확히 매칭, dedup 동작 확인.**
  - FK(`business_profile(id)`, `policy_announcement(pblanc_id)`) 모두 해소.
- `PipelineService`가 쓰는 `analysis_result(trigger_event_id NULL, cause_text, needs_funding_match, model)` / `funding_match(analysis_id, pblanc_id, bm25_rank, vector_rank, rrf_score, evidence)` / `report` / `notification` 컬럼명도 01·03 DDL과 전부 일치. `trigger_event_id`는 nullable이라 NULL 삽입 정상.
- 매칭 dict 키(`AiEngineClient.match()` → `hybrid_search.py`)가 `pblanc_id/title/evidence/rrf_score/bm25_rank/vector_rank`를 전부 반환 → `PipelineService`가 읽는 키와 일치.

### 1-4. 아키텍처 불변식 — PASS
- ai-engine이 `business_profile`/`profile_funding_alert`/`funding_match`/`analysis_result`/`report`/`notification`/`trigger_event` 등 비즈니스 테이블 직접 조회: **없음**(grep). ai-engine의 `policy_announcement` 접근은 RAG 코퍼스라 허용 범위.
- Spring `anthropic` 의존성: **없음**(build.gradle·src grep).
- web `:8000` 직접 호출: **없음**.
- 삭제된 `TriggerEngine`을 참조하는 import/생성자: **없음** — 컴파일 성공이 이를 뒷받침.

---

## 2. 컴파일 · 유닛 테스트 — PASS
- `./gradlew compileJava` (JDK 17): **BUILD SUCCESSFUL** (exit 0).
- `pytest tests/test_analysis.py`: **3 passed** (Python 3.11 venv에서. 시스템 python 3.9는 PEP 604 `dict | None` 미지원 → 환경 이슈일 뿐 코드는 정상. Dockerfile은 python:3.12-slim).

---

## 3. E2E 시나리오 — 미검증 (사유 §7)

`docker compose up`은 가능하나, 루트에 이미 `pg-data/` 볼륨이 존재하여 `06_*.sql`이 **재적용되지 않음**(initdb는 빈 볼륨에서만 실행). 실제로 기동 후 확인:
- `\dt profile_funding_alert` → **테이블 없음**
- `SELECT ... FROM business_profile` → **0행**

따라서 `POST /api/agent/check/1`(step 3~4)과 온보딩(step 5)의 실 파이프라인 완주는 **미검증**. 볼륨 재생성이 필요하나 지시에 따라 `pg-data`/`chroma-data` 파괴적 작업은 수행하지 않음. → **사용자 확인 요망**(§7).

대신 SQL↔DDL 경계는 §1-3처럼 실 Postgres 트랜잭션(임시 검증 후 ROLLBACK, 데모 데이터 무손상)으로 실증했다. 추가로 실 파이프라인은 `ANTHROPIC_API_KEY` + bge-m3(CPU 3분) 의존이라 볼륨 재생성만으로 자동 완주되지는 않음.

---

## 4. 스코프 확인 — PASS
- `threshold_rule`/`trigger_event`/`market_snapshot`/`econ_indicator`: `06_*.sql`에 `DROP` 없음(grep 0건). 01 DDL에 그대로 잔존 → 스코프 축소 의도대로 미삭제. 정상.
- `TriggerEngine.java`: 삭제됨(git status `D`). 잔여 참조는 주석뿐.

---

## 5. 문서 이슈 (코드 아님)
`doc/work_breakdown01.md` §3 표 line 46: `POST /api/agent/check/{profileId}` 설명에 "경로·응답 형태는 유지"라고 되어 있으나, 실제 응답은 `{profileId, newMatches, status, reportId?}`로 **재정의됨**(과업 명세·`AgentController.java:25-30`). 문서 문구가 코드와 어긋남 — 문서 갱신 권장(코드 수정 대상 아님). §2-2 line 112의 `/analysis` 계약은 코드와 정확히 일치.

---

## 6. 스코프 밖(지적만, 수정 안 함)
`EcosCollector.java:17,34`·`SbizCollector.java:31` 주석의 "TriggerEngine 명명 규칙" 언급이 남아 있음. 이번 이슈에서 트리거가 폐지되었으므로 향후 정리 대상이나, 본 스코프 밖.

---

## 7. 다음 액션 (해소됨 — §8 참고)
~~새 스키마(`06_*.sql`) 반영과 실 E2E 완주 확인을 위해 postgres 볼륨 재생성이 필요합니다.~~ 사용자 승인 하에 볼륨 재생성 진행, §8에서 완주 확인.

---

## 8. 실 E2E 완주 확인 (2026-07-20, 사용자 승인 후 오케스트레이터 직접 수행)

`pg-data`/`chroma-data` 삭제 → `docker compose up -d --build`(5개 컨테이너 정상 기동) → `\dt profile_funding_alert` 존재 확인 → 시드(`seed_demo.sql`) + `POST /index/rebuild` → `{"indexed":2}`.

| 시나리오 | 결과 |
| --- | --- |
| `POST /api/agent/check/1` (시드 프로필, 최초) | `{"newMatches":2,"reportId":1,"profileId":1,"status":"PROCESSED"}` — 실 Claude 호출로 리포트 생성, `matches`에 evidence·마감일·`detailUrl` 전부 정상 |
| `POST /api/agent/check/1` (재실행) | `{"newMatches":0,"profileId":1,"status":"NO_NEW_MATCH"}` — **dedup 정상 동작** |
| `GET /api/reports/1` | 마크다운 리포트 확인 — 매칭 2건(DEMO-0001/0002)에 근거·마감일·링크 포함 |
| `POST /api/onboarding` (신규 프로필, 강남구/카페) | 29초 만에 200 응답(id=3) — **동기 매칭 트리거가 온보딩 응답을 막지 않음** 확인 |
| `GET /api/reports?profileId=3` | 리포트 생성됨(id=2) — 온보딩 직후 동기 매칭 실증 |
| `GET /api/notifications?profileId=3&status=UNREAD` | 알림 1건(`UNREAD`) 확인 |
| `profile_funding_alert` 테이블 | profile 1·3 각각 (DEMO-0001, DEMO-0002) 2행씩, 총 4행 — dedup 이력 정상 기록 |

**최종 판정: PASS.** 이슈 #29 구현이 실제 동작까지 확인됨. 남은 INFO 항목(§5, §6 문서/스코프 외 코멘트)은 블로커 아님.
