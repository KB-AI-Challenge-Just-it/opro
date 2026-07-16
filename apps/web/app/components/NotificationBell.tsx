"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Noti = {
  id: number;
  reportId: number;
  title: string;
  body: string;
};

export default function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState<Noti[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const initialized = useRef(false);
  const prevLen = useRef(0);

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await api<Noti[]>("/api/notifications?profileId=1&status=UNREAD");
        if (initialized.current && data.length > prevLen.current) {
          setToast(data[0].title);
          setTimeout(() => setToast(null), 4000);
        }
        prevLen.current = data.length;
        initialized.current = true;
        setUnread(data);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  const markRead = async (n: Noti) => {
    try {
      await api(`/api/notifications/${n.id}/read`, { method: "PATCH" });
    } catch {}
    setUnread((prev) => prev.filter((x) => x.id !== n.id));
    setOpen(false);
    router.push(`/reports/${n.reportId}`);
  };

  return (
    <>
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="알림"
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, padding: 4 }}
        >
          🔔
          {unread.length > 0 && (
            <span style={{
              position: "absolute", top: 0, right: 0,
              background: "#e53e3e", color: "white", borderRadius: "50%",
              fontSize: 11, width: 18, height: 18,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {unread.length}
            </span>
          )}
        </button>
        {open && (
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 8px)",
            background: "white", border: "1px solid #e2e8f0", borderRadius: 8,
            minWidth: 300, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 100,
          }}>
            {unread.length === 0 ? (
              <p style={{ padding: "14px 16px", color: "#718096", margin: 0, fontSize: 14 }}>
                새 알림이 없습니다
              </p>
            ) : unread.map((n) => (
              <div
                key={n.id}
                onClick={() => markRead(n)}
                style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid #f7fafc" }}
              >
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{n.title}</p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#718096" }}>{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: "#1a202c", color: "white",
          padding: "12px 18px", borderRadius: 8,
          fontSize: 14, zIndex: 999,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          maxWidth: 320,
        }}>
          🔔 {toast}
        </div>
      )}
    </>
  );
}
