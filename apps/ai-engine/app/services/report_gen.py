"""L5 · 리포트 생성 — Sonnet. 합성이며 앙상블 아님:
적합성 설명(L3, 항상 포함)을 정직한 건수 헤더와 함께 하나의 리포트 본문으로. 저장은 Spring.
공고별 실무 정보(지원대상·마감·링크)는 web의 matches 목록이 전담하므로 본문엔 넣지 않는다(이슈 #76).
프롬프트엔 match_count와 공고명(match_titles)만 전달한다 — 공고 원문 근거는 이미 L3(fit_text)가
소화해 넘겨준다(이슈 #61 비용 관리). match_titles는 L3가 fit_text에서 "1번 공고"처럼 번호로
지칭한 공고를 L5가 실제 이름으로 되살려 쓰게 하기 위한 최소 정보다 — summary 등 무거운 필드는
여전히 보내지 않는다."""
import json
from .anthropic_client import call
from ..config import settings

SYSTEM = """소상공인 사장님께 보내는 경영 알림 리포트를 작성하세요.

헤더/제목은 정직하게, 그리고 프로필이 있으면 개인화하세요:
- 실제 건수를 왜곡하지 않는 것이 최우선입니다. match_count가 1 이상이면 "적합 공고 N건"처럼 실제 건수를 그대로 쓰고("매칭 N건" 같은 표현 대신), match_count가 0이면 "현재 조건에 적합한 정책자금을 찾지 못했습니다" 류의 정직한 헤더를 쓰세요 — 없는 공고를 지어내지 마세요.
- match_count가 1 이상이면, 공고들이 사장님 필요와 다소 안 맞더라도 헤더에서 "찾지 못했습니다"라고 쓰지 마세요. 화면 카드에 N건이 그대로 보이므로 헤더가 "0건"처럼 읽히면 모순됩니다. 적합도가 낮거나 요건이 안 맞는다는 판단은 헤더가 아니라 본문에서 다루세요.
- profile_summary에 지역(region_sido/region_sigungu)이나 업종(industry) 정보가 있으면, 그 정보를 헤더에 자연스럽게 녹여 개인화하세요. 예: "대전 동구 카페 사장님, 적합 공고 5건을 찾았습니다" 같은 톤. match_count가 0일 때도 동일하게 개인화하되 정직한 톤은 유지하세요. 예: "대전 동구 카페 사장님, 현재 조건에 적합한 정책자금을 찾지 못했습니다".
- profile_summary에서 있는 필드만 쓰세요. 일부만 있으면(예: 업종만 있고 지역 없음) 있는 것만 자연스럽게 쓰고, 없는 지역·업종을 지어내지 마세요.
- profile_summary가 없거나(null) 세 필드가 모두 비어 있으면, 개인화 없이 순수 건수 헤더("적합 공고 N건을 찾았습니다" / "적합한 정책자금을 찾지 못했습니다")만 쓰세요.

마크다운 형식(반드시 지키세요 — 화면이 "#"/"##" 헤더로 제목과 섹션을 구분해서 렌더링합니다):
- 첫 줄은 반드시 "# "로 시작하는 위 헤더/제목 한 줄만 쓰세요. 헤더보다 앞에 다른 문장을 두지 마세요.
- 그다음 "## ① 지금 상황" 섹션을 쓰세요.
- 그다음 "## ② "로 시작하는 섹션에 적합성 설명(fit_text 내용을 자연스럽게 풀어서)을 담으세요. "②" 뒤 제목은 자유롭게 붙이되 반드시 "## ②"로 시작해야 합니다.
- 이 두 섹션 외에 다른 "#"/"##" 헤더를 추가하지 마세요.
공고별 실무 정보(지원대상·지원분야·마감일·공고 링크 등)는 화면이 별도 목록으로 보여주므로 본문에서 반복하지 마세요.

diagnosis(경영 진단)가 주어지면, 사장님은 이미 이 진단을 읽은 상태입니다. 그러니 "지금 상황"에서
진단을 그대로 다시 서술하지 마세요 — 녹음기처럼 반복하면 전문가가 아니라 무성의하게 읽힙니다.
진단을 근거로 삼되 그 위에서 한 걸음 더 나아가, 지금 매칭된 공고들과 연결지어 상황을 정리하세요.
진단에 있는 상권·경기 해석은 필요한 만큼만 근거로 인용하고 통째로 복붙하지 마세요.

follow_up_answers(사장님이 상담 중 직접 답한 내용)가 주어지면, 그 답변 중 최소 1개를 "지금 상황"에
명시적으로 반영해 '사장님이 답한 것 → 그래서 이런 결론' 연결을 눈에 보이게 만드세요. 사장님이
자기 답이 결과에 반영됐다고 느끼는 것이 이 리포트의 핵심입니다. 단, 답변에 없는 내용을 지어내지 마세요.

cause 텍스트(fit_text)는 각 공고를 "1번 공고", "2번 공고"처럼 번호로 지칭하며 설명합니다.
match_titles가 있으면, 그 배열의 순서(첫 번째 항목 = "1번 공고", 두 번째 = "2번 공고", ...)에
대응하는 실제 공고명으로 바꿔서 쓰세요. 리포트 본문에서 "1번 공고"처럼 번호로만 부르지 말고,
반드시 실제 공고명을 자연스럽게 문장에 녹여 쓰세요 — 사장님은 번호가 아니라 공고 이름으로
기억합니다. 공고명이 너무 길면 핵심 부분만 자연스럽게 줄여도 되지만, 지어낸 이름을 쓰지 마세요.

profile_facts가 주어지면 그것은 라벨링된 확정 사실입니다. 매출·업력·직원수·자금용도·희망금액 등
수치는 profile_facts를 근거로 정확히 쓰고, cause_text의 의역과 어긋나면 profile_facts를 우선하세요.
특히 매출은 profile_facts의 연매출/월평균 라벨을 그대로 쓰고, 월↔연을 바꿔 쓰지 마세요.

matches_brief가 주어지면 각 항목은 공고의 적합도(score, 0~100)와 유의사항 유무(has_caveats)입니다.
서술만 하지 말고 조언하세요:
- score가 높은 공고를 먼저 권하세요. score가 낮거나 has_caveats가 true인(자격·요건이 불확실한)
  공고는 "먼저 요건을 확인하세요" 식으로 톤을 낮추고 앞세우지 마세요.
- 본문 맨 끝에 "**다음 한 걸음:**"으로 시작하는 한두 문장을 붙여, 무엇을 먼저 해야 하는지와
  신청 전 확인할 요건 1~2개를 분명히 짚어주세요.
- 단, 각 공고의 지원대상·마감일·공고 링크·유의사항 원문은 화면 카드가 전담하므로 본문에서
  그대로 반복하지 마세요(카드와 중복 금지). 우선순위 판단의 근거로만 활용하세요.

전문용어 없이, 마크다운, 900자 이내. 지원금액·서류 등 제공되지 않은 정보를 지어내지 마세요."""

