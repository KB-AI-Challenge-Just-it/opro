# 대화형 2-콜 컨설팅 플로우 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 온보딩 직후의 자동 리포트 생성을, 사장님이 진단을 읽고 재질문에 답한 뒤 그 답변이 반영된 전문 리포트를 받는 대화형 2-콜 플로우로 교체한다.

**Architecture:** Spring(api-core)이 전체를 지휘한다. 신규 엔드포인트 2개(`/api/consult/diagnose`, `/api/consult/specialize`)가 `consultation_session` 테이블로 상태를 이어붙인다. ai-engine에는 `/diagnose` 라우터 하나만 신규 추가하고, 전문화 단계는 기존 `matching → analysis → report` 파이프라인을 그대로 재사용한다.

**Tech Stack:** Spring Boot 3 / Java 21 (api-core), FastAPI / Python 3.12 (ai-engine), Next.js App Router (web), PostgreSQL 16, Anthropic Claude API

## Global Constraints

- **서비스 경계 (CLAUDE.md)**: api-core가 유일한 데이터 오너. ai-engine은 stateless — `business_profile`/`market_snapshot`/`econ_indicator`를 직접 조회하지 않고 Spring이 요청 body에 담아 전달한다. web은 Spring(:8080)만 호출하며 ai-engine(:8000)을 직접 호출하지 않는다.
- **스키마 단일 소스**: `db/init/*.sql` 번호 순서대로 1회 실행. JPA `ddl-auto` 우회 금지. 이미 배포된 DB는 수동 마이그레이션 필요.
- **하드코딩 금지**: 업종·지역·임계값을 코드에 하드코딩하지 않는다. 프로필 컬럼/파라미터에서 읽는다.
- **기존 파일 번호**: `db/init/`의 최신 파일은 `08_member_auth.sql` — 신규 파일은 `09_`로 시작한다.
- **모델 설정 위치**: `apps/ai-engine/app/config.py`의 `Settings`. 신규 모델 키는 여기에 추가한다.
- **mock_llm 규약**: 모든 LLM 서비스는 `settings.mock_llm`이 True일 때 Claude 호출 없이 목업을 반환해야 한다.

---

### Task 1: DB 스키마 — `consultation_session` 테이블

**Files:**
- Create: `db/init/09_consultation_session.sql`

**Interfaces:**
- Consumes: 기존 `business_profile(id)`, `report(id)` 테이블
- Produces: 테이블 `consultation_session` — 컬럼 `id BIGSERIAL PK`, `profile_id BIGINT`, `status TEXT`, `diagnosis_text TEXT`, `follow_up_questions JSONB`, `follow_up_answers JSONB`, `report_id BIGINT`, `created_at TIMESTAMPTZ`

- [ ] **Step 1: 스키마 파일 작성**

`db/init/09_consultation_session.sql`:

```sql
-- 09: 대화형 2-콜 컨설팅 세션
--  온보딩 직후 [콜1 진단] → [사장님이 진단 읽고 재질문 답변] → [콜2 전문화] 사이의
--  상태를 잇는다. 상태는 Spring이 소유한다(ai-engine은 stateless).
CREATE TABLE consultation_session (
  id BIGSERIAL PRIMARY KEY,
  profile_id BIGINT NOT NULL REFERENCES business_profile(id),
  status TEXT NOT NULL,                      -- DIAGNOSED | COMPLETED
  diagnosis_text TEXT,                       -- 콜1이 생성한 경영 진단 본문
  follow_up_questions JSONB,                 -- 콜1이 생성한 검증 재질문 배열
  follow_up_answers JSONB,                   -- 사장님 답변 (스킵 시 빈 배열)
  report_id BIGINT REFERENCES report(id),    -- 콜2 완료 후 채워짐
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_consultation_session_profile ON consultation_session (profile_id);
```

- [ ] **Step 2: 스키마가 적용되는지 확인**

Run:
```bash
cd /Users/keephun/vscode/opro
docker compose exec postgres psql -U bizagent -d bizagent -f /docker-entrypoint-initdb.d/09_consultation_session.sql
```
Expected: `CREATE TABLE`, `CREATE INDEX` 출력. (이미 뜬 DB라 init 스크립트가 자동 재실행되지 않으므로 수동 적용한다.)

- [ ] **Step 3: 테이블 존재 검증**

Run:
```bash
docker compose exec postgres psql -U bizagent -d bizagent -c "\d consultation_session"
```
Expected: 위 7개 컬럼이 모두 출력된다.

- [ ] **Step 4: Commit**

```bash
git add db/init/09_consultation_session.sql
git commit -m "feat: add consultation_session table for interactive two-call flow"
```

---

### Task 2: ai-engine `/diagnose` 엔드포인트 (콜1 · 개인화 진단)

**Files:**
- Create: `apps/ai-engine/app/services/diagnosis.py`
- Create: `apps/ai-engine/app/routers/diagnose.py`
- Modify: `apps/ai-engine/app/main.py` (라우터 등록)
- Modify: `apps/ai-engine/app/config.py` (진단용 모델 키 추가)
- Test: `apps/ai-engine/tests/test_diagnosis.py`

**Interfaces:**
- Consumes: `app.services.anthropic_client.call(model, system, user, max_tokens) -> str`, `app.config.settings`
- Produces:
  - `app.services.diagnosis.diagnose(profile: dict, market_context: dict | None, econ_context: dict | None) -> dict` — 반환 `{"diagnosis": str, "follow_up_questions": list[dict]}`
  - `app.routers.diagnose.DiagnoseRequest` — 필드 `profile: dict`, `market_context: dict | None`, `econ_context: dict | None`
  - `app.routers.diagnose.diagnose_endpoint(req: DiagnoseRequest) -> dict`
  - HTTP: `POST /diagnose`
  - `settings.model_diagnosis` (기본값 `"claude-opus-4-8"`)

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/ai-engine/tests/test_diagnosis.py`:

```python
"""콜1 /diagnose — 개인화 경영 진단 + 검증 재질문 계약 검증.
app.main(무거운 chromadb/torch 의존)을 로드하지 않도록 라우터/서비스를 직접 호출한다."""
from unittest.mock import patch

from app.routers.diagnose import DiagnoseRequest, diagnose_endpoint
from app.services import diagnosis

GOLDEN_REQUEST = {
    "profile": {
        "industry": "카페/디저트",
        "region_sido": "서울",
        "region_sigungu": "마포구",
        "monthly_revenue_band": "1억~3억",
        "employee_band": "1~4명",
        "funding_purpose": ["운영", "시설"],
        "tax_delinquency": "없음",
        "overdue_status": "없음",
    },
    "market_context": {"경쟁강도": "높음", "동일업종_점포수": 42},
    "econ_context": {"기준금리": 3.5},
}

