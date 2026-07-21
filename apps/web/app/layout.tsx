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
            maxWidth: 720,
            margin: "0 auto",
            padding: "20px 24px 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Link href="/" style={{ fontWeight: 700, color: C.brownDark, textDecoration: "none" }}>
            소상공인 금융 지원
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <HeaderUser />
            <NotificationBell />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