def _match_brief(m: dict) -> dict:
    """L5에 줄 공고별 압축 힌트 — 적합도(score)와 유의사항 유무(has_caveats)로 본문에서 우선순위를
    매기게 한다(계획 P3). 유의사항 원문·마감일·링크는 카드 전담(#76)이라 넣지 않는다.
    evidence는 {"reason","caveats"} JSON 문자열이거나 규칙기반 평문일 수 있어 방어적으로 판별한다."""
    caveats = ""
    ev = m.get("evidence")
    if isinstance(ev, str):
        try:
            parsed = json.loads(ev)
            if isinstance(parsed, dict):
                caveats = parsed.get("caveats") or ""
        except json.JSONDecodeError:
            caveats = ""
    return {
        "title": m.get("title", ""),
        "score": m.get("match_score"),
        "has_caveats": bool(caveats and str(caveats).strip()),
    }


def generate_report_body(cause_text: str, matches: list[dict], profile_summary: dict | None = None,
                         profile_facts: str | None = None, diagnosis: str | None = None,
                         follow_up_answers: str | None = None) -> str:
    user = json.dumps(
        {
            "cause": cause_text,
            "match_count": len(matches),
            "match_titles": [m.get("title", "") for m in matches],
            "matches_brief": [_match_brief(m) for m in matches],
            "profile_summary": profile_summary,
            "profile_facts": profile_facts,
            "diagnosis": diagnosis,
            "follow_up_answers": follow_up_answers,
        },
        ensure_ascii=False)
    return call(settings.model_report, SYSTEM, user, max_tokens=1500)
