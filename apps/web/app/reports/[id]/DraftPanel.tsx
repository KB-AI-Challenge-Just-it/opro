"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { C } from "@/lib/theme";
import { FormIcon, WarningIcon } from "@/lib/icons";

type Sections = Record<string, string>;

export default function DraftPanel({
  reportId,
  pblancId,
  initialSections,
}: {
  reportId: number;
  pblancId: string;
  initialSections: Sections | null;
}) {
  const [sections, setSections] = useState<Sections | null>(initialSections);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ sections: Sections }>(
        `/api/agent/draft?reportId=${reportId}&pblancId=${encodeURIComponent(pblancId)}`,
        { method: "POST" }
      );
      setSections(res.sections);
    } catch (e) {
      setError(e instanceof Error ? e.message : "초안 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (sections) {
    return (
      <div
        style={{
          marginTop: 12,
          padding: 12,
          background: C.bgLabel,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
        }}
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            width: "100%",
            margin: 0,
            padding: 0,
            background: "none",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 13,
            color: C.brownDark,
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: collapsed ? 0 : 8,
          }}
        >
          <FormIcon size={14} /> 신청서 초안
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.textMuted }}>
            {collapsed ? "펼치기 ▾" : "접기 ▴"}
          </span>
        </button>
        {!collapsed && (
          <>
            {Object.entries(sections).map(([key, value]) => (
              <div key={key} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.brown }}>{key}</div>
                <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: C.text }}>{String(value)}</div>
              </div>
            ))}
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 12,
                color: C.danger,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <WarningIcon /> 초안입니다. 반드시 검토·수정 후 직접 제출하세요.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={generate}
        disabled={loading}
        style={{
          padding: "8px 14px",
          borderRadius: 6,
          border: "none",
          background: loading ? C.border : C.gold,
          color: C.brownDark,
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: 13,
        }}
      >
        {loading ? "생성 중..." : "초안 생성하기"}
      </button>
      {error && <p style={{ color: C.danger, fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  );
}
