"use client";

import { useState } from "react";
import { api } from "@/lib/api";

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
      <div style={{ marginTop: 12, padding: 12, background: "#fffbea", border: "1px solid #f0e2a0", borderRadius: 6 }}>
        <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 13 }}>📝 신청서 초안</p>
        {Object.entries(sections).map(([key, value]) => (
          <div key={key} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{key}</div>
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{String(value)}</div>
          </div>
        ))}
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#c0392b", fontWeight: 600 }}>
          ⚠️ 초안입니다. 반드시 검토·수정 후 직접 제출하세요.
        </p>
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
          background: "#1a202c",
          color: "white",
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: 13,
        }}
      >
        {loading ? "생성 중..." : "초안 생성하기"}
      </button>
      {error && <p style={{ color: "#c0392b", fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  );
}
