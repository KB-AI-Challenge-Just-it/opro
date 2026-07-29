# INELIGIBLE 정책자금 게이트 독립 QA

## 최종 판정

**PASS**

## 실패

없음.

## 재검증에서 해결 확인

- ai-engine 파싱 후처리가 `match_eligibility`와 `match_relevance`가 객체일 때 exact `INELIGIBLE` id를 relevance map에서 강제로 제거한다 (`cause_analysis.py:149-160`).
- 모델이 계약을 위반해 INELIGIBLE 공고에 5점을 반환하는 fake 응답을 사용하고 최종 relevance가 빈 객체인지 검증하는 회귀 테스트가 추가됐다 (`test_analysis.py:238-252`).
- 해당 후처리는 ELIGIBLE/UNCERTAIN/missing/unknown status의 점수를 제거하지 않는다.

## 통과

- prompt는 `ELIGIBLE | INELIGIBLE | UNCERTAIN` 의미, 정보 부족 시 UNCERTAIN, INELIGIBLE 점수 키 생략과 fit_text 추천 금지를 명시한다 (`cause_analysis.py:41-94`).
- MOCK 응답은 모든 공고를 ELIGIBLE로 표시하고 relevance를 제공해 계약상 일관된다 (`cause_analysis.py:105-114`).
- Spring은 분석 직후, rationale/relevance merge와 report 생성·persist 전에 explicit `INELIGIBLE`만 필터링한다 (`PipelineService.java:62-80`).
- missing map, malformed map, missing id, UNCERTAIN 및 unknown status는 exact string 비교상 유지된다 (`PipelineService.java:115-132`).
- 필터 후 0건이면 `statusTracker.noMatch(profileId)` 후 null을 반환하므로 merge, report generation, writer/persist를 호출하지 않는다 (`PipelineService.java:67-72`).
- `ConsultationService`는 pipeline null을 `NO_MATCH`, null reportId로 변환하고 report_id를 기록하지 않는다 (`ConsultationService.java:101-113`).
- `ProfileMatchTrigger`는 nullable 반환을 안전하게 처리하고 `RunResult(..., 0, null)`을 반환한다 (`ProfileMatchTrigger.java:128-137`).
- Spring helper 테스트는 explicit INELIGIBLE 제거 및 missing/malformed/unknown 유지 사례를 포함한다 (`PipelineServiceTest.java:147-181`).
- 서비스 경계상 AI 호출은 Spring `AiEngineClient`를 거치며 이번 변경에 ai-engine의 비즈니스 테이블 접근이나 Spring의 Anthropic 직접 의존성 추가는 확인되지 않았다.

## 실행 검증

- Python 전체 관련 실행: **PASS**, 48 passed (담당 개발자 제공 결과).
- Spring `PipelineServiceTest`: **PASS**, BUILD SUCCESSFUL (담당 개발자 제공 결과).
- 재검증 `git diff --check`: **PASS**.

## 미검증

- 실제 LLM 응답 및 Spring↔ai-engine HTTP 통합 실행.
- DB writer/report 생성 미호출을 mock으로 검증하는 pipeline orchestration 테스트. 현재 Spring 추가 테스트는 private filter helper 중심이다.
