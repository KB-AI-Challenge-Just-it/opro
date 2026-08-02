"""ProfileFacts.java(apps/api-core/.../profile/ProfileFacts.java)의 Python 이식.

eval_diagnosis_golden.py 전용 — 실제 서비스 경로에서는 절대 쓰지 않는다. 콜1(진단)에 넘어가는
profile_facts는 프로덕션에서 Spring(ProfileFacts.compose)이 유일하게 만들고, ai-engine은 그걸
받기만 한다(CLAUDE.md 서비스 경계 — ai-engine이 비즈니스 로직을 소유하지 않는다는 원칙). 이 파일은
그 경계를 어기는 게 아니라, DB 접근 없는 로컬 평가 스크립트가 실제 콜1과 같은 입력을 만들어보려고
Java 로직을 그대로 베낀 것뿐이다.

**동기화 위험**: 이 파일은 원본(ProfileFacts.java)이 바뀌어도 자동으로 안 바뀐다. ProfileFacts.java를
고칠 때 이 파일도 같이 고쳤는지 사람이 확인해야 한다 — 안 하면 평가 결과가 실제 프로덕션 입력과
조용히 어긋난다(자세한 리스크는 doc/2026-08-02/diagnosis_followup_prompt_eval_2026-08-02.md 참고).
"""

# ProfileFacts.java의 FUNDING_PURPOSE_LABEL과 100% 동일 — "잘모름"(공백 없음)이 키인데
# 실제 온보딩 선택지(apps/web/.../onboarding/page.tsx PURPOSE_OPTIONS)는 "잘 모르겠어요"라
# 이 매핑은 그 값에 대해서는 이미 프로덕션에서도 안 맞는다. 원본과 동일하게 그대로 옮긴다 —
# "고쳐서" 이식하면 프로덕션 동작과 달라져 평가가 무의미해진다.
_FUNDING_PURPOSE_LABEL = {
    "운영": "운영자금", "시설": "시설자금", "창업": "창업자금",
    "대환": "대환자금", "잘모름": "자금",
}


def _str(v) -> str:
    if v is None:
        return ""
    if isinstance(v, (list, tuple)):
        return ""  # ProfileFacts.java의 str()는 스칼라 전용 — 리스트는 toList() 경로로 별도 처리
    return str(v)


def compose(profile: dict) -> str:
    """ProfileFacts.compose(Map<String,Object>)와 동일한 순서·라벨로 문자열을 조립한다."""
    lines: list[str] = []

    def add_line(label: str, value: str) -> None:
        if value and value.strip():
            lines.append(f"{label}: {value.strip()}")

    add_line("업종", _str(profile.get("industry")))

    region = f"{_str(profile.get('region_sido'))} {_str(profile.get('region_sigungu'))}".strip()
    add_line("지역", region)

    add_line("업력", _str(profile.get("operating_period")))
    add_line("직원 수", _str(profile.get("employee_band")))

    band = _str(profile.get("monthly_revenue_band"))
    if band.strip():
        basis = profile.get("revenue_basis")
        label = {"ANNUAL": "연매출", "MONTHLY": "월평균 매출"}.get(basis, "매출")
        lines.append(f"{label}: {band.strip()}")

    purposes = profile.get("funding_purpose") or []
    if purposes:
        joined_list = []
        for p in purposes:
            mapped = _FUNDING_PURPOSE_LABEL.get(p, p)
            if mapped not in joined_list:
                joined_list.append(mapped)
        add_line("자금 용도", ", ".join(joined_list))

    add_line("희망 자금", _str(profile.get("funding_amount_band")))
    add_line("세금 체납", _str(profile.get("tax_delinquency")))
    add_line("연체 상태", _str(profile.get("overdue_status")))
    add_line("정책자금 수혜 이력", _str(profile.get("funding_experience")))

    return "\n".join(lines)
