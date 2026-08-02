"""diagnosis.py의 SYSTEM 프롬프트가 스스로 선언한 재질문 규칙을, LLM 판정 없이 코드로 채점한다.

diagnosis.SYSTEM 35~43행의 규칙(2~4개, choice면 옵션 3~5개, 이미 profile에 값이 있는 항목은
재질문 금지)을 여기 하드 룰로 옮겨, 프롬프트 버전이 바뀔 때마다 회귀 테스트로 재사용한다.
실패율 계측의 1단계(하드 룰, 토큰 소모 없음) — "이미 있는 값을 다시 묻는가" 판정은 완전한
의미 분석이 아니라 키워드 휴리스틱이라 오탐이 있을 수 있어 SOFT로 분리한다.
"""
from __future__ import annotations

# profile 필드 → 그 필드가 채워져 있으면 재질문 문장에 등장해서는 안 되는 키워드.
# 온보딩 선택지 라벨(apps/web/app/onboarding/page.tsx)과 SYSTEM 25~27행 필드 나열에서 가져왔다.
_FIELD_KEYWORDS: dict[str, tuple[str, ...]] = {
    "industry": ("업종",),
    "region_sido": ("지역", "시/도"),
    "region_sigungu": ("지역", "시/군/구"),
    "operating_period": ("운영기간", "업력", "사업 시작"),
    "monthly_revenue_band": ("매출",),
    "employee_band": ("직원",),
    "funding_purpose": ("자금 용도", "자금용도"),
    "tax_delinquency": ("세금 체납", "체납"),
    "overdue_status": ("연체",),
    "funding_experience": ("정책자금 수혜", "수혜 이력"),
    "funding_amount_band": ("희망 금액", "희망 자금"),
}


# 필드별로 "값은 채워져 있지만 실질 정보가 거의 없는" 포괄 카테고리 값 — 이 값이면 채점상
# 미채움으로 취급해, 재질문이 그 값을 세분화하려는 것이어도 오탐(SOFT)으로 잡지 않는다.
# 실측(doc/2026-08-02/diagnosis_followup_prompt_eval*.md)에서 "기타"·"서비스업" 둘 다 모델이
# 정확히 세분화 재질문을 만들었는데도 오탐으로 잡혔던 사례라 코드로 옮겼다 — 목록은 추측이 아니라
# 실제로 관측된 값만 넣는다.
_GENERIC_CATEGORY_VALUES: dict[str, tuple[str, ...]] = {
    "industry": ("기타", "서비스업"),
}

# 질문 문장에 이 단어가 있으면 "필드값을 다시 묻는" 게 아니라 "그 범주 위에서 추이·비교·시점·정도를
# 더 캐묻는" 정밀화 질문으로 본다 — SYSTEM 프롬프트가 원래 의도한("이 값을 알았다면 진단이 더
# 정확했을 지점만 물으세요") 좋은 질문이라 SOFT에서 제외한다. 실측(v1·v2, doc/2026-08-02/
# diagnosis_followup_prompt_eval*.md)에서 확인된 오탐 전부가 이 패턴이었다 — 필드값 자체가 아니라
# 흐름·비교·시점·정도를 물었다. 추측으로 채운 목록이 아니라 실제 관측된 표현만 넣는다.
_REFINEMENT_MARKERS: tuple[str, ...] = (
    "흐름", "추이", "비교", "편차", "차이", "여력", "여유", "시점", "언제",
    "얼마나 됐", "원금", "진행 중", "조정 중", "이전보다", "작년",
)


def _is_filled(field: str, value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        stripped = value.strip()
        if stripped in ("", "잘 모름") or stripped.startswith("UNKNOWN_"):
            return False
        if stripped in _GENERIC_CATEGORY_VALUES.get(field, ()):
            return False
        return True
    if isinstance(value, (list, tuple)):
        return len(value) > 0
    return True


def check_follow_up_rules(profile: dict, result: dict) -> dict:
    """HARD(프롬프트 계약 위반, 명백한 버그) / SOFT(휴리스틱, 사람 확인 필요)로 나눠 위반 목록을 돌려준다.
    빈 dict({"hard": [], "soft": []})면 규칙 전부 통과."""
    hard: list[str] = []
    soft: list[str] = []

    questions = result.get("follow_up_questions", [])
    if not isinstance(questions, list):
        hard.append("follow_up_questions가 리스트가 아님")
        return {"hard": hard, "soft": soft}

    # 파싱 실패 폴백(빈 리스트)은 별도 계약 테스트(test_diagnosis.py)가 이미 다룬다 —
    # 여기서는 "질문이 생성된 경우" 그 내용이 규칙을 지키는지만 본다.
    if len(questions) == 0:
        return {"hard": hard, "soft": soft}

    if not (2 <= len(questions) <= 4):
        hard.append(f"재질문 개수 {len(questions)}개 — SYSTEM 규칙(2~4개) 위반")

    seen_ids = set()
    for q in questions:
        qid = q.get("id")
        if not qid:
            hard.append("질문에 id 없음")
        elif qid in seen_ids:
            hard.append(f"id 중복: {qid}")
        else:
            seen_ids.add(qid)

        if not q.get("question"):
            hard.append(f"[{qid}] question 텍스트 없음")

        qtype = q.get("type")
        if qtype not in ("choice", "text"):
            hard.append(f"[{qid}] type 값이 choice/text가 아님: {qtype!r}")
            continue

        options = q.get("options")
        if qtype == "choice":
            if not options or not (3 <= len(options) <= 5):
                hard.append(f"[{qid}] choice인데 options가 3~5개가 아님: {options!r}")
        elif qtype == "text" and options:
            hard.append(f"[{qid}] text인데 options가 있음: {options!r}")

        # SOFT — 이미 채워진 필드를 다시 묻는지 키워드로만 추정(의미 분석 아님, 오탐 가능).
        # 정밀화 신호 단어가 있으면 "다시 묻기"가 아니라 좋은 질문으로 보고 아예 스킵한다.
        question_text = str(q.get("question", ""))
        if any(marker in question_text for marker in _REFINEMENT_MARKERS):
            continue
        for field, keywords in _FIELD_KEYWORDS.items():
            if _is_filled(field, profile.get(field)) and any(kw in question_text for kw in keywords):
                soft.append(f"[{qid}] 이미 채워진 '{field}'을(를) 다시 묻는 것으로 보임: {question_text!r}")

    return {"hard": hard, "soft": soft}
