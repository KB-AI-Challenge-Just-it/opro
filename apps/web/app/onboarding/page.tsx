"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { saveProfileId } from "@/lib/profile";
import { C } from "@/lib/theme";

// doc/onboarding.md 9화면(+조건부 꼬리질문) 온보딩 위저드.
// 디자인 톤: doc/input_design.png(라벨-행 폼 테이블) + doc/motivation.png(골드 포인트 스텝퍼)

const SPRING_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

/* ------------------------------------------------------------------ */
/* 선택지 상수                                                         */
/* ------------------------------------------------------------------ */
const INDUSTRY_OPTIONS = [
  "카페/디저트",
  "음식점/외식업",
  "소매/유통",
  "서비스업",
  "제조/가공업",
  "숙박업",
  "교육/학원",
  "기타",
];
const OPERATING_PERIOD_OPTIONS = ["2개월 미만", "2개월~1년", "1~3년", "3~7년", "7년 이상"];
const BIZ_STATUS_OPTIONS = ["정상 영업", "휴업", "폐업(재창업 준비)"];
const EMPLOYEE_OPTIONS = ["없음(혼자)", "1~4명", "5~9명", "10명 이상"];
const REVENUE_ANNUAL_OPTIONS = ["5천만 미만", "5천만~1억", "1억~3억", "3억~10억", "10억 이상"];
const REVENUE_MONTHLY_OPTIONS = ["500만 미만", "500만~1천만", "1천만~3천만", "3천만 이상"];
const TAX_OPTIONS = ["없음", "있음", "잘 모름"];
const TAX_TAIL_OPTIONS = ["받았다", "없다", "모름"];
const OVERDUE_OPTIONS = ["없음", "있었지만 해결", "현재 연체 중", "잘 모름"];
const OVERDUE_TAIL_OPTIONS = [
  "카드값 5영업일 내 지연",
  "이자 1개월 이상 미납",
  "연체 문자·전화 받음",
  "해당 없음",
];
const FUNDING_OPTIONS = ["없음", "전액 상환", "상환 중", "잘 모름"];
const FUNDING_TAIL1_OPTIONS = ["코로나 저금리 대출", "보증재단 보증 대출", "소진공 대출", "시·구청 대출", "없음"];
const FUNDING_TAIL2_OPTIONS = ["다 갚음", "상환 중", "모름"];
const PURPOSE_OPTIONS = ["운영", "시설", "창업", "대환", "잘 모르겠어요"];
const PURPOSE_TAIL_OPTIONS = ["7% 이상", "5~7%", "5% 미만", "모름"];
const AMOUNT_OPTIONS = ["1천만 이하", "1천만~5천만", "5천만~1억", "1억 이상"];
const SIDO_OPTIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

const BIZ_STATUS_ENUM: Record<string, string> = {
  "정상 영업": "ACTIVE",
  "휴업": "SUSPENDED",
  "폐업(재창업 준비)": "CLOSED",
};
const BIZ_STATUS_ENUM_TO_LABEL: Record<string, string> = {
  ACTIVE: "정상 영업",
  SUSPENDED: "휴업",
  CLOSED: "폐업(재창업 준비)",
};

const ANNUAL_BANDS = ["1~3년", "3~7년", "7년 이상"];

/* ------------------------------------------------------------------ */
/* 타입                                                                */
/* ------------------------------------------------------------------ */
type StoreResult = {
  name: string;
  industry: string;
  regionSido: string;
  regionSigungu: string;
  marketRegionCode?: string;
  marketIndustryCode?: string;
};

type BizStatusResp = {
  verified: boolean;
  bizStatus: "ACTIVE" | "SUSPENDED" | "CLOSED";
  industry?: string;
  regionSido?: string;
  regionSigungu?: string;
  marketRegionCode?: string;
  marketIndustryCode?: string;
  operatingPeriodBand?: string;
};

type FormState = {
  userId: number;
  industry: string;
  regionSido: string;
  regionSigungu: string;
  marketRegionCode: string;
  marketIndustryCode: string;
  bizRegNo: string;
  ntsVerified: boolean;
  bizStatus: string; // ACTIVE | SUSPENDED | CLOSED
  operatingPeriod: string;
  employeeBand: string;
  revenueBasis: "ANNUAL" | "MONTHLY";
  monthlyRevenueBand: string; // 연매출/월매출 밴드 문자열 공용
  taxDelinquency: string;
  overdueStatus: string;
  fundingExperience: string;
  fundingPurpose: string[];
  fundingAmountBand: string;
};

