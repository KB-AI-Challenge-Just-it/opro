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
