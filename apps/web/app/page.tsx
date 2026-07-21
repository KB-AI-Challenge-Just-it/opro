"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { C } from "@/lib/theme";
import { firstHeaderText } from "@/lib/markdown";

type Report = { id: number; bodyMd: string; createdAt: string };

export default function Home() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.profileId === null) {
      router.replace("/onboarding");
      return;
    }
    api<Report[]>(`/api/reports?profileId=${session.profileId}`)
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [router]);

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 24, background: C.bgPage }}>
      <h1 style={{ color: C.brownDark, fontSize: 24, marginBottom: 4 }}>받은 리포트</h1>
      <p style={{ color: C.textMuted, marginTop: 0, marginBottom: 24 }}>
        아직 프로필이 없다면{" "}
        <Link href="/onboarding" style={{ color: C.goldDark, fontWeight: 700 }}>
          온보딩 질문지
        </Link>
        부터 작성하세요.
      </p>

      {loaded && reports.length === 0 && (
        <div
          style={{
            background: C.white,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "40px 24px",
            textAlign: "center",
            color: C.textMuted,
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
          <p style={{ margin: 0 }}>도착한 리포트가 없습니다.</p>
          <p style={{ margin: "4px 0 0", fontSize: 13 }}>변화가 감지되면 여기로 알려드립니다.</p>
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {reports.map((r) => (
          <li key={r.id}>
            <Link
              href={`/reports/${r.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                background: C.white,
                border: `1px solid ${C.border}`,
                borderLeft: `4px solid ${C.gold}`,
                borderRadius: 8,
                padding: "16px 20px",
                textDecoration: "none",
                color: C.text,
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: C.brownDark }}>
                  {firstHeaderText(r.bodyMd) ?? `리포트 #${r.id}`}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textMuted }}>
                  {new Date(r.createdAt).toLocaleString("ko-KR")}
                </p>
              </div>
              <span style={{ color: C.goldDark, fontSize: 18 }}>→</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
