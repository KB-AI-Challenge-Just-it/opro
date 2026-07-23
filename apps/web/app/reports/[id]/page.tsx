"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { loadSession } from "@/lib/session";
import DraftPanel from "./DraftPanel";
import EvidenceBlock from "./EvidenceBlock";
import { C } from "@/lib/theme";
import { WarningIcon } from "@/lib/icons";
import { firstHeaderText, stripFirstHeader } from "@/lib/markdown";

// matchScore가 이 값 미만이면 저관련성으로 보고 초안 CTA를 감춘다(이슈 #98).
// null(레거시 데이터)은 판단 근거가 없으므로 게이팅하지 않는다.
const MATCH_SCORE_MIN = 50;

type Match = {
  pblancId: string;
  title: string;
  evidence: string | null;
  applyEnd: string | null;
  detailUrl: string | null;
  matchScore: number | null;
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

// 최소 마크다운 렌더러 — 헤더(#/##/###), 굵게(**), 목록(-/*), 링크([text](url))
// http/https URL만 링크로 변환한다(javascript: 등 위험 스킴은 텍스트로 남김).
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

// matches는 이미 rrf_score DESC로 정렬돼 내려온다(ReportController) — 별도 점수 계산 없이 배열 순서로 배지만 표시.
const RANK_MEDALS = ["🥇", "🥈", "🥉"];
function rankLabel(idx: number) {
  const medal = RANK_MEDALS[idx];
  return medal ? `${medal} 추천 ${idx + 1}위` : `추천 ${idx + 1}위`;
}

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

  // 링크와 굵게를 함께 처리 — 먼저 [text](url) 링크로 분할한 뒤, 링크가 아닌 조각에 bold() 적용.
  const inline = (text: string): React.ReactNode => {
    LINK_RE.lastIndex = 0;
    if (!LINK_RE.test(text)) return bold(text);
    LINK_RE.lastIndex = 0;
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let key = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(text)) !== null) {
      if (m.index > last) {
        nodes.push(<span key={`t-${key}`}>{bold(text.slice(last, m.index))}</span>);
      }
      nodes.push(
        <a
          key={`a-${key}`}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: C.goldDark, textDecoration: "underline" }}
        >
          {m[1]}
        </a>
      );
      last = LINK_RE.lastIndex;
      key++;
    }
    if (last < text.length) {
      nodes.push(<span key={`t-${key}`}>{bold(text.slice(last))}</span>);
    }
    return nodes;
  };

  lines.forEach((line, i) => {
    if (line.startsWith("### ")) {
      flushList(i);
      elements.push(<h3 key={i} style={{ color: C.brownDark }}>{inline(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      flushList(i);
      elements.push(<h2 key={i} style={{ color: C.brownDark }}>{inline(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      flushList(i);
      elements.push(<h1 key={i} style={{ color: C.brownDark, fontSize: 22 }}>{inline(line.slice(2))}</h1>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      listItems.push(<li key={i}>{inline(line.slice(2))}</li>);
    } else if (line.trim() === "") {
      flushList(i);
    } else {
      flushList(i);
      elements.push(<p key={i}>{inline(line)}</p>);
    }
  });
  flushList(lines.length);
  return elements;
}

export default function ReportPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    // 지난 질문(과거 온보딩)의 리포트를 볼 때는 URL의 profileId를 쓴다 —
    // session.profileId는 "가장 최근" 프로필이라 과거 프로필의 리포트와 다를 수 있다.
    const profileId = searchParams.get("profileId") ?? session.profileId;
    api<ReportDetail>(`/api/reports/${params.id}?profileId=${profileId}`)
      .then((r) => {
        setReport(r);
        // 진입 경로 무관하게(벨 드롭다운/프로필 링크/카카오 딥링크) 리포트를 열면
        // 해당 리포트에 연결된 서버 알림을 읽음 처리한다(이슈 #106).
        // fire-and-forget — 실패해도 리포트 열람을 막지 않는다.
        api(`/api/notifications/by-report/${params.id}/read?profileId=${profileId}`, {
          method: "PATCH",
        }).catch(() => {});
      })
      .catch(() => setNotFound(true));
  }, [params.id, router, searchParams]);

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
            {report.matches.map((m, idx) => (
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
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.white,
                    background: C.gold,
                    borderRadius: 4,
                    padding: "2px 8px",
                    marginBottom: 8,
                  }}
                >
                  {rankLabel(idx)}
                </span>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: C.brownDark }}>
                  {m.detailUrl ? (
                    <a href={m.detailUrl} target="_blank" rel="noreferrer" style={{ color: C.brownDark }}>
                      {m.title}
                    </a>
                  ) : (
                    m.title
                  )}
                </p>
                {m.matchScore != null && (
                  <div style={{ marginTop: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontSize: 12, color: C.textMuted }}>적합도</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.brownDark }}>
                        {Math.round(m.matchScore)}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: C.bgLabel,
                        border: `1px solid ${C.border}`,
                        borderRadius: 999,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, m.matchScore))}%`,
                          height: "100%",
                          background: C.gold,
                          borderRadius: 999,
                        }}
                      />
                    </div>
                  </div>
                )}
                {m.applyEnd && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: C.textMuted }}>
                    신청 마감: {m.applyEnd}
                  </p>
                )}
                {m.evidence && <EvidenceBlock evidence={m.evidence} />}
                {m.matchScore != null && m.matchScore < MATCH_SCORE_MIN ? (
                  <p
                    style={{
                      margin: "12px 0 0",
                      fontSize: 13,
                      color: C.danger,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <WarningIcon size={15} /> 관련성이 낮을 수 있어요 — 공고 원문을 먼저 확인해보세요.
                  </p>
                ) : (
                  <DraftPanel
                    reportId={report.id}
                    pblancId={m.pblancId}
                    initialSections={report.drafts.find((d) => d.pblancId === m.pblancId)?.sections ?? null}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
