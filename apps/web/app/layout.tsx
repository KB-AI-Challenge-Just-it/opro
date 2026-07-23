import Link from "next/link";
import NotificationBell from "./components/NotificationBell";
import HeaderUser from "./components/HeaderUser";
import { C } from "@/lib/theme";

export const metadata = { title: "소상공인 금융 지원 에이전트" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, padding: 0, fontFamily: "system-ui", background: C.bgPage, color: C.text }}>
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: "rgba(250,247,242,0.92)",
            backdropFilter: "blur(8px)",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              maxWidth: 1040,
              margin: "0 auto",
              padding: "14px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                fontWeight: 800,
                fontSize: 15,
                color: C.brownDark,
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: C.gold,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: C.brownDark,
                  flexShrink: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 20V10l8-6 8 6v10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M9 20v-6h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              소상공인 금융 지원
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <HeaderUser />
              <NotificationBell />
            </div>
          </div>
        </header>
        {children}
        <footer
          style={{
            borderTop: `1px solid ${C.border}`,
            background: C.bgLabel,
          }}
        >
          <div
            style={{
              maxWidth: 1040,
              margin: "0 auto",
              padding: "24px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12.5, color: C.textMuted }}>
              <span>이용약관</span>
              <span style={{ color: C.border }}>|</span>
              <span>개인정보처리방침</span>
              <span style={{ color: C.border }}>|</span>
              <span>고객센터</span>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: C.textMuted }}>
              © {new Date().getFullYear()} 소상공인 금융 지원 에이전트. All rights reserved.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 800, fontSize: 13, color: C.brown }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: C.gold,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: C.brownDark,
                  flexShrink: 0,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 20V10l8-6 8 6v10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M9 20v-6h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              소상공인 금융 지원
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
