"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { loadSession } from "@/lib/session";
import DraftPanel from "./DraftPanel";
import { C } from "@/lib/theme";
import { firstHeaderText, stripFirstHeader } from "@/lib/markdown";

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
      elements.push(<h3 key={i} style={{ color: C.brownDark }}>{bold(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      flushList(i);
      elements.push(<h2 key={i} style={{ color: C.brownDark }}>{bold(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      flushList(i);
      elements.push(<h1 key={i} style={{ color: C.brownDark, fontSize: 22 }}>{bold(line.slice(2))}</h1>);
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

export default function ReportPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    api<ReportDetail>(`/api/reports/${params.id}?profileId=${session.profileId}`)
      .then(setReport)
      .catch(() => setNotFound(true));
  }, [params.id, router]);

  if (notFound) {
    return (
      <main style={{ maxWidth: 480, margin: "100px auto", padding: 24, textAlign: "center" }}>
        <p style={{ color: C.textMuted }}>존재하지 않거나 볼 수 없는 리포트입니다.</p>
      </main>
    );
  }

  if (!report) return null;

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 24, background: C.bgPage }}>
      <h1 style={{ color: C.brownDark, fontSize: 24, marginBottom: 4 }}>
        {firstHeaderText(report.bodyMd) ?? `리포트 #${report.id}`}
      </h1>
      <p style={{ color: C.textMuted, fontSize: 13, marginTop: 0, marginBottom: 24 }}>
        {new Date(report.createdAt).toLocaleString("ko-KR")}
      </p>

      <article
        style={{
          lineHeight: 1.7,
          color: C.text,
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "24px 28px",
        }}
      >
        {renderMd(stripFirstHeader(report.bodyMd))}
      </article>

      {report.matches.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ color: C.brownDark, fontSize: 18 }}>매칭된 정책자금</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {report.matches.map((m) => (
              <li
                key={m.pblancId}
                style={{
                  background: C.white,
                  border: `1px solid ${C.border}`,
                  borderLeft: `4px solid ${C.gold}`,
                  borderRadius: 8,
                  padding: "16px 20px",
                  marginBottom: 12,
                }}
              >
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: C.brownDark }}>
                  {m.detailUrl ? (
                    <a href={m.detailUrl} target="_blank" rel="noreferrer" style={{ color: C.brownDark }}>
                      {m.title}
                    </a>
                  ) : (
                    m.title
                  )}
                </p>
                {m.applyEnd && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: C.textMuted }}>
                    신청 마감: {m.applyEnd}
                  </p>
                )}
                {m.evidence && (
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: 13,
                      background: C.bgLabel,
                      color: C.brown,
                      padding: "8px 12px",
                      borderRadius: 6,
                    }}
                  >
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
