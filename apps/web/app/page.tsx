"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { loadSession, saveSession, type Session } from "@/lib/session";
import { C } from "@/lib/theme";
import { ChatIcon, ListIcon, FormIcon, MatchIcon, ReportIcon, ArrowIcon, BellIcon } from "@/lib/icons";
import { reportTitle } from "@/lib/markdown";

// 카카오 OAuth 콜백(KakaoOAuthController.callback)은 항상 이 페이지로 302한다.
// /reports/[id]가 팝업 창으로 이 플로우를 띄운 경우에만 window.opener가 있다 — 그때는
// 부모 창에 결과를 postMessage로 알리고 팝업 스스로 닫는다. 일반 방문(opener 없음)이면
// 아무것도 하지 않고 평소 홈 화면이 그려진다.
// useSearchParams()는 "/"가 static export 대상이라 Suspense 경계 안에서만 쓸 수 있어 별도 컴포넌트로 분리.
function KakaoOAuthPopupCloser() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const kakao = searchParams.get("kakao");
    if (!kakao || !window.opener) return;
    window.opener.postMessage({ type: "kakao-oauth-result", status: kakao }, window.location.origin);
    window.close();
  }, [searchParams]);

  return null;
}

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    setSession(loadSession());
  }, []);

  // 세션 확인 전에는 아무것도 그리지 않는다 — 로그인 여부에 따라 랜딩/대시보드가
  // 완전히 다른 레이아웃이라 확인 전 렌더를 보여주면 전환 시 화면이 튄다.
  if (session === undefined) return null;

  const kakaoPopupCloser = (
    <Suspense fallback={null}>
      <KakaoOAuthPopupCloser />
    </Suspense>
  );

  if (!session) {
    return (
      <>
        {kakaoPopupCloser}
        <LandingPage onLogin={setSession} />
      </>
    );
  }

  return (
    <>
      {kakaoPopupCloser}
      <Dashboard session={session} />
    </>
  );
}

function LandingPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const focusLogin = () => {
    document.getElementById("biz-login-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => document.getElementById("biz-login-username")?.focus(), 420);
  };

  return (
    <main style={{ background: C.bgPage }}>
      <section style={{ padding: "40px 24px 0" }}>
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            display: "flex",
            alignItems: "stretch",
            gap: 48,
            flexWrap: "wrap",
          }}
        >
          <div
            className="biz-hero-left"
            style={{ flex: "1 1 380px", minWidth: 300, display: "flex", flexDirection: "column", justifyContent: "center" }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "6px 14px",
                borderRadius: 999,
                background: C.bgLabel,
                color: C.goldDark,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.3,
                marginBottom: 16,
                alignSelf: "flex-start",
              }}
            >
              AI 정책자금 매칭 서비스
            </span>
            <h1
              style={{
                color: C.brownDark,
                fontSize: "clamp(30px, 4.2vw, 42px)",
                fontWeight: 800,
                lineHeight: 1.3,
                letterSpacing: -0.5,
                margin: "0 0 16px",
              }}
            >
              수백 개나 되는 정책자금,
              <br />
              하나하나 찾아볼 필요 없어요.
            </h1>
            <p style={{ color: C.textMuted, fontSize: 16, lineHeight: 1.65, margin: "0 0 24px", maxWidth: 380 }}>
              업종·지역·자금 목적 몇 가지만 알려주시면 AI가 딱 맞는 정책자금을
              찾아드리고, 신청 준비까지 이어지는 리포트를 만들어드려요.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              <button type="button" onClick={focusLogin} className="biz-cta-primary">
                AI 정책자금 찾기
                <ArrowIcon />
              </button>
              <Link href="/signup" className="biz-cta-secondary">
                회원가입
              </Link>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex" }}>
                {[C.gold, C.goldDark, C.brown].map((c, i) => (
                  <span
                    key={c}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: c,
                      border: `2px solid ${C.bgPage}`,
                      marginLeft: i === 0 ? 0 : -6,
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 13, color: C.textMuted }}>
                전국 소상공인 사장님들이 소담이와 상담하고 있어요.
              </span>
            </div>
          </div>

          <div
            className="biz-hero-right"
            style={{ flex: "1 1 380px", minWidth: 300, maxWidth: 460, width: "100%", position: "relative" }}
          >
            <div style={{ position: "relative" }}>
              <img
                src="/images/hero-illustration.png"
                alt="정책자금을 찾아드리는 탐정 캐릭터 소담이"
                style={{ width: "100%", display: "block", borderRadius: 20 }}
              />
              <div className="biz-float-chip" style={{ position: "absolute", top: -14, right: 24 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: C.gold,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.brownDark,
                    flexShrink: 0,
                  }}
                >
                  <TrendIcon />
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.brownDark }}>AI 정책자금 분석 중</span>
              </div>
            </div>
            <LoginCard onLogin={onLogin} />
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 24px 80px" }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <FeatureCard
            icon={<FormIcon />}
            title="사업 정보 온보딩"
            description="업종·지역·운영 현황 등 몇 가지 질문에 답하면 프로필이 만들어져요."
          />
          <FeatureCard
            icon={<MatchIcon />}
            title="AI 정책자금 매칭"
            description="공고 데이터를 하이브리드 검색으로 분석해 지금 지원 가능한 자금을 찾아요."
          />
          <FeatureCard
            icon={<ReportIcon />}
            title="맞춤 리포트 제공"
            description="왜 적합한지, 무엇을 준비해야 하는지 정리된 리포트를 바로 받아보세요."
          />
        </div>
      </section>

      <style>{`
        @keyframes biz-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes biz-chip-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .biz-hero-left { animation: biz-fade-up 0.5s ease both; }
        .biz-hero-right { animation: biz-fade-up 0.5s ease 0.1s both; }

        .biz-cta-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: ${C.gold};
          color: ${C.brownDark};
          font-weight: 800;
          font-size: 15px;
          padding: 14px 24px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(245,197,24,0.32);
          transition: transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
        }
        .biz-cta-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(245,197,24,0.4);
          background: ${C.goldDark};
        }
        .biz-cta-secondary {
          display: inline-flex;
          align-items: center;
          background: transparent;
          color: ${C.brownDark};
          font-weight: 700;
          font-size: 15px;
          padding: 14px 24px;
          border-radius: 12px;
          border: 1px solid ${C.border};
          text-decoration: none;
          transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
        }
        .biz-cta-secondary:hover {
          background: ${C.bgLabel};
          border-color: ${C.brown};
          transform: translateY(-2px);
        }

        .biz-float-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          background: ${C.white};
          border: 1px solid ${C.border};
          border-radius: 999px;
          padding: 8px 14px 8px 8px;
          box-shadow: 0 8px 20px rgba(43,33,24,0.15);
          animation: biz-chip-float 3.2s ease-in-out infinite;
        }

        .biz-input {
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .biz-input:focus {
          outline: none;
          border-color: ${C.gold};
          box-shadow: 0 0 0 3px rgba(245,197,24,0.18);
        }

        .biz-login-submit {
          transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
        }
        .biz-login-submit:not(:disabled):hover {
          background: ${C.goldDark};
          transform: translateY(-1px);
          box-shadow: 0 10px 22px rgba(245,197,24,0.35);
        }

        .biz-feature-card {
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        }
        .biz-feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 32px rgba(43,33,24,0.10);
          border-color: ${C.gold};
        }

        @media (max-width: 640px) {
          .biz-float-chip span:last-child { display: none; }
        }
      `}</style>
    </main>
  );
}

function TrendIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M4 17 10 11 14 15 20 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 8h5v5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LoginCard({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const resp = await api<Session>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      saveSession(resp);
      onLogin(resp);
    } catch (e) {
      setError(e instanceof Error && e.message.includes("401") ? "아이디 또는 비밀번호가 올바르지 않습니다." : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="biz-login-card"
      style={{
        marginTop: -36,
        marginLeft: "auto",
        width: "88%",
        position: "relative",
        zIndex: 2,
        background: C.white,
        borderRadius: 20,
        padding: "24px 24px 20px",
        boxShadow: "0 20px 40px rgba(43,33,24,0.14)",
        border: `1px solid ${C.border}`,
        scrollMarginTop: 96,
      }}
    >
      <h2 style={{ margin: "0 0 12px", color: C.brownDark, fontSize: 17, fontWeight: 800 }}>로그인</h2>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          id="biz-login-username"
          className="biz-input"
          placeholder="아이디"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ padding: "11px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14 }}
        />
        <input
          type="password"
          className="biz-input"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: "11px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14 }}
        />
        {error && <div style={{ color: C.danger, fontSize: 13 }}>{error}</div>}
        <button
          type="submit"
          disabled={submitting || !username || !password}
          className="biz-login-submit"
          style={{
            marginTop: 4,
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            background: submitting || !username || !password ? C.border : C.gold,
            color: C.brownDark,
            fontWeight: 800,
            fontSize: 15,
            cursor: submitting || !username || !password ? "not-allowed" : "pointer",
            boxShadow: submitting || !username || !password ? "none" : "0 8px 18px rgba(245,197,24,0.3)",
          }}
        >
          {submitting ? "로그인 중..." : "로그인"}
        </button>
      </form>
      <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: C.textMuted, textAlign: "center" }}>
        아직 계정이 없나요?{" "}
        <Link href="/signup" style={{ color: C.goldDark, fontWeight: 700 }}>
          회원가입
        </Link>
      </p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      className="biz-feature-card"
      style={{
        flex: "1 1 280px",
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 4px 16px rgba(43,33,24,0.04)",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: C.bgLabel,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
          color: C.goldDark,
        }}
      >
        {icon}
      </div>
      <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: C.brownDark }}>{title}</p>
      <p style={{ margin: "8px 0 0", fontSize: 13.5, color: C.textMuted, lineHeight: 1.5 }}>{description}</p>
    </div>
  );
}

function HeroIllustration() {
  return (
    <svg width="196" height="168" viewBox="0 0 280 240" fill="none">
      <circle cx="140" cy="120" r="110" fill="rgba(245,197,24,0.10)" />
      <rect x="60" y="130" width="30" height="70" rx="4" fill={C.gold} opacity="0.85" />
      <rect x="105" y="100" width="30" height="100" rx="4" fill={C.gold} />
      <rect x="150" y="70" width="30" height="130" rx="4" fill="#FFDE7A" />
      <path
        d="M60 108 L105 82 L150 58 L195 30"
        stroke={C.white}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="195" cy="30" r="8" fill={C.white} />
    </svg>
  );
}

