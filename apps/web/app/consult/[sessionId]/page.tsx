"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { C } from "@/lib/theme";
import { LoadingIndicator } from "../LoadingIndicator";

type Question = { id: string; question: string; type: "choice" | "text"; options?: string[] };
type SpecializeResp = { sessionId: number; reportId?: number; status: string; message?: string };

const SPRING_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

// 리포트를 만드는 동안(Wait B) 어차피 동기적으로 기다려야 하는 시간을 활용해 카카오 알림
// 동의를 물어본다 — 이 서비스에서 카카오 알림을 물어보는 지점은 여기 하나뿐이다(다른 화면의
// 테스트 발송 버튼들은 정리했다). 이미 연동돼 있으면 묻지 않는다.
function KakaoAskModal({
  pending,
  onAccept,
  onDecline,
}: {
  pending: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,33,24,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        style={{
          background: C.white,
          borderRadius: 16,
          padding: "28px 28px 24px",
          maxWidth: 380,
          width: "100%",
          boxShadow: "0 24px 60px rgba(43,33,24,0.25)",
        }}
      >
        <h3 style={{ margin: "0 0 8px", color: C.brownDark, fontSize: 17, fontWeight: 800 }}>
          카카오톡으로도 알려드릴까요?
        </h3>
        <p style={{ margin: "0 0 22px", color: C.textMuted, fontSize: 13.5, lineHeight: 1.6 }}>
          지금 찾고 있는 정책자금이 준비되면 카카오톡 "나에게 보내기"로도 알려드려요. 받기를
          누르면 팝업 창에서 카카오 로그인·동의만 하시면 되고, 그동안 결과도 함께 준비돼요.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onDecline}
            disabled={pending}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.white,
              color: C.textMuted,
              fontWeight: 700,
              fontSize: 13.5,
              cursor: "pointer",
            }}
          >
            안받기
          </button>
          <button
            onClick={onAccept}
            disabled={pending}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              border: "none",
              background: C.gold,
              color: C.brownDark,
              fontWeight: 800,
              fontSize: 13.5,
              cursor: pending ? "default" : "pointer",
            }}
          >
            {pending ? "연동 중..." : "받기"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 갭 구간 — 진단 리포트(읽을거리) + 검증 재질문(능동 답변).
 * 답변 제출 시 콜2가 돌고(Wait B), 끝나면 리포트로 이동한다. Wait B 동안 카카오 알림
 * 동의를 한 번 물어보고, 그 결정이 끝난 뒤에야 실제 콜2(specialize)를 호출한다.
 */
export default function ConsultSessionPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [diagnosis, setDiagnosis] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0); // 몇 번째 재질문을 보고 있는지 — 위저드 진행 지점
  const [submitting, setSubmitting] = useState(false);
  const [noMatch, setNoMatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noMatch, setNoMatch] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [kakaoConnected, setKakaoConnected] = useState<boolean | null>(null);
  const [kakaoPending, setKakaoPending] = useState(false);
  const [showKakaoAsk, setShowKakaoAsk] = useState(false);
  const pendingSkipRef = useRef(false);
  const specializeFiredRef = useRef(false);
  const popupPollRef = useRef<number | null>(null);

  // 진단 본문·재질문·profileId는 sessionStorage로 넘겨받는다 (콜1 응답을 그대로 재사용 — 재조회 불필요).
  useEffect(() => {
    const cached = sessionStorage.getItem(`consult:${sessionId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      setDiagnosis(parsed.diagnosis ?? "");
      setQuestions(parsed.followUpQuestions ?? []);
      if (parsed.profileId) {
        setProfileId(String(parsed.profileId));
        api<{ connected: boolean }>(`/api/kakao/oauth/status?profileId=${parsed.profileId}`)
          .then((r) => setKakaoConnected(r.connected))
          .catch(() => setKakaoConnected(null)); // 조회 실패 시 묻지 않고 그냥 진행(fail-open)
      }
    }
    setStep(0);
    setAnswers({});
    setNoMatch(false);
  }, [sessionId]);

  const doSpecialize = async (skip: boolean) => {
    if (specializeFiredRef.current) return;
    specializeFiredRef.current = true;
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
        specializeFiredRef.current = false;
        return;
      }
      if (resp.status === "NO_MATCH") {
        setNoMatch(true);
        setSubmitting(false);
        specializeFiredRef.current = false;
        return;
      }
      if (resp.status === "COMPLETED" && resp.reportId != null) {
        router.push(`/reports/${resp.reportId}`);
        return;
      }
      setError(
        resp.status === "COMPLETED"
          ? "리포트 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요."
          : "예상하지 못한 응답을 받았습니다. 잠시 후 다시 시도해주세요."
      );
      setSubmitting(false);
      specializeFiredRef.current = false;
    } catch {
      setError("리포트 생성에 실패했습니다.");
      setSubmitting(false);
      specializeFiredRef.current = false;
    }
  };

  const submit = (skip: boolean) => {
    setSubmitting(true);
    pendingSkipRef.current = skip;
    // 이미 연동돼 있거나 상태를 몰라도(fail-open) 묻지 않고 곧장 진행 — 연동 안 됐을 때만 묻는다.
    if (kakaoConnected === false) {
      setShowKakaoAsk(true);
    } else {
      doSpecialize(skip);
    }
  };

  const declineKakao = () => {
    setShowKakaoAsk(false);
    doSpecialize(pendingSkipRef.current);
  };

  const acceptKakao = () => {
    if (!profileId) {
      declineKakao();
      return;
    }
    setKakaoPending(true);
    const url = `${SPRING_BASE}/api/kakao/oauth/authorize?profileId=${profileId}`;
    const popup = window.open(url, "kakao-oauth", "width=480,height=640");
    if (!popup) {
      // 팝업 차단 시 폴백 — 현재 창을 그대로 이동시킨다.
      window.location.href = url;
      return;
    }
    popup.focus();
    popupPollRef.current = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(popupPollRef.current!);
      popupPollRef.current = null;
      setKakaoPending(false);
      setShowKakaoAsk(false);
      doSpecialize(pendingSkipRef.current);
    }, 500);
  };

  // 팝업(window.open)에서 OAuth를 마치면 page.tsx(홈, 콜백 도착지)가 postMessage로 결과를 보낸다.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.data?.type !== "kakao-oauth-result") return;
      if (popupPollRef.current) {
        window.clearInterval(popupPollRef.current);
        popupPollRef.current = null;
      }
      setKakaoConnected(e.data.status === "connected");
      setKakaoPending(false);
      setShowKakaoAsk(false);
      doSpecialize(pendingSkipRef.current);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, answers, sessionId]);

  // Wait B — 콜2 생성 중(혹은 그 직전 카카오 동의 질문). 방금 읽은 진단을 계속 보여줘 대기가
  // 비어 보이지 않게 한다.
  if (submitting) {
    return (
      <main style={{ background: C.bgPage, minHeight: "100vh", padding: "48px 24px" }}>
        {showKakaoAsk && (
          <KakaoAskModal pending={kakaoPending} onAccept={acceptKakao} onDecline={declineKakao} />
        )}
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

  if (noMatch) {
    return (
      <main style={{ background: C.bgPage, minHeight: "100vh", padding: "48px 24px" }}>
        <section
          aria-labelledby="no-match-title"
          style={{
            maxWidth: 640,
            margin: "40px auto 0",
            padding: "40px 32px",
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            background: C.white,
            boxShadow: "0 12px 32px rgba(43,33,24,0.06)",
            textAlign: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 48,
              height: 48,
              margin: "0 auto 20px",
              display: "grid",
              placeItems: "center",
              borderRadius: 14,
              background: C.bgLabel,
              color: C.goldDark,
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            ✓
          </div>
          <p style={{ margin: "0 0 8px", color: C.goldDark, fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }}>
            조건 확인 완료
          </p>
          <h1 id="no-match-title" style={{ margin: "0 0 14px", color: C.brownDark, fontSize: 25, lineHeight: 1.4 }}>
            지금 조건에 맞는 정책자금을 찾지 못했어요
          </h1>
          <p style={{ maxWidth: 500, margin: "0 auto", color: C.textMuted, fontSize: 15, lineHeight: 1.75 }}>
            답해주신 내용은 모두 확인했지만, 현재 공고 중 적합한 항목이 없었습니다.
            프로필이나 사업 조건을 다시 살펴보면 다른 결과를 확인할 수 있어요.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 12,
              marginTop: 28,
            }}
          >
            <button
              type="button"
              onClick={() => router.push("/onboarding")}
              style={{
                minWidth: 190,
                padding: "13px 20px",
                border: 0,
                borderRadius: 10,
                background: C.gold,
                color: C.brownDark,
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 800,
              }}
            >
              프로필·조건 다시 확인
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              style={{
                minWidth: 140,
                padding: "13px 20px",
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                background: C.white,
                color: C.brown,
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              홈으로
            </button>
          </div>
        </section>
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

        {error && <p role="alert" style={{ color: C.danger, fontSize: 14, marginTop: 20 }}>{error}</p>}
      </div>
    </main>
  );
}
