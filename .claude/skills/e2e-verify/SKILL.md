---
name: e2e-verify
description: "감지→분석→매칭→리포트→알림 파이프라인의 end-to-end 검증 절차. E2E 검증, 파이프라인 검증, 데모 리허설, '데모 되는지 확인', '완주 확인', 마일스톤 점검, 통합 테스트 요청 시 반드시 이 스킬을 사용할 것. 개별 유닛 검증(단일 API curl)에는 불필요."
---

# E2E Verify — 파이프라인 완주 검증

PRD 성공 기준 "트리거 발동 → Claude 원인 분석 → 정책자금 매칭까지 자동 파이프라인 완주"를 재현 가능한 절차로 검증한다. 수집기가 스텁이어도 시드 데이터로 파이프라인 자체를 완주시킬 수 있다 — 이것이 이 스킬의 존재 이유다.

## 사전 조건

```bash
docker compose up -d postgres chroma          # DB (init 스크립트 01→02→03 자동 실행)
cd apps/ai-engine && uvicorn app.main:app --port 8000   # ANTHROPIC_API_KEY 필요
cd apps/api-core  && ./gradlew bootRun                   # :8080
```

`ANTHROPIC_API_KEY`가 없으면 L3 이후를 검증할 수 없다 — 이 경우 "게이트 2까지만 검증"으로 축소하고 결과에 명시한다.

## 시드

`scripts/seed_demo.sql`을 실행한다 (데모 프로필 + 임계값 초과 상권 스냅샷 + 샘플 공고 3건).

```bash
docker compose exec -T postgres psql -U bizagent -d bizagent < .claude/skills/e2e-verify/scripts/seed_demo.sql
curl -X POST localhost:8000/index/rebuild    # 공고 시드 후 BM25·임베딩 재구성
```

## 검증 게이트 (순서대로 — 실패한 게이트에서 멈추고 보고)

| 게이트 | 실행 | 통과 기준 |
| --- | --- | --- |
| 1. 트리거 발동 | `curl -X POST localhost:8080/api/agent/check/1` | 응답에 `PROCESSED` 이벤트 ≥ 1 (전부 `DUPLICATE_SKIPPED`면 시드 dedup 초기화 필요) |
| 2. 분석 저장 | `SELECT cause_text, needs_funding_match FROM analysis_result ORDER BY id DESC LIMIT 1` | row 존재, cause_text 비어있지 않음 |
| 3. 매칭 저장 | `SELECT * FROM funding_match WHERE analysis_id = (위 id)` | `needs_funding_match=true`였다면 row ≥ 1 + rrf_score 존재 |
| 4. 리포트 | `curl localhost:8080/api/reports?profileId=1` | body_md 존재, 사람이 읽고 납득 가능한 수준 (PRD 성공 기준 ③) |
| 5. 알림 | `curl "localhost:8080/api/notifications?profileId=1&status=UNREAD"` | 리포트 연결(reportId) 알림 ≥ 1 — S6 구현 전이면 "미구현" 표기 |
| 6. 재실행 dedup | 게이트 1 재실행 | 동일 트리거가 `DUPLICATE_SKIPPED` 처리됨 |

## 결과 보고 형식

게이트별 통과/실패/미검증 표 + 실패 게이트의 원인 후보(파일:라인) + 재현 커맨드. 리포트 본문(body_md)은 품질 판단을 위해 전문 인용한다.

## 정리

검증 후 시드로 생성된 trigger_event·report는 남겨둔다 (데모 데이터 겸용). 완전 초기화가 필요하면 `docker compose down -v` 후 재기동.
