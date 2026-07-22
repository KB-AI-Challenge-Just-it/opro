"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { C } from "@/lib/theme";
import { ReportIcon } from "@/lib/icons";
import { firstHeaderText } from "@/lib/markdown";
import { useListFilters } from "@/lib/useListFilters";
import FilterBar from "@/app/components/FilterBar";

type ReportSummary = {
  id: number;
  profileId: number;
  bodyMd: string;
  createdAt: string;
  industry: string;
  regionSido: string;
  regionSigungu: string;
};

export default function ReportListPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const {
    industry,
    setIndustry,
    regionSido,
    setRegionSido,
    period,
    setPeriod,
    industries,
    regions,
    filtered,
  } = useListFilters(reports);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    api<ReportSummary[]>(`/api/reports/mine?userId=${session.userId}`)
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [router]);

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 24, background: C.bgPage }}>
      <h1 style={{ color: C.brownDark, fontSize: 24, marginBottom: 4 }}>받은 리포트</h1>
      <p style={{ color: C.textMuted, marginTop: 0, marginBottom: 24 }}>
        지금까지 받은 정책자금 매칭 리포트를 한눈에 확인할 수 있어요.
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
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: C.bgLabel,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
              color: C.goldDark,
            }}
          >
            <ReportIcon />
          </div>
          <p style={{ margin: 0 }}>아직 받은 리포트가 없습니다.</p>
          <p style={{ margin: "4px 0 0", fontSize: 13 }}>
            <Link href="/onboarding" style={{ color: C.goldDark, fontWeight: 700 }}>
              온보딩 질문지
            </Link>
            를 작성하면 맞춤 리포트를 받아볼 수 있어요.
          </p>
        </div>
      )}

      {reports.length > 0 && (
        <FilterBar
          industry={industry}
          onIndustryChange={setIndustry}
          industries={industries}
          regionSido={regionSido}
          onRegionChange={setRegionSido}
          regions={regions}
          period={period}
          onPeriodChange={setPeriod}
          resultCount={filtered.length}
        />
      )}

      {reports.length > 0 && filtered.length === 0 && (
        <p style={{ color: C.textMuted, fontSize: 14, textAlign: "center", padding: "24px 0" }}>
          조건에 맞는 리포트가 없습니다.
        </p>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((r) => (
          <li key={r.id}>
            <Link
              href={`/reports/${r.id}?profileId=${r.profileId}`}
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
                  {r.industry || "업종 미입력"} · {r.regionSido} {r.regionSigungu} ·{" "}
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
