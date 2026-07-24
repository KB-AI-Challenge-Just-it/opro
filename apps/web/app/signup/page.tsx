"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { saveSession } from "@/lib/session";
import { C } from "@/lib/theme";
import { MASCOT_NAME, MatchIcon, DocCheckIcon, ChatIcon } from "@/lib/icons";

type SignupResp = {
  userId: number;
  username: string;
  name: string;
  profileId: number | null;
  preferredNotifyHour: number;
};

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const resp = await api<SignupResp>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ username, password, name }),
      });
      saveSession(resp);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error && e.message.includes("409") ? "이미 사용 중인 아이디입니다." : "회원가입에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{ background: C.bgPage }}>
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
              fontSize: "clamp(26px, 3vw, 34px)",
              fontWeight: 800,
              lineHeight: 1.4,
              margin: "0 0 16px",
            }}
          >
            가입은 1분,
            <br />
            그다음은 {MASCOT_NAME}가 도와드려요.
          </h1>
          <p style={{ color: C.textMuted, fontSize: 15.5, lineHeight: 1.7, margin: "0 0 28px" }}>
            사업 정보 몇 가지만 알려주시면
            <br />
            맞춤 정책자금 탐색을 바로 시작할 수 있어요.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex" }}>
              <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#3E7A52", marginRight: -5, border: "2px solid " + C.bgPage }} />
              <span style={{ width: 14, height: 14, borderRadius: "50%", background: C.gold, marginRight: -5, border: "2px solid " + C.bgPage }} />
              <span style={{ width: 14, height: 14, borderRadius: "50%", background: C.brown, border: "2px solid " + C.bgPage }} />
            </span>
            <span style={{ fontSize: 13, color: C.textMuted }}>
              전국 소상공인 12,400명이 {MASCOT_NAME}와 상담했어요
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 36 }}>
            <SignupFeature icon={<MatchIcon />} title="정책자금 맞춤 추천" description="사장님의 상황에 맞는 정책자금을 찾아드려요." />
            <SignupFeature icon={<DocCheckIcon />} title="신청부터 관리까지" description="복잡한 서류도 간편하게, 한 곳에서 관리해요." />
            <SignupFeature icon={<ChatIcon />} title="전문 상담 지원" description="정책자금 전문가가 친절히 도와드려요." />
          </div>
        </div>

        <div style={{ flex: "1 1 460px", minWidth: 300, position: "relative" }}>
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

          <div
            style={{
              position: "relative",
              zIndex: 1,
              marginTop: -90,
              marginLeft: "auto",
              marginRight: 16,
              maxWidth: 360,
              background: C.white,
              borderRadius: 18,
              padding: "32px 30px",
              boxShadow: "0 20px 50px rgba(43,33,24,0.18)",
            }}
          >
            <h2 style={{ color: C.brownDark, fontSize: 20, fontWeight: 800, margin: "0 0 20px" }}>회원가입</h2>
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
              <input
                placeholder="이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14 }}
              />
              {error && <div style={{ color: C.danger, fontSize: 13 }}>{error}</div>}
              <button
                type="submit"
                disabled={submitting || !username || !password || !name}
                style={{
                  padding: "13px 0",
                  borderRadius: 8,
                  border: "none",
                  background: submitting || !username || !password || !name ? C.border : C.gold,
                  color: C.brownDark,
                  fontWeight: 800,
                  fontSize: 14.5,
                  cursor: submitting || !username || !password || !name ? "not-allowed" : "pointer",
                  marginTop: 4,
                }}
              >
                {submitting ? "가입 중..." : "회원가입"}
              </button>
            </form>
            <p style={{ marginTop: 18, fontSize: 13, color: C.textMuted, textAlign: "center" }}>
              이미 계정이 있나요?{" "}
              <Link href="/login" style={{ color: C.goldDark, fontWeight: 700 }}>
                로그인
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function SignupFeature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: C.bgLabel,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.goldDark,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: C.brownDark }}>{title}</p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>{description}</p>
      </div>
    </div>
  );
}