const initialForm: FormState = {
  userId: 1,
  industry: "",
  regionSido: "",
  regionSigungu: "",
  marketRegionCode: "",
  marketIndustryCode: "",
  bizRegNo: "",
  ntsVerified: false,
  bizStatus: "",
  operatingPeriod: "",
  employeeBand: "",
  revenueBasis: "MONTHLY",
  monthlyRevenueBand: "",
  taxDelinquency: "",
  overdueStatus: "",
  fundingExperience: "",
  fundingPurpose: [],
  fundingAmountBand: "",
};

/* ------------------------------------------------------------------ */
/* 화면 순서 + 그룹(스텝퍼)                                             */
/* ------------------------------------------------------------------ */
const STEP_GROUPS = [
  { key: "basic", num: "01", label: "기본 정보" },
  { key: "operation", num: "02", label: "운영 현황" },
  { key: "credit", num: "03", label: "신용 정보" },
  { key: "funding", num: "04", label: "자금 계획" },
] as const;

const SCREEN_GROUP: Record<string, (typeof STEP_GROUPS)[number]["key"]> = {
  store: "basic",
  bizreg: "basic",
  operatingPeriod: "basic",
  bizStatus: "basic",
  employee: "operation",
  revenue: "operation",
  tax: "credit",
  overdue: "credit",
  funding: "credit",
  purpose: "funding",
  amount: "funding",
};

/* ------------------------------------------------------------------ */
/* 공용 UI 조각                                                        */
/* ------------------------------------------------------------------ */
function FieldRow({
  label,
  required,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
      <div
        style={{
          flex: "0 0 180px",
          background: C.bgLabel,
          color: C.brown,
          fontWeight: 700,
          padding: "20px 16px",
          display: "flex",
          alignItems: "flex-start",
        }}
      >
        <span>
          {label}
          {required && <span style={{ color: C.danger }}>*</span>}
        </span>
      </div>
      <div style={{ flex: 1, padding: "20px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
        {help && <div style={{ fontSize: 13, color: C.textMuted }}>{help}</div>}
      </div>
    </div>
  );
}

function OptionList({
  options,
  value,
  onChange,
  multiple = false,
}: {
  options: string[];
  value: string | string[];
  onChange: (v: string) => void;
  multiple?: boolean;
}) {
  const selected = (opt: string) => (multiple ? (value as string[]).includes(opt) : value === opt);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const isSel = selected(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              padding: "10px 16px",
              borderRadius: 6,
              border: `1.5px solid ${isSel ? C.goldDark : C.border}`,
              background: isSel ? C.gold : C.white,
              color: isSel ? C.brownDark : C.text,
              fontWeight: isSel ? 700 : 400,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: C.gold,
        color: C.brownDark,
        fontWeight: 700,
        fontSize: 12,
        padding: "4px 10px",
        borderRadius: 999,
      }}
    >
      {children}
    </span>
  );
}

function StepperHeader({ currentGroupKey }: { currentGroupKey: string }) {
  const currentIdx = STEP_GROUPS.findIndex((g) => g.key === currentGroupKey);
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
      {STEP_GROUPS.map((g, i) => {
        const active = i === currentIdx;
        const done = i < currentIdx;
        return (
          <div
            key={g.key}
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 8,
              background: active ? C.brownDark : C.white,
              border: `1px solid ${active ? C.brownDark : C.border}`,
              opacity: done ? 0.6 : 1,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: active ? C.gold : C.goldDark,
                letterSpacing: 1,
              }}
            >
              STEP {g.num}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: active ? C.white : C.brown }}>{g.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel = "다음",
  nextDisabled,
  showBack,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: "12px 22px",
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: C.white,
            color: C.brown,
            cursor: "pointer",
          }}
        >
          이전
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        style={{
          padding: "12px 28px",
          borderRadius: 6,
          border: "none",
          background: nextDisabled ? C.border : C.gold,
          color: C.brownDark,
          fontWeight: 700,
          cursor: nextDisabled ? "not-allowed" : "pointer",
        }}
      >
        {nextLabel}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 메인 컴포넌트                                                        */
