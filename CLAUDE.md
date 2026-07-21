# 소상공인 금융 지원 에이전트 (biz-agent)

온보딩 질문지 → 프로필 기반 하이브리드 RAG 정책자금 매칭 → Claude 리포트 생성 → 알림.
회원가입/로그인, 질문(온보딩) 이력 조회, MOCK_LLM 개발 스위치까지 포함된 다중 사용자 서비스.

## 서비스 경계 원칙 (항상 지킬 것)

| 서비스 | 포트 | 역할 | 절대 규칙 |
| --- | --- | --- | --- |
| **api-core** (Spring Boot 3, Java 21) | 8080 | **유일한 데이터 오너.** 수집·저장·조회·매칭 트리거·파이프라인 지휘·알림·인증 | Claude API를 직접 호출하지 않는다 — AI가 필요하면 반드시 `AiEngineClient`를 거친다 |
| **ai-engine** (FastAPI, Python) | 8000 | **stateless AI 서비스.** Spring이 컨텍스트를 담아 호출하면 Claude 결과·RAG 매칭만 반환 | 비즈니스 테이블(`business_profile`, `report`, `app_user` 등)을 직접 조회·저장하지 않는다. 유일한 예외: `/index/rebuild`가 `policy_announcement`를 읽어 BM25·Chroma 구성 |
| **web** (Next.js App Router) | 3000 | 로그인/회원가입, 온보딩 질문지, 질문 이력, 알림 수신, 리포트 뷰어 | **Spring(:8080)만 호출한다.** ai-engine(:8000) 직접 호출 금지 |

**흔히 저지르는 위반 (명시적 금지사항)**:
- ❌ ai-engine에서 `business_profile`/`app_user` SELECT — 필요한 값은 Spring이 요청 body에 담아 보낸다
- ❌ Spring 코드에 `anthropic` SDK 의존성 추가
- ❌ web에서 `http://localhost:8000` 호출
- ❌ 업종·지역·임계값을 코드에 하드코딩 — 파라미터화(컬럼·환경변수·설정 테이블)할 것
- ❌ 신청서 자동 제출 기능 구현 — 초안 생성까지만, 제출은 사용자 책임
- ❌ 스키마 변경을 JPA `ddl-auto` 등으로 우회 — 스키마 단일 소스는 `db/init/*.sql`(번호 순서대로 1회 실행, 이미 배포된 DB는 수동 마이그레이션 필요)
- ❌ Pro/Max 구독 OAuth로 이 서비스(다중 사용자 백엔드)를 돌리는 시도 — Anthropic 상업 이용 약관 위반 소지, API 키만 사용

**API 계약의 단일 소스는 코드 자체다.** 예전엔 `doc/work_breakdown01.md`가 계약 문서였지만
기능이 그 문서가 따라가지 못할 속도로 진화해 stale해졌다(2026-07-21 삭제). 정확한 요청/응답
스키마가 필요하면 해당 `*Controller.java`를 직접 읽을 것 — 이 표의 경계 원칙만 문서로 유지한다.

## 하네스: 기능 구현

**트리거:** `apps/` 하위 기능 구현·수정·보완·이어서 개발 요청 시 `dev-orchestrator` 스킬을 사용하라. 단순 질문·문서 열람·한 파일 소규모 수정은 직접 응답 가능.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-07-13 | 초기 구성 — 에이전트 4(backend-dev·ai-dev·web-dev·qa-verifier) + 스킬 3(dev-orchestrator·rag-conventions·e2e-verify) | 전체 | 1인 개발 전환 (어드바이저 2차 검토 반영) |
| 2026-07-21 | `doc/work_breakdown01.md` 삭제, 경계 원칙을 이 파일로 이관 | CLAUDE.md | 계약 문서가 실제 구현(다중 사용자 인증·질문 이력·MOCK_LLM 등)을 못 따라가 stale — 코드가 계약의 단일 소스가 됨 |
