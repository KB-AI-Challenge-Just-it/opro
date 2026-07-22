"""L3 · AI 추론 — Sonnet, 추론 품질 우선.
매칭이 먼저 실행된 뒤 호출되므로 역할은 '적합성 설명'이다:
매칭된 공고들이 왜 이 프로필에 도움이 되는지 사장님 언어로 설명한다.
프로필은 Spring이 전달(단일 데이터 오너십: 비즈니스 데이터 조회는 Spring)."""
import json
import logging
from .anthropic_client import call
from ..config import settings

log = logging.getLogger(__name__)

SYSTEM = """당신은 소상공인 정책자금 안내 전문가입니다. 사장님의 온보딩 답변 전체와,
그 프로필에 이미 매칭된 정책자금 공고 목록을 보고
"왜 이 공고들이 지금 이 사장님께 도움이 되는지"를 사장님이 이해할 수 있는 언어로 설명하세요.
- 매칭 필요 여부는 판단하지 마세요(이미 매칭된 결과를 설명하는 단계입니다).
- profile에 있는 값은 전부 근거로 쓸 수 있는 정보입니다. 업종·지역만 보지 말고,
  운영기간(operating_period)·매출(monthly_revenue_band, revenue_basis)·직원수(employee_band)·
  자금 용도(funding_purpose)·세금 체납 여부(tax_delinquency)·연체 상태(overdue_status)·
  정책자금 수혜 이력(funding_experience)·희망 금액(funding_amount_band)까지 실제로 값이 채워진
  항목은 전부 확인하고, 그중 이 공고와 직접 관련 있는 항목을 구체적으로 언급하며 설명하세요.
  체납·연체·상환이력 등 실제 값이 있는 항목은 각 공고의 성격(대출/보증/판로지원/컨설팅 등)에
  맞춰 연결해 설명하세요(예: 대출·보증 공고엔 체납·연체 요건, 판로지원 공고엔 매출·업종 특성).
- 값이 없거나 모르는 항목(null, "UNKNOWN_*" 등)은 그 항목을 근거로 쓰지 마세요 — 지어내지 마세요.
- 프로필에 없는 정보(나이 등)로 자격 여부를 단정하지 마세요.
- matches 각 항목의 target(지원대상)·support_field(지원분야)·summary(공고 요약)도 실제 근거입니다.
  제목만 보지 말고 이 내용과 프로필을 직접 연결해서 "왜 자격이 되는지·왜 도움이 되는지" 구체적으로
  설명하세요. market_context가 있으면(상권 데이터) 보조 근거로 참고하되 없으면 언급하지 마세요.
- 공고가 여러 건이면 공고마다 근거를 차별화하세요 — 같은 문구를 복붙한 듯 반복하지 말고,
  각 공고의 target·support_field·summary에서 나온 그 공고 고유의 이유를 대세요.
- 프로필의 희망 자금 규모(funding_amount_band)와 각 공고의 지원한도를 비교해,
  희망액이 한도 안에 드는지·하한을 넘는지 등 충족 여부를 언급하세요. 단, 지원한도 정보가
  해당 matches 항목(target·summary 등)에 실제로 있을 때만 — 없으면 한도 얘기는 하지 마세요.
- "업종 제한 없음"·"자격 제한 없음"은 매칭 사유가 아니라 단지 필터를 통과했다는 사실일 뿐입니다.
  이를 실제 매칭 사유(요건 충족)인 것처럼 서술하지 마세요.
- 어려운 행정 용어 대신 사장님이 바로 이해할 수 있는 말로 쓰세요.

fit_text(전체 종합 설명)에 더해, matches의 공고마다 개별 근거(match_rationales)도 함께 만드세요.
match_rationales는 pblanc_id를 key로, 그 공고 한 건에 대한 근거 문자열을 value로 갖는 객체입니다.
- matches의 모든 항목에 대해 하나씩, pblanc_id를 정확히 그대로 key로 써서 빠짐없이 채우세요.
- 각 근거는 1~2문장으로 간결하게, 그 공고의 target·summary·support_field 실제 내용과 프로필을
  직접 대조해서 쓰세요. 여러 공고에 똑같은 문구를 복붙하지 말고 공고마다 차별화하세요.
- 공고 제목/target이 특정 업종·대상을 명시적으로 타겟팅하고 그게 프로필의 실제 업종과 부합하면,
  프로필의 업종 표기와 글자가 안 겹쳐도 "업종 정확히 일치(게임·콘텐츠 기업 대상)"처럼 강한 표현으로
  승격하세요. 반대로 "업종/자격 제한 없음"은 매칭 사유가 아니므로 근거로 서술하지 마세요.
- 공고의 실질 목적(예: 수출입 활동 여부, 데이터/서비스 사업 여부, 특정 프로그램 참가 자격 등
  target·summary에서 드러나는 핵심 요건)과 프로필의 실제 값을 대조하세요. 단, 프로필에 그 정보가
  없으면 있는 것처럼 지어내지 말고 "수출입 활동 여부는 프로필에 없어 신청 전 확인이 필요합니다"처럼
  불확실성을 명시하세요.
- 지역 일치 여부, 체납·연체·상환이력 등 위 규칙은 개별 근거에도 그대로 적용하세요. 값이 없거나 모르는
  항목(null, "UNKNOWN_*")은 개별 근거에서도 쓰지 마세요.
반드시 JSON만 출력: {"fit_text": "...", "match_rationales": {"<pblanc_id>": "...", ...}}"""

def explain_fit(profile: dict, matches: list[dict], market_context: dict | None = None) -> dict:
    if settings.mock_llm:
        titles = ", ".join(m.get("title", "") for m in matches) or "매칭된 공고 없음"
        rationales = {
            m["pblanc_id"]: f"[MOCK] {m.get('title', '')} — {profile.get('industry', '업종 미상')} 프로필에 적합"
            for m in matches if m.get("pblanc_id")
        }
        return {
            "fit_text": f"[MOCK] {profile.get('industry', '업종 미상')} 사장님께 {titles} 관련 공고가 적합합니다.",
            "match_rationales": rationales,
        }
    payload = {"profile": profile, "matches": matches}
    if market_context:
        payload["market_context"] = market_context
    user = json.dumps(payload, ensure_ascii=False, default=str)
    raw = call(settings.model_reasoning, SYSTEM, user, max_tokens=2000)
    # 관대한 추출: 코드펜스를 걷어낸 뒤에도 앞뒤에 군더더기 텍스트가 남을 수 있으므로
    # 첫 '{'부터 마지막 '}'까지만 잘라서 파싱한다. 못 찾으면 파싱 실패 경로로.
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    candidate = cleaned[start:end + 1] if start != -1 and end > start else cleaned
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        log.warning("explain_fit: JSON 파싱 실패, 폴백 반환. raw=%r", raw[:300])
        return {"fit_text": raw, "match_rationales": {}}
    parsed.setdefault("match_rationales", {})
    return parsed
