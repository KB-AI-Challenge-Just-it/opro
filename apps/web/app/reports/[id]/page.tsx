"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { loadSession } from "@/lib/session";
import DraftPanel from "./DraftPanel";
import EvidenceBlock, { parseEvidence } from "./EvidenceBlock";
import { C } from "@/lib/theme";
import { WarningIcon } from "@/lib/icons";
import { reportTitle, stripFirstHeader } from "@/lib/markdown";

// matchScore가 이 값 미만이면 저관련성으로 보고 초안 CTA를 감춘다(이슈 #98).
// null(레거시 데이터)은 판단 근거가 없으므로 게이팅하지 않는다.
const MATCH_SCORE_MIN = 50;

// 문서 패널의 지면(paper) 배경 — 순백 대신 살짝 따뜻한 톤으로 페이지 배경(C.bgPage)과
// 구분되면서도 브랜드의 크림/골드 톤 안에 머무르게 한다.
const PAPER_BG = "#FCFAF6";

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
  return medal ? `${medal} ${idx + 1}위` : `${idx + 1}위`;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// 리포트 본문은 프롬프트 지시상 공고명을 그대로 옮기지 않고 자연스럽게 줄여 쓸 수 있어("서울시
// 프렙아카데미"처럼) 원문 대조가 안 맞을 때가 많다 — 대괄호 접두어와 공백을 지우고 6자 단위
// 부분 문자열로 대조해 "프렙아카데미" 같은 핵심 표현만 겹쳐도 같은 공고를 언급한 문단으로 본다.
const MENTION_WINDOW = 6;
function normalizeForMatch(s: string) {
  return s.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, "");
}
function findMentionParagraph(container: HTMLElement, title: string): HTMLElement | null {
  const needle = normalizeForMatch(title);
  if (needle.length < MENTION_WINDOW) return null;
  const candidates = Array.from(container.querySelectorAll<HTMLElement>("p, li"));
  return (
    candidates.find((el) => {
      const hay = normalizeForMatch(el.textContent ?? "");
      for (let i = 0; i + MENTION_WINDOW <= needle.length; i++) {
        if (hay.includes(needle.slice(i, i + MENTION_WINDOW))) return true;
      }
      return false;
    }) ?? null
  );
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

  // 섹션 표식("## ① 지금 상황" 등)은 본문 제목(h1)과 경쟁하지 않도록 작은 eyebrow 라벨로,
  // 나머지 본문은 여백을 넉넉히 준 문단으로 — 제목 > 섹션 라벨 > 본문의 3단 위계를 만든다.
  lines.forEach((line, i) => {
    if (line.startsWith("### ")) {
      flushList(i);
      elements.push(
        <h3 key={i} className="biz-doc-h3">
          {inline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      flushList(i);
      elements.push(
        <h2 key={i} className="biz-doc-eyebrow">
          {inline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      flushList(i);
      elements.push(
        <h1 key={i} className="biz-doc-h3">
          {inline(line.slice(2))}
        </h1>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      listItems.push(
        <li key={i} className="biz-doc-li">
          {inline(line.slice(2))}
        </li>
      );
    } else if (line.trim() === "") {
      flushList(i);
    } else {
      flushList(i);
      elements.push(
        <p key={i} className="biz-doc-p">
          {inline(line)}
        </p>
      );
    }
  });
  flushList(lines.length);
  return elements;
}

function ScoreBadge({ value }: { value: number }) {
  const pct = Math.round(value);
  return (
    <span
      style={{
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12.5,
        fontWeight: 800,
        color: C.brownDark,
        background: C.bgLabel,
        border: `1px solid ${C.border}`,
        borderRadius: 999,
        padding: "3px 10px",
      }}
    >
      적합도 {pct}%
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      style={{
        flexShrink: 0,
        color: C.textMuted,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.25s ease",
      }}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MatchCard({
  m,
  idx,
  reportId,
  draftSections,
  active,
  onSelect,
}: {
  m: Match;
  idx: number;
  reportId: number;
  draftSections: Record<string, string> | null;
  active: boolean;
  onSelect: () => void;
}) {
  const parsed = m.evidence ? parseEvidence(m.evidence) : null;
  const shortReason = parsed?.reason ? truncate(parsed.reason, 72) : null;
  const isLowRelevance = m.matchScore != null && m.matchScore < MATCH_SCORE_MIN;

  return (
    <li
      id={`biz-match-${m.pblancId}`}
      className={`biz-match-card${active ? " biz-match-card--active" : ""}`}
      style={{
        listStyle: "none",
        background: active ? C.bgLabel : C.white,
        border: `1px solid ${active ? C.gold : C.border}`,
        borderLeft: `4px solid ${active ? C.gold : "transparent"}`,
        borderRadius: 12,
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        style={{ padding: "16px 18px", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              flexShrink: 0,
              fontSize: 11.5,
              fontWeight: 800,
              color: active ? C.brownDark : C.textMuted,
              letterSpacing: 0.2,
            }}
          >
            {rankLabel(idx)}
          </span>
          <p
            style={{
              flex: 1,
              minWidth: 0,
              margin: 0,
              fontWeight: 700,
              fontSize: 14.5,
              color: active ? C.brownDark : C.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {m.title}
          </p>
          {m.matchScore != null && <ScoreBadge value={m.matchScore} />}
          <ChevronIcon open={active} />
        </div>
        {shortReason && (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13,
              lineHeight: 1.5,
              color: C.textMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: active ? "normal" : "nowrap",
            }}
          >
            {shortReason}
          </p>
        )}
      </div>

      <div className={`biz-accordion${active ? " biz-accordion--open" : ""}`}>
        <div className="biz-accordion-inner">
          <div style={{ padding: "0 18px 18px" }}>
            {m.title && m.detailUrl && (
              <a
                href={m.detailUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ display: "inline-block", marginBottom: 8, fontSize: 12.5, color: C.goldDark, fontWeight: 700 }}
              >
                공고 원문 보기 ↗
              </a>
            )}
            {m.applyEnd && (
              <p style={{ margin: "0 0 6px", fontSize: 13, color: C.textMuted }}>신청 마감: {m.applyEnd}</p>
            )}
            {m.evidence && <EvidenceBlock evidence={m.evidence} />}
            {isLowRelevance ? (
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
              <DraftPanel reportId={reportId} pblancId={m.pblancId} initialSections={draftSections} />
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function ReportPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const docBodyRef = useRef<HTMLDivElement>(null);
  const userSelectedRef = useRef(false);

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
        setSelectedId(r.matches[0]?.pblancId ?? null);
        // 진입 경로 무관하게(벨 드롭다운/프로필 링크/카카오 딥링크) 리포트를 열면
        // 해당 리포트에 연결된 서버 알림을 읽음 처리한다(이슈 #106).
        // fire-and-forget — 실패해도 리포트 열람을 막지 않는다.
        api(`/api/notifications/by-report/${params.id}/read?profileId=${profileId}`, {
          method: "PATCH",
        }).catch(() => {});
      })
      .catch(() => setNotFound(true));
  }, [params.id, router, searchParams]);

  // 오른쪽에서 공고를 고르면(사용자 클릭에 한해 — 최초 자동 선택 시엔 건너뜀) 왼쪽 문서에서
  // 그 공고명이 언급된 문단을 찾아 스크롤+하이라이트한다. 두 패널이 하나의 워크스페이스처럼
  // 연결돼 보이게 하는 최소한의 장치 — 못 찾으면 조용히 넘어간다(리포트 본문이 공고명을
  // 줄여 쓸 수 있어 항상 매치되진 않는다).
  useEffect(() => {
    if (!userSelectedRef.current || !selectedId || !report) return;
    const match = report.matches.find((m) => m.pblancId === selectedId);
    const container = docBodyRef.current;
    if (!match || !container) return;
    const target = findMentionParagraph(container, match.title);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("biz-doc-highlight");
    const timer = window.setTimeout(() => target.classList.remove("biz-doc-highlight"), 1600);
    return () => window.clearTimeout(timer);
  }, [selectedId, report]);

  if (notFound) {
    return (
      <main style={{ maxWidth: 480, margin: "100px auto", padding: 24, textAlign: "center" }}>
        <p style={{ color: C.textMuted }}>존재하지 않거나 볼 수 없는 리포트입니다.</p>
      </main>
    );
  }

  if (!report) return null;

  return (
    <main style={{ background: C.bgPage }}>
      <div
        className="biz-report-shell"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "0 32px",
          display: "flex",
          alignItems: "flex-start",
          gap: 44,
          height: "calc(100vh - 57px)",
        }}
      >
        {/* 왼쪽: AI 분석 문서 — 화면 위치 고정(sticky), 내용이 길면 패널 안에서만 스크롤. */}
        <div
          className="biz-report-left"
          style={{
            flex: "43 1 0%",
            minWidth: 320,
            position: "sticky",
            top: 57,
            alignSelf: "flex-start",
            height: "calc(100vh - 57px)",
            overflowY: "auto",
            padding: "32px 0",
          }}
        >
          <div
            style={{
              background: PAPER_BG,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: "40px 44px",
            }}
          >
            <h1
              style={{
                color: C.brownDark,
                fontSize: 27,
                fontWeight: 800,
                letterSpacing: -0.3,
                lineHeight: 1.35,
                margin: "0 0 8px",
              }}
            >
              {reportTitle(report.bodyMd, `리포트 #${report.id}`)}
            </h1>
            <p style={{ color: C.textMuted, fontSize: 13, margin: "0 0 32px" }}>
              {new Date(report.createdAt).toLocaleString("ko-KR")}
            </p>

            <div ref={docBodyRef} className="biz-doc-body" style={{ maxWidth: 640, color: C.text }}>
              {renderMd(stripFirstHeader(report.bodyMd))}
            </div>
          </div>
        </div>

        {/* 오른쪽: 추천 탐색기 — 카드를 눌러 펼치면 왼쪽 문서와 연결된 하나의 워크스페이스로 동작. */}
        <div
          className="biz-report-right"
          style={{
            flex: "57 1 0%",
            minWidth: 320,
            height: "calc(100vh - 57px)",
            overflowY: "auto",
            padding: "32px 0",
          }}
        >
          <h2
            style={{
              color: C.brownDark,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              margin: "0 0 16px",
            }}
          >
            매칭된 정책자금 {report.matches.length > 0 && `· ${report.matches.length}건`}
          </h2>
          {report.matches.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 14 }}>아직 매칭된 공고가 없어요.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {report.matches.map((m, idx) => (
                <MatchCard
                  key={m.pblancId}
                  m={m}
                  idx={idx}
                  reportId={report.id}
                  draftSections={report.drafts.find((d) => d.pblancId === m.pblancId)?.sections ?? null}
                  active={selectedId === m.pblancId}
                  onSelect={() => {
                    userSelectedRef.current = true;
                    setSelectedId((cur) => (cur === m.pblancId ? cur : m.pblancId));
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <style>{`
        .biz-doc-eyebrow {
          margin: 32px 0 12px;
          font-size: 12.5px;
          font-weight: 800;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: ${C.goldDark};
        }
        .biz-doc-body > *:first-child { margin-top: 0; }
        .biz-doc-h3 {
          margin: 24px 0 8px;
          font-size: 16px;
          font-weight: 800;
          color: ${C.brownDark};
        }
        .biz-doc-p {
          margin: 0 0 20px;
          font-size: 15.5px;
          line-height: 1.85;
          color: ${C.text};
        }
        .biz-doc-li {
          margin: 0 0 10px;
          font-size: 15.5px;
          line-height: 1.8;
          color: ${C.text};
        }
        .biz-doc-highlight {
          animation: biz-doc-flash 1.6s ease;
          border-radius: 6px;
        }
        @keyframes biz-doc-flash {
          0% { background: rgba(245,197,24,0.35); }
          100% { background: rgba(245,197,24,0); }
        }

        .biz-match-card {
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease, background-color 0.18s ease;
        }
        .biz-match-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(43,33,24,0.08);
          border-color: ${C.gold};
        }
        .biz-match-card--active {
          box-shadow: 0 12px 28px rgba(43,33,24,0.10);
        }

        .biz-accordion {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.3s ease;
        }
        .biz-accordion--open {
          grid-template-rows: 1fr;
        }
        .biz-accordion-inner {
          min-height: 0;
          overflow: hidden;
        }

        @media (max-width: 900px) {
          .biz-report-shell {
            flex-direction: column;
            height: auto !important;
          }
          .biz-report-left,
          .biz-report-right {
            position: static !important;
            height: auto !important;
            overflow-y: visible !important;
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