VALID_LLM_JSON = (
    '{"diagnosis": "마포구 카페는 경쟁강도가 높은 상권입니다.", '
    '"follow_up_questions": ['
    '{"id": "q1", "question": "최근 3개월 매출이 줄었나요?", "type": "choice", '
    '"options": ["늘었다", "비슷하다", "줄었다"]}, '
    '{"id": "q2", "question": "가장 큰 고민을 적어주세요", "type": "text"}]}'
)


def test_diagnose_returns_diagnosis_and_follow_up_questions():
    with patch.object(diagnosis, "call", return_value=VALID_LLM_JSON):
        body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert set(body.keys()) == {"diagnosis", "follow_up_questions"}
    assert isinstance(body["diagnosis"], str) and body["diagnosis"]
    assert len(body["follow_up_questions"]) == 2
    assert body["follow_up_questions"][0]["type"] == "choice"
    assert body["follow_up_questions"][0]["options"] == ["늘었다", "비슷하다", "줄었다"]
    assert body["follow_up_questions"][1]["type"] == "text"


def test_diagnose_defaults_questions_when_llm_omits_them():
    # LLM이 diagnosis만 반환해도 follow_up_questions 키는 항상 존재해야 한다 (Spring 안전 접근).
    with patch.object(diagnosis, "call", return_value='{"diagnosis": "ok"}'):
        body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert body == {"diagnosis": "ok", "follow_up_questions": []}


def test_diagnose_falls_back_on_non_json():
    with patch.object(diagnosis, "call", return_value="JSON이 아닌 응답"):
        body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert body == {"diagnosis": "JSON이 아닌 응답", "follow_up_questions": []}


def test_diagnose_strips_markdown_code_fence():
    fenced = "```json\n" + VALID_LLM_JSON + "\n```"
    with patch.object(diagnosis, "call", return_value=fenced):
        body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert body["diagnosis"] == "마포구 카페는 경쟁강도가 높은 상권입니다."
    assert len(body["follow_up_questions"]) == 2


def test_diagnose_mock_path_returns_valid_contract():
    with patch.object(diagnosis.settings, "mock_llm", True):
        body = diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))

    assert body["diagnosis"]
    assert len(body["follow_up_questions"]) >= 1
    for q in body["follow_up_questions"]:
        assert {"id", "question", "type"} <= set(q.keys())


def test_diagnose_contexts_are_optional_and_forwarded():
    # 컨텍스트 없이도 동작
    minimal = {"profile": GOLDEN_REQUEST["profile"]}
    with patch.object(diagnosis, "call", return_value='{"diagnosis": "ok"}'):
        assert diagnose_endpoint(DiagnoseRequest(**minimal)) == {
            "diagnosis": "ok", "follow_up_questions": []}

    # 있으면 LLM user payload에 실려야 한다
    with patch.object(diagnosis, "call", return_value='{"diagnosis": "ok"}') as mock_call:
        diagnose_endpoint(DiagnoseRequest(**GOLDEN_REQUEST))
    user_payload = mock_call.call_args[0][2]
    assert "market_context" in user_payload
    assert "econ_context" in user_payload
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run:
```bash
cd /Users/keephun/vscode/opro/apps/ai-engine && python -m pytest tests/test_diagnosis.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.routers.diagnose'`

- [ ] **Step 3: 진단 모델 설정 추가**

`apps/ai-engine/app/config.py` — 모델 배분 블록에 한 줄 추가 (`model_report` 아래):

```python
    model_diagnosis: str = "claude-opus-4-8"             # 콜1 개인화 진단 — 품질 최우선
```

- [ ] **Step 4: 진단 서비스 구현**

`apps/ai-engine/app/services/diagnosis.py`:

```python
"""콜1 · 개인화 경영 진단 (Opus, 품질 최우선).
온보딩 프로필 + 상권/경기지표 실데이터로 "지금 이 사장님의 경영 상태"를 진단하고,
진단하면서 불확실했던 지점을 검증 재질문으로 되묻는다.
이 재질문의 답변은 이후 콜2(전문화)의 매칭 근거로 그대로 쓰인다.
프로필·컨텍스트는 Spring이 전달한다(단일 데이터 오너십)."""
import json
from .anthropic_client import call
from ..config import settings

SYSTEM = """당신은 소상공인 경영 진단 전문가입니다. 사장님의 온보딩 답변과 상권·경기지표 데이터를 보고
"지금 이 사장님의 경영 상태가 어떤지"를 사장님이 이해할 수 있는 언어로 진단하세요.

진단(diagnosis) 작성 규칙:
- profile에 실제로 값이 채워진 항목만 근거로 쓰세요. 업종·지역만 보지 말고 운영기간(operating_period)·
  매출(monthly_revenue_band)·직원수(employee_band)·자금 용도(funding_purpose)·세금 체납(tax_delinquency)·
  연체 상태(overdue_status)·정책자금 수혜 이력(funding_experience)·희망 금액(funding_amount_band)까지
  확인하고, 그중 의미 있는 항목을 구체적으로 언급하세요.
- 값이 없거나 모르는 항목(null, "UNKNOWN_*", "잘 모름")은 근거로 쓰지 마세요 — 지어내지 마세요.
- market_context(상권 데이터)가 있으면 경쟁강도·유동인구·매출추이를 사장님 상황과 연결해 해석하세요.
  econ_context(금리·BSI)가 있으면 자금 조달 환경 관점에서 연결하세요. 없으면 언급하지 마세요.
- 강점과 리스크를 균형 있게 쓰되, 겁주지 말고 사실 기반으로 담담하게 쓰세요.
- 어려운 행정·금융 용어 대신 사장님이 바로 이해할 수 있는 말로 쓰세요.
- 아직 정책자금을 추천하는 단계가 아닙니다. 어떤 공고를 신청하라는 말은 하지 마세요.

검증 재질문(follow_up_questions) 작성 규칙:
- 2~4개만 만드세요. 많을수록 사장님이 답을 포기합니다.
- 진단을 쓰면서 "이 값을 알았다면 훨씬 정확했을 텐데" 싶었던 지점만 물으세요.
  이미 profile에 값이 있는 항목은 다시 묻지 마세요.
- 각 질문은 사장님이 고민 없이 바로 답할 수 있어야 합니다. 회계·법률 지식을 요구하지 마세요.
- type은 "choice"(객관식) 또는 "text"(자유서술)입니다. 기본은 "choice"로 하고,
  선택지로 담기 어려운 미묘한 것만 "text"로 하세요.
- type이 "choice"면 options에 3~5개 선택지를 넣으세요. type이 "text"면 options는 넣지 마세요.
- id는 "q1", "q2" 같은 짧은 문자열로 하세요.

반드시 JSON만 출력:
{"diagnosis": "...", "follow_up_questions": [{"id": "q1", "question": "...", "type": "choice", "options": ["...", "..."]}]}"""


def diagnose(profile: dict, market_context: dict | None = None,
             econ_context: dict | None = None) -> dict:
    if settings.mock_llm:
        industry = profile.get("industry", "업종 미상")
        region = profile.get("region_sigungu") or profile.get("region_sido", "지역 미상")
        return {
            "diagnosis": f"[MOCK] {region} {industry} 사장님의 경영 상태 진단입니다.",
            "follow_up_questions": [
                {"id": "q1", "question": "[MOCK] 최근 3개월 매출 추이는 어떤가요?",
                 "type": "choice", "options": ["늘었다", "비슷하다", "줄었다"]},
                {"id": "q2", "question": "[MOCK] 가장 큰 고민을 적어주세요", "type": "text"},
            ],
        }
    payload = {"profile": profile}
    if market_context:
        payload["market_context"] = market_context
    if econ_context:
        payload["econ_context"] = econ_context
    user = json.dumps(payload, ensure_ascii=False, default=str)
    raw = call(settings.model_diagnosis, SYSTEM, user, max_tokens=3000)
    try:
        parsed = json.loads(raw.replace("```json", "").replace("```", "").strip())
    except json.JSONDecodeError:
        return {"diagnosis": raw, "follow_up_questions": []}
    parsed.setdefault("follow_up_questions", [])
    return parsed
```