type ProfileSummary = { id: number; industry: string; regionSido: string; regionSigungu: string; createdAt: string };
type ReportSummary = { id: number; profileId: number; bodyMd: string; createdAt: string; analysisId: number | null };

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function Dashboard({ session }: { session: Session }) {
  const hasProfile = session.profileId !== null;
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<ProfileSummary[]>(`/api/onboarding/mine?userId=${session.userId}`)
      .then((list) => {
        if (cancelled) return;
        const sorted = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setProfiles(sorted);
        if (sorted[0]) {
          api<ReportSummary[]>(`/api/reports?profileId=${sorted[0].id}`)
            .then((r) => !cancelled && setReports(r))
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));

    if (session.profileId !== null) {
      api<{ id: number }[]>(`/api/notifications?profileId=${session.profileId}&status=UNREAD`)
        .then((n) => !cancelled && setUnreadCount(n.length))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [session.userId, session.profileId]);

  // 온보딩 직후 자동 생성되는 "등록 완료" 웰컴 리포트는 analysisId가 없다(OnboardingController.
  // createWelcomeReport) — 실제 정책 매칭 결과가 아니므로 대시보드 리포트 목록에서는 제외한다.
  const matchingReports = reports.filter((r) => r.analysisId !== null);

  return (
    <main style={{ background: C.bgPage }}>
      <section
        style={{
          background: `linear-gradient(135deg, ${C.brownDark} 0%, ${C.brown} 100%)`,
          padding: "44px 24px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 48,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 420px", minWidth: 300 }}>
            <span
              style={{
                display: "inline-block",
                padding: "6px 14px",
                borderRadius: 999,
                background: "rgba(245,197,24,0.16)",
                color: C.gold,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.3,
                marginBottom: 16,
              }}
            >
              소상공인 안심에이전트
            </span>
            <h1
              style={{
                color: C.white,
                fontSize: "clamp(24px, 3.4vw, 32px)",
                fontWeight: 800,
                letterSpacing: -0.3,
                lineHeight: 1.3,
                margin: "0 0 12px",
              }}
            >
              {session.name}님, 무엇을 도와드릴까요?
            </h1>
            <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 15, lineHeight: 1.6, margin: 0, maxWidth: 420 }}>
              {hasProfile
                ? "지난 상담 결과를 이어서 보거나, 새로운 상담을 시작할 수 있어요."
                : "아직 등록된 사업 정보가 없어요. 몇 가지 질문에 답하고 맞춤 정책자금을 받아보세요."}
            </p>
          </div>
          <div style={{ flex: "1 1 320px", minWidth: 260, display: "flex", justifyContent: "center" }}>
            <HeroIllustration />
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px 0" }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <HomeCard
            href="/onboarding"
            badge="AI 추천"
            icon={<ChatIcon />}
            title="상담 진행하기"
            description="새 온보딩 질문지 작성 → AI가 업종·지역·자금 목적에 맞는 정책자금을 매칭해드려요."
            meta="STEP 4개 · 약 3분 소요"
            ctaLabel="지금 시작하기"
            primary
          />
          <HomeCard
            href="/profiles"
            icon={<ListIcon />}
            title="질문 목록 보기"
            description="지금까지 제출한 온보딩 결과와 리포트를 다시 확인할 수 있어요."
            meta={loaded ? `최근 제출 ${profiles.length}건` : undefined}
            ctaLabel="목록 보기"
          />
        </div>
      </section>

      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "48px 24px 80px" }}>
        <p
          style={{
            margin: "0 0 16px",
            fontSize: 12,
            fontWeight: 800,
            color: C.textMuted,
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          빠른 현황
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
          <StatTile icon={<FormIcon />} label="제출한 질문지" value={profiles.length} />
          <StatTile icon={<ReportIcon />} label="받은 리포트" value={matchingReports.length} />
          <StatTile icon={<BellIcon />} label="읽지 않은 알림" value={unreadCount} />
        </div>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <DashboardPanel
            title="최근 상담"
            isEmpty={loaded && profiles.length === 0}
            emptyText="아직 제출한 온보딩 질문지가 없어요."
            emptyHref="/onboarding"
            emptyCta="지금 시작하기"
          >
            {profiles.slice(0, 3).map((p) => (
              <DashboardRow
                key={p.id}
                href={`/profiles/${p.id}`}
                title={`${p.industry || "업종 미입력"} · ${p.regionSido} ${p.regionSigungu}`}
                meta={shortDate(p.createdAt)}
              />
            ))}
          </DashboardPanel>

          <DashboardPanel
            title="추천 리포트"
            isEmpty={loaded && matchingReports.length === 0}
            emptyText="아직 받은 리포트가 없어요."
            emptyHref={profiles[0] ? `/profiles/${profiles[0].id}` : "/onboarding"}
            emptyCta="상담 이어서 보기"
          >
            {matchingReports.slice(0, 3).map((r) => (
              <DashboardRow
                key={r.id}
                href={`/reports/${r.id}`}
                title={reportTitle(r.bodyMd, "정책자금 리포트")}
                meta={shortDate(r.createdAt)}
              />
            ))}
          </DashboardPanel>
        </div>
      </section>

      <style>{`
        .biz-home-card {
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        }
        .biz-home-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 32px rgba(43,33,24,0.10);
          border-color: ${C.gold};
        }
        .biz-cta-fill {
          transition: background-color 0.15s ease, box-shadow 0.15s ease;
        }
        .biz-home-card:hover .biz-cta-fill {
          background: ${C.goldDark};
          box-shadow: 0 8px 18px rgba(245,197,24,0.35);
        }
        .biz-stat-tile {
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        }
        .biz-stat-tile:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 24px rgba(43,33,24,0.08);
          border-color: ${C.gold};
        }
        .biz-dash-row {
          transition: background-color 0.15s ease;
        }
        .biz-dash-row:hover {
          background: ${C.bgLabel};
        }
      `}</style>
    </main>
  );
}

