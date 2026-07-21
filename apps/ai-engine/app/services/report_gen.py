"""L5 · 리포트 생성 — Sonnet. 합성이며 앙상블 아님:
적합성 설명(L3, 항상 포함) + 매칭 결과(있을 때만)를 하나의 리포트로. 저장은 Spring.
matches는 무거운 공고 원문(summary) 없이 가벼운 필드만 받는다(이슈 #61 비용 관리) —
공고 원문 근거는 이미 L3(fit_text)가 소화해서 넘겨준다."""
import json
from datetime import date
from .anthropic_client import call
from ..config import settings

SYSTEM = """소상공인 사장님께 보내는 경영 알림 리포트를 작성하세요.

헤더/제목은 정직하게:
- matches가 1건 이상이면 "적합 공고 N건"처럼 실제 건수를 그대로 쓰세요("매칭 N건" 같은 표현 대신).
- matches가 비어 있으면(적합 공고 0건) "현재 조건에 적합한 정책자금을 찾지 못했습니다" 류의 정직한 헤더를 쓰고, 없는 공고를 지어내지 마세요.

구성: ① 지금 상황 ② 적합성 설명(fit_text 내용을 자연스럽게 풀어서) ③ 공고별 실무 정보.

③은 matches 각 건마다 아래를 공고당 2~3줄로 간결하게 채우세요(값이 없는 항목은 생략):
- 지원대상(target)·지원분야(support_field)를 짧게 요약
- 마감 안내는 각 match의 deadline_note 값을 그대로 반영하세요. "마감임박"이 포함돼 있으면 "⚠️ 마감 임박"으로 강조하세요. 직접 날짜를 계산하거나 오늘 날짜를 추정하지 마세요 — 제공된 deadline_note가 유일한 근거입니다.
- 공고 링크(detail_url)를 "공고 바로가기"로 연결

전문용어 없이, 마크다운, 800자 이내. matches에 없는 지원금액·서류 등을 지어내지 마세요."""

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

def generate_report_body(cause_text: str, matches: list[dict]) -> str:
    today = date.today()
    enriched = [{**m, "deadline_note": _deadline_note(m.get("apply_end"), today)} for m in matches]
    if settings.mock_llm:
        header = f"## 적합 공고 {len(matches)}건" if matches else "## 적합한 정책자금을 찾지 못했습니다"
        match_lines = "\n".join(
            f"- {m.get('title', '')} ({m['deadline_note']})" for m in enriched) or "- (적합 공고 없음)"
        return f"# [MOCK] 리포트\n\n## 지금 상황\n{cause_text}\n\n{header}\n{match_lines}"
    user = json.dumps(
        {"cause": cause_text, "match_count": len(enriched), "matches": enriched},
        ensure_ascii=False)
    return call(settings.model_report, SYSTEM, user, max_tokens=1500)
