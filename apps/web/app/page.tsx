"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadSession, type Session } from "@/lib/session";
import { C } from "@/lib/theme";
import { ChatIcon, ListIcon, FormIcon, MatchIcon, ReportIcon, ArrowIcon } from "@/lib/icons";

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    setSession(loadSession());
  }, []);

  // 세션 확인 전에는 아무것도 그리지 않는다 — 로그인 여부에 따라 랜딩/대시보드가
  // 완전히 다른 레이아웃이라 확인 전 렌더를 보여주면 전환 시 화면이 튄다.
  if (session === undefined) return null;

  if (!session) return <LandingPage />;

  return <Dashboard session={session} />;
}

function LandingPage() {
  return (
    <main style={{ background: C.bgPage }}>
      <section
        style={{
          background: `linear-gradient(135deg, ${C.brownDark} 0%, ${C.brown} 100%)`,
          padding: "72px 24px",
          overflow: "hidden",
          position: "relative",
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
                marginBottom: 20,
              }}
            >
              AI 정책자금 매칭 서비스
            </span>
            <h1
              style={{
                color: C.white,
                fontSize: "clamp(28px, 4vw, 40px)",
                fontWeight: 800,
                lineHeight: 1.35,
                margin: "0 0 16px",
              }}
            >
              소상공인의 사업이 잘되기 위해서
              <br />
              능동적으로 도와드립니다.
            </h1>
            <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 16, lineHeight: 1.6, margin: "0 0 32px", maxWidth: 440 }}>
              업종·지역·자금 목적 몇 가지만 알려주시면 AI가 딱 맞는 정책자금을
              찾아드리고, 신청 준비까지 이어지는 리포트를 만들어드려요.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link
                href="/login"
                style={{
                  background: C.gold,
                  color: C.brownDark,
                  fontWeight: 800,
                  fontSize: 15,
                  padding: "14px 28px",
                  borderRadius: 10,
                  textDecoration: "none",
                }}
              >
                로그인
              </Link>
              <Link
                href="/signup"
                style={{
                  background: "transparent",
                  color: C.white,
                  fontWeight: 700,
                  fontSize: 15,
                  padding: "14px 28px",
                  borderRadius: 10,
                  textDecoration: "none",
                  border: "1px solid rgba(255,255,255,0.4)",
                }}
              >
                회원가입
              </Link>
            </div>
          </div>
          <div style={{ flex: "1 1 320px", minWidth: 260, display: "flex", justifyContent: "center" }}>
            <HeroIllustration />
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "56px 24px 72px" }}>
        <h2 style={{ textAlign: "center", color: C.brownDark, fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>
          이렇게 도와드려요
        </h2>
        <p style={{ textAlign: "center", color: C.textMuted, fontSize: 14, margin: "0 0 36px" }}>
          질문 몇 개로 시작해서, 실제 신청까지 이어지는 3단계예요.
        </p>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <FeatureCard
            step="STEP 1"
            icon={<FormIcon />}
            title="사업 정보 온보딩"
            description="업종·지역·운영 현황 등 몇 가지 질문에 답하면 프로필이 만들어져요."
          />
          <FeatureCard
            step="STEP 2"
            icon={<MatchIcon />}
            title="AI 정책자금 매칭"
            description="공고 데이터를 하이브리드 검색으로 분석해 지금 지원 가능한 자금을 찾아요."
          />
          <FeatureCard
            step="STEP 3"
            icon={<ReportIcon />}
            title="맞춤 리포트 제공"
            description="왜 적합한지, 무엇을 준비해야 하는지 정리된 리포트를 바로 받아보세요."
          />
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  step,
  icon,
  title,
  description,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 280px",
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: "26px 24px",
        boxShadow: "0 8px 24px rgba(43,33,24,0.05)",
      }}
    >
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
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: C.goldDark, letterSpacing: 0.5 }}>{step}</p>
      <p style={{ margin: "6px 0 0", fontWeight: 800, fontSize: 16, color: C.brownDark }}>{title}</p>
      <p style={{ margin: "8px 0 0", fontSize: 13.5, color: C.textMuted, lineHeight: 1.5 }}>{description}</p>
    </div>
  );
}

function HeroIllustration() {
  return (
    <svg width="280" height="240" viewBox="0 0 280 240" fill="none">
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

function Dashboard({ session }: { session: Session }) {
  const hasProfile = session.profileId !== null;

  return (
    <main style={{ background: C.bgPage }}>
      <section
        style={{
          background: `linear-gradient(135deg, ${C.brownDark} 0%, ${C.brown} 100%)`,
          padding: "56px 24px",
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
                marginBottom: 20,
              }}
            >
              소상공인 금융 지원
            </span>
            <h1
              style={{
                color: C.white,
                fontSize: "clamp(24px, 3.4vw, 32px)",
                fontWeight: 800,
                lineHeight: 1.35,
                margin: "0 0 12px",
              }}
            >
              {session.name}님, 무엇을 도와드릴까요?
            </h1>
            <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 15, lineHeight: 1.6, margin: 0, maxWidth: 440 }}>
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

      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "48px 24px 72px" }}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <HomeCard
            href="/onboarding"
            badge="NEW"
            icon={<ChatIcon />}
            title="상담 진행하기"
            description="새 온보딩 질문지 작성 → AI가 업종·지역·자금 목적에 맞는 정책자금을 매칭해드려요."
            primary
          />
          <HomeCard
            href="/reports"
            icon={<ReportIcon />}
            title="받은 리포트 보기"
            description="지금까지 받은 정책자금 매칭 리포트를 한눈에 확인할 수 있어요."
          />
          <HomeCard
            href="/profiles"
            icon={<ListIcon />}
            title="질문 목록 보기"
            description="지금까지 제출한 온보딩 질문지 내용을 다시 확인할 수 있어요."
          />
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
  primary,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
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
        background: C.white,
        border: `1px solid ${primary ? C.gold : C.border}`,
        borderRadius: 16,
        padding: "28px 26px",
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
          width: 46,
          height: 46,
          borderRadius: 12,
          background: C.bgLabel,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 18,
          color: C.goldDark,
        }}
      >
        {icon}
      </div>
      <p style={{ margin: 0, fontWeight: 800, fontSize: 17, color: C.brownDark }}>{title}</p>
      <p style={{ margin: "8px 0 0", fontSize: 13.5, color: C.textMuted, lineHeight: 1.5 }}>
        {description}
      </p>
      <div
        style={{
          marginTop: 20,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 700,
          color: C.goldDark,
        }}
      >
        시작하기
        <ArrowIcon />
      </div>
    </Link>
  );
}

