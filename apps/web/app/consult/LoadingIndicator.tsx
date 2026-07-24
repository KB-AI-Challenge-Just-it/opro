"use client";

import { C } from "@/lib/theme";

/**
 * 대기 화면 공용 로딩 인디케이터 — 회전하는 링 + 은은하게 흐르는 진행 바.
 * 이 프로젝트는 CSS 파일 없이 인라인 스타일만 쓰므로 @keyframes는 <style>로 주입한다.
 * 진단 생성(Wait A)·정책자금 검색(Wait B) 두 대기 화면에서 함께 쓴다.
 */
export function LoadingIndicator() {
  return (
    <>
      <style>{`
        @keyframes consult-spin { to { transform: rotate(360deg); } }
        @keyframes consult-bar {
          0%   { left: -35%; }
          100% { left: 100%; }
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <div
          aria-label="로딩 중"
          role="status"
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            border: `4px solid ${C.border}`,
            borderTopColor: C.gold,
            animation: "consult-spin 0.8s linear infinite",
          }}
        />
        <div
          style={{
            position: "relative",
            width: 200,
            height: 5,
            borderRadius: 999,
            background: C.border,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              width: "35%",
              height: "100%",
              borderRadius: 999,
              background: C.gold,
              animation: "consult-bar 1.3s ease-in-out infinite",
            }}
          />
        </div>
      </div>
    </>
  );
}
