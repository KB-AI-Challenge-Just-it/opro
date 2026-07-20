import { api } from "@/lib/api";
import DraftPanel from "./DraftPanel";

type Match = {
  pblancId: string;
  title: string;
  evidence: string | null;
  applyEnd: string | null;
  detailUrl: string | null;
};

type Draft = {
  pblancId: string;
  sections: Record<string, string> | null;
};

type ReportDetail = {
  id: number;
  bodyMd: string;
  createdAt: string;
  matches: Match[];
  drafts: Draft[];
};

// 최소 마크다운 렌더러 — 헤더(#/##/###), 굵게(**), 목록(-/*)
function renderMd(md: string) {
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];

  const flushList = (key: number) => {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${key}`}>{listItems}</ul>);
      listItems = [];
    }
  };

  const bold = (text: string): React.ReactNode => {
    const parts = text.split(/\*\*(.*?)\*\*/);
    if (parts.length === 1) return text;
    return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : p));
  };

  lines.forEach((line, i) => {
    if (line.startsWith("### ")) {
      flushList(i);
      elements.push(<h3 key={i}>{bold(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      flushList(i);
      elements.push(<h2 key={i}>{bold(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      flushList(i);
      elements.push(<h1 key={i}>{bold(line.slice(2))}</h1>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      listItems.push(<li key={i}>{bold(line.slice(2))}</li>);
    } else if (line.trim() === "") {
      flushList(i);
    } else {
      flushList(i);
      elements.push(<p key={i}>{bold(line)}</p>);
    }
  });
  flushList(lines.length);
  return elements;
}

export default async function ReportPage({ params }: { params: { id: string } }) {
  const report = await api<ReportDetail>(`/api/reports/${params.id}`);

  return (
    <main>
      <h1>리포트 #{report.id}</h1>
      <p style={{ color: "#718096", fontSize: 13 }}>
        {new Date(report.createdAt).toLocaleString("ko-KR")}
      </p>

      <article style={{ lineHeight: 1.7 }}>{renderMd(report.bodyMd)}</article>

      {report.matches.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2>매칭된 정책자금</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {report.matches.map((m) => (
              <li key={m.pblancId} style={{
                border: "1px solid #e2e8f0", borderRadius: 8,
                padding: "16px 20px", marginBottom: 12,
              }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
                  {m.detailUrl ? (
                    <a href={m.detailUrl} target="_blank" rel="noreferrer">{m.title}</a>
                  ) : m.title}
                </p>
                {m.applyEnd && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#718096" }}>
                    신청 마감: {m.applyEnd}
                  </p>
                )}
                {m.evidence && (
                  <p style={{ margin: "8px 0 0", fontSize: 13, background: "#f7fafc", padding: "8px 12px", borderRadius: 6 }}>
                    근거: {m.evidence}
                  </p>
                )}
                <DraftPanel
                  reportId={report.id}
                  pblancId={m.pblancId}
                  initialSections={report.drafts.find((d) => d.pblancId === m.pblancId)?.sections ?? null}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