function HomeCard({
  href,
  icon,
  title,
  description,
  badge,
  meta,
  ctaLabel,
  primary,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  meta?: string;
  ctaLabel: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="biz-home-card"
      style={{
        position: "relative",
        flex: "1 1 300px",
        display: "block",
        background: primary ? `linear-gradient(180deg, ${C.bgLabel} 0%, ${C.white} 120px)` : C.white,
        border: `1px solid ${primary ? C.gold : C.border}`,
        borderRadius: 16,
        padding: "24px 24px",
        textDecoration: "none",
        boxShadow: "0 8px 24px rgba(43,33,24,0.05)",
      }}
    >
      {badge && (
        <span
          style={{
            position: "absolute",
            top: 20,
            right: 22,
            background: C.gold,
            color: C.brownDark,
            fontSize: 11,
            fontWeight: 800,
            padding: "3px 9px",
            borderRadius: 999,
            letterSpacing: 0.3,
          }}
        >
          {badge}
        </span>
      )}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: C.bgLabel,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
          color: C.goldDark,
        }}
      >
        {icon}
      </div>
      <p style={{ margin: 0, fontWeight: 800, fontSize: 17, color: C.brownDark }}>{title}</p>
      <p style={{ margin: "8px 0 0", fontSize: 13.5, color: C.textMuted, lineHeight: 1.5 }}>
        {description}
      </p>
      {meta && (
        <p style={{ margin: "12px 0 0", fontSize: 12, color: C.goldDark, fontWeight: 700 }}>{meta}</p>
      )}
      {primary ? (
        <div
          className="biz-cta-fill"
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: C.gold,
            color: C.brownDark,
            fontWeight: 800,
            fontSize: 14,
            padding: "12px 0",
            borderRadius: 10,
          }}
        >
          {ctaLabel}
          <ArrowIcon />
        </div>
      ) : (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            color: C.goldDark,
          }}
        >
          {ctaLabel}
          <ArrowIcon />
        </div>
      )}
    </Link>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div
      className="biz-stat-tile"
      style={{
        flex: "1 1 160px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: 20,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: 12,
          background: C.bgLabel,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.goldDark,
        }}
      >
        {icon}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.brownDark, lineHeight: 1 }}>{value}</p>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.textMuted }}>{label}</p>
      </div>
    </div>
  );
}

function DashboardPanel({
  title,
  isEmpty,
  emptyText,
  emptyHref,
  emptyCta,
  children,
}: {
  title: string;
  isEmpty: boolean;
  emptyText: string;
  emptyHref: string;
  emptyCta: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: "1 1 380px",
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: 24,
      }}
    >
      <p style={{ margin: "0 0 12px", fontWeight: 800, fontSize: 15, color: C.brownDark }}>{title}</p>
      {isEmpty ? (
        <div style={{ padding: "16px 0 4px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>
          <p style={{ margin: "0 0 8px" }}>{emptyText}</p>
          <Link href={emptyHref} style={{ color: C.goldDark, fontWeight: 700 }}>
            {emptyCta}
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
      )}
    </div>
  );
}

function DashboardRow({ href, title, meta }: { href: string; title: string; meta: string }) {
  return (
    <Link
      href={href}
      className="biz-dash-row"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 12px",
        marginLeft: -12,
        marginRight: -12,
        borderRadius: 10,
        textDecoration: "none",
        color: C.text,
      }}
    >
      <span
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          color: C.brownDark,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </span>
      <span style={{ fontSize: 12, color: C.textMuted, flexShrink: 0 }}>{meta}</span>
    </Link>
  );
}
