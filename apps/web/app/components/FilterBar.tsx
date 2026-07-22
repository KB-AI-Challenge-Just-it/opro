"use client";

import { C } from "@/lib/theme";
import type { Period } from "@/lib/useListFilters";

const PERIOD_LABEL: Record<Period, string> = { ALL: "전체 기간", "1M": "최근 1개월", "3M": "최근 3개월" };

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        background: C.white,
        color: C.text,
        fontSize: 13,
      }}
    >
      {children}
    </select>
  );
}

export default function FilterBar({
  industry,
  onIndustryChange,
  industries,
  regionSido,
  onRegionChange,
  regions,
  period,
  onPeriodChange,
  resultCount,
}: {
  industry: string;
  onIndustryChange: (v: string) => void;
  industries: string[];
  regionSido: string;
  onRegionChange: (v: string) => void;
  regions: string[];
  period: Period;
  onPeriodChange: (v: Period) => void;
  resultCount: number;
}) {
  const hasFilter = industry !== "" || regionSido !== "" || period !== "ALL";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      <Select value={industry} onChange={onIndustryChange}>
        <option value="">업종 전체</option>
        {industries.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </Select>
      <Select value={regionSido} onChange={onRegionChange}>
        <option value="">지역 전체</option>
        {regions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </Select>
      <Select value={period} onChange={(v) => onPeriodChange(v as Period)}>
        {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
          <option key={p} value={p}>
            {PERIOD_LABEL[p]}
          </option>
        ))}
      </Select>
      {hasFilter && (
        <button
          onClick={() => {
            onIndustryChange("");
            onRegionChange("");
            onPeriodChange("ALL");
          }}
          style={{
            border: "none",
            background: "none",
            color: C.goldDark,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            padding: "8px 4px",
          }}
        >
          초기화
        </button>
      )}
      <span style={{ marginLeft: "auto", fontSize: 13, color: C.textMuted }}>{resultCount}건</span>
    </div>
  );
}
