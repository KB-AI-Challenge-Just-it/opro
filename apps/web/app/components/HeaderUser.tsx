"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, loadSession, SESSION_CHANGE_EVENT } from "@/lib/session";
import { C } from "@/lib/theme";

export default function HeaderUser() {
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState<string | null>(null);

  // 레이아웃은 클라이언트 네비게이션에도 리마운트되지 않으므로, 로그인/로그아웃으로
  // 세션 이벤트와 경로 변경 때마다 다시 읽어 헤더를 최신 상태로 유지한다.
  useEffect(() => {
    const syncName = () => setName(loadSession()?.name ?? null);
    syncName();
    window.addEventListener(SESSION_CHANGE_EVENT, syncName);
    window.addEventListener("storage", syncName);
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, syncName);
      window.removeEventListener("storage", syncName);
    };
  }, [pathname]);

  if (!name) return null;

  const logout = () => {
    clearSession();
    setName(null);
    router.push("/login");
  };

  return (
    <div className="biz-header-user" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
      <span className="biz-header-user-name" style={{ color: C.brown, padding: "6px 8px" }}>{name}님</span>
      <Link href="/account" className="biz-header-link" style={{ color: C.brown, textDecoration: "none", fontSize: 13 }}>
        내 정보
      </Link>
      <button
        onClick={logout}
        className="biz-header-link"
        style={{ border: "none", color: C.brown, cursor: "pointer", fontSize: 13 }}
      >
        로그아웃
      </button>
      <style>{`
        .biz-header-link {
          background-color: transparent;
          padding: 6px 8px;
          border-radius: 6px;
          transition: background-color 0.15s ease, color 0.15s ease;
        }
        .biz-header-link:hover {
          background-color: ${C.bgLabel};
          color: ${C.brownDark};
        }
        @media (max-width: 720px) {
          .biz-header-user-name { display: none; }
          .biz-header-user { gap: 0 !important; }
          .biz-header-link { padding: 6px !important; font-size: 12px !important; white-space: nowrap; }
        }
      `}</style>
    </div>
  );
}