- [ ] **Step 5: 라우터 구현**

`apps/ai-engine/app/routers/diagnose.py`:

```python
"""콜1 · 개인화 경영 진단 (Opus) — 진단 본문 + 검증 재질문 반환.
온보딩 직후 가장 먼저 호출된다. 매칭보다 앞선 단계라 공고 정보는 받지 않는다.
호출자: Spring ConsultationService"""
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from ..services.diagnosis import diagnose

router = APIRouter()


class DiagnoseRequest(BaseModel):
    profile: dict                          # Spring이 조회해 전달 (ai-engine은 테이블 직접 조회 안 함)
    market_context: Optional[dict] = None  # market_snapshot metric — 없으면 무시
    econ_context: Optional[dict] = None    # econ_indicator 최신값 — 없으면 무시


@router.post("")
def diagnose_endpoint(req: DiagnoseRequest):
    return diagnose(req.profile, req.market_context, req.econ_context)
```

- [ ] **Step 6: main.py에 라우터 등록**

`apps/ai-engine/app/main.py` — import 줄과 include_router 줄을 각각 수정한다.

import 줄을 이렇게 바꾼다:
```python
from .routers import screening, analysis, matching, report, draft, indexing, diagnose
```

`app.include_router(screening.router, ...)` 바로 위에 한 줄 추가:
```python
app.include_router(diagnose.router,  prefix="/diagnose", tags=["콜1 개인화 진단 (Opus)"])
```

- [ ] **Step 7: 테스트 실행해서 통과 확인**

Run:
```bash
cd /Users/keephun/vscode/opro/apps/ai-engine && python -m pytest tests/test_diagnosis.py -v
```
Expected: PASS — 6개 테스트 모두 통과

- [ ] **Step 8: 기존 테스트 회귀 확인**

Run:
```bash
cd /Users/keephun/vscode/opro/apps/ai-engine && python -m pytest tests/ -v
```
Expected: PASS — 기존 테스트 포함 전부 통과

- [ ] **Step 9: Commit**

```bash
cd /Users/keephun/vscode/opro
git add apps/ai-engine/app/services/diagnosis.py apps/ai-engine/app/routers/diagnose.py apps/ai-engine/app/main.py apps/ai-engine/app/config.py apps/ai-engine/tests/test_diagnosis.py
git commit -m "feat: add /diagnose endpoint for personalized business diagnosis (call 1)"
```

---

### Task 3: Spring — 진단 호출 + 세션 저장 (`ConsultationService.diagnose`)

**Files:**
- Modify: `apps/api-core/src/main/java/com/bizagent/api/aiclient/AiEngineClient.java`
- Create: `apps/api-core/src/main/java/com/bizagent/api/consult/ConsultationService.java`
- Test: `apps/api-core/src/test/java/com/bizagent/api/consult/ConsultationServiceTest.java`

**Interfaces:**
- Consumes: `AiEngineClient.post(String path, Map body)` (기존 private 헬퍼), `PipelineService`, `ProfileMatchTrigger.buildQuery(Map)` (Task 5에서 사용)
- Produces:
  - `AiEngineClient.diagnose(Map<String,Object> profile, Map<String,Object> marketContext, Map<String,Object> econContext) -> Map<String,Object>` — 반환 `{diagnosis, follow_up_questions}`
  - `ConsultationService.diagnose(long profileId) -> DiagnoseResult`
  - `record ConsultationService.DiagnoseResult(long sessionId, String diagnosis, List<Map<String,Object>> followUpQuestions)`
  - `ConsultationService.formatAnswers(List<Map<String,Object>>) -> String` (private static, Task 5에서 사용)

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/api-core/src/test/java/com/bizagent/api/consult/ConsultationServiceTest.java`:

```java
package com.bizagent.api.consult;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 콜1/콜2 사이를 잇는 순수 조립 로직 검증.
 * DB·AI 호출이 없는 static 헬퍼만 대상으로 한다(PipelineServiceTest와 동일한 방식).
 */
class ConsultationServiceTest {

    private static String formatAnswers(List<Map<String, Object>> answers) {
        return (String) ReflectionTestUtils.invokeMethod(
                ConsultationService.class, "formatAnswers", answers);
    }

    private static Map<String, Object> answer(String question, Object value) {
        Map<String, Object> a = new HashMap<>();
        a.put("question", question);
        a.put("value", value);
        return a;
    }

    @Test
    void formatAnswers_rendersQuestionAndValuePairs() {
        String out = formatAnswers(List.of(
                answer("최근 3개월 매출 추이는?", "줄었다"),
                answer("가장 큰 고민은?", "임대료 인상")));

        assertThat(out).contains("최근 3개월 매출 추이는?");
        assertThat(out).contains("줄었다");
        assertThat(out).contains("임대료 인상");
    }

    @Test
    void formatAnswers_returnsEmptyString_whenAnswersNull() {
        assertThat(formatAnswers(null)).isEmpty();
    }

    @Test
    void formatAnswers_returnsEmptyString_whenAnswersEmpty() {
        assertThat(formatAnswers(List.of())).isEmpty();
    }

