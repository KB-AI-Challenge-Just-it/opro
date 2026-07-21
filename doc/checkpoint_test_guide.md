# 중간점검 테스트 가이드 (2026-07-17 기준)

**목적**: 계약 문서(구 `doc/work_breakdown01.md`, 2026-07-21 삭제)가 stale해서 실제 구현 상태와 어긋나 있었다 (자세한 내용은 세션 로그 참고).
이 문서는 "지금 코드 그대로" 무엇을 테스트할 수 있고, 무엇이 아직 안 되는지를 중간점검용으로 정리한다.
`TESTING.md`·`doc/local_test_guide.md`를 대체하지 않는다 — 그쪽은 상세 계약·트러블슈팅용으로 유지하고,
이 문서는 점검 순서와 "지금 알려진 이슈"를 앞에 배치한 체크리스트다.

---

## ⚠️ 시작 전 필수 — 시드 버그 원라인 픽스

**증상**: 아래 가이드를 그대로 따라 하면 STEP 3(에이전트 발동)에서 트리거가 하나도 안 뜬다 (`[]` 반환).

**원인**: `.claude/skills/e2e-verify/scripts/seed_demo.sql`이 데모 프로필의 `market_industry_code`를
`'CAFE'`로 심는데, `TriggerEngine.java`의 조인은 `business_profile.market_industry_code = threshold_rule.industry`이고
`threshold_rule.industry`는 `'카페/디저트'`(`db/init/02_seed_thresholds.sql`)다. 문자열이 달라 조인 결과가 0행 →
룰을 하나도 못 찾음.

**픽스** (`.claude/skills/e2e-verify/scripts/seed_demo.sql` 14번째 줄):

```diff
-       '알아본 적은 있지만 신청은 안 해봄', 'DEMO_EDAE', 'CAFE'
+       '알아본 적은 있지만 신청은 안 해봄', 'DEMO_EDAE', '카페/디저트'
```

이 픽스를 적용한 뒤에 아래 STEP을 진행한다. (픽스 없이도 `db/init/04_seed_demo.sql`은 애초에
`'카페/디저트'`로 올바르게 심어져 있어 대체 경로로 쓸 수 있지만, 정책자금 공고 데모 데이터가 없어 매칭·리포트
테스트가 안 된다 — e2e-verify 쪽을 고쳐 쓰는 걸 권장한다.)

---

## 0. 준비

```bash
cp .env.example .env
```

| 레벨 | 조건 | 테스트 가능 범위 |
| --- | --- | --- |
| ① 키 없음 | `.env`만 생성 | 수집기 스킵 동작, 인덱싱, 트리거 감지(L2)까지 — 원인분석·리포트·매칭은 500 |
| ② `ANTHROPIC_API_KEY`만 | 위 + Claude 키 | 원인분석·리포트·매칭·초안까지 전부 — RAG 품질(한국어 임베딩)도 확인 가능 |
| ③ `ECOS_API_KEY`/`SBIZ_API_KEY`도 | 위 + 실데이터 키 | 실제 수집기 라이브 연동까지 (아래 "실연동 키 필요" 항목 참고) |

```bash
docker compose up -d --build
docker compose ps       # postgres·chroma·ai-engine·api-core·web 5개 Up 확인
curl localhost:8000/health                      # {"status":"ok"}
curl "localhost:8080/api/reports?profileId=1"    # [] 면 정상
```

시드 (위 픽스 적용 후):

```bash
docker compose exec -T postgres psql -U bizagent -d bizagent \
  < .claude/skills/e2e-verify/scripts/seed_demo.sql
curl -X POST localhost:8000/index/rebuild
```

**기대**: `{"indexed": 2}` — 시드 공고 3건 중 활성 2건(DEMO-0001·0002)만 인덱싱, 마감된 DEMO-0003은
활성 공고 필터(`apply_end >= CURRENT_DATE OR apply_end IS NULL`)로 제외.

---

## 1. 지금 테스트 가능한 항목 (레벨 ①, 키 없이)

