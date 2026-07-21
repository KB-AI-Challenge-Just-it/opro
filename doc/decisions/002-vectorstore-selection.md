# 벡터스토어 선택: Chroma 유지

**상태**: 결정 완료 (Chroma 유지, pgvector extension 제거)

**관련 문서**: `gap_analysis_01.md` #15

---

## 1. 문제 정의

`01_schema.sql`이 `CREATE EXTENSION IF NOT EXISTS vector`를 실행하지만
벡터 컬럼을 사용하는 테이블이 단 하나도 없다.
임베딩은 전부 Chroma(`apps/ai-engine/app/services/indexing.py`)가 처리하고 있어
pgvector extension이 사문화된 상태다.

README에는 "pgvector + Chroma 병기"로 표기되어 있어 실제 구현과 불일치한다.
벡터스토어를 단일화하지 않으면 인프라 불명확성이 지속되고,
추후 다른 개발자나 AI 하네스가 pgvector 경로를 구현하는 혼선이 생길 수 있다.

---

## 2. 선택지 비교

| 항목 | Chroma 유지 | pgvector 채택 |
|------|------------|--------------|
| 현재 구현 변경 | extension 제거 1줄 | ai-engine 전면 재작성 |
| 한국어 임베딩 제어 | `EmbeddingFunction` 파라미터로 직접 지정 | Spring pgvector 쿼리 추가 필요 |
| 로컬 개발 편의 | Chroma 컨테이너 단독 기동 가능 | Postgres 의존으로 단일화 (장점도 있음) |
| MVP 리스크 | 낮음 — 이미 동작 중 | 높음 — 검증되지 않은 경로 |
| §1 경계 원칙 | ai-engine 내부 구현으로 유지 | Spring ↔ ai-engine 경계 재설계 필요 |

---

## 3. 결정: Chroma 유지

MVP 4주 타임라인 내에서 벡터스토어 교체는 득보다 실이 크다.
Chroma는 이미 동작 중이고, 한국어 임베딩 함수 명시(이슈 #7)로 품질 개선이 가능하다.
pgvector는 Postgres 단일화 측면에서 장기적으로 재검토 가능하나 MVP 범위 밖으로 명시한다.

**실서비스 전환 시 재검토 포인트**: KB 인프라 탑재 시 Postgres 관리형 서비스를 쓰게 되면
pgvector로 단일화하는 것이 운영 효율 면에서 유리할 수 있다.

---

## 4. 후속 조치

| 항목 | 담당 | 시점 |
|------|------|------|
| `01_schema.sql`에서 `CREATE EXTENSION IF NOT EXISTS vector` 제거 | 백엔드 | Week 2 (이슈 #5 ddl-auto 픽스와 동일 PR) |
| README 아키텍처 섹션 "pgvector" 표기 → "Chroma" 단일 표기로 수정 | 공통 | Week 2 |
| Chroma 임베딩 함수 한국어 모델 명시 | AI | Week 2 (이슈 #7) |
