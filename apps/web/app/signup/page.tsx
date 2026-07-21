"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { saveSession } from "@/lib/session";
import { C } from "@/lib/theme";

type SignupResp = { userId: number; username: string; name: string; profileId: number | null };

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
    <main style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
      <h1 style={{ color: C.brownDark, fontSize: 22, marginBottom: 24 }}>회원가입</h1>
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
        <input
          placeholder="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 10, borderRadius: 6, border: `1px solid ${C.border}` }}
        />
        {error && <div style={{ color: C.danger, fontSize: 13 }}>{error}</div>}
        <button
          type="submit"
          disabled={submitting || !username || !password || !name}
          style={{
            padding: "12px 0",
            borderRadius: 6,
            border: "none",
            background: submitting || !username || !password || !name ? C.border : C.gold,
            color: C.brownDark,
            fontWeight: 700,
            cursor: submitting || !username || !password || !name ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "가입 중..." : "회원가입"}
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 13, color: C.textMuted }}>
        이미 계정이 있나요?{" "}
        <Link href="/login" style={{ color: C.goldDark, fontWeight: 700 }}>
          로그인
        </Link>
      </p>
    </main>
  );
}
