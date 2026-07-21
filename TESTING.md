# 핵심 시나리오 테스트 가이드

로컬에서 전체 스택을 올리고 "감지 → 분석 → 매칭 → 리포트" 파이프라인을 시나리오별로 검증하는 방법.
Postman 사용 시 루트의 `postman_collection.json`을 import하면 아래 요청이 전부 들어있다.

## 0. 사전 준비

```bash
cp .env.example .env        # ANTHROPIC_API_KEY 채우기 (없으면 레벨①만 가능 — 아래 표)
docker compose up -d --build
docker compose ps           # 5개 서비스 healthy 확인
```

| 레벨 | 조건 | 가능한 시나리오 |
| --- | --- | --- |
| ① 키 없음 | `.env`만 생성 | T1~T3 (트리거 발동까지), T4 일부(빈 목록), T7 인덱싱 |
| ② 키 있음 | `ANTHROPIC_API_KEY` 설정 | 전부 (T1~T10, 완전 E2E) |

**데모 시드 적용** (필수 — 수집기가 스텁이라 시드 없이는 트리거가 발동하지 않음):

```bash
docker compose exec -T postgres psql -U bizagent -d bizagent \
  < .claude/skills/e2e-verify/scripts/seed_demo.sql
curl -X POST localhost:8000/index/rebuild    # 시드 공고 3건 인덱싱 (BM25+임베딩)
```

포트: web `:3000` · api-core `:8080` · ai-engine `:8000` · chroma `:8001` · postgres `:5432`

---

## T1. 헬스체크

```bash
curl localhost:8000/health          # {"status":"ok"}
curl "localhost:8080/api/reports?profileId=1"   # 200 + [] (Spring 기동 확인)
open http://localhost:3000          # 웹 홈
```

**실패 시**: `docker compose logs api-core ai-engine` — 대부분 `.env` 누락 또는 postgres 기동 전 접속.

## T2. 온보딩 — 프로필 등록/조회

```bash
curl -X POST localhost:8080/api/onboarding \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "industry": "카페/디저트",
    "entityType": "개인(일반과세자)",
    "operatingPeriod": "1~3년",
    "monthlyRevenueBand": "1,500만~3,000만",
    "employeeBand": "1~2명",
    "regionSido": "서울특별시",
    "regionSigungu": "마포구",
    "concerns": ["주변 경쟁 심화", "자금 조달 어려움"],
    "fundingExperience": "알아본 적은 있지만 신청은 안 해봄",
    "bizRegNo": "1234567890"
  }'
curl localhost:8080/api/onboarding/1
```

**기대**: 201/200 + 저장된 프로필 JSON (id 부여).
**주의**: 온보딩 UI(`:3000/onboarding`)로 만든 프로필에는 `market_region_code/market_industry_code`가 없어 상권 트리거가 발동하지 않는다 — 트리거 테스트는 시드 프로필(id=1)로 할 것.

## T3. ⭐ 핵심 — 트리거 발동 → 파이프라인 완주

```bash
curl -X POST localhost:8080/api/agent/check/1
```

**기대 (레벨 ② 키 있음)**:

```json
[
  {"event": "new_competitors_500m:GTE:3.0", "status": "PROCESSED", "reportId": 1},
  {"event": "foot_traffic_delta_pct:LTE:-15.0", "status": "PROCESSED", "reportId": 2}
]
```

**기대 (레벨 ① 키 없음)**: 500 응답 — 단 트리거 자체는 발동했다. DB로 확인:

```bash
docker compose exec postgres psql -U bizagent -d bizagent -c \
  "SELECT metric_key, observed_value, status FROM trigger_event WHERE profile_id=1;"
```

→ `new_competitors_500m / 4 / NEW`, `foot_traffic_delta_pct / -20 / NEW` 2행이면 L2까지 정상.

**단계별 DB 검증 (레벨 ②)**:

