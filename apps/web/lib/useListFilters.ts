import { useMemo, useState } from "react";

export type Period = "ALL" | "1M" | "3M";

type Filterable = { industry: string; regionSido: string; createdAt: string };

/** 질문 목록(/profiles)·받은 리포트(/reports)가 공유하는 업종·지역·기간 필터 로직.
 * 데이터가 유저 1명 기준 수십 건 규모라 서버 쿼리 파라미터화 없이 클라이언트에서 거른다. */
export function useListFilters<T extends Filterable>(items: T[]) {
  const [industry, setIndustry] = useState("");
  const [regionSido, setRegionSido] = useState("");
  const [period, setPeriod] = useState<Period>("ALL");

  const industries = useMemo(
    () => Array.from(new Set(items.map((i) => i.industry).filter(Boolean))).sort(),
    [items]
  );
  const regions = useMemo(
    () => Array.from(new Set(items.map((i) => i.regionSido).filter(Boolean))).sort(),
    [items]
  );

  const filtered = useMemo(() => {
    const cutoff =
      period === "ALL" ? null : Date.now() - (period === "1M" ? 30 : 90) * 24 * 60 * 60 * 1000;
    return items.filter((i) => {
      if (industry && i.industry !== industry) return false;
      if (regionSido && i.regionSido !== regionSido) return false;
      if (cutoff !== null && new Date(i.createdAt).getTime() < cutoff) return false;
      return true;
    });
  }, [items, industry, regionSido, period]);

  return { industry, setIndustry, regionSido, setRegionSido, period, setPeriod, industries, regions, filtered };
}
