---
name: commit-split
description: 현재 변경사항을 빌드 단위(컴파일 통과 기준)로 최대한 작게 쪼개 커밋 순서와 의존 그래프를 제안한다
triggers:
  - commit split
  - 커밋 쪼개기
  - 빌드 단위로 커밋
  - 커밋 단위
  - 어떻게 커밋
  - 커밋 순서
---

# Commit Split

변경된 파일들을 분석해 "각 커밋이 독립적으로 컴파일·빌드 통과"하는 최소 단위로 쪼개고,
커밋 순서와 의존 그래프를 한눈에 보여준다.

## Inputs

- 현재 git diff (staged + unstaged) 또는 이번 세션에서 작업한 파일 목록
- 프로젝트 언어/빌드 도구 (Java/Gradle, TypeScript/npm 등)

## Steps

### 1. 변경 파일 수집

```bash
git diff --name-only HEAD
git diff --name-only --cached
```

파일이 없으면 이번 세션에서 직접 수정한 파일 목록을 사용한다.

### 2. 파일을 레이어로 분류

아래 순서대로 레이어를 나눈다. 레이어가 낮을수록 의존성이 없는(leaf) 쪽이다.

| 레이어 | 해당 파일 유형 |
|---|---|
| 0 — 인프라/설정 | DB 마이그레이션, yml, properties |
| 1 — 도메인/엔티티 | Entity, Enum, Repository 인터페이스 |
| 2 — DTO | Request/Response record·class |
| 3 — 서비스/유스케이스 | Service, UseCase |
| 4 — 컨트롤러/API | Controller, ControllerApi (인터페이스) |
| 5 — 테스트 | *Test.java, Fixture |
| 6 — 문서 | *.md, OpenAPI spec |

### 3. 레이어 내 파일 묶기

같은 레이어 안에서도 **서로 의존하지 않는 파일**은 같은 커밋으로 묶는다.
한 레이어 안에서 A가 B를 import한다면 B를 먼저 커밋한다.

### 4. 빌드 검증 포인트 확인

각 커밋 후보에 대해 "이 커밋만 체크아웃했을 때 빌드가 통과하는가"를 따진다.

- **통과 조건**: 컴파일 오류 없음 + 기존 테스트 깨지지 않음
- **주의**: 인터페이스를 먼저 커밋하고 구현체가 없으면 컴파일 실패 → 인터페이스+구현체는 같은 커밋으로 묶는다

### 5. 커밋 메시지 제안

각 커밋에 `<type>(<scope>): <subject>` 형식으로 메시지를 제안한다.

| type | 사용 시점 |
|---|---|
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `test` | 테스트 추가·수정 |
| `refactor` | 동작 변경 없는 코드 개선 |
| `docs` | 문서만 변경 |
| `chore` | 빌드 설정, 의존성 등 |

### 6. 의존 그래프 출력

```
Commit 1 ──────── Commit 2
    │                  │
    └──────┬───────────┘
           ↓
        Commit 3
           │
    ┌──────┴──────┐
    ↓             ↓
Commit 4      Commit 5 (독립)
```

병렬(독립) 커밋은 같은 줄에 표시한다.

## Success Criteria

- 각 커밋을 순서대로 적용하면 매 단계에서 빌드가 통과한다
- 커밋 하나가 하나의 "변경 이유"를 담는다
- 의존 그래프를 보고 커밋 순서를 바꿀 여지가 있는지 판단할 수 있다

## Constraints & Pitfalls

- **인터페이스+구현 분리 금지**: Spring Controller 인터페이스와 구현체는 분리하면 `@Override` 오류. 반드시 같은 커밋.
- **DTO 먼저**: Service가 DTO를 쓰면 DTO 커밋이 Service 커밋보다 앞에 와야 한다.
- **테스트는 항상 마지막**: 프로덕션 코드가 없으면 테스트 컴파일 불가. 테스트 픽스처도 동일 커밋 또는 그 직후.
- **문서는 어디든**: `.md` 파일은 빌드와 무관하므로 어느 커밋에 넣어도 된다.
- **DB 마이그레이션은 첫 커밋**: Entity와 같이 넣거나 한 커밋 앞에 둔다.

## Output Format

```
**Commit N — <한 줄 설명>**
\`\`\`
<type>(<scope>): <subject>
\`\`\`
- 변경 파일 목록
- 이 시점에 빌드 통과 여부
```

마지막에 의존 그래프를 ASCII로 출력한다.
