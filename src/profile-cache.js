import { createSharedRequest, SUCCESS_MAX_AGE_MS } from "./request-cache.js";

const KEY = "little-nest-profile-v1";
const isSuccess = (result) => result?.status === "ok"
  && typeof result.profile?.username === "string"
  && /^[A-Za-z0-9_]{1,15}$/.test(result.profile?.username ?? "")
  && typeof result.profile?.name === "string";

export function readProfileCache(storage, now = Date.now()) {
  try {
    const cached = JSON.parse(storage.getItem(KEY));
    if (!cached || !Number.isFinite(cached.savedAt) || now < cached.savedAt || now - cached.savedAt > SUCCESS_MAX_AGE_MS
      || !isSuccess({ status: "ok", profile: cached.profile })) return null;
    return cached;
  } catch { return null; }
}

export function writeProfileCache(storage, result, now = Date.now()) {
  if (!isSuccess(result)) return;
  try { storage.setItem(KEY, JSON.stringify({ savedAt: now, profile: result.profile })); } catch { /* Storage is optional. */ }
}

const request = createSharedRequest({
  url: "/api/x-profile", isSuccess,
  onSuccess: (result, savedAt) => {
    if (typeof window !== "undefined") writeProfileCache(window.localStorage, result, savedAt);
  },
});

export function getProfileSnapshot() {
  if (!request.getSnapshot()) {
    try {
      const cached = readProfileCache(window.localStorage);
      if (cached) request.prime({ status: "ok", profile: cached.profile }, cached.savedAt);
    } catch { /* Storage is optional. */ }
  }
  const snapshot = request.getSnapshot();
  return snapshot ? { savedAt: snapshot.savedAt, profile: snapshot.value.profile } : null;
}

export function fetchProfile(options) {
  getProfileSnapshot();
  return request.load(options);
}
