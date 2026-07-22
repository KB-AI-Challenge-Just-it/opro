"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { C } from "@/lib/theme";
import { FormIcon } from "@/lib/icons";
import { useListFilters } from "@/lib/useListFilters";
import FilterBar from "@/app/components/FilterBar";

type ProfileSummary = {
  id: number;
  industry: string;
  regionSido: string;
  regionSigungu: string;
  createdAt: string;
};

export default function ProfileListPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
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
  } = useListFilters(profiles);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    api<ProfileSummary[]>(`/api/onboarding/mine?userId=${session.userId}`)
      .then(setProfiles)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [router]);

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 24, background: C.bgPage }}>
      <h1 style={{ color: C.brownDark, fontSize: 24, marginBottom: 4 }}>내 질문 목록</h1>
      <p style={{ color: C.textMuted, marginTop: 0, marginBottom: 24 }}>
        지금까지 제출한 온보딩 질문지와 그 결과를 확인할 수 있어요.
      </p>

      {loaded && profiles.length === 0 && (
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
            <FormIcon />
          </div>
          <p style={{ margin: 0 }}>아직 제출한 질문지가 없습니다.</p>
          <p style={{ margin: "4px 0 0", fontSize: 13 }}>
            <Link href="/onboarding" style={{ color: C.goldDark, fontWeight: 700 }}>
              온보딩 질문지
            </Link>
            를 작성해보세요.
          </p>
        </div>
      )}

      {profiles.length > 0 && (
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

      {profiles.length > 0 && filtered.length === 0 && (
        <p style={{ color: C.textMuted, fontSize: 14, textAlign: "center", padding: "24px 0" }}>
          조건에 맞는 질문지가 없습니다.
        </p>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((p) => (
          <li key={p.id}>
            <Link
              href={`/profiles/${p.id}`}
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
                  {p.industry || "업종 미입력"} · {p.regionSido} {p.regionSigungu}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textMuted }}>
                  {new Date(p.createdAt).toLocaleString("ko-KR")}
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
