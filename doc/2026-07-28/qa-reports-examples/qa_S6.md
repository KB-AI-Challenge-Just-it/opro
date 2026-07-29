# QA 리포트 — S6 알림 API (feat/#11)

- 검증 일자: 2026-07-16
- 검증 대상 브랜치/작업: S6 NOTI+POLL — `notification` 패키지 + `PipelineService` 알림 INSERT
- 검증 방식: 정적 교차 비교 (실행 미검증 — docker/curl 미수행)
- 판정: **CONDITIONAL PASS** — §2-1 계약·DDL 정합은 통과. 다만 아래 P1 이슈 2건은 3주차 E2E 이전에 수정 권장.

---

## 판정 요약

| 심각도 | 이슈 | 판정 |
| --- | --- | --- |
| P1 (권장 수정) | `Notification.id`에 `@GeneratedValue` 누락 | 실사용 경로에서는 문제 없음. JPA를 통한 신규 insert 시 NULL PK로 실패. 지금은 JdbcTemplate로만 INSERT하므로 런타임 버그는 없지만, 계약 완결성 관점에서는 붙여두는 편이 안전 |
| P1 (권장 수정) | `PATCH /read` 응답의 stale read | `JdbcTemplate.update` 후 `repository.findById()`가 트랜잭션 밖 별도 세션이라 대개 최신값을 읽지만, `@Transactional` 부재 + JPA 1차 캐시/영속성 컨텍스트 상호작용 상 신뢰 취약 |
| INFO | 응답에 계약 외 필드 `readAt` 노출 | 계약 §2-1 응답 스키마엔 없으나, 웹은 무시 가능. 허용 |

이하 각 체크리스트 세부.

---

## 1. 패키지 구조

**PASS**

`apps/api-core/src/main/java/com/bizagent/api/notification/` 하위에 3파일 존재 확인:

```
Notification.java
NotificationController.java
NotificationRepository.java
```

---

## 2. DDL ↔ Entity 교차 검증

**PASS (조건부)**

DDL (`db/init/03_schema_additions.sql:30-42`):

