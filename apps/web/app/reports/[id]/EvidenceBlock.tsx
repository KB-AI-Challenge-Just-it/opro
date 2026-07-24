"use client";

import { useState } from "react";
import { C } from "@/lib/theme";

// 백엔드가 evidence 문자열 "내용"을 JSON({reason, caveats})으로 담아 보낸다(이슈 #102).
// 타입은 여전히 string이며, 레거시 리포트는 평문일 수 있어 방어적으로 파싱한다.
type Parsed = { reason: string; caveats: string };

function parseEvidence(evidence: string): Parsed | null {
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

const PREVIEW_MAX = 55;

// 기존 근거 박스 스타일(배경·패딩·radius)을 재사용한다.
const boxStyle = {
  margin: "8px 0 0",
  fontSize: 13,
  background: C.bgLabel,
  color: C.brown,
  padding: "8px 12px",
  borderRadius: 6,
} as const;

export default function EvidenceBlock({ evidence }: { evidence: string }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseEvidence(evidence);

  // 레거시 모드 — 기존과 완전히 동일하게 한 줄 표시.
  if (!parsed) {
    return <p style={boxStyle}>근거: {evidence}</p>;
  }

  const { reason, caveats } = parsed;
  const needsTruncate = reason.length > PREVIEW_MAX;
  const preview = needsTruncate ? `${reason.slice(0, PREVIEW_MAX)}…` : reason;

  const toggleStyle = {
    marginLeft: 6,
    padding: 0,
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    color: C.brownDark,
    whiteSpace: "nowrap" as const,
  };

  const labelStyle = {
    fontWeight: 700,
    color: C.brownDark,
  } as const;

  if (!expanded) {
    return (
      <p style={boxStyle}>
        근거: {preview}
        <button onClick={() => setExpanded(true)} style={toggleStyle}>
          자세히보기 ▸
        </button>
      </p>
    );
  }

  return (
    <div style={boxStyle}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => setExpanded(false)} style={{ ...toggleStyle, marginLeft: 0 }}>
          접기 ▴
        </button>
      </div>
      <div style={{ marginBottom: caveats ? 8 : 0 }}>
        <div style={labelStyle}>[추천이유]</div>
        <div style={{ whiteSpace: "pre-wrap" }}>{reason}</div>
      </div>
      {caveats && (
        <div>
          <div style={labelStyle}>[유의사항]</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{caveats}</div>
        </div>
      )}
    </div>
  );
}
