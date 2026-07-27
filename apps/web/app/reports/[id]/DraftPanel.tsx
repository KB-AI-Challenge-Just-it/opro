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
        className="biz-draft-panel"
        style={{
          marginTop: 12,
          padding: 14,
          background: "rgba(255,255,255,.7)",
          border: `1px solid ${C.border}`,
          borderRadius: 10,
        }}
      >
        <button
          type="button"
          className="biz-draft-toggle"
          aria-expanded={!collapsed}
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
            marginBottom: collapsed ? 0 : 10,
          }}
        >
          <FormIcon size={14} /> 신청서 초안
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.textMuted }}>
            {collapsed ? "펼치기 ▾" : "접기 ▴"}
          </span>
        </button>
        <div className={`biz-draft-content${collapsed ? "" : " biz-draft-content--open"}`}>
          <div className="biz-draft-content-inner">
            {Object.entries(sections).map(([key, value]) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ marginBottom: 2, fontWeight: 750, fontSize: 12, color: C.brown }}>{key}</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", color: C.text }}>
                  {String(value)}
                </div>
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        className="biz-primary-cta"
        onClick={generate}
        disabled={loading}
        aria-busy={loading}
        style={{
          width: "100%",
          padding: "11px 16px",
          borderRadius: 8,
          border: "none",
          background: loading ? C.border : C.gold,
          color: C.brownDark,
          fontWeight: 800,
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: 13.5,
        }}
      >
        {loading ? "생성 중..." : "AI 신청 초안 생성"}
      </button>
      {error && (
        <p role="alert" style={{ color: C.danger, fontSize: 12, marginTop: 6 }}>
          {error}
        </p>
      )}
    </div>
  );
}
