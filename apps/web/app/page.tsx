"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loadSession, type Session } from "@/lib/session";
import { C } from "@/lib/theme";
import { ChatIcon, ReportIcon, ArrowIcon } from "@/lib/icons";

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    setSession(s);
  }, [router]);

  // 세션 확인 전에는 아무것도 그리지 않는다 — /login으로 리다이렉트되는 경우 화면이 튀지 않게.
  if (!session) return null;

  return <Dashboard session={session} />;
}

function Dashboard({ session }: { session: Session }) {
  const hasProfile = session.profileId !== null;

  return (
    <main style={{ background: C.bgPage }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "48px 40px",
          display: "flex",
          flexWrap: "wrap",
          gap: 40,
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 380px", minWidth: 280, paddingTop: 24 }}>
          <h1
            style={{
              color: C.brownDark,
              fontSize: "clamp(26px, 3vw, 34px)",
              fontWeight: 800,
              lineHeight: 1.4,
              margin: "0 0 16px",
            }}
          >
            {session.name}님, 무엇을 도와드릴까요?
          </h1>
          <p style={{ color: C.textMuted, fontSize: 15.5, lineHeight: 1.7, margin: 0 }}>
            {hasProfile
              ? "지난 상담 결과를 이어서 보거나, 새로운 상담을 시작할 수 있어요."
              : "아직 등록된 사업 정보가 없어요. 몇 가지 질문에 답하고 맞춤 정책자금을 받아보세요."}
          </p>
        </div>

        <div style={{ flex: "1 1 460px", minWidth: 300 }}>
          <div
            style={{
              borderRadius: "24px 0 0 260px",
              overflow: "hidden",
              background: C.nightSkyDeep,
              lineHeight: 0,
              height: 480,
            }}
          >
            <img
              src="/images/policy-fund-detective.jpg"
              alt="정책자금을 찾아주는 탐정 토리"
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%", display: "block" }}
            />
          </div>
        </div>
      </div>

      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "0 24px 72px" }}>
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
            title="상담 결과 보기"
            description="지금까지 등록한 사업 정보와 받은 정책자금 매칭 리포트를 한 곳에서 확인할 수 있어요."
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
