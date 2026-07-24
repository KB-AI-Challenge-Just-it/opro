"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiVoid } from "@/lib/api";
import { loadSession, saveSession, type Session } from "@/lib/session";
import { C } from "@/lib/theme";

const HOURS = Array.from({ length: 23 - 7 + 1 }, (_, i) => i + 7); // 7~23

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ flex: "0 0 120px", background: C.bgLabel, color: C.brown, fontWeight: 700, padding: "14px 16px" }}>
        {label}
      </div>
      <div style={{ flex: 1, padding: "14px 16px", color: C.text }}>{value || "-"}</div>
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [hour, setHour] = useState(9);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    setSession(s);
    // 로그인/회원가입 응답에 실려온 현재 설정값으로 초기화(세션에 없던 과거 로그인이면 기본 9시 유지).
    if (s.preferredNotifyHour != null) setHour(s.preferredNotifyHour);
  }, [router]);

  if (!session) return null;

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await apiVoid(`/api/auth/${session.userId}/notify-hour?preferredNotifyHour=${hour}`, { method: "PATCH" });
      const updated = { ...session, preferredNotifyHour: hour };
      saveSession(updated);
      setSession(updated);
      setFeedback({ ok: true, msg: `알림 시간을 ${String(hour).padStart(2, "0")}시로 저장했습니다.` });
    } catch {
      setFeedback({ ok: false, msg: "저장에 실패했습니다. 잠시 후 다시 시도해주세요." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: 24, background: C.bgPage }}>
      <p style={{ marginTop: 0 }}>
        <Link href="/profiles" style={{ color: C.brown, fontSize: 13 }}>
          ← 질문 목록으로
        </Link>
      </p>
      <h1 style={{ color: C.brownDark, fontSize: 22, marginBottom: 20 }}>내 정보</h1>

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <Row label="이름" value={session.name} />
        <Row label="아이디" value={session.username} />
      </div>

      <h2 style={{ color: C.brownDark, fontSize: 18, marginTop: 32, marginBottom: 8 }}>알림 설정</h2>
      <p style={{ color: C.textMuted, marginTop: 0, marginBottom: 12, fontSize: 13 }}>
        새로운 정책자금 매칭 알림을 받을 시간을 선택하세요.
      </p>

      <div
        style={{
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <label htmlFor="notify-hour" style={{ color: C.brown, fontWeight: 700, fontSize: 14 }}>
          알림 받을 시간
        </label>
        <select
          id="notify-hour"
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          style={{
            padding: "8px 12px",
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            color: C.text,
            background: C.white,
            fontSize: 14,
          }}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}시
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={saving}
          style={{
            marginLeft: "auto",
            background: C.gold,
            color: C.brownDark,
            border: "none",
            borderRadius: 6,
            padding: "8px 20px",
            fontSize: 14,
            fontWeight: 700,
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>

      {feedback && (
        <p style={{ marginTop: 12, fontSize: 13, color: feedback.ok ? C.goldDark : C.danger }}>{feedback.msg}</p>
      )}
    </main>
  );
}
