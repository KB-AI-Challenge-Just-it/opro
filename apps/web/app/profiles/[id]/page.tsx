"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiVoid } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { C } from "@/lib/theme";
import { firstHeaderText } from "@/lib/markdown";

type BusinessProfile = {
  id: number;
  userId: number;
  industry: string;
  regionSido: string;
  regionSigungu: string;
  bizRegNo: string | null;
  ntsVerified: boolean;
  bizStatus: string;
  operatingPeriod: string;
  employeeBand: string;
  revenueBasis: "ANNUAL" | "MONTHLY";
  monthlyRevenueBand: string;
  taxDelinquency: string;
  overdueStatus: string;
  fundingExperience: string;
  fundingPurpose: string[];
  fundingAmountBand: string;
  preferredNotifyHour: number;
  createdAt: string;
};

const BIZ_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "정상 영업",
  SUSPENDED: "휴업",
  CLOSED: "폐업(재창업 준비)",
};
const TAX_DELINQUENCY_LABEL: Record<string, string> = {
  NONE: "없음",
  YES: "있음",
  UNKNOWN_CONFIRMED: "잘 모름 (조회 결과 있음)",
  UNKNOWN_UNCONFIRMED: "잘 모름",
};
const OVERDUE_LABEL: Record<string, string> = {
  NONE: "없음",
  RESOLVED: "있었지만 해결",
  CURRENT: "현재 연체 중",
  UNKNOWN: "잘 모름",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ flex: "0 0 160px", background: C.bgLabel, color: C.brown, fontWeight: 700, padding: "14px 16px" }}>
        {label}
      </div>
      <div style={{ flex: 1, padding: "14px 16px", color: C.text }}>{value || "-"}</div>
    </div>
  );
}

type Report = { id: number; profileId: number; bodyMd: string; createdAt: string };

type SaveState = "idle" | "saving" | "saved" | "error";

/** 알림 받을 시간(07~23시)을 선택·저장하는 편집형 Row. */
function NotifyHourRow({
  profileId,
  userId,
  initialHour,
}: {
  profileId: number;
  userId: number;
  initialHour: number;
}) {
  const [hour, setHour] = useState(initialHour);
  const [state, setState] = useState<SaveState>("idle");

  async function save(nextHour: number) {
    setHour(nextHour);
    setState("saving");
    try {
      await apiVoid(
        `/api/onboarding/${profileId}/notify-hour?userId=${userId}&preferredNotifyHour=${nextHour}`,
        { method: "PATCH" }
      );
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ flex: "0 0 160px", background: C.bgLabel, color: C.brown, fontWeight: 700, padding: "14px 16px" }}>
        알림 받을 시간
      </div>
      <div style={{ flex: 1, padding: "14px 16px", color: C.text, display: "flex", alignItems: "center", gap: 12 }}>
        <select
          value={hour}
          onChange={(e) => save(Number(e.target.value))}
          disabled={state === "saving"}
          style={{
            padding: "6px 10px",
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            background: C.white,
            color: C.text,
            fontSize: 14,
          }}
        >
          {Array.from({ length: 17 }, (_, i) => i + 7).map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}시
            </option>
          ))}
        </select>
        {state === "saving" && <span style={{ fontSize: 13, color: C.textMuted }}>저장 중…</span>}
        {state === "saved" && <span style={{ fontSize: 13, color: C.goldDark, fontWeight: 700 }}>저장됨 ✓</span>}
        {state === "error" && <span style={{ fontSize: 13, color: C.danger, fontWeight: 700 }}>저장 실패</span>}
      </div>
    </div>
  );
}

export default function ProfileDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    setUserId(session.userId);
    api<BusinessProfile>(`/api/onboarding/${params.id}`)
      .then((p) => {
        if (p.userId !== session.userId) {
          setError("본인이 제출한 질문지만 볼 수 있습니다.");
          return;
        }
        setProfile(p);
        api<Report[]>(`/api/reports?profileId=${p.id}`)
          .then(setReports)
          .catch(() => {});
      })
      .catch(() => setError("질문지를 불러오지 못했습니다."));
  }, [params.id, router]);

  if (error) {
    return (
      <main style={{ maxWidth: 560, margin: "80px auto", padding: 24, textAlign: "center", color: C.textMuted }}>
        <p>{error}</p>
        <Link href="/profiles" style={{ color: C.goldDark, fontWeight: 700 }}>
          목록으로
        </Link>
      </main>
    );
  }

  if (!profile) return null;

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 24, background: C.bgPage }}>
      <p style={{ marginTop: 0 }}>
        <Link href="/profiles" style={{ color: C.brown, fontSize: 13 }}>
          ← 질문 목록으로
        </Link>
      </p>
      <h1 style={{ color: C.brownDark, fontSize: 22, marginBottom: 4 }}>질문 상세</h1>
      <p style={{ color: C.textMuted, marginTop: 0, marginBottom: 20, fontSize: 13 }}>
        {new Date(profile.createdAt).toLocaleString("ko-KR")} 제출
      </p>

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <Row label="업종" value={profile.industry} />
        <Row label="지역" value={`${profile.regionSido} ${profile.regionSigungu}`} />
        <Row
          label="사업자등록번호"
          value={profile.bizRegNo ? `${profile.bizRegNo}${profile.ntsVerified ? " (국세청 확인 ✓)" : ""}` : "미입력"}
        />
        <Row label="영업 상태" value={BIZ_STATUS_LABEL[profile.bizStatus] ?? profile.bizStatus} />
        <Row label="업력" value={profile.operatingPeriod} />
        <Row label="직원 수" value={profile.employeeBand} />
        <Row
          label={profile.revenueBasis === "ANNUAL" ? "연매출" : "월매출"}
          value={profile.monthlyRevenueBand}
        />
        <Row label="세금 체납" value={TAX_DELINQUENCY_LABEL[profile.taxDelinquency] ?? profile.taxDelinquency} />
        <Row label="연체 상태" value={OVERDUE_LABEL[profile.overdueStatus] ?? profile.overdueStatus} />
        <Row label="정책자금 수혜 이력" value={profile.fundingExperience} />
        <Row label="자금 사용 목적" value={profile.fundingPurpose?.join(", ")} />
        <Row label="희망 자금 규모" value={profile.fundingAmountBand} />
        {userId !== null && (
          <NotifyHourRow profileId={profile.id} userId={userId} initialHour={profile.preferredNotifyHour} />
        )}
      </div>

      <h2 style={{ color: C.brownDark, fontSize: 18, marginTop: 32, marginBottom: 8 }}>받은 리포트</h2>
      {reports.length === 0 ? (
        <p style={{ color: C.textMuted, fontSize: 14 }}>아직 이 질문지로 받은 리포트가 없습니다.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {reports.map((r) => (
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
                    {new Date(r.createdAt).toLocaleString("ko-KR")}
                  </p>
                </div>
                <span style={{ color: C.goldDark, fontSize: 18 }}>→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
