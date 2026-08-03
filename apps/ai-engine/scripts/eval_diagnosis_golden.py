"""2단계 — 골든 프로필 8종에 실제 Opus(model_diagnosis)를 호출해 재질문 실패율 베이스라인을 잰다.
토큰을 실제로 쓴다 — 프롬프트(diagnosis.SYSTEM) 버전을 바꿀 때마다 이 스크립트를 다시 돌려
하드/소프트 위반 개수 변화로 비교한다. 원본 응답은 output/에 저장해 같은 버전을 두 번 호출하지 않게 한다.

실행: apps/ai-engine에서 `python scripts/eval_diagnosis_golden.py`
      (ANTHROPIC_API_KEY가 환경변수로 있어야 함 — 리포지토리 루트 .env를 source 해서 실행)
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import diagnosis
from app.services.diagnosis_rules import check_follow_up_rules
from app.services.golden_profiles import GOLDEN_PROFILES
from app.config import settings
from profile_facts_port import compose as compose_profile_facts

# 진단 프롬프트가 econ_context를 자금 조달 환경 관점으로 참고할 수 있게 최소 예시값을 준다.
# 실제 서비스는 Spring이 econ_indicator 테이블 최신값을 넘긴다(ConsultationService.fetchEconContext) —
# 여기서는 그 자리에 대표값 하나만 고정해, 이 값 자체의 변화가 결과에 섞이지 않게 한다.
SAMPLE_ECON_CONTEXT = {"기준금리": 3.5, "BSI": 78}

OUTPUT_DIR = Path(__file__).resolve().parent / "output"


def main() -> None:
    if not settings.anthropic_api_key:
        print("ANTHROPIC_API_KEY가 비어 있습니다 — 저장소 루트 .env를 source 해서 실행하세요.")
        sys.exit(1)

    OUTPUT_DIR.mkdir(exist_ok=True)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = OUTPUT_DIR / run_id
    run_dir.mkdir()

    summary = []
    print(f"model_diagnosis={settings.model_diagnosis}  프로필 {len(GOLDEN_PROFILES)}건  run_id={run_id}\n")

    for name, profile in GOLDEN_PROFILES.items():
        t0 = time.time()
        profile_facts = compose_profile_facts(profile)
        result = diagnosis.diagnose(profile, econ_context=SAMPLE_ECON_CONTEXT, profile_facts=profile_facts)
        elapsed = time.time() - t0
        violations = check_follow_up_rules(profile, result)

        (run_dir / f"{name}.json").write_text(
            json.dumps({"profile": profile, "profile_facts": profile_facts, "result": result,
                        "violations": violations, "elapsed_sec": round(elapsed, 2)},
                       ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        n_q = len(result.get("follow_up_questions", []))
        status = "PARSE_FAIL(0문항)" if n_q == 0 else (
            "HARD 위반" if violations["hard"] else ("SOFT 위반" if violations["soft"] else "PASS"))
        print(f"[{name:28s}] {status:16s} 재질문 {n_q}개  {elapsed:5.1f}s")
        for v in violations["hard"]:
            print(f"    HARD: {v}")
        for v in violations["soft"]:
            print(f"    SOFT: {v}")

        summary.append({
            "profile": name, "n_questions": n_q,
            "hard_violations": len(violations["hard"]), "soft_violations": len(violations["soft"]),
            "parse_fail": n_q == 0,
        })

    (run_dir / "_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    n = len(summary)
    parse_fail = sum(1 for s in summary if s["parse_fail"])
    hard_fail = sum(1 for s in summary if s["hard_violations"] > 0)
    soft_flag = sum(1 for s in summary if s["soft_violations"] > 0)
    print(f"\n=== 베이스라인 요약 (run_id={run_id}) ===")
    print(f"파싱 실패(재질문 0개): {parse_fail}/{n}")
    print(f"HARD 위반 프로필 수:   {hard_fail}/{n}")
    print(f"SOFT 플래그 프로필 수: {soft_flag}/{n}")
    print(f"원본 저장 위치: {run_dir}")


if __name__ == "__main__":
    main()
