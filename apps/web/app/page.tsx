"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { loadProfileId } from "@/lib/profile";

type Report = { id: number; bodyMd: string; createdAt: string };

export default function Home() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const profileId = loadProfileId();
    api<Report[]>(`/api/reports?profileId=${profileId}`)
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1>받은 리포트</h1>
      <p>
        아직 프로필이 없다면 <Link href="/onboarding">온보딩 질문지</Link>부터
        작성하세요.
      </p>
      {loaded && reports.length === 0 && <p>도착한 리포트가 없습니다. 변화가 감지되면 여기로 알려드립니다.</p>}
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
