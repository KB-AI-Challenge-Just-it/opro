"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { C } from "@/lib/theme";
import { LoadingIndicator } from "../LoadingIndicator";

type DiagnoseResp = {
  sessionId: number;
  status: string;
  message?: string;
  diagnosis?: string;
  followUpQuestions?: { id: string; question: string; type: "choice" | "text"; options?: string[] }[];
};

/**
 * useSearchParams()는 정적 프리렌더 시 Suspense 경계가 필요하다(App Router 요구사항) —
 * 동적 세그먼트가 없는 이 경로는 빌드 시 정적 생성을 시도하기 때문에 래핑이 필수다.
 */
export default function LoadingDiagnosisPage() {
  return (
    <Suspense fallback={<LoadingDiagnosisFallback />}>
      <LoadingDiagnosisInner />
    </Suspense>
  );
}

function LoadingDiagnosisFallback() {
  return (
    <main style={{ background: C.bgPage, minHeight: "100vh", display: "flex",
                   alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ marginBottom: 28 }}>
          <LoadingIndicator />
        </div>
        <h1 style={{ color: C.brownDark, fontSize: 24, fontWeight: 800, margin: "0 0 12px" }}>
          사장님 상권과 경영 상태를 분석 중이에요
        </h1>
        <p style={{ color: C.textMuted, fontSize: 15, lineHeight: 1.7, margin: 0 }}>
          상권 데이터와 금리 흐름까지 함께 살펴보고 있어요. 잠시만 기다려주세요.
        </p>
      </div>
    </main>
  );
}

/** Wait A — 콜1(진단) 생성 중. 완료되면 /consult/<sessionId>로 이동한다. */
function LoadingDiagnosisInner() {
  const router = useRouter();
  const params = useSearchParams();
  const profileId = params.get("profileId");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await api<DiagnoseResp>("/api/consult/diagnose", {
          method: "POST",
          body: JSON.stringify({ profileId: Number(profileId) }),
        });
        if (cancelled) return;
        if (resp.status === "ERROR") {
          setError(resp.message ?? "진단 생성에 실패했습니다.");
          return;
        }
        sessionStorage.setItem(`consult:${resp.sessionId}`, JSON.stringify(resp));
        router.replace(`/consult/${resp.sessionId}`);
      } catch {
        if (!cancelled) setError("진단 생성에 실패했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, router]);

  return (
    <main style={{ background: C.bgPage, minHeight: "100vh", display: "flex",
                   alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        {!error && (
          <div style={{ marginBottom: 28 }}>
            <LoadingIndicator />
          </div>
        )}
        <h1 style={{ color: C.brownDark, fontSize: 24, fontWeight: 800, margin: "0 0 12px" }}>
          {error ? "다시 시도해주세요" : "사장님 상권과 경영 상태를 분석 중이에요"}
        </h1>
        <p style={{ color: C.textMuted, fontSize: 15, lineHeight: 1.7, margin: 0 }}>
          {error ?? "상권 데이터와 금리 흐름까지 함께 살펴보고 있어요. 잠시만 기다려주세요."}
        </p>
      </div>
    </main>
  );
}