    @Test
    void formatAnswers_skipsBlankValues() {
        String out = formatAnswers(List.of(
                answer("답한 질문", "실제 답변"),
                answer("건너뛴 질문", "")));

        assertThat(out).contains("실제 답변");
        assertThat(out).doesNotContain("건너뛴 질문");
    }
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run:
```bash
cd /Users/keephun/vscode/opro/apps/api-core && ./gradlew test --tests "*ConsultationServiceTest*"
```
Expected: FAIL — 컴파일 에러 `cannot find symbol: class ConsultationService`

- [ ] **Step 3: AiEngineClient에 diagnose 메서드 추가**

`apps/api-core/src/main/java/com/bizagent/api/aiclient/AiEngineClient.java` — `analyze` 메서드 바로 위에 추가:

```java
    /** 콜1 · 개인화 경영 진단 (Opus) — 온보딩 직후 매칭보다 먼저 호출된다.
     *  응답: {diagnosis, follow_up_questions}. marketContext/econContext는 선택 —
     *  null이면 아예 안 보낸다(ai-engine이 없어도 정상 동작). */
    public Map<String, Object> diagnose(Map<String, Object> profile,
                                        Map<String, Object> marketContext,
                                        Map<String, Object> econContext) {
        Map<String, Object> body = new HashMap<>();
        body.put("profile", sanitize(profile));
        if (marketContext != null) body.put("market_context", marketContext);
        if (econContext != null) body.put("econ_context", econContext);
        return post("/diagnose", body);
    }
```

- [ ] **Step 4: ConsultationService 구현 (진단 단계)**

`apps/api-core/src/main/java/com/bizagent/api/consult/ConsultationService.java`:

```java
package com.bizagent.api.consult;

import com.bizagent.api.aiclient.AiEngineClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 대화형 2-콜 컨설팅 오케스트레이션.
 * 콜1(진단) → [사장님이 진단 읽고 재질문 답변] → 콜2(전문화)로 이어지는 상태를
 * consultation_session 테이블로 잇는다. AI 호출만 ai-engine에 위임한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConsultationService {

    private final JdbcTemplate jdbc;
    private final AiEngineClient aiEngine;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 콜1 결과 — 프론트가 진단 본문과 재질문을 바로 렌더한다. */
    public record DiagnoseResult(long sessionId, String diagnosis,
                                 List<Map<String, Object>> followUpQuestions) {}

    /**
     * 콜1 · 개인화 진단. 프로필 + 상권/경기지표를 모아 ai-engine에 넘기고,
     * 결과를 세션(status=DIAGNOSED)으로 저장한다.
     */
    @SuppressWarnings("unchecked")
    public DiagnoseResult diagnose(long profileId) {
        long t0 = System.currentTimeMillis();
        Map<String, Object> profile = loadProfile(profileId);

        Map<String, Object> marketContext = fetchMarketContext(profile);
        Map<String, Object> econContext = fetchEconContext();

        Map<String, Object> res = aiEngine.diagnose(profile, marketContext, econContext);
        String diagnosis = String.valueOf(res.getOrDefault("diagnosis", ""));
        Object rawQuestions = res.get("follow_up_questions");
        List<Map<String, Object>> questions =
                rawQuestions instanceof List ? (List<Map<String, Object>>) rawQuestions : List.of();

        Long sessionId = jdbc.queryForObject("""
            INSERT INTO consultation_session (profile_id, status, diagnosis_text, follow_up_questions)
            VALUES (?, 'DIAGNOSED', ?, ?::jsonb)
            RETURNING id
            """, Long.class, profileId, diagnosis, toJson(questions));

        log.info("[profile={}] 콜1 진단 완료 ({}ms, sessionId={}, 재질문 {}건)",
                profileId, System.currentTimeMillis() - t0, sessionId, questions.size());
        return new DiagnoseResult(sessionId, diagnosis, questions);
    }

    /** 프로필 조회 — PipelineService와 동일한 컬럼 집합을 쓴다. */
    Map<String, Object> loadProfile(long profileId) {
        return jdbc.queryForMap("""
            SELECT industry, entity_type, operating_period, monthly_revenue_band,
                   employee_band, region_sido, region_sigungu,
                   funding_purpose, tax_delinquency, overdue_status, funding_experience,
                   funding_amount_band, revenue_basis, nts_verified,
                   market_region_code, market_industry_code
            FROM business_profile WHERE id = ?
            """, profileId);
    }

    /**
     * 상권 최신 스냅샷 조회. 프로필에 상권 코드가 없으면 조용히 생략한다 —
     * ai-engine이 market_context 없이도 정상 동작하도록 설계돼 있다.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> fetchMarketContext(Map<String, Object> profile) {
        Object regionCode = profile.get("market_region_code");
        Object industryCode = profile.get("market_industry_code");
        if (regionCode == null || industryCode == null) return null;
        try {
            String metricJson = jdbc.queryForObject("""
                SELECT metric::text FROM market_snapshot
                WHERE region_code = ? AND industry_code = ?
                ORDER BY collected_at DESC LIMIT 1
                """, String.class, regionCode, industryCode);
            return objectMapper.readValue(metricJson, Map.class);
        } catch (EmptyResultDataAccessException e) {
            return null;
        } catch (Exception e) {
            log.warn("market_context 조회 실패 — 생략하고 진행: {}", e.toString());
            return null;
        }
    }

    /**
     * 경기지표 최신값 조회 — 지표코드별 가장 최근 관측치를 map으로 모은다.
     * 지표 코드를 하드코딩하지 않고 테이블에 있는 것을 그대로 쓴다.
     */
    private Map<String, Object> fetchEconContext() {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT DISTINCT ON (indicator_code) indicator_code, value, observed_at
                FROM econ_indicator
                ORDER BY indicator_code, observed_at DESC
                """);
            if (rows.isEmpty()) return null;
            Map<String, Object> out = new HashMap<>();
            for (Map<String, Object> row : rows) {
                out.put(String.valueOf(row.get("indicator_code")), row.get("value"));
            }
            return out;
        } catch (Exception e) {
            log.warn("econ_context 조회 실패 — 생략하고 진행: {}", e.toString());
            return null;
        }
    }

    /**
     * 재질문 답변을 콜2 매칭 쿼리에 붙일 자연어로 변환한다.
     * 값이 비어있는(건너뛴) 답변은 제외한다 — 스킵을 빈 답변으로 보내도 안전하다.
     */
    private static String formatAnswers(List<Map<String, Object>> answers) {
        if (answers == null || answers.isEmpty()) return "";
        List<String> lines = new ArrayList<>();
        for (Map<String, Object> a : answers) {
            Object value = a.get("value");
            String valueText = value == null ? "" : String.valueOf(value).trim();
            if (valueText.isEmpty()) continue;
            String question = String.valueOf(a.getOrDefault("question", "")).trim();
            lines.add(question.isEmpty() ? valueText : question + " → " + valueText);
        }
        return String.join("\n", lines);
    }

    String toJson(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return "[]";
        }
    }
}
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run:
```bash
cd /Users/keephun/vscode/opro/apps/api-core && ./gradlew test --tests "*ConsultationServiceTest*"
```
Expected: PASS — 4개 테스트 통과

- [ ] **Step 6: Commit**

```bash
cd /Users/keephun/vscode/opro
git add apps/api-core/src/main/java/com/bizagent/api/aiclient/AiEngineClient.java apps/api-core/src/main/java/com/bizagent/api/consult/ConsultationService.java apps/api-core/src/test/java/com/bizagent/api/consult/ConsultationServiceTest.java
git commit -m "feat: add ConsultationService.diagnose with market/econ context"
```

---

### Task 4: Spring — `POST /api/consult/diagnose` 컨트롤러

**Files:**
- Create: `apps/api-core/src/main/java/com/bizagent/api/consult/ConsultationController.java`

**Interfaces:**
- Consumes: `ConsultationService.diagnose(long profileId) -> DiagnoseResult`
- Produces: HTTP `POST /api/consult/diagnose` — 요청 `{"profileId": <long>}`, 응답 `{sessionId, diagnosis, followUpQuestions, status}`

- [ ] **Step 1: 컨트롤러 구현**

`apps/api-core/src/main/java/com/bizagent/api/consult/ConsultationController.java`:

```java
package com.bizagent.api.consult;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 대화형 2-콜 컨설팅 엔드포인트.
 * 온보딩 직후 /diagnose(콜1) → 사장님이 진단 읽고 답변 → /specialize(콜2).
 */
@Slf4j
@RestController
@RequestMapping("/api/consult")
@RequiredArgsConstructor
public class ConsultationController {

