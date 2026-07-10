export const metadata = { title: "소상공인 금융 지원 에이전트" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
        {children}
      </body>
    </html>
  );
}
