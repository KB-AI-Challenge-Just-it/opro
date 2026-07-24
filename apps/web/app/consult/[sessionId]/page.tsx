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

        {questions.length > 0 && (
          <>
            <h2 style={{ color: C.brownDark, fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>
              몇 가지만 더 확인할게요
            </h2>
            <p style={{ color: C.textMuted, fontSize: 14, margin: "0 0 24px" }}>
              답해주시면 더 정확한 정책자금을 찾아드릴 수 있어요.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {questions.map((q) => (
                <div key={q.id}>
                  <p style={{ color: C.brownDark, fontSize: 16, fontWeight: 700,
                              margin: "0 0 12px" }}>
                    {q.question}
                  </p>
                  {q.type === "choice" ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(q.options ?? []).map((opt) => {
                        const selected = answers[q.id] === opt;
                        return (
                          <button
                            key={opt}
                            onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
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
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      rows={3}
                      placeholder="편하게 적어주세요"
                      style={{ width: "100%", padding: 14, borderRadius: 10, fontSize: 14,
                               border: `1px solid ${C.border}`, resize: "vertical" }}
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {error && <p style={{ color: C.danger, fontSize: 14, marginTop: 20 }}>{error}</p>}

        <div style={{ display: "flex", gap: 12, marginTop: 40 }}>
          <button
            onClick={() => submit(false)}
            style={{ flex: 1, padding: "15px 0", borderRadius: 10, border: "none",
                     background: C.gold, color: C.brownDark, fontWeight: 800, fontSize: 15,
                     cursor: "pointer" }}
          >
            답변하고 정책자금 찾기
          </button>
          <button
            onClick={() => submit(true)}
            style={{ padding: "15px 24px", borderRadius: 10, background: C.white,
                     border: `1px solid ${C.border}`, color: C.textMuted, fontSize: 15,
                     cursor: "pointer" }}
          >
            건너뛰기
          </button>
        </div>
      </div>
    </main>
  );
}
