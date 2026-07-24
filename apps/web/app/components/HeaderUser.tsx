"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, loadSession } from "@/lib/session";
import { C } from "@/lib/theme";

export default function HeaderUser() {
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState<string | null>(null);

  // 레이아웃은 클라이언트 네비게이션에도 리마운트되지 않으므로, 로그인/로그아웃으로
  // 세션이 바뀔 때마다(=경로가 바뀔 때마다) 다시 읽어야 헤더가 최신 상태를 반영한다.
  useEffect(() => {
    setName(loadSession()?.name ?? null);
  }, [pathname]);

  if (!name) return null;

  const logout = () => {
    clearSession();
    setName(null);
    router.push("/login");
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.textMuted }}>
      <span>{name}님</span>
      <Link href="/account" style={{ color: C.brown, textDecoration: "none", fontSize: 13 }}>
        내 정보
      </Link>
      <button
        onClick={logout}
        style={{ background: "none", border: "none", color: C.brown, cursor: "pointer", fontSize: 13, padding: 0 }}
      >
        로그아웃
      </button>
    </div>
  );
}
