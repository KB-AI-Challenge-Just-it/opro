"""L3 · AI 추론 — Sonnet, 추론 품질 우선.
매칭이 먼저 실행된 뒤 호출되므로 역할은 '적합성 설명'이다:
매칭된 공고들이 왜 이 프로필에 도움이 되는지 사장님 언어로 설명한다.
프로필은 Spring이 전달(단일 데이터 오너십: 비즈니스 데이터 조회는 Spring)."""
import json
from .anthropic_client import call
from ..config import settings

SYSTEM = """당신은 소상공인 정책자금 안내 전문가입니다. 사장님의 온보딩 답변 전체와,
그 프로필에 이미 매칭된 정책자금 공고 목록을 보고
"왜 이 공고들이 지금 이 사장님께 도움이 되는지"를 사장님이 이해할 수 있는 언어로 설명하세요.
- 매칭 필요 여부는 판단하지 마세요(이미 매칭된 결과를 설명하는 단계입니다).
- profile에 있는 값은 전부 근거로 쓸 수 있는 정보입니다. 업종·지역만 보지 말고,
  운영기간(operating_period)·매출(monthly_revenue_band, revenue_basis)·직원수(employee_band)·
  자금 용도(funding_purpose)·세금 체납 여부(tax_delinquency)·연체 상태(overdue_status)·
  정책자금 수혜 이력(funding_experience)·희망 금액(funding_amount_band)까지 실제로 값이 채워진
  항목은 전부 확인하고, 그중 이 공고와 직접 관련 있는 항목을 구체적으로 언급하며 설명하세요.
  (예: "체납·연체가 없어 신청 요건을 충족" "창업 1년 미만 밴드라 초기 임대료 지원 대상" 등)
- 값이 없거나 모르는 항목(null, "UNKNOWN_*" 등)은 그 항목을 근거로 쓰지 마세요 — 지어내지 마세요.
- 프로필에 없는 정보(나이 등)로 자격 여부를 단정하지 마세요.
- matches 각 항목의 target(지원대상)·support_field(지원분야)·summary(공고 요약)도 실제 근거입니다.
  제목만 보지 말고 이 내용과 프로필을 직접 연결해서 "왜 자격이 되는지·왜 도움이 되는지" 구체적으로
  설명하세요. market_context가 있으면(상권 데이터) 보조 근거로 참고하되 없으면 언급하지 마세요.
- 어려운 행정 용어 대신 사장님이 바로 이해할 수 있는 말로 쓰세요.
반드시 JSON만 출력: {"fit_text": "..."}"""

def explain_fit(profile: dict, matches: list[dict], market_context: dict | None = None) -> dict:
    if settings.mock_llm:
        titles = ", ".join(m.get("title", "") for m in matches) or "매칭된 공고 없음"
        return {"fit_text": f"[MOCK] {profile.get('industry', '업종 미상')} 사장님께 {titles} 관련 공고가 적합합니다."}
    payload = {"profile": profile, "matches": matches}
    if market_context:
        payload["market_context"] = market_context
    user = json.dumps(payload, ensure_ascii=False, default=str)
    raw = call(settings.model_reasoning, SYSTEM, user, max_tokens=1200)
    try:
        return json.loads(raw.replace("```json", "").replace("```", "").strip())
    except json.JSONDecodeError:
        return {"fit_text": raw}
