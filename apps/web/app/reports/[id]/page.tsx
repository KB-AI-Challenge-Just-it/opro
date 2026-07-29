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
const PAPER_BG = "#FAFAF8";

type Match = {
  pblancId: string;
  title: string;
  evidence: string | null;
  applyEnd: string | null;
  detailUrl: string | null;
  matchScore: number | null;
  isNew: boolean;
};

type Draft = {
  pblancId: string;
  sections: Record<string, string> | null;
};

type ReportDetail = {
  id: number;
  profileId: number;
  analysisId: number | null;
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
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const degrees = pct * 3.6;
  const ringColor = pct >= 90 ? C.goldDark : pct >= 70 ? C.gold : pct >= 50 ? "#E58A2B" : "#A9A39A";
  return (
    <span
      className="biz-score"
      aria-label={`적합도 ${pct}퍼센트`}
      style={{
        "--score": `${degrees}deg`,
        "--ring-color": ringColor,
        flexShrink: 0,
        display: "inline-grid",
        placeItems: "center",
        width: 56,
        height: 56,
        position: "relative",
        borderRadius: "50%",
      } as React.CSSProperties}
    >
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 44,
          height: 44,
          background: C.white,
          borderRadius: "50%",
          fontSize: 11,
          lineHeight: 1,
          fontWeight: 850,
          color: C.brownDark,
        }}
      >
        {pct}
        <span
          style={{
            position: "absolute",
            top: 36,
            fontSize: 8,
            fontWeight: 700,
            color: C.textMuted,
          }}
        >
          적합도
        </span>
      </span>
    </span>
  );
}

