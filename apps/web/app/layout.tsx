import Link from "next/link";
import Image from "next/image";
import NotificationBell from "./components/NotificationBell";
import HeaderUser from "./components/HeaderUser";
import { C } from "@/lib/theme";

export const metadata = {
  title: "소상공인 안심에이전트",
  description: "소상공인을 위한 AI 정책자금 추천 서비스",
};

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
            className="biz-header-inner"
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
              className="biz-header-logo"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                fontWeight: 800,
                fontSize: 15,
                color: C.brownDark,
                textDecoration: "none",
                padding: "6px 8px",
                marginLeft: -8,
                borderRadius: 8,
                transition: "background-color 0.15s ease",
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Image
                  src="/brand/opro-logo.png"
                  alt=""
                  width={34}
                  height={30}
                  priority
                  style={{ width: 34, height: "auto", display: "block" }}
                />
              </span>
              <span className="biz-header-logo-text">소상공인 금융 지원</span>
            </Link>
            <div className="biz-header-actions" style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <HeaderUser />
              <NotificationBell />
            </div>
          </div>
        </header>
        <style>{`
          .biz-header-logo:hover {
            background-color: ${C.bgLabel};
          }
          .biz-header-logo-text { white-space: nowrap; }
          @media (max-width: 640px) {
            .biz-header-inner { padding: 10px 16px !important; }
            .biz-header-logo { gap: 7px !important; padding: 4px !important; margin-left: -4px !important; }
            .biz-header-logo-text { font-size: 14px; }
            .biz-header-actions { gap: 4px !important; }
          }
          @media (max-width: 360px) {
            .biz-header-logo-text { display: none; }
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}
