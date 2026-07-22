"""L5 · 리포트 생성 — Sonnet. 합성이며 앙상블 아님:
적합성 설명(L3, 항상 포함)을 정직한 건수 헤더와 함께 하나의 리포트 본문으로. 저장은 Spring.
공고별 실무 정보(지원대상·마감·링크)는 web의 matches 목록이 전담하므로 본문엔 넣지 않는다(이슈 #76).
프롬프트엔 match_count만 전달한다 — 공고 원문 근거는 이미 L3(fit_text)가 소화해 넘겨준다(이슈 #61 비용 관리)."""
import json
from datetime import date
from .anthropic_client import call
from ..config import settings

SYSTEM = """소상공인 사장님께 보내는 경영 알림 리포트를 작성하세요.

헤더/제목은 정직하게, 그리고 프로필이 있으면 개인화하세요:
- 실제 건수를 왜곡하지 않는 것이 최우선입니다. match_count가 1 이상이면 "적합 공고 N건"처럼 실제 건수를 그대로 쓰고("매칭 N건" 같은 표현 대신), match_count가 0이면 "현재 조건에 적합한 정책자금을 찾지 못했습니다" 류의 정직한 헤더를 쓰세요 — 없는 공고를 지어내지 마세요.
- profile_summary에 지역(region_sido/region_sigungu)이나 업종(industry) 정보가 있으면, 그 정보를 헤더에 자연스럽게 녹여 개인화하세요. 예: "대전 동구 카페 사장님, 적합 공고 5건을 찾았습니다" 같은 톤. match_count가 0일 때도 동일하게 개인화하되 정직한 톤은 유지하세요. 예: "대전 동구 카페 사장님, 현재 조건에 적합한 정책자금을 찾지 못했습니다".
- profile_summary에서 있는 필드만 쓰세요. 일부만 있으면(예: 업종만 있고 지역 없음) 있는 것만 자연스럽게 쓰고, 없는 지역·업종을 지어내지 마세요.
- profile_summary가 없거나(null) 세 필드가 모두 비어 있으면, 개인화 없이 순수 건수 헤더("적합 공고 N건을 찾았습니다" / "적합한 정책자금을 찾지 못했습니다")만 쓰세요.

구성: ① 지금 상황 ② 적합성 설명(fit_text 내용을 자연스럽게 풀어서). 이 둘만 작성하세요.
공고별 실무 정보(지원대상·지원분야·마감일·공고 링크 등)는 화면이 별도 목록으로 보여주므로 본문에서 반복하지 마세요.

전문용어 없이, 마크다운, 800자 이내. 지원금액·서류 등 제공되지 않은 정보를 지어내지 마세요."""

def _deadline_note(apply_end, today: date) -> str:
    """apply_end(YYYY-MM-DD 문자열)와 오늘로 D-day·마감임박을 결정론적으로 미리 계산.
    Claude가 날짜를 추정하지 않게 프롬프트에 완성된 문구로 박아 넣는다(2주=14일 이내 임박)."""
    if not apply_end:
        return "마감일 미정"
    try:
        d = date.fromisoformat(str(apply_end))
    except (ValueError, TypeError):
        return "마감일 미정"
    days = (d - today).days
    if days < 0:
        return f"마감: {apply_end} (마감됨)"
    tag = ", 마감임박" if days <= 14 else ""
    return f"마감: {apply_end} (D-{days}{tag})"

def _personal_prefix(profile_summary: dict | None) -> str:
    """profile_summary에서 있는 값만 뽑아 결정론적 개인화 접두어를 만든다.
    지역(시도·시군구)·업종 순으로 나열, 하나도 없으면 빈 문자열(=하위호환)."""
    if not profile_summary:
        return ""
    tokens = [profile_summary.get(k) for k in ("region_sido", "region_sigungu", "industry")]
    tokens = [t for t in tokens if t]
    return (" ".join(tokens) + " 사장님, ") if tokens else ""

def generate_report_body(cause_text: str, matches: list[dict], profile_summary: dict | None = None) -> str:
    if settings.mock_llm:
        today = date.today()
        enriched = [{**m, "deadline_note": _deadline_note(m.get("apply_end"), today)} for m in matches]
        prefix = _personal_prefix(profile_summary)
        header = (f"## {prefix}적합 공고 {len(matches)}건" if matches
                  else f"## {prefix}적합한 정책자금을 찾지 못했습니다")
        match_lines = "\n".join(
            f"- {m.get('title', '')} ({m['deadline_note']})" for m in enriched) or "- (적합 공고 없음)"
        return f"# [MOCK] 리포트\n\n## 지금 상황\n{cause_text}\n\n{header}\n{match_lines}"
    user = json.dumps(
        {"cause": cause_text, "match_count": len(matches), "profile_summary": profile_summary},
        ensure_ascii=False)
    return call(settings.model_report, SYSTEM, user, max_tokens=1500)