| # | 테스트 대상 | 명령 | 기대 결과 |
| --- | --- | --- | --- |
| 1-1 | 헬스체크 | `curl localhost:8000/health` / `curl "localhost:8080/api/reports?profileId=1"` | `{"status":"ok"}` / `[]` |
| 1-2 | 온보딩 저장·조회 | `POST /api/onboarding` (본문은 `TESTING.md` T2 참고) → `GET /api/onboarding/{id}` | 201/200 + 저장된 JSON. **입력 검증 없음이 정상** — 아무 값이나 넣어도 저장됨(알려진 갭, 3번 참고) |
| 1-3 | 활성 공고 필터 | `curl -X POST localhost:8000/index/rebuild` | `{"indexed": 2}`. DEMO-0003이 안 들어갔는지 `SELECT pblanc_id, apply_end FROM policy_announcement`로 육안 확인 |
| 1-4 | 트리거 감지(L2) | `curl -X POST localhost:8080/api/agent/check/1` | 500 응답이 정상(키 없음). DB로 확인: `SELECT metric_key, observed_value, status FROM trigger_event WHERE profile_id=1;` → `new_competitors_500m/4/NEW`, `foot_traffic_delta_pct/-20/NEW` 2행 |
| 1-5 | 알림 벨 UI (프론트) | `open http://localhost:3000`, 우측 상단 🔔 아이콘 | 30초 폴링 동작 확인 (네트워크 탭에서 `/api/notifications` 반복 호출). 이 시점엔 알림이 없어 배지 안 뜨는 게 정상(리포트가 아직 안 생겼으므로) |
| 1-6 | 수집기 빈 키 스킵 | `docker compose logs api-core \| grep -i "미설정\|수집 생략"` | ECOS_API_KEY/SBIZ_API_KEY 미설정 시 배치가 죽지 않고 로그만 남기는지 확인 (매일 06:00 스케줄이라 즉시 보려면 `dailyRun()`을 수동 트리거하거나 로그만 코드 리뷰로 대체) |
| 1-7 | 유닛테스트 (백엔드) | `cd apps/api-core && ./gradlew test` | `EcosCollectorTest`·`SbizCollectorTest` 통과 (빈 키 스킵 검증) |
| 1-8 | 유닛테스트 (ai-engine) | `cd apps/ai-engine && pip install -r requirements.txt && pytest` | `test_indexing.py`(활성 공고 필터)·`test_vectorstore.py`(임베딩 함수 메모이즈) 통과 |

---

## 2. 키가 있어야 테스트되는 항목 (레벨 ②, `ANTHROPIC_API_KEY`)

| # | 테스트 대상 | 명령 | 기대 결과 |
| --- | --- | --- | --- |
| 2-1 | ⭐ 전체 파이프라인 완주 | `curl -X POST localhost:8080/api/agent/check/1` | 감지→원인분석→매칭→리포트 생성까지, `[{"event":"new_competitors_500m:GTE:3.0","status":"PROCESSED","reportId":1}, ...]` (수십 초 걸릴 수 있음) |
| 2-2 | 리포트 화면 | `localhost:3000` 새로고침 → 알림 벨에 배지·토스트 뜨는지, 클릭 시 리포트로 이동하는지 | "리포트 #1" 링크 생성, 클릭 → 본문·매칭 공고(근거·마감일·링크) 표시 |
| 2-3 | 한국어 RAG 매칭 품질 | `curl -X POST localhost:8000/matching -d '{"cause_text": "반경 500m 내 카페 신규 개업 4건으로 경쟁 심화, 유동인구 20% 감소", "top_k": 3}'` | `matches[]`에 DEMO-0001(경쟁 심화 자금)이 상위 랭크. **최초 호출 시 bge-m3 모델(~2.2GB) 다운로드로 수 분 걸릴 수 있음** |
| 2-4 | 중복 알림 방지 | 2-1의 curl을 한 번 더 | 같은 이벤트가 `"status":"DUPLICATE_SKIPPED"` |
| 2-5 | 신청서 초안 | `curl -X POST "localhost:8080/api/agent/draft?reportId=1&pblancId=DEMO-0001"` | `sections`(사업개요·신청사유 등) + "검토·수정 후 직접 제출" 고지 |

