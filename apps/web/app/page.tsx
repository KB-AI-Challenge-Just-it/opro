import Link from "next/link";
import { api } from "@/lib/api";

type Report = { id: number; bodyMd: string; createdAt: string };

export default async function Home() {
  // MVP: 데모 프로필 1번 고정. 추후 인증 연동
  let reports: Report[] = [];
  try {
    reports = await api<Report[]>("/api/reports?profileId=1");
  } catch {}

  return (
    <main>
      <h1>받은 리포트</h1>
      <p>
        아직 프로필이 없다면 <Link href="/onboarding">온보딩 질문지</Link>부터
        작성하세요.
      </p>
      {reports.length === 0 && <p>도착한 리포트가 없습니다. 변화가 감지되면 여기로 알려드립니다.</p>}
      <ul>
        {reports.map((r) => (
          <li key={r.id}>
            <Link href={`/reports/${r.id}`}>
              리포트 #{r.id} — {new Date(r.createdAt).toLocaleString("ko-KR")}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
