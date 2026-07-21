"""L5 · 리포트 생성 — Sonnet. 합성이며 앙상블 아님:
적합성 설명(L3, 항상 포함) + 매칭 결과(있을 때만)를 하나의 리포트로. 저장은 Spring.
matches는 무거운 공고 원문(summary) 없이 가벼운 필드만 받는다(이슈 #61 비용 관리) —
공고 원문 근거는 이미 L3(fit_text)가 소화해서 넘겨준다."""
import json
from .anthropic_client import call
from ..config import settings

SYSTEM = """소상공인 사장님께 보내는 경영 알림 리포트를 작성하세요.
구성: ① 지금 상황 ② 적합성 설명(fit_text 내용을 자연스럽게 풀어서) ③ 공고별 실무 정보.

③은 matches 각 건마다 아래를 공고당 2~3줄로 간결하게 채우세요(값이 없는 항목은 생략):
- 지원대상(target)·지원분야(support_field)를 짧게 요약
- 마감일(apply_end)이 임박(2주 이내)하면 "⚠️ 마감 임박" 강조
- 공고 링크(detail_url)를 "공고 바로가기"로 연결

전문용어 없이, 마크다운, 800자 이내. matches에 없는 지원금액·서류 등을 지어내지 마세요."""

def generate_report_body(cause_text: str, matches: list[dict]) -> str:
    if settings.mock_llm:
        match_lines = "\n".join(f"- {m.get('title', '')}" for m in matches) or "- (매칭된 공고 없음)"
        return f"# [MOCK] 리포트\n\n## 지금 상황\n{cause_text}\n\n## 대응 가능한 정책자금\n{match_lines}"
    user = json.dumps({"cause": cause_text, "matches": matches}, ensure_ascii=False)
    return call(settings.model_report, SYSTEM, user, max_tokens=1500)
