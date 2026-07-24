// 서버 컴포넌트(예: reports/[id]/page.tsx)는 Docker web 컨테이너 "안"에서 fetch를 실행한다 —
// 거기서 localhost:8080은 컨테이너 자신이지 api-core가 아니다. 브라우저(클라이언트 컴포넌트)는
// 반대로 호스트의 localhost:8080을 그대로 써야 한다. 그래서 실행 위치에 따라 base를 분리한다.
function resolveBase(): string {
  if (typeof window === "undefined") {
    return process.env.API_BASE_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${resolveBase()}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

/** 응답 본문이 없는 요청(예: 200 empty body PATCH)용 — res.json() 파싱을 건너뛴다. */
export async function apiVoid(path: string, init?: RequestInit): Promise<void> {
  const res = await fetch(`${resolveBase()}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
}
