"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

// 기획서 4-1 폐쇄형 질문지 — 전 항목 선택형 (Q9만 형식 고정 입력)
const Q = {
  industry: ["카페/디저트", "음식점/외식업", "소매/유통", "서비스업", "제조/가공업", "기타"],
  entityType: ["개인(일반과세자)", "개인(간이과세자)", "법인"],
  operatingPeriod: ["6개월 미만", "6개월~1년", "1~3년", "3~5년", "5년 이상"],
  monthlyRevenueBand: ["500만 미만", "500만~1,500만", "1,500만~3,000만", "3,000만~5,000만", "5,000만 이상"],
  employeeBand: ["없음(1인 운영)", "1~2명", "3~5명", "6명 이상"],
  concerns: ["매출 감소", "임대료 등 고정비 부담", "인건비/구인난", "주변 경쟁 심화", "자금 조달 어려움", "세무/법률 이슈", "특별한 어려움 없음"],
  fundingExperience: ["신청해본 적 있음", "알아본 적은 있지만 신청은 안 해봄", "전혀 알아본 적 없음"],
};

const SPRING_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export default function Onboarding() {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown>>({ userId: 1, concerns: [] });
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const toggleConcern = (c: string) =>
    setForm((f) => {
      const cur = (f.concerns as string[]) ?? [];
      const next = cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c].slice(-2); // 최대 2개
      return { ...f, concerns: next };
    });

  const submit = async () => {
    setError(null);
    try {
      // 제출 성공 → 저장된 프로필 id 확보. 카카오 동의(선택) 화면으로 전환.
      const saved = await api<{ id: number }>("/api/onboarding", { method: "POST", body: JSON.stringify(form) });
      setProfileId(saved.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출에 실패했습니다.");
    }
  };

  // 카카오 '나에게 보내기' 동의 — fetch가 아니라 브라우저 리다이렉트 플로우(Spring이 302로 인가 서버 이동).
  const connectKakao = () => {
    window.location.href = `${SPRING_BASE}/api/kakao/oauth/authorize?profileId=${profileId}`;
  };

  // 제출 완료 후: 카카오 동의(선택) 안내. 동의는 필수가 아니므로 건너뛰기 경로 제공.
  if (profileId !== null) {
    return (
      <main>
        <h1>등록 완료</h1>
        <p>카카오톡으로 맞춤 알림을 받아보시겠어요? (선택)</p>
        <button onClick={connectKakao}>카카오톡으로 알림 받기</button>
        <p style={{ margin: "12px 0" }}>
          <a href="#" onClick={(e) => { e.preventDefault(); router.push("/"); }}>건너뛰기</a>
        </p>
      </main>
    );
  }

  const Select = ({ k, label, opts }: { k: string; label: string; opts: string[] }) => (
    <label style={{ display: "block", margin: "12px 0" }}>
      {label}
      <select onChange={(e) => set(k, e.target.value)} defaultValue="">
        <option value="" disabled>선택</option>
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <main>
      <h1>온보딩 질문지</h1>
      <Select k="industry" label="Q1. 업종" opts={Q.industry} />
      <Select k="entityType" label="Q2. 사업자 형태" opts={Q.entityType} />
      <Select k="operatingPeriod" label="Q3. 운영 기간" opts={Q.operatingPeriod} />
      <Select k="monthlyRevenueBand" label="Q4. 월평균 매출 구간" opts={Q.monthlyRevenueBand} />
      <Select k="employeeBand" label="Q5. 직원 수 (본인 제외)" opts={Q.employeeBand} />
      {/* Q6: MVP는 텍스트 2필드, 추후 시도→시군구 캐스케이드 */}
      <label style={{ display: "block", margin: "12px 0" }}>
        Q6. 소재지 (시/도, 시/군/구)
        <input placeholder="서울" onChange={(e) => set("regionSido", e.target.value)} />
        <input placeholder="마포구" onChange={(e) => set("regionSigungu", e.target.value)} />
      </label>
      <fieldset style={{ margin: "12px 0" }}>
        <legend>Q7. 최근 가장 큰 경영 고민 (최대 2개)</legend>
        {Q.concerns.map((c) => (
          <label key={c} style={{ display: "block" }}>
            <input type="checkbox"
              checked={((form.concerns as string[]) ?? []).includes(c)}
              onChange={() => toggleConcern(c)} /> {c}
          </label>
        ))}
      </fieldset>
      <Select k="fundingExperience" label="Q8. 정책자금 신청 경험" opts={Q.fundingExperience} />
      <label style={{ display: "block", margin: "12px 0" }}>
        Q9. 사업자등록번호 (숫자 10자리)
        <input maxLength={10} pattern="\d{10}" onChange={(e) => set("bizRegNo", e.target.value)} />
      </label>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button onClick={submit}>등록</button>
    </main>
  );
}