/* ------------------------------------------------------------------ */
export default function Onboarding() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 매칭 진행 스텝퍼(이슈 #53) — 온보딩 제출 후 실제 파이프라인(검색→분석→리포트) 진행 단계를 폴링.
  const [matchStage, setMatchStage] = useState<string>("SEARCHING");
  const [matchSettled, setMatchSettled] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  // 화면1: 매장 검색
  const [storeSido, setStoreSido] = useState("");
  const [storeQuery, setStoreQuery] = useState("");
  const [storeResults, setStoreResults] = useState<StoreResult[]>([]);
  const [storeSearching, setStoreSearching] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [storeSearched, setStoreSearched] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreResult | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualIndustry, setManualIndustry] = useState("");
  const [manualIndustryOther, setManualIndustryOther] = useState("");
  const [manualSido, setManualSido] = useState("");
  const [manualSigungu, setManualSigungu] = useState("");

  // 화면2: 사업자등록번호
  const [bizRegNoInput, setBizRegNoInput] = useState("");
  const [bizVerifying, setBizVerifying] = useState(false);
  const [bizVerifyError, setBizVerifyError] = useState<string | null>(null);
  const [bizSkipped, setBizSkipped] = useState(false);

  // 화면5/6/7 꼬리질문
  const [taxTail, setTaxTail] = useState("");
  const [overdueTail, setOverdueTail] = useState("");
  const [fundingTail1, setFundingTail1] = useState("");
  const [fundingTail2, setFundingTail2] = useState("");
  const [purposeTail, setPurposeTail] = useState("");

  const [pensionDefault, setPensionDefault] = useState<string | null>(null);

  const screens = useMemo(() => {
    const s = ["store", "bizreg"];
    if (!form.ntsVerified) s.push("operatingPeriod", "bizStatus");
    s.push("employee", "revenue", "tax", "overdue", "funding", "purpose", "amount");
    return s;
  }, [form.ntsVerified]);

  const [screenIdx, setScreenIdx] = useState(0);
  const screen = screens[Math.min(screenIdx, screens.length - 1)];

  const goNext = () => setScreenIdx((i) => Math.min(i + 1, screens.length - 1));
  const goBack = () => setScreenIdx((i) => Math.max(i - 1, 0));

  const is1YearPlus = ANNUAL_BANDS.includes(form.operatingPeriod);

  useEffect(() => {
    set("revenueBasis", is1YearPlus ? "ANNUAL" : "MONTHLY");
    // 매출 밴드 옵션이 바뀌면 기존 선택값이 유효하지 않을 수 있으므로 초기화
    setForm((f) => {
      const opts = is1YearPlus ? REVENUE_ANNUAL_OPTIONS : REVENUE_MONTHLY_OPTIONS;
      if (f.monthlyRevenueBand && !opts.includes(f.monthlyRevenueBand)) {
        return { ...f, monthlyRevenueBand: "" };
      }
      return f;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is1YearPlus]);

  // 매칭 진행 폴링(이슈 #53) — 제출 성공 후 실제 백엔드 파이프라인 단계를 1.5초마다 확인.
  // 60초 넘게 안 끝나도 무한정 붙잡지 않고 다음 화면으로 넘긴다(완료는 알림 벨이 나중에 알려줌).
  useEffect(() => {
    if (profileId === null) return;
    let cancelled = false;
    const startedAt = Date.now();
    const TIMEOUT_MS = 60_000;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await api<{ stage: string }>(`/api/onboarding/${profileId}/match-status`);
        if (cancelled) return;
        setMatchStage(res.stage);
        if (["DONE", "NO_MATCH", "FAILED"].includes(res.stage)) {
          setTimeout(() => !cancelled && setMatchSettled(true), 700); // 완료 체크 잠깐 보여주고 전환
          return;
        }
      } catch {
        // 폴링 실패는 무시하고 계속 시도 — 다음 화면 전환은 타임아웃이 보장
      }
      if (Date.now() - startedAt >= TIMEOUT_MS) {
        setMatchSettled(true);
        return;
      }
      setTimeout(poll, 1500);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  /* ------------------------- 화면1: 매장 검색 ------------------------- */
  const searchStores = async () => {
    if (!storeQuery.trim()) return;
    if (!storeSido) {
      setStoreError("시/도를 먼저 선택해주세요.");
      return;
    }
    setStoreSearching(true);
    setStoreError(null);
    setStoreSearched(false);
    try {
      // 소진공 상가업소 API는 시/도 단위로만 목록을 주므로(상호명 검색 전용 오퍼레이션 없음)
      // sido는 백엔드가 지역코드로 변환하는 데 필수, query는 그 지역 안에서 상호명 포함검색용.
      const results = await api<StoreResult[]>(
        `/api/onboarding/stores?query=${encodeURIComponent(storeQuery.trim())}&sido=${encodeURIComponent(storeSido)}`
      );
      setStoreResults(results);
    } catch (e) {
      setStoreError(e instanceof Error ? e.message : "매장 검색에 실패했습니다.");
      setStoreResults([]);
    } finally {
      setStoreSearched(true);
      setStoreSearching(false);
    }
  };

  const pickStore = (s: StoreResult) => {
    setSelectedStore(s);
    set("industry", s.industry);
    set("regionSido", s.regionSido);
    set("regionSigungu", s.regionSigungu);
    set("marketRegionCode", s.marketRegionCode ?? "");
    set("marketIndustryCode", s.marketIndustryCode ?? "");
  };

  const confirmManual = () => {
    const industryFinal = manualIndustry === "기타" ? manualIndustryOther.trim() : manualIndustry;
    set("industry", industryFinal);
    set("regionSido", manualSido);
    set("regionSigungu", manualSigungu);
    set("marketRegionCode", "");
    set("marketIndustryCode", "");
  };

  const storeScreenValid = form.ntsVerified
    ? true
    : manualMode
    ? !!(manualIndustry && (manualIndustry !== "기타" || manualIndustryOther.trim()) && manualSido && manualSigungu.trim())
    : !!selectedStore;

  /* ------------------------- 화면2: 사업자등록번호 ------------------------- */
  const verifyBizRegNo = async () => {
    if (!/^\d{10}$/.test(bizRegNoInput)) {
      setBizVerifyError("사업자등록번호는 숫자 10자리로 입력해주세요.");
      return;
    }
    setBizVerifying(true);
    setBizVerifyError(null);
    try {
      const resp = await api<BizStatusResp>(`/api/onboarding/biz-status?bizRegNo=${bizRegNoInput}`);
      if (resp.verified) {
        set("bizRegNo", bizRegNoInput);
        set("ntsVerified", true);
        set("bizStatus", resp.bizStatus);
        if (resp.industry) set("industry", resp.industry);
        if (resp.regionSido) set("regionSido", resp.regionSido);
        if (resp.regionSigungu) set("regionSigungu", resp.regionSigungu);
        if (resp.marketRegionCode) set("marketRegionCode", resp.marketRegionCode);
        if (resp.marketIndustryCode) set("marketIndustryCode", resp.marketIndustryCode);
        if (resp.operatingPeriodBand) set("operatingPeriod", resp.operatingPeriodBand);
        setBizSkipped(false);

        // 국민연금 가입자 수 기본값(참고용) 조회 — 실패해도 진행에 영향 없음
        try {
          const pension = await api<{ employeeBand: string }>(
            `/api/onboarding/pension-default?bizRegNo=${bizRegNoInput}`
          );
          if (pension?.employeeBand) {
            setPensionDefault(pension.employeeBand);
            set("employeeBand", pension.employeeBand);
          }
        } catch {
          // 선택 정보이므로 조용히 무시
        }
      } else {
        setBizVerifyError("국세청 조회 결과를 확인할 수 없습니다. 직접 입력을 진행해주세요.");
        set("ntsVerified", false);
      }
    } catch (e) {
      setBizVerifyError(e instanceof Error ? e.message : "국세청 조회에 실패했습니다. 직접 입력을 진행해주세요.");
      set("ntsVerified", false);
    } finally {
      setBizVerifying(false);
    }
  };

  const skipBizRegNo = () => {
    setBizSkipped(true);
    set("ntsVerified", false);
    set("bizRegNo", "");
  };

  /* ------------------------- 제출 ------------------------- */
  const canSubmit =
    form.employeeBand &&
    form.monthlyRevenueBand &&
    form.taxDelinquency &&
    form.overdueStatus &&
    form.fundingExperience &&
    form.fundingPurpose.length > 0 &&
    form.fundingAmountBand;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        userId: form.userId,
        industry: form.industry,
        regionSido: form.regionSido,
        regionSigungu: form.regionSigungu,
        marketRegionCode: form.marketRegionCode,
        marketIndustryCode: form.marketIndustryCode,
        bizRegNo: form.bizRegNo,
        ntsVerified: form.ntsVerified,
        bizStatus: form.bizStatus,
        operatingPeriod: form.operatingPeriod,
        employeeBand: form.employeeBand,
        revenueBasis: form.revenueBasis,
        monthlyRevenueBand: form.monthlyRevenueBand,
        taxDelinquency: form.taxDelinquency,
        overdueStatus: form.overdueStatus,
        fundingExperience: form.fundingExperience,
        fundingPurpose: form.fundingPurpose,
        fundingAmountBand: form.fundingAmountBand,
      };
      const saved = await api<{ id: number }>("/api/onboarding", { method: "POST", body: JSON.stringify(body) });
      saveProfileId(saved.id);
      setProfileId(saved.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const connectKakao = () => {
    window.location.href = `${SPRING_BASE}/api/kakao/oauth/authorize?profileId=${profileId}`;
  };

  /* ------------------------- 매칭 진행 스텝퍼 화면 (이슈 #53) ------------------------- */
  if (profileId !== null && !matchSettled) {
    const STAGE_ORDER = ["SEARCHING", "ANALYZING", "GENERATING"];
    const currentIdx = ["DONE", "NO_MATCH", "FAILED"].includes(matchStage)
      ? STAGE_ORDER.length
      : STAGE_ORDER.indexOf(matchStage);
    const STEPS = [
      { label: "정책자금 검색 중", desc: "키워드(BM25) + 의미 기반(벡터) 하이브리드 검색" },
      { label: "AI 적합성 분석 중", desc: "Claude Sonnet이 프로필과 공고를 비교 분석" },
      { label: "맞춤 리포트 작성 중", desc: "사장님 상황에 맞는 리포트 작성" },
    ];
    return (
      <main style={{ maxWidth: 480, margin: "100px auto", padding: 24, textAlign: "center" }}>
        <h1 style={{ color: C.brownDark, fontSize: 20 }}>정책자금을 찾고 있어요</h1>
        <p style={{ color: C.textMuted, fontSize: 13, marginBottom: 32 }}>
          잠시만 기다려 주세요. 사장님께 맞는 공고를 실제로 살펴보는 중이에요.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
          {STEPS.map((step, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div
                key={step.label}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 8,
                  border: `1px solid ${active ? C.goldDark : C.border}`,
                  background: active ? C.bgLabel : C.white,
                  opacity: done || active ? 1 : 0.5,
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>
                  {done ? "✅" : active ? "⏳" : "⚪"}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.brownDark }}>{step.label}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{step.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    );
  }

  /* ------------------------- 완료 화면 ------------------------- */
  if (profileId !== null) {
    return (
      <main style={{ maxWidth: 560, margin: "80px auto", padding: 24, textAlign: "center" }}>
        <h1 style={{ color: C.brownDark }}>등록 완료</h1>
        <p style={{ color: C.text }}>카카오톡으로 맞춤 알림을 받아보시겠어요? (선택)</p>
        <button
          onClick={connectKakao}
          style={{
            padding: "12px 28px",
            borderRadius: 6,
            border: "none",
            background: C.gold,
            color: C.brownDark,
            fontWeight: 700,
            cursor: "pointer",
            marginTop: 12,
          }}
        >
          카카오톡으로 알림 받기
        </button>
        <p style={{ margin: "16px 0" }}>
          <a
            href="#"
            style={{ color: C.textMuted }}
            onClick={(e) => {
              e.preventDefault();
              router.push("/");
            }}
          >
            건너뛰기
          </a>
        </p>
      </main>
    );
  }

  /* ------------------------- 화면 렌더 ------------------------- */
  const bizBadge = form.ntsVerified && <Badge>국세청 확인 ✓</Badge>;

  let body: React.ReactNode = null;
  let nextDisabled = false;
  let onNext = goNext;
  let nextLabel = "다음";

  if (screen === "store") {
    nextDisabled = !storeScreenValid;
    onNext = () => {
      if (!manualMode && selectedStore) {
        goNext();
        return;
      }
      if (manualMode) {
        confirmManual();
        goNext();
        return;
      }
      goNext();
    };
    body = (
      <>
        <FieldRow label="사장님 가게를 찾아볼게요" required>
          {!manualMode ? (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select
                  value={storeSido}
                  onChange={(e) => {
                    setStoreSido(e.target.value);
                    setStoreSearched(false);
                    setStoreResults([]);
                  }}
                  style={{ padding: 10, borderRadius: 6, border: `1px solid ${C.border}` }}
                >
                  <option value="">시/도 선택</option>
                  {SIDO_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="매장 이름 검색"
                  value={storeQuery}
                  onChange={(e) => {
                    setStoreQuery(e.target.value);
                    setStoreSearched(false);
                    setStoreResults([]);
                  }}
                  style={{ padding: 10, borderRadius: 6, border: `1px solid ${C.border}`, flex: 1, minWidth: 160 }}
                />
                <button
                  type="button"
                  onClick={searchStores}
                  disabled={storeSearching}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 6,
                    border: "none",
                    background: C.gold,
                    color: C.brownDark,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {storeSearching ? "검색 중..." : "검색"}
                </button>
              </div>
              {storeError && <div style={{ color: C.danger, fontSize: 13 }}>{storeError}</div>}
              {storeSearching && (
                <div style={{ marginTop: 8, fontSize: 13, color: C.textMuted }}>
                  검색 중입니다... (공공데이터포털 응답 대기 중이라 몇 초 걸릴 수 있어요)
                </div>
              )}
              {!storeSearching && storeSearched && !storeError && storeResults.length === 0 && (
                <div style={{ marginTop: 8, fontSize: 13, color: C.textMuted }}>
                  검색 결과가 없습니다. 아래 &quot;직접 입력하기&quot;로 등록해주세요.
                </div>
              )}
              {storeResults.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {storeResults.map((s, i) => (
                    <button
                      key={`${s.name}-${i}`}
                      type="button"
                      onClick={() => pickStore(s)}
                      style={{
                        textAlign: "left",
                        padding: 12,
                        borderRadius: 6,
                        border: `1.5px solid ${selectedStore === s ? C.goldDark : C.border}`,
                        background: selectedStore === s ? C.bgLabel : C.white,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: C.text }}>{s.name}</div>
                      <div style={{ fontSize: 13, color: C.textMuted }}>
                        {s.industry} · {s.regionSido} {s.regionSigungu}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <a
                  href="#"
                  style={{ color: C.brown, fontSize: 13 }}
                  onClick={(e) => {
                    e.preventDefault();
                    setManualMode(true);
                  }}
                >
                  검색에 내 가게가 없어요 → 직접 입력하기
                </a>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 4 }}>업종을 선택해주세요</div>
              <OptionList options={INDUSTRY_OPTIONS} value={manualIndustry} onChange={setManualIndustry} />
              {manualIndustry === "기타" && (
                <input
                  placeholder="업종을 직접 입력해주세요"
                  value={manualIndustryOther}
                  onChange={(e) => setManualIndustryOther(e.target.value)}
                  style={{ padding: 10, borderRadius: 6, border: `1px solid ${C.border}`, marginTop: 6 }}
                />
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <select
                  value={manualSido}
                  onChange={(e) => setManualSido(e.target.value)}
                  style={{ padding: 10, borderRadius: 6, border: `1px solid ${C.border}` }}
                >
                  <option value="">시/도</option>
                  {SIDO_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="시/군/구"
                  value={manualSigungu}
                  onChange={(e) => setManualSigungu(e.target.value)}
                  style={{ padding: 10, borderRadius: 6, border: `1px solid ${C.border}`, flex: 1 }}
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <a
                  href="#"
                  style={{ color: C.brown, fontSize: 13 }}
                  onClick={(e) => {
                    e.preventDefault();
                    setManualMode(false);
                  }}
                >
                  ← 매장 검색으로 돌아가기
                </a>
              </div>
            </>
          )}
        </FieldRow>
      </>
    );
  } else if (screen === "bizreg") {
    nextDisabled = false;
    onNext = () => {
      if (!form.ntsVerified) skipBizRegNo();
      goNext();
    };
    body = (
      <FieldRow label="사업자등록번호를 입력해주세요" help="선택 입력입니다. 건너뛰어도 다음 질문으로 진행돼요.">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="숫자 10자리"
            maxLength={10}
            value={bizRegNoInput}
            onChange={(e) => setBizRegNoInput(e.target.value.replace(/\D/g, ""))}
            disabled={form.ntsVerified}
            style={{ padding: 10, borderRadius: 6, border: `1px solid ${C.border}`, width: 160 }}
          />
          {!form.ntsVerified && (
            <button
              type="button"
              onClick={verifyBizRegNo}
              disabled={bizVerifying}
              style={{
                padding: "10px 16px",
                borderRadius: 6,
                border: "none",
                background: C.gold,
                color: C.brownDark,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {bizVerifying ? "조회 중..." : "조회"}
            </button>
          )}
          {bizBadge}
        </div>
        {bizVerifyError && <div style={{ color: C.danger, fontSize: 13 }}>{bizVerifyError}</div>}
        {!form.ntsVerified && (
          <div style={{ marginTop: 4 }}>
            <a
              href="#"
              style={{ color: C.brown, fontSize: 13 }}
              onClick={(e) => {
                e.preventDefault();
                skipBizRegNo();
                goNext();
              }}
            >
              건너뛰기
            </a>
          </div>
        )}
      </FieldRow>
    );
  } else if (screen === "operatingPeriod") {
    nextDisabled = !form.operatingPeriod;
    body = (
      <FieldRow label="사업 시작한 지 얼마나 되셨나요?" required>
        <OptionList options={OPERATING_PERIOD_OPTIONS} value={form.operatingPeriod} onChange={(v) => set("operatingPeriod", v)} />
      </FieldRow>
    );
  } else if (screen === "bizStatus") {
    nextDisabled = !form.bizStatus;
    onNext = () => {
      goNext();
    };
    body = (
      <FieldRow label="현재 영업 상태는?" required>
        <OptionList
          options={BIZ_STATUS_OPTIONS}
          value={BIZ_STATUS_ENUM_TO_LABEL[form.bizStatus] ?? ""}
          onChange={(v) => set("bizStatus", BIZ_STATUS_ENUM[v])}
        />
      </FieldRow>
    );
  } else if (screen === "employee") {
    nextDisabled = !form.employeeBand;
    body = (
      <FieldRow
        label="직원은 몇 명인가요? (알바 포함)"
        required
        help={
          pensionDefault
            ? `국민연금 가입 정보 기준 기본값(${pensionDefault})을 채워뒀어요. 다르면 직접 바꿔주세요. 가족 종사자, 주 15시간 미만 알바도 포함해서 세어주세요.`
            : "가족 종사자, 주 15시간 미만 알바도 포함해서 세어주세요."
        }
      >
        <OptionList options={EMPLOYEE_OPTIONS} value={form.employeeBand} onChange={(v) => set("employeeBand", v)} />
      </FieldRow>
    );
  } else if (screen === "revenue") {
    nextDisabled = !form.monthlyRevenueBand;
    const opts = is1YearPlus ? REVENUE_ANNUAL_OPTIONS : REVENUE_MONTHLY_OPTIONS;
    const label = is1YearPlus ? "작년 연 매출은 어느 정도인가요?" : "최근 한 달 평균 매출은 어느 정도인가요?";
    body = (
      <FieldRow label={label} required>
        <OptionList options={opts} value={form.monthlyRevenueBand} onChange={(v) => set("monthlyRevenueBand", v)} />
      </FieldRow>
    );
  } else if (screen === "tax") {
    nextDisabled = !form.taxDelinquency || (form.taxDelinquency === "잘 모름" && !taxTail);
    body = (
      <>
        <FieldRow label="세금 체납이 있으신가요?" required>
          <OptionList
            options={TAX_OPTIONS}
            value={form.taxDelinquency}
            onChange={(v) => {
              set("taxDelinquency", v);
              if (v !== "잘 모름") setTaxTail("");
            }}
          />
        </FieldRow>
        {form.taxDelinquency === "잘 모름" && (
          <FieldRow label="세무서·시청 납부 독촉장을 받은 적 있나요?" required>
            <OptionList options={TAX_TAIL_OPTIONS} value={taxTail} onChange={setTaxTail} />
          </FieldRow>
        )}
      </>
    );
  } else if (screen === "overdue") {
    nextDisabled = !form.overdueStatus || (form.overdueStatus === "잘 모름" && !overdueTail);
    body = (
      <>
        <FieldRow label="최근 대출·카드 연체가 있었나요?" required>
          <OptionList
            options={OVERDUE_OPTIONS}
            value={form.overdueStatus}
            onChange={(v) => {
              set("overdueStatus", v);
              if (v !== "잘 모름") setOverdueTail("");
            }}
          />
        </FieldRow>
        {form.overdueStatus === "잘 모름" && (
          <FieldRow label="최근 3개월 안에 이런 일이 있었나요?" required>
            <OptionList options={OVERDUE_TAIL_OPTIONS} value={overdueTail} onChange={setOverdueTail} />
          </FieldRow>
        )}
      </>
    );
  } else if (screen === "funding") {
    const showTail1 = form.fundingExperience === "없음" || form.fundingExperience === "잘 모름";
    const showTail2 = Boolean(showTail1 && fundingTail1 && fundingTail1 !== "없음");
    nextDisabled =
      !form.fundingExperience || (showTail1 && !fundingTail1) || (showTail2 && !fundingTail2);
    body = (
      <>
        <FieldRow label="정책자금을 받은 적이 있나요?" required>
          <OptionList
            options={FUNDING_OPTIONS}
            value={form.fundingExperience}
            onChange={(v) => {
              set("fundingExperience", v);
              if (v !== "없음" && v !== "잘 모름") {
                setFundingTail1("");
                setFundingTail2("");
              }
            }}
          />
        </FieldRow>
        {showTail1 && (
          <FieldRow label="이것도 정책자금이에요, 받아보신 적 없나요?" required>
            <OptionList
              options={FUNDING_TAIL1_OPTIONS}
              value={fundingTail1}
              onChange={(v) => {
                setFundingTail1(v);
                if (v === "없음") setFundingTail2("");
              }}
            />
          </FieldRow>
        )}
        {showTail2 && (
          <FieldRow label="지금도 갚고 계신가요?" required>
            <OptionList options={FUNDING_TAIL2_OPTIONS} value={fundingTail2} onChange={setFundingTail2} />
          </FieldRow>
        )}
      </>
    );
  } else if (screen === "purpose") {
    const showTail = form.fundingPurpose.includes("대환");
    nextDisabled = form.fundingPurpose.length === 0 || (showTail && !purposeTail);
    const togglePurpose = (v: string) =>
      setForm((f) => ({
        ...f,
        fundingPurpose: f.fundingPurpose.includes(v)
          ? f.fundingPurpose.filter((x) => x !== v)
          : [...f.fundingPurpose, v],
      }));
    body = (
      <>
        <FieldRow label="자금이 왜 필요하신가요? (모두 선택)" required>
          <OptionList options={PURPOSE_OPTIONS} value={form.fundingPurpose} onChange={togglePurpose} multiple />
        </FieldRow>
        {showTail && (
          <FieldRow label="지금 대출 금리가 대략 몇 %인가요?" required>
            <OptionList options={PURPOSE_TAIL_OPTIONS} value={purposeTail} onChange={setPurposeTail} />
          </FieldRow>
        )}
      </>
    );
  } else if (screen === "amount") {
    nextDisabled = !form.fundingAmountBand;
    nextLabel = submitting ? "제출 중..." : "제출";
    onNext = () => {
      if (form.fundingAmountBand) submit();
    };
    body = (
      <FieldRow label="얼마나 필요하신가요?" required>
        <OptionList options={AMOUNT_OPTIONS} value={form.fundingAmountBand} onChange={(v) => set("fundingAmountBand", v)} />
      </FieldRow>
    );
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 24, background: C.bgPage }}>
      <h1 style={{ color: C.brownDark, fontSize: 24, marginBottom: 4 }}>온보딩</h1>
      <p style={{ color: C.textMuted, marginTop: 0, marginBottom: 24 }}>
        몇 가지만 알려주시면 맞춤 정책자금을 찾아드릴게요.
      </p>
      <StepperHeader currentGroupKey={SCREEN_GROUP[screen]} />
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {body}
      </div>
      {error && <p style={{ color: C.danger }}>{error}</p>}
      <NavButtons
        onBack={goBack}
        onNext={onNext}
        nextDisabled={nextDisabled || submitting}
        nextLabel={nextLabel}
        showBack={screenIdx > 0}
      />
    </main>
  );
}
