# 시연 영상 2부 — 신규 공고 능동 알림 재현 (DB 직접 삽입, 2026-08-02)

## 왜 이 방식인가

실제 기업마당 API가 촬영 타이밍에 맞춰 매칭될 공고를 새로 올려주길 기다리는 건 통제 불가능하다.
대신 `policy_announcement`에 데모용 공고를 직접 넣고 재매칭을 수동 트리거하면, 실제 매칭
파이프라인(하이브리드 RAG → 알림)을 그대로 타면서도 타이밍은 완전히 통제할 수 있다.

이 패턴은 코드베이스가 이미 전제하고 있다 — `AgentController.collectStatus()`가
`pblanc_id NOT LIKE 'DEMO-%'`로 실공고와 데모용 공고를 구분하는 조건을 이미 갖고 있다.

## 0. 대상 프로필 (이미 확인됨 — 다시 조회할 필요 없음)

1부에서 실제로 녹화된 케이스1 프로필은 `business_profile.id = 23`, 다음 값으로 저장돼 있다:

| 컬럼 | 값 |
| --- | --- |
| industry | 음식점/외식업 |
| region_sido / region_sigungu | 서울 / 영등포구 |
| operating_period | 1~3년 |
| monthly_revenue_band (연매출) | 1억~3억 |
| employee_band | 1~4명 |
| funding_purpose | {운영} |
| funding_amount_band | 1천만~5천만 |
| tax_delinquency / overdue_status | 없음 / 있었지만 해결 |

`overdue_status`가 "현재 연체 중"이 아니라 "있었지만 해결"이라 리스크 경고 문구는 안 붙는다
(`hybrid_search._risk_warnings`는 "현재 연체 중"일 때만 경고를 단다) — 깨끗한 매칭 카드로
나온다.

## 1. 이벤트 설계 — 영등포 외식업에 실제로 생길 법한 것

`funding_purpose='운영'`(운영자금)에 맞춰, 최근 원자재비·전기요금 상승으로 외식업 소상공인의
경영 부담이 커진 상황을 배경으로 한 **경영안정자금** 공고로 설계했다. 실제 정책자금 공고에서
흔히 쓰이는 명칭·구성을 따랐다.

- 제목: `[서울] 영등포구 외식업 소상공인 경영안정자금 특별지원`
- 배경: 원자재비·공공요금 상승으로 인한 외식업 운영자금 부담 완화
- 대상: 서울 영등포구 소재 음식점/외식업 소상공인
- 지원분야: 운영자금
- 마감: 오늘(2026-08-02)로부터 30일 뒤 — 인덱싱 조건(`apply_end >= CURRENT_DATE`)을 만족해야
  하므로 반드시 미래 날짜여야 한다.

## 1.5 알림 시각 분 단위 예약 (2026-08-02 — 정식 기능으로 반영, 되돌릴 필요 없음)

애초에 "촬영을 위한 임시 우회"로 하려던 걸 정식 기능으로 바꿨다. `app_user`에
`preferred_notify_minute`(0~59) 컬럼을 추가하고, 스케줄러(`ScheduledJobs.notifyTimeMatchTrigger`,
구 `hourlyMatchTrigger`)는 이제 매분 정각에 시:분을 둘 다 비교해서 재매칭을 돈다. 시 단위 배치를
매분으로 돌리는 게 아니라 **분 단위 예약 자체가 제품 기능**이 됐으므로, 촬영이 끝나도 되돌릴 게
없다.

- DB: `db/init/11_preferred_notify_minute.sql`
- 백엔드: `AppUser.preferredNotifyMinute`, `AuthController`의
  `PATCH /api/auth/{userId}/notify-time?preferredNotifyHour=H&preferredNotifyMinute=M`
  (기존 `/notify-hour` 엔드포인트는 이걸로 대체됨)
- 프론트: `/account` 페이지에 분 선택 드롭다운 추가 — 사용자가 직접 시:분을 고를 수 있다

**촬영 전 할 것**: 케이스1 계정(`user_id=5`)으로 로그인해 `/account` 페이지에서 알림 받을
시:분을 지금 시각(또는 촬영에서 "지금이 O시 O분이라고 가정" 자막을 넣을 시각)으로 맞추고 저장.
UI로도 되지만 촬영 편의상 DataGrip에서 바로 맞춰도 된다:

```sql
UPDATE app_user
SET preferred_notify_hour = EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Seoul'),
    preferred_notify_minute = EXTRACT(MINUTE FROM now() AT TIME ZONE 'Asia/Seoul') + 1
WHERE id = 5;
```

(`+ 1`은 저장하는 순간과 다음 분 정각 사이에 최소 몇 초 여유를 두기 위함 — 정확히 지금 분으로
맞추면 스케줄러가 그 분을 이미 지나쳤을 수 있다.)

