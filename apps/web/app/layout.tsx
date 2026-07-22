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
      </body>
    </html>
  );
}
