const KEY = "bizagent_session";

export type Session = {
  userId: number;
  username: string;
  name: string;
  profileId: number | null;
};

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

/** 온보딩 제출 성공 시 이 세션의 profileId를 갱신한다. */
export function setSessionProfileId(profileId: number) {
  const session = loadSession();
  if (!session) return;
  saveSession({ ...session, profileId });
}
