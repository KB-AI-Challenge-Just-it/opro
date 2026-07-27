/** 리포트 bodyMd의 첫 헤더 라인(예: "# 📊 소상공인 경영 알림 리포트")을
 * 화면 제목으로 재사용한다 — 홈 목록·리포트 상세가 같은 이름을 보여주도록. */
export function firstHeaderText(md: string): string | null {
  const line = md.split("\n").find((l) => l.startsWith("#"));
  return line ? line.replace(/^#+\s*/, "") : null;
}

/** 본문 카드 안에서 같은 헤더가 제목과 중복 렌더링되지 않도록 첫 헤더 라인만 제거한다. */
export function stripFirstHeader(md: string): string {
  const lines = md.split("\n");
  const idx = lines.findIndex((l) => l.startsWith("#"));
  if (idx === -1) return md;
  return [...lines.slice(0, idx), ...lines.slice(idx + 1)].join("\n");
}

/** 화면에 보여줄 리포트 제목. 정상적으로 "#" 헤더가 있으면 그걸 쓰고, 드물게 LLM이
 * 마크다운 헤더 없이 본문을 생성한 경우(리포트 포맷 붕괴)에도 "리포트 #62"처럼 의미 없는
 * ID를 보여주지 않도록 본문 첫 줄을 대신 제목으로 쓴다. */
export function reportTitle(md: string, fallback: string): string {
  const header = firstHeaderText(md);
  if (header) return header;
  const line = md.split("\n").find((l) => l.trim().length > 0);
  if (!line) return fallback;
  const trimmed = line.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}