```sql
SELECT cause_text, needs_funding_match FROM analysis_result ORDER BY id DESC LIMIT 1;  -- L3
SELECT pblanc_id, rrf_score FROM funding_match ORDER BY id DESC LIMIT 5;               -- L4
SELECT id, left(body_md, 200) FROM report ORDER BY id DESC LIMIT 1;                    -- L5
```

## T4. 리포트 조회

```bash
curl "localhost:8080/api/reports?profileId=1"    # 목록 (최신순)
curl localhost:8080/api/reports/1                # 단건 — body_md가 사람이 읽고 납득 가능한가 (PRD 성공기준 ③)
open http://localhost:3000/reports/1             # 뷰어
```

## T5. 중복 알림 방지 (dedup 게이트)

T3 직후 같은 요청을 다시:

```bash
curl -X POST localhost:8080/api/agent/check/1
```

**기대**: 같은 이벤트가 `"status": "DUPLICATE_SKIPPED"` (14일 윈도우 내 동일 트리거 재발동 차단).
**초기화 후 재테스트**:

```bash
docker compose exec postgres psql -U bizagent -d bizagent -c \
  "DELETE FROM trigger_event WHERE profile_id=1;"
```

## T6. 신청서 초안 (확장 5-3)

T3에서 받은 `reportId`와 시드 공고 ID로:

```bash
curl -X POST "localhost:8080/api/agent/draft?reportId=1&pblancId=DEMO-0001"
```

**기대**: `sections`(사업개요·신청사유 등) + "검토·수정 후 직접 제출" 고지. `application_draft` 테이블에 저장 확인.

## T7. ai-engine 단독 테스트 (디버그용 — 원래 Spring 전용 내부 API)

```bash
curl -X POST localhost:8000/index/rebuild        # {"indexed": 2} (시드 공고 3건 중 마감된 DEMO-0003 제외)

curl -X POST localhost:8000/matching -H "Content-Type: application/json" \
  -d '{"cause_text": "반경 500m 내 카페 신규 개업 4건으로 경쟁 심화, 유동인구 20% 감소", "top_k": 3}'
# 기대: matches[].pblanc_id에 DEMO-0001(경쟁 심화 자금)이 상위 랭크

curl -X POST localhost:8000/analysis -H "Content-Type: application/json" \
  -d '{"profile": {"industry": "카페/디저트", "region_sigungu": "서대문구"},
       "trigger_context": {"metric_key": "new_competitors_500m", "observed_value": 4}}'
# 기대: {"cause_text": "...", "needs_funding_match": true, "match_hint": "..."}
```

## T8. 알림 폴링 — ⬜ 미구현 (S6 작업 후 활성화)

```bash
curl "localhost:8080/api/notifications?profileId=1&status=UNREAD"   # 지금은 404
```

계약은 `NotificationController.java`를 참고. 구현 후 이 시나리오를 T3 뒤에 끼워 넣는다.

## T9. 일일 배치 (선택)

스케줄러는 매일 06:00 KST(`ScheduledJobs`). 수동으로 배치 경로를 태우려면 T3의 check 엔드포인트가 동일 파이프라인을 실행하므로 그것으로 갈음.

## T10. 완전 초기화

```bash
docker compose down
rm -rf pg-data chroma-data     # DB 볼륨 삭제 → 다음 up 때 db/init 01→02→03 재적용
```

---

## 트러블슈팅

| 증상 | 원인 · 조치 |
| --- | --- |
| check/1 응답이 `[]` | 시드 미적용(0. 사전 준비) 또는 trigger_event가 이미 PROCESSED(T5 초기화 SQL) |
| check/1이 500 | ① 키 없음(레벨① 정상 동작 — DB로 L2 확인) ② ai-engine 미기동(`docker compose logs ai-engine`) |
| matching 결과 0건 | `/index/rebuild` 미실행, 또는 chroma 미기동 |
| 스키마 오류 (컬럼 없음) | pg-data 볼륨이 03 이전에 생성됨 → T10 완전 초기화 |
| notification 404 | 정상 — S6 미구현 (T8) |