    private final ConsultationService consultationService;

    /** 콜1 · 개인화 진단. 최대 수십 초 걸릴 수 있다(Opus). */
    @PostMapping("/diagnose")
    public Map<String, Object> diagnose(@RequestBody Map<String, Object> body) {
        long profileId = Long.parseLong(String.valueOf(body.get("profileId")));
        Map<String, Object> res = new HashMap<>();
        res.put("profileId", profileId);
        try {
            ConsultationService.DiagnoseResult result = consultationService.diagnose(profileId);
            res.put("sessionId", result.sessionId());
            res.put("diagnosis", result.diagnosis());
            res.put("followUpQuestions", result.followUpQuestions());
            res.put("status", "DIAGNOSED");
        } catch (Exception e) {
            // 기존 파이프라인 방어 패턴과 동일 — 원시 500 대신 실패 상태를 반환한다.
            log.warn("[profile={}] 콜1 진단 실패: {}", profileId, e.toString());
            res.put("status", "ERROR");
            res.put("message", e.getMessage());
        }
        return res;
    }
}
```

- [ ] **Step 2: 컴파일 확인**

Run:
```bash
cd /Users/keephun/vscode/opro/apps/api-core && ./gradlew compileJava
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: 실제 호출로 계약 검증 (mock_llm으로 토큰 없이)**

Run:
```bash
cd /Users/keephun/vscode/opro
docker compose up -d --build api-core ai-engine
sleep 60
curl -s -X POST http://localhost:8080/api/consult/diagnose \
  -H "Content-Type: application/json" -d '{"profileId": 1}' | head -40
```
Expected: `{"sessionId":<숫자>,"diagnosis":"...","followUpQuestions":[...],"status":"DIAGNOSED", ...}`

- [ ] **Step 4: 세션이 DB에 저장됐는지 확인**

Run:
```bash
docker compose exec postgres psql -U bizagent -d bizagent -c \
  "SELECT id, profile_id, status, left(diagnosis_text, 40) AS diag, jsonb_array_length(follow_up_questions) AS q_count FROM consultation_session ORDER BY id DESC LIMIT 1;"
```
Expected: `status = DIAGNOSED`, `q_count >= 1`인 한 행

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/main/java/com/bizagent/api/consult/ConsultationController.java
git commit -m "feat: add POST /api/consult/diagnose endpoint"
```

---

### Task 5: Spring — 전문화 단계 (`ConsultationService.specialize`)

**Files:**
- Modify: `apps/api-core/src/main/java/com/bizagent/api/consult/ConsultationService.java`
- Test: `apps/api-core/src/test/java/com/bizagent/api/consult/ConsultationServiceTest.java` (테스트 추가)

**Interfaces:**
- Consumes: `ProfileMatchTrigger.buildQuery(Map<String,Object> profile) -> String`, `AiEngineClient.match(String causeText, Map profile) -> List<Map<String,Object>>`, `PipelineService.run(long profileId, List<Map<String,Object>> newMatches) -> long`, `ConsultationService.formatAnswers(List)`
- Produces:
  - `ConsultationService.specialize(long sessionId, List<Map<String,Object>> answers) -> SpecializeResult`
  - `record ConsultationService.SpecializeResult(long sessionId, Long reportId, String status)`
  - `ConsultationService.buildEnrichedQuery(String baseQuery, String diagnosisText, String answersText) -> String` (private static)

- [ ] **Step 1: 실패하는 테스트 추가**

`apps/api-core/src/test/java/com/bizagent/api/consult/ConsultationServiceTest.java` — 기존 클래스 안에 헬퍼와 테스트를 추가한다.

클래스 상단 `formatAnswers` 헬퍼 아래에 추가:

```java
    private static String buildEnrichedQuery(String baseQuery, String diagnosisText, String answersText) {
        return (String) ReflectionTestUtils.invokeMethod(
                ConsultationService.class, "buildEnrichedQuery", baseQuery, diagnosisText, answersText);
    }
```

클래스 맨 아래에 테스트 추가:

```java
    @Test
    void buildEnrichedQuery_includesAllThreeParts() {
        String out = buildEnrichedQuery(
                "마포구에서 카페/디저트를 운영 중이며 운영자금 마련이 필요합니다",
                "경쟁강도가 높은 상권입니다",
                "최근 3개월 매출 추이는? → 줄었다");

        assertThat(out).contains("마포구에서 카페/디저트를 운영 중");
        assertThat(out).contains("경쟁강도가 높은 상권입니다");
        assertThat(out).contains("줄었다");
    }

    @Test
    void buildEnrichedQuery_omitsDiagnosisSection_whenBlank() {
        String out = buildEnrichedQuery("기본 쿼리", "", "답변 있음");

        assertThat(out).contains("기본 쿼리");
        assertThat(out).contains("답변 있음");
        assertThat(out).doesNotContain("[경영 진단]");
    }

    @Test
    void buildEnrichedQuery_omitsAnswersSection_whenSkipped() {
        // 재질문 스킵 경로 — 답변이 비어도 진단 기반으로 매칭이 진행돼야 한다.
        String out = buildEnrichedQuery("기본 쿼리", "진단 내용", "");

        assertThat(out).contains("기본 쿼리");
        assertThat(out).contains("진단 내용");
        assertThat(out).doesNotContain("[추가 확인 사항]");
    }

