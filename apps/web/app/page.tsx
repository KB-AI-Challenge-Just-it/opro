"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadSession } from "@/lib/session";
import { C } from "@/lib/theme";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (!loadSession()) {
      router.replace("/login");
    }
  }, [router]);

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 24, background: C.bgPage }}>
      <h1 style={{ color: C.brownDark, fontSize: 24, marginBottom: 20 }}>무엇을 하시겠어요?</h1>

      <div style={{ display: "flex", gap: 12 }}>
        <Link
          href="/profiles"
          style={{
            flex: 1,
            display: "block",
            background: C.white,
            border: `1px solid ${C.border}`,
            borderTop: `4px solid ${C.gold}`,
            borderRadius: 8,
            padding: "20px 16px",
            textDecoration: "none",
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>📋</div>
          <p style={{ margin: 0, fontWeight: 700, color: C.brownDark }}>질문 목록 보기</p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textMuted }}>지금까지 제출한 온보딩 결과 확인</p>
        </Link>
        <Link
          href="/onboarding"
          style={{
            flex: 1,
            display: "block",
            background: C.white,
            border: `1px solid ${C.border}`,
            borderTop: `4px solid ${C.gold}`,
            borderRadius: 8,
            padding: "20px 16px",
            textDecoration: "none",
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>💬</div>
          <p style={{ margin: 0, fontWeight: 700, color: C.brownDark }}>상담 진행하기</p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textMuted }}>새 온보딩 질문지 작성 → 맞춤 정책자금 매칭</p>
        </Link>
      </div>
    </main>
  );
}
