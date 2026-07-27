"use client";

// 백엔드가 evidence 문자열 "내용"을 JSON({reason, caveats})으로 담아 보낸다(이슈 #102).
// 타입은 여전히 string이며, 레거시 리포트는 평문일 수 있어 방어적으로 파싱한다.
type Parsed = { reason: string; caveats: string };

export function parseEvidence(evidence: string): Parsed | null {
  try {
    const obj = JSON.parse(evidence);
    if (obj && typeof obj === "object" && typeof obj.reason === "string") {
      return { reason: obj.reason, caveats: typeof obj.caveats === "string" ? obj.caveats : "" };
    }
  } catch {
    // 레거시 평문 — JSON 아님
  }
  return null;
}

const REASON_GROUPS = [
  { label: "사업 적합", en: "Business Match", icon: "◆", keywords: ["업종", "사업", "소상공인", "기업", "매출", "규모"] },
  { label: "지역 적합", en: "Region Match", icon: "⌖", keywords: ["지역", "소재", "서울", "경기", "광역", "시·도", "주소"] },
  { label: "자금 목적", en: "Funding Purpose", icon: "₩", keywords: ["자금", "융자", "운영", "시설", "투자", "용도"] },
  { label: "사업 단계", en: "Business Stage", icon: "↗", keywords: ["창업", "초기", "성장", "도약", "재기", "폐업", "단계"] },
  { label: "신용 조건", en: "Credit Condition", icon: "✓", keywords: ["신용", "등급", "보증", "부채", "상환"] },
] as const;

function structureReason(reason: string) {
  const sentences = reason
    .split(/(?<=[.!?。]|다\.)\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const matchedSentenceIndexes = new Set<number>();
  const groups = REASON_GROUPS.map((group) => {
    const matches = sentences.filter((sentence, index) => {
      const matched = group.keywords.some((keyword) => sentence.includes(keyword));
      if (matched) matchedSentenceIndexes.add(index);
      return matched;
    });
    return {
      label: group.label,
      en: group.en,
      icon: group.icon,
      text: matches.join(" "),
      indicator: matches.length > 0 ? "근거 확인" : "근거 없음",
    };
  });
  const unmatched = sentences.filter((_, index) => !matchedSentenceIndexes.has(index)).join(" ");
  return { groups, unmatched };
}

export default function EvidenceBlock({ evidence }: { evidence: string }) {
  const parsed = parseEvidence(evidence);

  if (!parsed) {
    return (
      <section className="biz-ai-reasoning" aria-label="AI 매칭 근거">
        <p className="biz-detail-kicker">AI 매칭 근거</p>
        <p className="biz-reason-summary">{evidence}</p>
        {REASON_GROUPS.map((group) => (
          <div className="biz-reason-row" key={group.label}>
            <span className="biz-reason-icon" aria-hidden="true">{group.icon}</span>
            <span className="biz-reason-label">{group.label}<small>{group.en}</small></span>
            <p aria-label={`${group.label} 개별 근거 없음`}>—</p>
            <span className="biz-confidence-chip biz-confidence-chip--empty">근거 없음</span>
          </div>
        ))}
      </section>
    );
  }

  const { reason, caveats } = parsed;
  const { groups, unmatched } = structureReason(reason);

  return (
    <>
      <section className="biz-ai-reasoning" aria-label="AI 매칭 근거">
        <p className="biz-detail-kicker">AI 매칭 근거</p>
        {unmatched && <p className="biz-reason-summary">{unmatched}</p>}
        {groups.map((group, index) => (
          <div className="biz-reason-row" key={`${group.label}-${index}`}>
            <span className="biz-reason-icon" aria-hidden="true">{group.icon}</span>
            <span className="biz-reason-label">{group.label}<small>{group.en}</small></span>
            <p aria-label={group.text ? undefined : `${group.label} 개별 근거 없음`}>{group.text || "—"}</p>
            <span className={`biz-confidence-chip${group.text ? "" : " biz-confidence-chip--empty"}`}>
              {group.indicator}
            </span>
          </div>
        ))}
      </section>
      {caveats && (
        <section className="biz-precautions" aria-label="유의사항">
          <p className="biz-detail-kicker">유의사항</p>
          <p>{caveats}</p>
        </section>
      )}
    </>
  );
}