**⚠️ 컬렉션 재생성 필요할 수 있음**: 임베딩 함수를 bge-m3로 바꾸면서 벡터 차원이 384→1024로 바뀌었다.
이전에 한 번이라도 `/index/rebuild`를 돌린 `chroma-data` 볼륨이 남아있으면 2-3에서 차원 불일치 에러가 난다 —
`docker compose down && rm -rf chroma-data`로 초기화 후 재기동할 것.

---

## 3. 실연동 키가 있어야 확인되는 항목 (레벨 ③)

| # | 항목 | 필요 키 | 확인 방법 |
| --- | --- | --- | --- |
| 3-1 | ECOS 기준금리·CPI·BSI 수집 | `ECOS_API_KEY` | 배치 실행 후 `SELECT indicator_code, count(*), min(observed_at), max(observed_at) FROM econ_indicator GROUP BY indicator_code;` — 특히 `base_rate`가 90일 창 안에 관측점 ≥2개인지 (BSI는 통계코드 미검증 추정치라 데이터가 없어도 정상) |
| 3-2 | Sbiz 반경 500m 경쟁강도 수집 | `SBIZ_API_KEY` | `SELECT metric FROM market_snapshot WHERE region_code='A1001' ORDER BY snapshot_date DESC LIMIT 1;` — `new_competitors_500m` 값 확인 (유동인구·매출추이는 이 API로 미구현이라 값이 없는 게 정상) |
| 3-3 | 기업마당 정책자금 실수집 | `BIZINFO_CRTFC_KEY` | 배치 후 `SELECT count(*), max(apply_start) FROM policy_announcement WHERE pblanc_id NOT LIKE 'DEMO-%';` |

이 3개는 API 키 발급 리드타임이 있어 별도로 신청·확보 후 테스트한다.

---

## 4. 지금 마주칠 수 있는 "알려진 이슈" (버그 아님 — 의도된/문서화된 갭)

- **웹 온보딩으로 새로 만든 프로필은 트리거가 안 붙는다.** `market_region_code`/`market_industry_code` 자동 매핑
  로직이 아직 없어서다 (S3 미완). 트리거 테스트는 반드시 시드 프로필(id=1)로 할 것.
- **키 없이 `check/1` 호출 시 500이 정상.** Claude 호출이 실패하면서 예외가 그대로 올라온다 — 트리거(L2)까지는
  됐는지는 DB로 확인.
- **BSI 지표는 안 채워질 수 있음.** 소진공/ECOS 통계코드가 미검증 추정치라 실제 API가 값을 안 줄 수 있다 —
  `base_rate`·`cpi`만 확인해도 AC는 충족.
- **유동인구·매출추이 지표는 아예 없다.** Sbiz 실연동 API 패밀리에 대응 엔드포인트가 없어 이번 스코프에서 뺐다
  (`new_competitors_500m`만 실연동).

## 5. 아직 테스트 대상이 아닌 것 (미구현)

- 카카오 "나에게 보내기" 알림 발송 (S7) — 스키마(`notification_delivery`)만 있고 발송 코드 없음
- 신청서 초안의 실제 hwp/pdf 양식 기반 섹션 매핑 (E5) — 현재는 공고 요약문 기반 생성만
- Q9 사업자등록번호 국세청 상태조회 연동 (S3)
- 프론트엔드 자동화 테스트 (web에 테스트 스크립트 자체가 없음)
- CI 파이프라인 (`.github/workflows` 없음 — 전부 로컬 수동 실행)

---

## 체크리스트 요약

- [ ] 시드 버그 픽스 적용 (`'CAFE'` → `'카페/디저트'`)
- [ ] `docker compose up -d --build` 5개 서비스 Up
- [ ] 시드 적용 + `/index/rebuild` → `{"indexed": 2}`
- [ ] (키 없이) `check/1` → 500 정상, `trigger_event` 2행 확인
- [ ] (키 없이) 유닛테스트 2종(api-core·ai-engine) 통과
- [ ] (키 있으면) `check/1` 전체 완주 → 리포트·알림 벨·토스트 확인
- [ ] (키 있으면) 한국어 쿼리 매칭 품질 육안 확인
- [ ] (키 있으면) 신청서 초안 생성 확인
- [ ] (실연동 키 있으면) ECOS/Sbiz/기업마당 라이브 수집 확인
