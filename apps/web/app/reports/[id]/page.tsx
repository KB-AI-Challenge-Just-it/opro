import { api } from "@/lib/api";

type Report = { id: number; bodyMd: string; createdAt: string };

export default async function ReportPage({ params }: { params: { id: string } }) {
  const report = await api<Report>(`/api/reports/${params.id}`);
  return (
    <main>
      <h1>리포트 #{report.id}</h1>
      {/* MVP: 마크다운 원문 노출. 추후 렌더러 적용 */}
      <pre style={{ whiteSpace: "pre-wrap" }}>{report.bodyMd}</pre>
    </main>
  );
}
