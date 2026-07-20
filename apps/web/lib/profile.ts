const KEY = "bizagent_profile_id";

/** 인증이 없는 MVP — 마지막으로 온보딩한 프로필 id를 브라우저에 기억해
 * 홈 화면·알림벨이 데모 프로필(1) 대신 그 프로필을 보도록 한다. */
export function loadProfileId(): number {
  if (typeof window === "undefined") return 1;
  const stored = window.localStorage.getItem(KEY);
  return stored ? Number(stored) : 1;
}

export function saveProfileId(id: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, String(id));
}