## 2. DataGrip에서 실행 — SQL 콘솔에 아래 순서대로

DataGrip에서 로컬 postgres(localhost:5432, db `bizagent`) 연결을 열고 새 SQL 콘솔에서 실행한다.

**2-1. INSERT (신규 공고 삽입)**

```sql
INSERT INTO policy_announcement
  (pblanc_id, title, summary_html, support_field, target, region,
   apply_start, apply_end, detail_url, raw)
VALUES (
  'DEMO-20260802-01',
  '[서울] 영등포구 외식업 소상공인 경영안정자금 특별지원',
  '<p>최근 원자재비·공공요금 상승으로 어려움을 겪는 영등포구 소재 음식점/외식업 소상공인을 대상으로 운영자금을 저리로 지원합니다.</p>',
  '운영자금',
  '서울특별시 영등포구 소재 음식점/외식업 소상공인',
  '서울특별시 영등포구',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  'https://example.com/demo-notice-yeongdeungpo',
  '{}'::jsonb
);
```

**2-2. 확인 (선택)**

```sql
SELECT pblanc_id, title, region, apply_end FROM policy_announcement WHERE pblanc_id = 'DEMO-20260802-01';
```

행이 하나 보이면 성공. 이 단계는 DataGrip에서 끝난다 — 아래 3·4번은 SQL이 아니라 터미널에서
`curl`로 실행한다(인덱싱·매칭 트리거는 API 호출이라 DB 콘솔로는 할 수 없다).

## 3. 터미널 — 인덱스 재구성

```bash
curl -X POST localhost:8000/index/rebuild
```

`{"indexed": <건수>}`가 찍히면 성공. 방금 넣은 행이 BM25/Chroma 인덱스에 반영된다.

## 4. 기다리기 — 스케줄러가 알아서 돈다

curl로 직접 부르지 않는다. 1.5번에서 `preferred_notify_hour`를 현재 시(hour)로 맞춰뒀으니,
다음 "분" 정각(최대 59초)에 `notifyTimeMatchTrigger`가 실제로 자동 실행되어 카카오(1부에서
동의했다면)와 인앱 알림이 둘 다 발송된다. 영상에서는 "지금이 O시 O분이라고 가정하겠습니다"
자막을 넣은 뒤, 알림이 뜨는 휴대폰/웹 화면으로 자연스럽게 컷하면 된다.

로그로 실제 자동 실행을 확인하고 싶으면:

```bash
docker compose logs -f api-core | grep notifyTimeMatchTrigger
```

`targetProfiles=1` 이상이 찍히고 곧이어 `report generated: profileId=23, ...`이 보이면 성공.
1분이 지나도 `targetProfiles=0`만 계속 찍히면 대개 다음 중 하나다:
- 1.5번의 `UPDATE app_user`(또는 `/account` 저장)를 빼먹었거나, 그 사이 시:분이 지나감
- 3번 인덱스 재구성을 빼먹음
- `region`/`target`에 영등포구·음식점 키워드가 실제로 들어갔는지 오타 확인
- `apply_end`가 과거 날짜로 잘못 들어감

(급하면 `curl -X POST localhost:8080/api/agent/check/23`로 즉시 실행해도 결과는 동일하다 —
같은 함수를 부르는 것뿐이라 리허설 확인용으로 써도 무방하다.)

## 5. 재촬영 시 — dedup 게이트 초기화

같은 공고로 다시 찍고 싶으면(리허설 후 본촬영 등) `profile_funding_alert`
(`db/init/06_profile_funding_alert.sql`에 정의된 "이미 알린 공고는 재알림 안 함" 게이트)에서
해당 행을 지워야 다시 알림이 간다. DataGrip에서:

```sql
DELETE FROM profile_funding_alert WHERE pblanc_id = 'DEMO-20260802-01' AND profile_id = 23;
```

지운 뒤 1.5번처럼 `preferred_notify_hour`/`preferred_notify_minute`을 다시 가까운 미래 시:분으로
맞추고 기다리면 된다(2·3번은 다시 안 해도 됨 — 공고 자체는 이미 인덱스에 있다).

## 6. 다 찍고 나서 — 정리 (선택, 급하지 않음)

```sql
DELETE FROM policy_announcement WHERE pblanc_id LIKE 'DEMO-%';
```

지운 뒤 터미널에서 `curl -X POST localhost:8000/index/rebuild` 한 번 더. 안 지워도
`/api/agent/collect/status`의 `realCount` 집계에는 `DEMO-`가 이미 제외돼 있어 실데이터
통계를 어지럽히지 않는다.
