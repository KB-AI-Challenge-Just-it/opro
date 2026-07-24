"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { saveSession } from "@/lib/session";
import { C } from "@/lib/theme";

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
    <main style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
      <h1 style={{ color: C.brownDark, fontSize: 22, marginBottom: 24 }}>로그인</h1>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          placeholder="아이디"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ padding: 10, borderRadius: 6, border: `1px solid ${C.border}` }}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10, borderRadius: 6, border: `1px solid ${C.border}` }}
        />
        {error && <div style={{ color: C.danger, fontSize: 13 }}>{error}</div>}
        <button
          type="submit"
          disabled={submitting || !username || !password}
          style={{
            padding: "12px 0",
            borderRadius: 6,
            border: "none",
            background: submitting || !username || !password ? C.border : C.gold,
            color: C.brownDark,
            fontWeight: 700,
            cursor: submitting || !username || !password ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "로그인 중..." : "로그인"}
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 13, color: C.textMuted }}>
        아직 계정이 없나요?{" "}
        <Link href="/signup" style={{ color: C.goldDark, fontWeight: 700 }}>
          회원가입
        </Link>
      </p>
    </main>
  );
}