```sql
CREATE TABLE notification (
  id          BIGSERIAL PRIMARY KEY,
  profile_id  BIGINT NOT NULL REFERENCES business_profile(id),
  report_id   BIGINT REFERENCES report(id),
  type        TEXT NOT NULL DEFAULT 'REPORT'
              CHECK (type IN ('REPORT', 'SYSTEM')),
  title       TEXT NOT NULL,
  body        TEXT,
  status      TEXT NOT NULL DEFAULT 'UNREAD'
              CHECK (status IN ('UNREAD', 'READ')),
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

Entity (`Notification.java`):

```java
@Id
private Long id;
private Long profileId;
private Long reportId;
private String type;
private String title;
@Column(columnDefinition = "text")
private String body;
private String status;
private OffsetDateTime readAt;
private OffsetDateTime createdAt;
```

- 모든 DDL 컬럼이 Entity 필드에 1:1 매핑됨.
- `spring.jpa.hibernate.naming.physical-strategy` 기본값 `CamelCaseToUnderscoresNamingStrategy`가 적용되어 `profileId → profile_id`, `readAt → read_at`, `createdAt → created_at` 자동 변환. `application.yml`에서 오버라이드 없음 확인.
- `@Column(columnDefinition = "text")`가 `body` 필드에 붙어 있는데, 이는 스키마 생성용 힌트. `ddl-auto: none` 이므로 실행에는 무영향. **불필요한 어노테이션**이지만 오류는 아님.

### P1 이슈 — `@GeneratedValue` 누락

`id` 컬럼은 DDL에서 `BIGSERIAL PRIMARY KEY` (Postgres identity/sequence). Entity에는 다음이 없음:

```java
@Id
@GeneratedValue(strategy = GenerationType.IDENTITY)
private Long id;
```

**현재 영향**:
- `PipelineService`는 JPA가 아닌 `JdbcTemplate.update()`로 INSERT하고, `id` 컬럼을 명시하지 않아 DB DEFAULT(BIGSERIAL nextval)가 적용됨 → OK.
- `NotificationController.markRead()`는 `repository.findById(id)`로 조회만 함 → OK.
- **문제 시나리오**: 향후 누군가 `repository.save(new Notification(...))`을 호출하면 `id`가 NULL로 전달되어 실패하거나 Hibernate가 `ASSIGNED` 전략으로 오인.

**권장 수정**: `Notification.java:11-12`

```java
@Id
@GeneratedValue(strategy = GenerationType.IDENTITY)
private Long id;
```

동일 저장소의 `Report.java`, `BusinessProfile.java` 컨벤션과 정합.

---

## 3. §2-1 계약 응답 스키마

**PASS**

계약 (`doc/work_breakdown01.md:69-82`) 필수 필드: `id, profileId, reportId, type, title, body, status, createdAt` — 모두 Entity에 존재.

- 계약 외 추가 필드 `readAt` 노출: 웹은 알 수 없는 필드를 무시하므로 계약 위반은 아님. `W2 NOTI_UI` 타입 정의 시 `readAt`을 optional로 반영해도 되고 무시해도 됨.
- 별도 DTO/응답 매퍼 없이 Entity를 그대로 반환 (`List<Notification>`) — Lombok `@Getter` + Jackson이 필드명 camelCase로 직렬화 → 계약 JSON 예시와 일치.

---

## 4. GET 엔드포인트

**PASS**

`NotificationController.java:17-21`:

```java
@GetMapping
public List<Notification> list(@RequestParam Long profileId,
                               @RequestParam(defaultValue = "UNREAD") String status) {
    return repository.findByProfileIdAndStatusOrderByCreatedAtDesc(profileId, status);
}
```

- 경로 `GET /api/notifications` (클래스 `@RequestMapping("/api/notifications")` + `@GetMapping`).
- 쿼리 파라미터: `profileId`, `status` — 계약 §2-1 시그니처 일치.
- `status` 기본값 `"UNREAD"` — 계약 명시 기본값과 일치.
- Repository 메서드명 `findByProfileIdAndStatusOrderByCreatedAtDesc` — DDL 인덱스 `idx_notification_poll (profile_id, status, created_at DESC)`와 정확히 정합. Spring Data JPA가 생성할 SQL도 `WHERE profile_id = ? AND status = ? ORDER BY created_at DESC` → 인덱스 그대로 활용.

---

## 5. PATCH 엔드포인트

**PASS (경로·SQL) / P1 (응답 신뢰성 취약)**

`NotificationController.java:23-27`:

```java
@PatchMapping("/{id}/read")
public Notification markRead(@PathVariable Long id) {
    jdbc.update("UPDATE notification SET status = 'READ', read_at = now() WHERE id = ?", id);
    return repository.findById(id).orElseThrow();
}
```

- 경로 `PATCH /api/notifications/{id}/read` — 계약 일치.
- `status = 'READ'`, `read_at = now()` UPDATE 포함 — 계약 §2-1 명세 일치.
- 존재하지 않는 id는 `NoSuchElementException` → Spring 기본 500. `ResponseStatusException(404)`가 더 적절하지만 MVP 스코프에선 허용 가능.

### P1 이슈 — JdbcTemplate + JpaRepository 혼용의 stale read 위험

같은 트랜잭션 내에서:
1. `jdbc.update(...)` — 실제 DB 업데이트
2. `repository.findById(id)` — JPA로 재조회

`@Transactional`이 없어 각 호출이 개별 auto-commit이므로 대체로는 최신값을 읽는다. 그러나 Hibernate가 트랜잭션 스코프 안에서 캐싱하는 경우 이전 상태 반환 가능성이 있음. `NotificationRepository`가 JPA로 관리되고 있어 특히 취약.

**권장 수정 옵션 A (간단)**: JdbcTemplate으로 조회도 처리

```java
return jdbc.queryForObject(
    "SELECT id, profile_id, report_id, type, title, body, status, read_at, created_at " +
    "FROM notification WHERE id = ?",
    new BeanPropertyRowMapper<>(Notification.class), id);