    @Test
    void buildEnrichedQuery_returnsBaseQueryOnly_whenNothingElse() {
        assertThat(buildEnrichedQuery("기본 쿼리", "", "")).isEqualTo("기본 쿼리");
    }
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run:
```bash
cd /Users/keephun/vscode/opro/apps/api-core && ./gradlew test --tests "*ConsultationServiceTest*"
```
Expected: FAIL — `buildEnrichedQuery` 메서드를 찾을 수 없다는 에러

- [ ] **Step 3: specialize 구현**

`apps/api-core/src/main/java/com/bizagent/api/consult/ConsultationService.java` — import에 다음을 추가:

```java
import com.bizagent.api.pipeline.PipelineService;
import com.bizagent.api.trigger.ProfileMatchTrigger;
```

의존성 필드에 두 줄 추가 (`private final ObjectMapper objectMapper` 위):

```java
    private final PipelineService pipelineService;
    private final ProfileMatchTrigger profileMatchTrigger;
```

`DiagnoseResult` record 아래에 record 추가:

```java
    /** 콜2 결과 — reportId는 매칭이 하나도 없으면 null이다. */
    public record SpecializeResult(long sessionId, Long reportId, String status) {}
```

`diagnose` 메서드 아래에 메서드 추가:

```java
    /**
     * 콜2 · 전문화. 진단 + 재질문 답변을 합친 쿼리로 매칭한 뒤,
     * 기존 파이프라인(L3 적합성 설명 → L5 리포트 생성 → 저장·알림)을 그대로 재사용한다.
     * answers가 null이거나 비어있으면(스킵) 진단만으로 매칭한다.
     */
    public SpecializeResult specialize(long sessionId, List<Map<String, Object>> answers) {
        long t0 = System.currentTimeMillis();
        Map<String, Object> session = jdbc.queryForMap("""
            SELECT profile_id, diagnosis_text FROM consultation_session WHERE id = ?
            """, sessionId);
        long profileId = ((Number) session.get("profile_id")).longValue();
        String diagnosisText = (String) session.get("diagnosis_text");

        jdbc.update("UPDATE consultation_session SET follow_up_answers = ?::jsonb WHERE id = ?",
                toJson(answers == null ? List.of() : answers), sessionId);

        Map<String, Object> profile = loadProfile(profileId);
        String query = buildEnrichedQuery(
                profileMatchTrigger.buildQuery(profile),
                diagnosisText == null ? "" : diagnosisText,
                formatAnswers(answers));

        List<Map<String, Object>> matches = aiEngine.match(query, profile);
        if (matches.isEmpty()) {
            log.info("[session={}] 콜2 매칭 결과 없음 ({}ms)", sessionId, System.currentTimeMillis() - t0);
            jdbc.update("UPDATE consultation_session SET status = 'COMPLETED' WHERE id = ?", sessionId);
            return new SpecializeResult(sessionId, null, "NO_MATCH");
        }

        long reportId = pipelineService.run(profileId, matches);
        jdbc.update("UPDATE consultation_session SET status = 'COMPLETED', report_id = ? WHERE id = ?",
                reportId, sessionId);
        log.info("[session={}] 콜2 전문화 완료 ({}ms, reportId={}, 매칭 {}건)",
                sessionId, System.currentTimeMillis() - t0, reportId, matches.size());
        return new SpecializeResult(sessionId, reportId, "COMPLETED");
    }

    /**
     * 매칭 쿼리 조립 — 기본 프로필 쿼리에 진단과 재질문 답변을 덧붙인다.
     * 빈 구간은 섹션 자체를 넣지 않는다(스킵 경로에서 빈 헤더만 남는 것을 막는다).
     */
    private static String buildEnrichedQuery(String baseQuery, String diagnosisText, String answersText) {
        StringBuilder sb = new StringBuilder(baseQuery == null ? "" : baseQuery);
        if (diagnosisText != null && !diagnosisText.isBlank()) {
            sb.append("\n\n[경영 진단]\n").append(diagnosisText.trim());
        }
        if (answersText != null && !answersText.isBlank()) {
            sb.append("\n\n[추가 확인 사항]\n").append(answersText.trim());
        }
        return sb.toString();
    }
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run:
```bash
cd /Users/keephun/vscode/opro/apps/api-core && ./gradlew test --tests "*ConsultationServiceTest*"
```
Expected: PASS — 8개 테스트 전부 통과

- [ ] **Step 5: 전체 Java 테스트 회귀 확인**

Run:
```bash
cd /Users/keephun/vscode/opro/apps/api-core && ./gradlew test
```
Expected: `BUILD SUCCESSFUL` — 기존 테스트 포함 전부 통과

- [ ] **Step 6: Commit**

```bash
cd /Users/keephun/vscode/opro
git add apps/api-core/src/main/java/com/bizagent/api/consult/ConsultationService.java apps/api-core/src/test/java/com/bizagent/api/consult/ConsultationServiceTest.java
git commit -m "feat: add ConsultationService.specialize reusing existing match pipeline"
```

---

### Task 6: Spring — `POST /api/consult/specialize` 컨트롤러

**Files:**
- Modify: `apps/api-core/src/main/java/com/bizagent/api/consult/ConsultationController.java`

**Interfaces:**
- Consumes: `ConsultationService.specialize(long sessionId, List<Map<String,Object>> answers) -> SpecializeResult`
- Produces: HTTP `POST /api/consult/specialize` — 요청 `{"sessionId": <long>, "answers": [{"id","question","value"}] | null}`, 응답 `{sessionId, reportId, status}`

- [ ] **Step 1: 엔드포인트 추가**

`apps/api-core/src/main/java/com/bizagent/api/consult/ConsultationController.java` — `diagnose` 메서드 아래에 추가:

```java
    /** 콜2 · 전문화. answers가 null/빈 배열이면 스킵 경로로 진단만 써서 매칭한다.
     *  매칭·분석·리포트 생성까지 포함해 수 분 걸릴 수 있다. */
    @SuppressWarnings("unchecked")
    @PostMapping("/specialize")
    public Map<String, Object> specialize(@RequestBody Map<String, Object> body) {
        long sessionId = Long.parseLong(String.valueOf(body.get("sessionId")));
        Object rawAnswers = body.get("answers");
        List<Map<String, Object>> answers =
                rawAnswers instanceof List ? (List<Map<String, Object>>) rawAnswers : null;

        Map<String, Object> res = new HashMap<>();
        res.put("sessionId", sessionId);
        try {
            ConsultationService.SpecializeResult result = consultationService.specialize(sessionId, answers);
            if (result.reportId() != null) res.put("reportId", result.reportId());
            res.put("status", result.status());
        } catch (Exception e) {
            log.warn("[session={}] 콜2 전문화 실패: {}", sessionId, e.toString());
            res.put("status", "ERROR");
            res.put("message", e.getMessage());
        }
        return res;
    }
```

import에 `java.util.List` 추가:

```java
import java.util.List;
```

- [ ] **Step 2: 컴파일 확인**

Run:
```bash
cd /Users/keephun/vscode/opro/apps/api-core && ./gradlew compileJava
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: end-to-end 호출로 검증**

Run:
```bash
cd /Users/keephun/vscode/opro
docker compose up -d --build api-core
sleep 60
SESSION=$(curl -s -X POST http://localhost:8080/api/consult/diagnose \
  -H "Content-Type: application/json" -d '{"profileId": 1}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['sessionId'])")
echo "sessionId=$SESSION"
curl -s -X POST http://localhost:8080/api/consult/specialize \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": $SESSION, \"answers\": [{\"id\":\"q1\",\"question\":\"최근 3개월 매출 추이는?\",\"value\":\"줄었다\"}]}"
```
Expected: `{"sessionId":<숫자>,"reportId":<숫자>,"status":"COMPLETED"}`

- [ ] **Step 4: 스킵 경로 검증**

Run:
```bash
SESSION2=$(curl -s -X POST http://localhost:8080/api/consult/diagnose \
  -H "Content-Type: application/json" -d '{"profileId": 1}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['sessionId'])")
curl -s -X POST http://localhost:8080/api/consult/specialize \
  -H "Content-Type: application/json" -d "{\"sessionId\": $SESSION2, \"answers\": null}"
```
Expected: `status`가 `COMPLETED` 또는 `NO_MATCH` — 에러 없이 완주한다.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/main/java/com/bizagent/api/consult/ConsultationController.java
git commit -m "feat: add POST /api/consult/specialize endpoint with skip path"
```

---

### Task 7: web — 진단 화면 + 재질문 UI + 대기 UX

**Files:**
- Create: `apps/web/app/consult/[sessionId]/page.tsx`
- Create: `apps/web/app/consult/loading-diagnosis/page.tsx`

**Interfaces:**
- Consumes: `POST /api/consult/diagnose`, `POST /api/consult/specialize` (Spring :8080 — `@/lib/api`의 `api()` 사용), `@/lib/theme`의 `C`, `@/lib/icons`의 `MASCOT_NAME`
- Produces: 라우트 `/consult/loading-diagnosis?profileId=<id>` (Wait A), `/consult/<sessionId>` (진단 읽기 + 재질문 + Wait B)

- [ ] **Step 1: Wait A 화면 — 진단 생성 중**

`apps/web/app/consult/loading-diagnosis/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { C } from "@/lib/theme";
import { MASCOT_NAME } from "@/lib/icons";

type DiagnoseResp = { sessionId: number; status: string; message?: string };

/** Wait A — 콜1(진단) 생성 중. 완료되면 /consult/<sessionId>로 이동한다. */
export default function LoadingDiagnosisPage() {
  const router = useRouter();
  const params = useSearchParams();
  const profileId = params.get("profileId");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await api<DiagnoseResp>("/api/consult/diagnose", {
          method: "POST",
          body: JSON.stringify({ profileId: Number(profileId) }),
        });
        if (cancelled) return;
        if (resp.status === "ERROR") {
          setError(resp.message ?? "진단 생성에 실패했습니다.");
          return;
        }
        router.replace(`/consult/${resp.sessionId}`);
      } catch {
        if (!cancelled) setError("진단 생성에 실패했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, router]);

  return (
    <main style={{ background: C.bgPage, minHeight: "100vh", display: "flex",
                   alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <h1 style={{ color: C.brownDark, fontSize: 24, fontWeight: 800, margin: "0 0 12px" }}>
          {error ? "다시 시도해주세요" : `${MASCOT_NAME}가 사장님 상권과 경영 상태를 분석 중이에요`}
        </h1>
        <p style={{ color: C.textMuted, fontSize: 15, lineHeight: 1.7, margin: 0 }}>
          {error ?? "상권 데이터와 금리 흐름까지 함께 살펴보고 있어요. 잠시만 기다려주세요."}
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 진단 읽기 + 재질문 + Wait B 화면**

`apps/web/app/consult/[sessionId]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { C } from "@/lib/theme";

type Question = { id: string; question: string; type: "choice" | "text"; options?: string[] };
type SpecializeResp = { sessionId: number; reportId?: number; status: string; message?: string };

/**
 * 갭 구간 — 진단 리포트(읽을거리) + 검증 재질문(능동 답변).
 * 답변 제출 시 콜2가 돌고(Wait B), 끝나면 리포트로 이동한다.
 */
export default function ConsultSessionPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [diagnosis, setDiagnosis] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 진단 본문·재질문은 sessionStorage로 넘겨받는다 (콜1 응답을 그대로 재사용 — 재조회 불필요).
  useEffect(() => {
    const cached = sessionStorage.getItem(`consult:${sessionId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      setDiagnosis(parsed.diagnosis ?? "");
      setQuestions(parsed.followUpQuestions ?? []);
    }
  }, [sessionId]);

  const submit = async (skip: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = skip
        ? null
        : questions.map((q) => ({ id: q.id, question: q.question, value: answers[q.id] ?? "" }));
      const resp = await api<SpecializeResp>("/api/consult/specialize", {
        method: "POST",
        body: JSON.stringify({ sessionId: Number(sessionId), answers: payload }),
      });
      if (resp.status === "ERROR") {
        setError(resp.message ?? "리포트 생성에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      router.push(resp.reportId ? `/reports/${resp.reportId}` : "/reports");
    } catch {
      setError("리포트 생성에 실패했습니다.");
      setSubmitting(false);
    }
  };

  // Wait B — 콜2 생성 중. 방금 읽은 진단을 계속 보여줘 대기가 비어 보이지 않게 한다.
  if (submitting) {
    return (
      <main style={{ background: C.bgPage, minHeight: "100vh", padding: "48px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ color: C.brownDark, fontSize: 24, fontWeight: 800, margin: "0 0 12px" }}>
            이 조건에 딱 맞는 정책자금을 찾는 중이에요
          </h1>
          <p style={{ color: C.textMuted, fontSize: 15, lineHeight: 1.7, margin: "0 0 32px" }}>
            사장님이 답해주신 내용까지 반영해서 공고를 고르고 있어요.
          </p>
          <div style={{ background: C.white, borderRadius: 16, padding: 28,
                        border: `1px solid ${C.border}` }}>
            <p style={{ color: C.textMuted, fontSize: 13, fontWeight: 800, margin: "0 0 10px" }}>
              방금 확인한 진단
            </p>
            <p style={{ color: C.text, fontSize: 15, lineHeight: 1.8, margin: 0,
                        whiteSpace: "pre-wrap" }}>
              {diagnosis}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ background: C.bgPage, minHeight: "100vh", padding: "48px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ color: C.brownDark, fontSize: 28, fontWeight: 800, margin: "0 0 20px" }}>
          사장님 경영 진단
        </h1>
        <div style={{ background: C.white, borderRadius: 16, padding: 28,
                      border: `1px solid ${C.border}`, marginBottom: 40 }}>
          <p style={{ color: C.text, fontSize: 16, lineHeight: 1.9, margin: 0,
                      whiteSpace: "pre-wrap" }}>
            {diagnosis}
          </p>
        </div>

        {questions.length > 0 && (
          <>
            <h2 style={{ color: C.brownDark, fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>
              몇 가지만 더 확인할게요
            </h2>
            <p style={{ color: C.textMuted, fontSize: 14, margin: "0 0 24px" }}>
              답해주시면 더 정확한 정책자금을 찾아드릴 수 있어요.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {questions.map((q) => (
                <div key={q.id}>
                  <p style={{ color: C.brownDark, fontSize: 16, fontWeight: 700,
                              margin: "0 0 12px" }}>
                    {q.question}
                  </p>
                  {q.type === "choice" ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(q.options ?? []).map((opt) => {
                        const selected = answers[q.id] === opt;
                        return (
                          <button
                            key={opt}
                            onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                            style={{
                              padding: "10px 18px", borderRadius: 999, fontSize: 14,
                              cursor: "pointer",
                              border: `1px solid ${selected ? C.goldDark : C.border}`,
                              background: selected ? C.gold : C.white,
                              color: selected ? C.brownDark : C.text,
                              fontWeight: selected ? 800 : 500,
                            }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      rows={3}
                      placeholder="편하게 적어주세요"
                      style={{ width: "100%", padding: 14, borderRadius: 10, fontSize: 14,
                               border: `1px solid ${C.border}`, resize: "vertical" }}
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {error && <p style={{ color: C.danger, fontSize: 14, marginTop: 20 }}>{error}</p>}

        <div style={{ display: "flex", gap: 12, marginTop: 40 }}>
          <button
            onClick={() => submit(false)}
            style={{ flex: 1, padding: "15px 0", borderRadius: 10, border: "none",
                     background: C.gold, color: C.brownDark, fontWeight: 800, fontSize: 15,
                     cursor: "pointer" }}
          >
            답변하고 정책자금 찾기
          </button>
          <button
            onClick={() => submit(true)}
            style={{ padding: "15px 24px", borderRadius: 10, background: C.white,
                     border: `1px solid ${C.border}`, color: C.textMuted, fontSize: 15,
                     cursor: "pointer" }}
          >
            건너뛰기
          </button>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Wait A 화면이 콜1 응답을 sessionStorage에 저장하도록 수정**

`apps/web/app/consult/loading-diagnosis/page.tsx` — `router.replace` 바로 앞에 한 줄 추가:

```tsx
        sessionStorage.setItem(`consult:${resp.sessionId}`, JSON.stringify(resp));
        router.replace(`/consult/${resp.sessionId}`);
```

`DiagnoseResp` 타입도 진단·재질문을 포함하도록 바꾼다:

```tsx
type DiagnoseResp = {
  sessionId: number;
  status: string;
  message?: string;
  diagnosis?: string;
  followUpQuestions?: { id: string; question: string; type: "choice" | "text"; options?: string[] }[];
};
```

- [ ] **Step 4: 빌드 확인**

Run:
```bash
cd /Users/keephun/vscode/opro
docker compose -f docker-compose.web.yml build web
```
Expected: `Image opro-web Built` — 타입 에러 없이 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/consult/
git commit -m "feat: add consultation diagnosis screen with follow-up questions"
```

---

### Task 8: web — 온보딩 제출 후 새 플로우로 연결

**Files:**
- Modify: `apps/web/app/onboarding/page.tsx` (제출 완료 후 이동 경로)

**Interfaces:**
- Consumes: `POST /api/onboarding` 응답의 프로필 `id`, 라우트 `/consult/loading-diagnosis?profileId=<id>`
- Produces: 온보딩 완료 → 대화형 컨설팅 플로우 진입

- [ ] **Step 1: 제출 성공 처리를 새 플로우로 교체**

`apps/web/app/onboarding/page.tsx:631-633` — 현재 코드는 이렇다:

```tsx
      const saved = await api<{ id: number }>("/api/onboarding", { method: "POST", body: JSON.stringify(body) });
      setSessionProfileId(saved.id);
      setProfileId(saved.id);
```

`setProfileId(saved.id)`가 기존 match-status 폴링 스텝퍼(같은 파일 497행 useEffect, 646행 렌더 분기)를 발동시킨다. 이 한 줄을 새 플로우 이동으로 바꾼다:

```tsx
      const saved = await api<{ id: number }>("/api/onboarding", { method: "POST", body: JSON.stringify(body) });
      setSessionProfileId(saved.id);
      router.push(`/consult/loading-diagnosis?profileId=${saved.id}`);
```

`setSessionProfileId`는 그대로 둔다 — 세션에 프로필 id를 남기는 역할이라 새 플로우에서도 필요하다.

**주의**: 이 변경으로 497행의 폴링 useEffect와 646행의 스텝퍼 렌더 분기는 `profileId`가 더 이상 세팅되지 않아 도달 불가 코드가 된다. 삭제는 이 계획의 범위 밖으로 남긴다 — 변경 면적을 좁게 유지하고, 롤백이 필요할 때 되돌릴 지점을 남겨두기 위함이다.

- [ ] **Step 2: 빌드 확인**

Run:
```bash
docker compose -f docker-compose.web.yml build web
```
Expected: `Image opro-web Built`

- [ ] **Step 3: 전체 플로우 수동 검증**

Run:
```bash
cd /Users/keephun/vscode/opro
docker compose up -d
docker compose -f docker-compose.web.yml up -d web
```
그다음 브라우저에서 `http://localhost:3000/onboarding`을 열어 온보딩을 끝까지 제출한다.

Expected 순서:
1. "토리가 사장님 상권과 경영 상태를 분석 중이에요" 화면 (Wait A)
2. 진단 본문 + 재질문 2~4개 화면
3. 답변 후 "이 조건에 딱 맞는 정책자금을 찾는 중이에요" 화면 (Wait B, 진단 재노출)
4. 리포트 상세 화면

- [ ] **Step 4: 세션 상태가 COMPLETED로 끝났는지 확인**

Run:
```bash
docker compose exec postgres psql -U bizagent -d bizagent -c \
  "SELECT id, profile_id, status, report_id, jsonb_array_length(follow_up_answers) AS answers FROM consultation_session ORDER BY id DESC LIMIT 3;"
```
Expected: 최신 행의 `status = COMPLETED`, `report_id`가 채워져 있음

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/onboarding/page.tsx
git commit -m "feat: route onboarding completion into interactive consultation flow"
```

---

## 완료 기준

전체 태스크 완료 시 다음이 성립해야 한다:

1. 온보딩 제출 → 진단 화면 → 재질문 답변 → 전문 리포트가 끊김 없이 이어진다.
2. 재질문을 건너뛰어도 진단만으로 리포트가 생성된다.
3. `consultation_session` 행이 `DIAGNOSED → COMPLETED`로 전이하고 `report_id`가 채워진다.
4. `apps/ai-engine`의 pytest와 `apps/api-core`의 gradle test가 모두 통과한다.
5. ai-engine이 비즈니스 테이블을 직접 조회하지 않고, web이 :8000을 직접 호출하지 않는다.
