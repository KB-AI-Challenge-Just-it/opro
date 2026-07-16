# 로컬 테스트 워크스루 — 도커 올리기부터 화면 확인까지

처음부터 끝까지 순서대로 따라 하는 가이드. API별 상세 계약·검증 쿼리는 루트 `TESTING.md`,
Postman으로 쏘려면 루트 `postman_collection.json` import.

---

## 준비 (1분)

1. **Docker 실행 확인** — OrbStack(또는 Docker Desktop)이 켜져 있어야 한다: `docker ps`가 에러 없으면 OK
2. **.env 생성**:

```bash
cp .env.example .env
```

3. `.env`를 열어 `ANTHROPIC_API_KEY=sk-...` 채우기.
   **키가 없어도 STEP 4의 "트리거 발동"까지는 테스트 가능** — 대신 리포트 생성(Claude 호출)은 안 된다.

---

## STEP 1 — 도커로 전체 스택 올리기

```bash
docker compose up -d --build
```

첫 실행은 이미지 빌드(gradle·npm) 때문에 **수 분** 걸린다. 끝나면:

```bash
docker compose ps
```

**기대**: `postgres` `chroma` `ai-engine` `api-core` `web` 5개가 전부 `Up`.

빠른 생존 확인:

```bash
curl localhost:8000/health                        # {"status":"ok"}
curl "localhost:8080/api/reports?profileId=1"     # []  (빈 배열이면 정상)
```

> 안 뜨는 서비스가 있으면 → `docker compose logs -f api-core` (또는 ai-engine/web)

## STEP 2 — 데모 데이터 넣기 (복붙 2줄)

수집기가 아직 스텁이라 시드 없이는 아무 일도 일어나지 않는다:

```bash
docker compose exec -T postgres psql -U bizagent -d bizagent \
  < .claude/skills/e2e-verify/scripts/seed_demo.sql
curl -X POST localhost:8000/index/rebuild
```

**기대**: 마지막 줄이 `{"indexed":2}` — 데모 공고 3건 중 활성 2건(DEMO-0001·0002)이 검색 인덱스에
들어갔다는 뜻. 마감된 DEMO-0003은 활성 공고 필터(`apply_end >= CURRENT_DATE OR apply_end IS NULL`)로
제외된다.

## STEP 3 — 웹 화면 눌러보기 (http://localhost:3000)

1. **홈 접속** → "받은 리포트" 제목 + "도착한 리포트가 없습니다" 문구가 보이면 정상 (아직 발동 전)
2. **"온보딩 질문지" 링크 클릭** → Q1~Q9 나온다:
   - Q1 업종 `카페/디저트` … Q5까지 드롭다운 선택
   - Q6 소재지 입력 (예: `서울` / `마포구`)
   - Q7 고민 체크박스 (최대 2개), Q8 선택, Q9 사업자번호 10자리
   - **제출** → "등록 완료" 화면이 뜨면 온보딩 API 정상
3. ⚠️ 방금 UI로 만든 프로필은 상권 코드가 없어서 트리거가 안 붙는다 — **다음 STEP의 데모는 시드 프로필(1번)로 진행**한다

## STEP 4 — ⭐ 에이전트 발동 (핵심 한 줄)

스케줄러(매일 06:00)를 기다리는 대신 즉시 실행:

```bash
curl -X POST localhost:8080/api/agent/check/1
```

**기대 (키 있음)** — 감지→분석→매칭→리포트 생성까지 완주 (Claude 호출 때문에 수십 초 걸릴 수 있음):

```json
[
  {"event":"new_competitors_500m:GTE:3.0","status":"PROCESSED","reportId":1},
  {"event":"foot_traffic_delta_pct:LTE:-15.0","status":"PROCESSED","reportId":2}
]
```

**키 없음** — 500이 뜨는 게 정상. 트리거(L2)까지는 동작했는지 확인:

```bash
docker compose exec postgres psql -U bizagent -d bizagent -c \
  "SELECT metric_key, observed_value, status FROM trigger_event WHERE profile_id=1;"
```

→ 2행(4 / -20)이 보이면 감지 레이어는 정상.

## STEP 5 — 리포트 화면 확인

1. 브라우저 `localhost:3000` **새로고침** → "리포트 #1 — (시각)" 링크가 목록에 생긴다
2. **링크 클릭** → 리포트 본문 확인. 볼 것:
   - 원인 설명이 사장님 언어로 읽히는가 (PRD 성공 기준 ③)
   - 매칭된 정책자금(데모 공고 `DEMO-0001` 등)이 근거와 함께 붙었는가

## STEP 6 — 중복 알림 방지 확인

STEP 4의 curl을 **한 번 더** 실행:

```bash
curl -X POST localhost:8080/api/agent/check/1
```

**기대**: 같은 이벤트가 `"status":"DUPLICATE_SKIPPED"` — 14일 내 동일 트리거 재알림 차단.
다시 처음부터 돌리고 싶으면:

```bash
docker compose exec postgres psql -U bizagent -d bizagent -c \
  "DELETE FROM trigger_event WHERE profile_id=1;"
```

## STEP 7 — 신청서 초안 (선택, 키 필요)

```bash
curl -X POST "localhost:8080/api/agent/draft?reportId=1&pblancId=DEMO-0001"
```

**기대**: 사업개요·신청사유 등 `sections` + "검토·수정 후 직접 제출" 고지.

---

## 끄기 / 완전 초기화

```bash
docker compose down                 # 중지
rm -rf pg-data chroma-data          # DB까지 초기화 → 다음 up 때 스키마(01→03) 재적용
```

## 안 될 때 빠른 진단

| 증상 | 확인 명령 / 원인 |
| --- | --- |
| compose up 즉시 실패 | `.env` 없음 → `cp .env.example .env` |
| check/1 응답이 `[]` | STEP 2 시드 누락, 또는 이미 발동됨(STEP 6 초기화 SQL) |
| check/1 이 500 | 키 없음(정상, STEP 4 하단) 또는 `docker compose logs ai-engine` |
| 웹 화면이 안 뜸 | `docker compose logs web` — api-core 기동 대기 중일 수 있음 |
| 리포트 목록이 안 늘어남 | STEP 4가 200이었는지, `profileId=1`인지 확인 |
| 스키마 컬럼 없음 에러 | pg-data가 옛 버전 → 완전 초기화 후 재기동 |
