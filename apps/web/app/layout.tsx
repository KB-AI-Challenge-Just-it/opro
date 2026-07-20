import NotificationBell from "./components/NotificationBell";

export const metadata = { title: "소상공인 금융 지원 에이전트" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ fontWeight: 700 }}>소상공인 금융 지원</span>
          <NotificationBell />
        </header>
        {children}
      </body>
    </html>
  );
}
