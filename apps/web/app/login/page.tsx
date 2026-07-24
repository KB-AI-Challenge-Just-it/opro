"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { saveSession } from "@/lib/session";
import { C } from "@/lib/theme";
import { MASCOT_NAME, FormIcon, MatchIcon, ReportIcon, BellIcon } from "@/lib/icons";

type LoginResp = {
  userId: number;
  username: string;
  name: string;
  profileId: number | null;
  preferredNotifyHour: number;
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const resp = await api<LoginResp>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      saveSession(resp);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error && e.message.includes("401") ? "아이디 또는 비밀번호가 올바르지 않습니다." : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{ background: `linear-gradient(90deg, ${C.white} 0%, ${C.bgPage} 45%, ${C.bgLabel} 100%)` }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "48px 40px 64px",
          display: "flex",
          flexWrap: "wrap",
          gap: 40,
          alignItems: "stretch",
        }}
      >
        <div style={{ flex: "1 1 380px", minWidth: 280, display: "flex", flexDirection: "column", justifyContent: "flex-start", paddingTop: 24 }}>
          <h1
            style={{
              color: C.brownDark,
              fontSize: "clamp(32px, 3.6vw, 42px)",
              fontWeight: 800,
              lineHeight: 1.4,
              margin: "0 0 20px",
            }}
          >
            수백 개나 되는 정책자금,
            <br />
            하나하나 찾아볼 필요 없어요.
          </h1>
          <p style={{ color: C.textMuted, fontSize: 18, lineHeight: 1.7, margin: "0 0 32px" }}>
            {MASCOT_NAME}가 사장님의 조건에 맞는
            <br />
            정책자금을 추천해드려요.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex" }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#3E7A52", marginRight: -5, border: "2px solid " + C.bgPage }} />
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: C.gold, marginRight: -5, border: "2px solid " + C.bgPage }} />
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: C.brown, border: "2px solid " + C.bgPage }} />
            </span>
            <span style={{ fontSize: 15, color: C.textMuted }}>
              전국 소상공인 12,400명이 {MASCOT_NAME}와 상담했어요
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 40, marginTop: 52 }}>
            <LoginFeature
              step="STEP 1"
              icon={<FormIcon />}
              title="사업 정보 온보딩"
              description="업종·지역·운영 현황 등 몇 가지 질문에 답하면 프로필이 만들어져요."
            />
            <LoginFeature
              step="STEP 2"
              icon={<MatchIcon />}
              title="AI 정책자금 매칭"
              description="공고 데이터를 하이브리드 검색으로 분석해 지금 지원 가능한 자금을 찾아요."
            />
            <LoginFeature
              step="STEP 3"
              icon={<ReportIcon />}
              title="맞춤 리포트 제공"
              description="왜 적합한지, 무엇을 준비해야 하는지 정리된 리포트를 바로 받아보세요."
            />
            <LoginFeature
              step="STEP 4"
              icon={<BellIcon size={26} />}
              title="카카오톡 실시간 알림"
              description="사장님께 딱 맞는 공고가 새로 올라오면 카카오톡으로 가장 먼저 알려드려요."
            />
          </div>
        </div>

        <div style={{ flex: "1 1 460px", minWidth: 300, position: "relative" }}>
          <div
            style={{
              borderRadius: "50% 0 0 50%",
              overflow: "hidden",
              background: C.nightSkyDeep,
              lineHeight: 0,
              height: 560,
            }}
          >
            <img
              src="/images/policy-fund-detective.jpg"
              alt="정책자금을 찾아주는 탐정 토리"
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%", display: "block" }}
            />
          </div>

          <div
            style={{
              position: "relative",
              zIndex: 1,
              marginTop: 28,
              marginLeft: "auto",
              marginRight: 16,
              maxWidth: 360,
              background: C.white,
              borderRadius: 18,
              padding: "32px 30px",
              boxShadow: "0 20px 50px rgba(43,33,24,0.18)",
            }}
          >
            <h2 style={{ color: C.brownDark, fontSize: 20, fontWeight: 800, margin: "0 0 20px" }}>로그인</h2>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                placeholder="아이디"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14 }}
              />
              <input
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14 }}
              />
              {error && <div style={{ color: C.danger, fontSize: 13 }}>{error}</div>}
              <button
                type="submit"
                disabled={submitting || !username || !password}
                style={{
                  padding: "13px 0",
                  borderRadius: 8,
                  border: "none",
                  background: submitting || !username || !password ? C.border : C.gold,
                  color: C.brownDark,
                  fontWeight: 800,
                  fontSize: 14.5,
                  cursor: submitting || !username || !password ? "not-allowed" : "pointer",
                  marginTop: 4,
                }}
              >
                {submitting ? "로그인 중..." : "로그인"}
              </button>
            </form>
            <p style={{ marginTop: 18, fontSize: 13, color: C.textMuted, textAlign: "center" }}>
              아직 계정이 없나요?{" "}
              <Link href="/signup" style={{ color: C.goldDark, fontWeight: 700 }}>
                회원가입
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function LoginFeature({
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
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
      <div
        style={{
          width: 66,
          height: 66,
          borderRadius: 16,
          background: C.bgLabel,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.goldDark,
          flexShrink: 0,
        }}
      >
        <span style={{ transform: "scale(1.5)" }}>{icon}</span>
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: C.goldDark, letterSpacing: 0.5 }}>{step}</p>
        <p style={{ margin: "4px 0 0", fontWeight: 800, fontSize: 20, color: C.brownDark }}>{title}</p>
        <p style={{ margin: "6px 0 0", fontSize: 16, color: C.textMuted, lineHeight: 1.6 }}>{description}</p>
      </div>
    </div>
  );
}