function DeadlineChip({ date }: { date: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 12,
        fontWeight: 700,
        color: C.brown,
        background: "rgba(255,255,255,.7)",
        border: `1px solid ${C.border}`,
        borderRadius: 999,
        padding: "5px 9px",
      }}
    >
      마감 {date}
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
  const reasonSummary = parsed?.reason ?? null;
  const isLowRelevance = m.matchScore != null && m.matchScore < MATCH_SCORE_MIN;

  return (
    <li
      id={`biz-match-${m.pblancId}`}
      className={`biz-match-card${active ? " biz-match-card--active" : ""}`}
      style={{
        listStyle: "none",
        background: active ? "#FFF9EB" : C.white,
        border: `1px solid ${active ? C.gold : C.border}`,
        borderLeft: `4px solid ${active ? C.gold : "transparent"}`,
        borderRadius: 14,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        aria-expanded={active}
        aria-controls={`biz-match-panel-${m.pblancId}`}
        onClick={onSelect}
        className="biz-match-trigger"
        style={{ padding: "14px 16px", cursor: "pointer" }}
      >
        <div className="biz-match-heading">
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="biz-rank">{rankLabel(idx)}</span>
            {m.isNew && (
              <span
                title="이번에 새로 찾은 매칭이에요"
                style={{
                  display: "inline-block",
                  marginLeft: 6,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: C.gold,
                  color: C.brownDark,
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: 0.3,
                  verticalAlign: "middle",
                }}
              >
                NEW
              </span>
            )}
            <p className="biz-match-title">{m.title}</p>
          </div>
          {m.matchScore != null && <ScoreBadge value={m.matchScore} />}
          <ChevronIcon open={active} />
        </div>
        {reasonSummary && (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13,
              lineHeight: 1.5,
              color: C.textMuted,
              whiteSpace: "normal",
              overflowWrap: "anywhere",
            }}
          >
            {reasonSummary}
          </p>
        )}
      </button>

      <div
        id={`biz-match-panel-${m.pblancId}`}
        className={`biz-accordion${active ? " biz-accordion--open" : ""}`}
        aria-hidden={!active}
        inert={!active ? true : undefined}
      >
        <div className="biz-accordion-inner">
          <div className="biz-match-details">
            {m.applyEnd && <DeadlineChip date={m.applyEnd} />}
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
            {m.title && m.detailUrl && (
              <a
                className="biz-source-link"
                href={m.detailUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                공고 원문 확인 <span aria-hidden="true">↗</span>
              </a>
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
  const [profileId, setProfileId] = useState<string | null>(null);
  const [readyReportId, setReadyReportId] = useState<number | null>(null);
  const [reportProcessing, setReportProcessing] = useState(false);
  const [reportActionLoading, setReportActionLoading] = useState(false);
  const docBodyRef = useRef<HTMLDivElement>(null);
  const userSelectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // App Router가 같은 동적 페이지 인스턴스를 재사용할 수 있으므로 report id가 바뀌면
    // 이전 프로필의 준비된 reportId·처리 상태가 새 화면에 새지 않게 즉시 초기화한다.
    setReadyReportId(null);
    setReportProcessing(false);
    setReportActionLoading(false);
    setReport(null);
    setSelectedId(null);
    setNotFound(false);
    const session = loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    // 지난 질문(과거 온보딩)의 리포트를 볼 때는 URL의 profileId를 쓴다 —
    // session.profileId는 "가장 최근" 프로필이라 과거 프로필의 리포트와 다를 수 있다.
    const pid = searchParams.get("profileId") ?? session.profileId;
    setProfileId(String(pid));
    api<ReportDetail>(`/api/reports/${params.id}?profileId=${pid}`)
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        setSelectedId(r.matches[0]?.pblancId ?? null);
        // 진입 경로 무관하게(벨 드롭다운/프로필 링크/카카오 딥링크) 리포트를 열면
        // 해당 리포트에 연결된 서버 알림을 읽음 처리한다(이슈 #106).
        // fire-and-forget — 실패해도 리포트 열람을 막지 않는다.
        api(`/api/notifications/by-report/${params.id}/read?profileId=${pid}`, {
          method: "PATCH",
        }).catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, router, searchParams]);

  // 등록 완료 웰컴 리포트(analysisId 없음)로 돌아왔을 때, 이미 생성된 실제 리포트가 있으면
  // 바로 연결하고 아직 파이프라인이 도는 중이면 완료될 때까지 상태를 갱신한다.
  useEffect(() => {
    if (!report || report.analysisId !== null) return;
    let cancelled = false;
    let timer: number | undefined;

    const refresh = async () => {
      try {
        const reports = await api<{ id: number; analysisId: number | null }[]>(
          `/api/reports?profileId=${report.profileId}`
        );
        if (cancelled) return;
        const ready = reports.find((item) => item.analysisId !== null);
        if (ready) {
          setReadyReportId(ready.id);
          setReportProcessing(false);
          return;
        }

        const status = await api<{ stage: string; reportId?: number }>(
          `/api/onboarding/${report.profileId}/match-status`
        );
        if (cancelled) return;
        if (status.stage === "DONE" && status.reportId) {
          setReadyReportId(status.reportId);
          setReportProcessing(false);
          return;
        }
        if (["ANALYZING", "GENERATING"].includes(status.stage)) {
          setReportProcessing(true);
          timer = window.setTimeout(refresh, 1800);
          return;
        }
        setReportProcessing(false);
      } catch {
        if (!cancelled) setReportProcessing(false);
      }
    };

    refresh();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [report]);

  const openOrCreateReport = async () => {
    if (!report || report.analysisId !== null || reportActionLoading || reportProcessing) return;
    setReportActionLoading(true);
    try {
      const reports = await api<{ id: number; analysisId: number | null }[]>(
        `/api/reports?profileId=${report.profileId}`
      );
      const ready = reports.find((item) => item.analysisId !== null);
      if (ready) {
        router.push(`/reports/${ready.id}?profileId=${report.profileId}`);
        return;
      }
      router.push(`/consult/loading-diagnosis?profileId=${report.profileId}`);
    } catch {
      // 목록 확인이 일시 실패해도 저장된 profileId 기반 상담 재시작 경로는 사용할 수 있다.
      router.push(`/consult/loading-diagnosis?profileId=${report.profileId}`);
    }
  };

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
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
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
            padding: "28px 0 40px",
          }}
        >
          <div
            style={{
              background: PAPER_BG,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: "58px 60px 64px",
              boxShadow: "0 18px 48px rgba(43,33,24,0.07)",
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
            <span className="biz-ai-badge">AI Generated Report</span>
            <p style={{ color: C.textMuted, fontSize: 13, margin: "0 0 32px" }}>
              {new Date(report.createdAt).toLocaleString("ko-KR")}
            </p>

            <div ref={docBodyRef} className="biz-doc-body" style={{ maxWidth: 620, color: C.text }}>
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
            report.analysisId === null ? (
              <section
                aria-labelledby="welcome-report-action-title"
                style={{
                  padding: 24,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  background: C.white,
                  boxShadow: "0 8px 24px rgba(43,33,24,0.05)",
                }}
              >
                <p
                  id="welcome-report-action-title"
                  style={{ margin: "0 0 8px", color: C.brownDark, fontSize: 17, fontWeight: 800 }}
                >
                  저장된 답변으로 맞춤 보고서를 확인하세요
                </p>
                <p style={{ margin: "0 0 20px", color: C.textMuted, fontSize: 14, lineHeight: 1.65 }}>
                  다시 질문을 처음부터 입력하지 않아도 이 프로필을 기반으로 분석을 이어갈 수 있어요.
                </p>
                <button
                  type="button"
                  className="biz-primary-cta"
                  disabled={reportProcessing || reportActionLoading}
                  aria-busy={reportProcessing || reportActionLoading}
                  onClick={() => {
                    if (readyReportId) {
                      router.push(`/reports/${readyReportId}?profileId=${report.profileId}`);
                    } else {
                      openOrCreateReport();
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "13px 18px",
                    border: 0,
                    borderRadius: 9,
                    background: reportProcessing || reportActionLoading ? C.border : C.gold,
                    color: C.brownDark,
                    cursor: reportProcessing || reportActionLoading ? "wait" : "pointer",
                    fontSize: 14,
                    fontWeight: 800,
                  }}
                >
                  {reportProcessing
                    ? "보고서 만드는 중..."
                    : reportActionLoading
                      ? "확인 중..."
                      : readyReportId
                        ? "보고서 보기"
                        : "저장된 답변으로 보고서 만들기"}
                </button>
              </section>
            ) : (
              <p style={{ color: C.textMuted, fontSize: 14 }}>아직 매칭된 공고가 없어요.</p>
            )
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
          margin: 38px 0 14px;
          font-size: 12.5px;
          font-weight: 800;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: ${C.goldDark};
        }
        .biz-ai-badge {
          display: inline-flex;
          align-items: center;
          min-height: 24px;
          margin: 2px 0 12px;
          padding: 0 9px;
          border: 1px solid rgba(201,154,30,.35);
          border-radius: 999px;
          background: rgba(245,197,24,.09);
          color: ${C.brown};
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: .55px;
          text-transform: uppercase;
        }
        .biz-doc-body > *:first-child { margin-top: 0; }
        .biz-doc-h3 {
          margin: 28px 0 10px;
          font-size: 17px;
          font-weight: 800;
          color: ${C.brownDark};
        }
        .biz-doc-p {
          margin: 0 0 22px;
          font-size: 15.5px;
          line-height: 1.92;
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
          animation: biz-card-in .28s ease both;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease, background-color 0.18s ease;
        }
        @keyframes biz-card-in {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .biz-match-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 22px rgba(43,33,24,0.08);
          border-color: ${C.gold};
        }
        .biz-match-card--active {
          box-shadow: 0 12px 28px rgba(43,33,24,0.10);
        }
        .biz-match-trigger {
          appearance: none;
          display: block;
          width: 100%;
          border: 0;
          color: inherit;
          background: transparent;
          text-align: left;
          font: inherit;
          transition: background-color .18s ease;
        }
        .biz-match-trigger:hover { background: rgba(245,197,24,.055); }
        .biz-match-trigger:focus-visible,
        .biz-source-link:focus-visible {
          outline: 3px solid rgba(201,154,30,.35);
          outline-offset: -3px;
        }
        .biz-match-heading { display: flex; align-items: center; gap: 12px; }
        .biz-rank {
          display: block;
          margin-bottom: 4px;
          color: ${C.textMuted};
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: .2px;
        }
        .biz-match-title {
          margin: 0;
          color: ${C.text};
          font-size: 14.5px;
          font-weight: 750;
          line-height: 1.4;
        }
        .biz-match-card--active .biz-rank,
        .biz-match-card--active .biz-match-title { color: ${C.brownDark}; }
        @property --ring-progress {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }
        .biz-score {
          --ring-progress: 0deg;
          background: conic-gradient(var(--ring-color) var(--ring-progress), ${C.border} var(--ring-progress));
          animation: biz-ring-fill .7s cubic-bezier(.2,.75,.25,1) forwards;
          transition: transform .2s ease, filter .2s ease;
        }
        @keyframes biz-ring-fill { to { --ring-progress: var(--score); } }
        .biz-match-card:hover .biz-score { transform: scale(1.04); filter: saturate(1.08); }
        .biz-match-details { padding: 2px 16px 18px; }
        .biz-detail-kicker {
          margin: 0 0 10px;
          color: ${C.goldDark};
          font-size: 11px;
          font-weight: 850;
          letter-spacing: .65px;
          text-transform: uppercase;
        }
        .biz-ai-reasoning {
          margin-top: 14px;
          padding: 14px;
          border: 1px solid ${C.border};
          border-radius: 10px;
          background: rgba(255,255,255,.68);
        }
        .biz-reason-row {
          display: grid;
          grid-template-columns: 22px 104px minmax(0, 1fr) auto;
          align-items: start;
          gap: 8px;
          padding: 8px 0;
          border-top: 1px solid rgba(229,223,211,.75);
        }
        .biz-reason-row:first-of-type { border-top: 0; padding-top: 0; }
        .biz-reason-row:last-child { padding-bottom: 0; }
        .biz-reason-icon {
          display: grid;
          place-items: center;
          width: 20px;
          height: 20px;
          border-radius: 6px;
          background: rgba(245,197,24,.14);
          color: ${C.goldDark};
          font-size: 11px;
          font-weight: 900;
        }
        .biz-reason-label { color: ${C.brown}; font-size: 12px; font-weight: 800; }
        .biz-reason-label small {
          display: block;
          margin-top: 1px;
          color: ${C.textMuted};
          font-size: 9px;
          font-weight: 650;
        }
        .biz-confidence-chip {
          align-self: start;
          padding: 3px 6px;
          border: 1px solid ${C.border};
          border-radius: 999px;
          background: ${C.bgLabel};
          color: ${C.textMuted};
          font-size: 9.5px;
          font-weight: 750;
          white-space: nowrap;
        }
        .biz-confidence-chip--empty {
          border-color: transparent;
          background: transparent;
          color: ${C.textMuted};
          font-weight: 650;
        }
        .biz-reason-summary {
          margin: 0 0 8px;
          color: ${C.text};
          font-size: 13px;
          line-height: 1.65;
        }
        .biz-reason-row p,
        .biz-precautions > p:last-child {
          margin: 0;
          color: ${C.text};
          font-size: 13px;
          line-height: 1.65;
          white-space: pre-wrap;
        }
        .biz-precautions {
          margin-top: 10px;
          padding: 12px 14px;
          border-left: 3px solid ${C.goldDark};
          background: rgba(255,255,255,.52);
        }
        .biz-source-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-top: 14px;
          padding: 5px 1px;
          border: 0;
          border-radius: 2px;
          color: ${C.brownDark};
          background: transparent;
          font-size: 12.5px;
          font-weight: 750;
          text-decoration: none;
          transition: transform .18s ease, border-color .18s ease, background-color .18s ease;
        }
        .biz-source-link:hover {
          transform: translateX(2px);
          color: ${C.goldDark};
        }
        .biz-primary-cta {
          box-shadow: 0 5px 14px rgba(201,154,30,.2);
          transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
        }
        .biz-primary-cta:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(201,154,30,.28);
          filter: saturate(1.06);
        }
        .biz-primary-cta:focus-visible,
        .biz-draft-toggle:focus-visible {
          outline: 3px solid rgba(201,154,30,.35);
          outline-offset: 2px;
        }
        .biz-draft-content {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows .24s ease;
        }
        .biz-draft-content--open { grid-template-rows: 1fr; }
        .biz-draft-content-inner { min-height: 0; overflow: hidden; }

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
        @media (prefers-reduced-motion: reduce) {
          .biz-match-card,
          .biz-match-trigger,
          .biz-score,
          .biz-source-link,
          .biz-primary-cta,
          .biz-draft-content,
          .biz-accordion,
          svg { transition: none !important; }
          .biz-doc-highlight { animation: none; }
          .biz-match-card,
          .biz-score { animation: none; }
          .biz-score { --ring-progress: var(--score); }
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
          .biz-report-left { padding-bottom: 0 !important; }
          .biz-report-left > div { padding: 36px 28px 42px !important; }
        }
        @media (max-width: 560px) {
          .biz-report-shell { padding: 0 16px !important; gap: 20px !important; }
          .biz-report-left > div { padding: 30px 22px 36px !important; }
          .biz-reason-row { grid-template-columns: 22px 1fr auto; gap: 6px; }
          .biz-reason-row p { grid-column: 2 / -1; }
        }
      `}</style>
    </main>
  );
}
