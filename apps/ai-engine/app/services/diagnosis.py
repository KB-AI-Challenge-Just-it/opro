"""콜1 · 개인화 경영 진단 (Opus, 품질 최우선).
온보딩 프로필 + 상권/경기지표 실데이터로 "지금 이 사장님의 경영 상태"를 진단하고,
진단하면서 불확실했던 지점을 검증 재질문으로 되묻는다.
이 재질문의 답변은 이후 콜2(전문화)의 매칭 근거로 그대로 쓰인다.
프로필·컨텍스트는 Spring이 전달한다(단일 데이터 오너십).

실측 사고: 모델이 가끔 "반드시 JSON만 출력" 지시를 무시하고 순수 자연어 진단 문단만
반환해 follow_up_questions가 통째로 비었다(재질문 세션 자체가 안 뜸).
assistant 턴 프리필("{")로 막으려 했으나 model_diagnosis(claude-opus-4-8)가
프리필 자체를 지원하지 않아(400 invalid_request_error) 쓸 수 없다 — 대신
SYSTEM 프롬프트 끝에 형식 경고를 한 번 더 못박고, cause_analysis.py와 동일한
관대한 추출(코드펜스·군더더기 제거, 무효 이스케이프 정리)을 방어선으로 둔다."""
import json
import logging
import re
from .anthropic_client import call
from ..config import settings

log = logging.getLogger(__name__)

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
{"diagnosis": "...", "follow_up_questions": [{"id": "q1", "question": "...", "type": "choice", "options": ["...", "..."]}]}

다시 한번 강조합니다: 응답의 첫 글자는 반드시 "{"여야 합니다. "알겠습니다", "분석 결과입니다" 같은
인사말이나 설명을 앞에 붙이지 마세요. 코드펜스(```)도 쓰지 마세요. 위 JSON 객체 하나만 출력하고
그 앞뒤에 어떤 문장도 덧붙이지 마세요."""


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
    # 관대한 추출: 코드펜스를 걷어낸 뒤에도 앞뒤에 군더더기 텍스트가 남을 수 있으므로
    # 첫 '{'부터 마지막 '}'까지만 잘라서 파싱한다. 못 찾으면 파싱 실패 경로로.
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    candidate = cleaned[start:end + 1] if start != -1 and end > start else cleaned
    # cause_analysis.py와 동일 — Claude가 문자열 값 안의 작은따옴표를 \' 로 이스케이프하는 등
    # JSON 문법상 무효한 백슬래시 이스케이프를 내보내면 json.loads가 거부한다. 유효 이스케이프
    # (" \ / b f n r t u, \uXXXX)는 보존하고 무효한 \<char>는 백슬래시만 떼어낸다.
    sanitized = re.sub(
        r'\\(["\\/bfnrtu])|\\(.)',
        lambda m: m.group(0) if m.group(1) is not None else m.group(2),
        candidate,
    )
    try:
        parsed = json.loads(sanitized)
    except json.JSONDecodeError:
        log.warning("diagnose: JSON 파싱 실패, 폴백 반환. raw=%r", raw[:300])
        parsed = None
    # 파싱은 성공했지만 객체가 아닌 JSON(배열/문자열/숫자 등)이면 .setdefault가 터지므로
    # 파싱 실패와 동일하게 폴백 처리한다.
    if not isinstance(parsed, dict):
        return {"diagnosis": raw, "follow_up_questions": []}
    parsed.setdefault("follow_up_questions", [])
    return parsed
