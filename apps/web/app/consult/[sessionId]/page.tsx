"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { C } from "@/lib/theme";
import { LoadingIndicator } from "../LoadingIndicator";

type Question = { id: string; question: string; type: "choice" | "text"; options?: string[] };
type SpecializeResp = { sessionId: number; reportId?: number; status: string; message?: string };

/**
 * 갭 구간 — 진단 리포트(읽을거리) + 검증 재질문(능동 답변).
 * 답변 제출 시 콜2가 돌고(Wait B), 끝나면 리포트로 이동한다.
 */
export default function ConsultSessionPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [diagnosis, setDiagnosis] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0); // 몇 번째 재질문을 보고 있는지 — 위저드 진행 지점
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 진단 본문·재질문은 sessionStorage로 넘겨받는다 (콜1 응답을 그대로 재사용 — 재조회 불필요).
  useEffect(() => {
    const cached = sessionStorage.getItem(`consult:${sessionId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      setDiagnosis(parsed.diagnosis ?? "");
      setQuestions(parsed.followUpQuestions ?? []);
    }
    setStep(0);
    setAnswers({});
  }, [sessionId]);

  const submit = async (skip: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = skip
        ? null
        : questions.map((q) => ({ id: q.id, question: q.question, value: answers[q.id] ?? "" }));
      const resp = await api<SpecializeResp>("/api/consult/specialize", {
        method: "POST",
        body: JSON.stringify({ sessionId: Number(sessionId), answers: payload }),
      });
      if (resp.status === "ERROR") {
        setError(resp.message ?? "리포트 생성에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      router.push(resp.reportId ? `/reports/${resp.reportId}` : "/reports");
    } catch {
      setError("리포트 생성에 실패했습니다.");
      setSubmitting(false);
    }
  };

  // Wait B — 콜2 생성 중. 방금 읽은 진단을 계속 보여줘 대기가 비어 보이지 않게 한다.
  if (submitting) {
    return (
      <main style={{ background: C.bgPage, minHeight: "100vh", padding: "48px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ marginBottom: 28 }}>
            <LoadingIndicator />
          </div>
          <h1 style={{ color: C.brownDark, fontSize: 24, fontWeight: 800, margin: "0 0 12px" }}>
            이 조건에 딱 맞는 정책자금을 찾는 중이에요
          </h1>
          <p style={{ color: C.textMuted, fontSize: 15, lineHeight: 1.7, margin: "0 0 32px" }}>
            사장님이 답해주신 내용까지 반영해서 공고를 고르고 있어요.
          </p>
          <div style={{ background: C.white, borderRadius: 16, padding: 28,
                        border: `1px solid ${C.border}` }}>
            <p style={{ color: C.textMuted, fontSize: 13, fontWeight: 800, margin: "0 0 10px" }}>
              방금 확인한 진단
            </p>
            <p style={{ color: C.text, fontSize: 15, lineHeight: 1.8, margin: 0,
                        whiteSpace: "pre-wrap" }}>
              {diagnosis}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ background: C.bgPage, minHeight: "100vh", padding: "48px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ color: C.brownDark, fontSize: 28, fontWeight: 800, margin: "0 0 20px" }}>
          사장님 경영 진단
        </h1>
        <div style={{ background: C.white, borderRadius: 16, padding: 28,
                      border: `1px solid ${C.border}`, marginBottom: 40 }}>
          <p style={{ color: C.text, fontSize: 16, lineHeight: 1.9, margin: 0,
                      whiteSpace: "pre-wrap" }}>
            {diagnosis}
          </p>
        </div>

        {questions.length > 0 && (() => {
          const current = questions[step];
          const isLast = step === questions.length - 1;
          const answered = (q: Question) => !!(answers[q.id] ?? "").trim();
          const canAdvance = current.type === "text" || answered(current);

          return (
            <>
              <h2 style={{ color: C.brownDark, fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>
                몇 가지만 더 확인할게요
              </h2>
              <p style={{ color: C.textMuted, fontSize: 14, margin: "0 0 24px" }}>
                답해주시면 더 정확한 정책자금을 찾아드릴 수 있어요.
              </p>

              {/* 하네스 배선 도식 느낌의 스텝 인디케이터 — 커넥터(네모)를 연결선으로 잇고,
                  답변을 마칠 때마다 그 커넥터와 다음 구간까지 채워진다. */}
              <style>{`
                @keyframes step-fill { from { background-position: 100% 0; } to { background-position: 0 0; } }
                @keyframes card-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
              `}</style>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
                {questions.map((q, i) => (
                  <div key={q.id} style={{ display: "flex", alignItems: "center", flex: i < questions.length - 1 ? 1 : "0 0 auto" }}>
                    <div
                      style={{
                        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, fontWeight: 800,
                        border: `2px solid ${i <= step ? C.gold : C.border}`,
                        background: i < step ? C.gold : i === step ? C.white : C.bgPage,
                        color: i < step ? C.brownDark : i === step ? C.goldDark : C.textMuted,
                        boxShadow: i === step ? `0 0 0 4px ${C.bgLabel}` : "none",
                        transition: "all 0.35s ease",
                      }}
                    >
                      {i < step ? "✓" : i + 1}
                    </div>
                    {i < questions.length - 1 && (
                      <div
                        style={{
                          flex: 1, height: 3, margin: "0 4px", borderRadius: 999,
                          background: i < step
                            ? C.gold
                            : `repeating-linear-gradient(90deg, ${C.border} 0 6px, transparent 6px 12px)`,
                          backgroundSize: "200% 100%",
                          animation: i < step ? "step-fill 0.4s ease" : "none",
                          transition: "background 0.35s ease",
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div key={current.id} style={{ animation: "card-in 0.3s ease" }}>
                <div style={{ background: C.white, borderRadius: 16, padding: 28,
                              border: `1px solid ${C.border}` }}>
                  <p style={{ color: C.goldDark, fontSize: 12, fontWeight: 800, margin: "0 0 10px",
                              letterSpacing: 0.5 }}>
                    {`질문 ${step + 1} / ${questions.length}`}
                  </p>
                  <p style={{ color: C.brownDark, fontSize: 17, fontWeight: 700, margin: "0 0 18px" }}>
                    {current.question}
                  </p>
                  {current.type === "choice" ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(current.options ?? []).map((opt) => {
                        const selected = answers[current.id] === opt;
                        return (
                          <button
                            key={opt}
                            onClick={() => setAnswers((prev) => ({ ...prev, [current.id]: opt }))}
                            style={{
                              padding: "10px 18px", borderRadius: 999, fontSize: 14,
                              cursor: "pointer",
                              border: `1px solid ${selected ? C.goldDark : C.border}`,
                              background: selected ? C.gold : C.white,
                              color: selected ? C.brownDark : C.text,
                              fontWeight: selected ? 800 : 500,
                            }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={answers[current.id] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [current.id]: e.target.value }))}
                      rows={3}
                      placeholder="편하게 적어주세요 (건너뛰어도 괜찮아요)"
                      style={{ width: "100%", padding: 14, borderRadius: 10, fontSize: 14,
                               border: `1px solid ${C.border}`, resize: "vertical" }}
                    />
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
                {step > 0 && (
                  <button
                    onClick={() => setStep((s) => s - 1)}
                    style={{ padding: "15px 20px", borderRadius: 10, background: C.white,
                             border: `1px solid ${C.border}`, color: C.text, fontSize: 15,
                             cursor: "pointer" }}
                  >
                    이전
                  </button>
                )}
                <button
                  onClick={() => (isLast ? submit(false) : setStep((s) => s + 1))}
                  disabled={!canAdvance}
                  style={{
                    flex: 1, padding: "15px 0", borderRadius: 10, border: "none",
                    background: canAdvance ? C.gold : C.border,
                    color: canAdvance ? C.brownDark : C.textMuted,
                    fontWeight: 800, fontSize: 15,
                    cursor: canAdvance ? "pointer" : "not-allowed",
                  }}
                >
                  {isLast ? "답변 완료, 정책자금 찾기" : "다음"}
                </button>
                <button
                  onClick={() => submit(true)}
                  style={{ padding: "15px 20px", borderRadius: 10, background: C.white,
                           border: `1px solid ${C.border}`, color: C.textMuted, fontSize: 15,
                           cursor: "pointer" }}
                >
                  건너뛰기
                </button>
              </div>
            </>
          );
        })()}

        {questions.length === 0 && (
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button
              onClick={() => submit(true)}
              style={{ flex: 1, padding: "15px 0", borderRadius: 10, border: "none",
                       background: C.gold, color: C.brownDark, fontWeight: 800, fontSize: 15,
                       cursor: "pointer" }}
            >
              정책자금 찾기
            </button>
          </div>
        )}

        {error && <p style={{ color: C.danger, fontSize: 14, marginTop: 20 }}>{error}</p>}
      </div>
    </main>
  );
}