```

**권장 수정 옵션 B**: 메서드에 `@Transactional` + `entityManager.clear()` 또는 `refresh()`.

옵션 A가 저장소 컨벤션에 가깝다 (`PipelineService`가 raw SQL 위주).

---

## 6. PipelineService notification INSERT

**PASS**

`PipelineService.java:60-68`:

```java
// 알림 생성 — 폴링용 GET /api/notifications 에 노출 (§2-1 계약)
jdbc.update("""
    INSERT INTO notification (profile_id, report_id, type, title, body)
    VALUES (?, ?, 'REPORT', ?, ?)
    """, ev.profileId(), reportId,
    "새 리포트가 도착했어요",
    "원인 분석과 정책자금 매칭 결과를 확인하세요.");

jdbc.update("UPDATE trigger_event SET status = 'PROCESSED' WHERE id = ?", ev.id());
```

- `report` INSERT (line 56-58) 직후 → notification INSERT 순서 OK.
- INSERT 컬럼: `profile_id`(NOT NULL), `report_id`, `type`, `title`(NOT NULL), `body`. 
  - `type`은 값 `'REPORT'` 명시 → CHECK 통과.
  - `status`, `id`, `created_at`, `read_at`은 생략 → DDL DEFAULT (`'UNREAD'`, `BIGSERIAL`, `now()`, `NULL`) 적용 → NOT NULL 컬럼 (`status`, `title`, `profile_id`) 모두 커버됨.
- `trigger_event UPDATE 'PROCESSED'` (line 68)가 알림 INSERT 이후에 위치 — DoD 순서 만족.
- INFO: 하드코딩된 문자열 "새 리포트가 도착했어요" / "원인 분석과 정책자금 매칭 결과를 확인하세요." — MVP 데모용으론 허용. `title`을 트리거 원인 요약(예: "반경 500m 신규 경쟁점 3곳 — 대응 리포트 도착") 기반으로 만들면 계약 예시(`doc/work_breakdown01.md:76`)와 더 근접하지만 스코프 밖 개선 사항.

---

## 7. 경계 위반 검사

**PASS**

- `grep -rn "anthropic" apps/api-core/src/main/java/com/bizagent/api/notification/` → 없음.
- notification 패키지 어느 파일에도 ai-engine 호출(`AiEngineClient` 참조) 없음.
- web(:3000) 참조 없음.
- 업종/지역 하드코딩 없음.

---

## 미검증 항목 (실행 검증 생략)

- **컴파일 확인**: gradle build 미실행. 정적 분석상 syntax·import는 정상.
- **DB 실질의**: `docker compose up -d postgres` + POST `/api/agent/check/1` 후 `notification` row 생성 여부 미확인. E2E 검증은 `e2e-verify` 스킬 호출 시점으로 지연.
- **web 통합**: W2가 아직 미구현이므로 실제 폴링·읽음 처리 UI 확인 불가.

---

## 최종 판정

**CONDITIONAL PASS** — 계약(§2-1)·DDL·경계 원칙 모두 통과. 아래 2건은 3주차 E2E 리허설 이전에 담당 dev 에이전트(backend-dev)가 수정 권장:

1. `Notification.java:11-12` — `@GeneratedValue(strategy = GenerationType.IDENTITY)` 추가 (미래 회귀 예방).
2. `NotificationController.java:24-27` — `markRead()` 응답 조회를 JdbcTemplate 기반으로 전환 (stale read 위험 제거).

INFO 성 개선(계약 외 `readAt` 노출, 알림 title 트리거 반영)은 스코프 판단에 위임.
