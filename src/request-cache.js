export const REQUEST_TIMEOUT_MS = 12_000;
export const REQUEST_FRESH_MS = 15 * 60 * 1000;
export const REQUEST_RETRY_MS = 30_000;
export const SUCCESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REFRESH_CHECK_MS = 60_000;

// The endpoint owns its request. Consumers can stop listening without aborting
// work that another mounted component (or a route preload) still needs.
export function createSharedRequest({
  url, isSuccess, onSuccess,
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  timeoutMs = REQUEST_TIMEOUT_MS,
  freshMs = REQUEST_FRESH_MS,
  retryMs = REQUEST_RETRY_MS,
  maxAgeMs = SUCCESS_MAX_AGE_MS,
  setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  let snapshot = null;
  let pending = null;
  let retryAt = 0;
  let failure = null;

  function getSnapshot() {
    const time = now();
    return snapshot && time >= snapshot.savedAt && time - snapshot.savedAt <= maxAgeMs ? snapshot : null;
  }

  function prime(value, savedAt) {
    const time = now();
    if (!isSuccess(value) || !Number.isFinite(savedAt) || savedAt > time || time - savedAt > maxAgeMs
      || (snapshot && snapshot.savedAt >= savedAt)) return;
    snapshot = { value, savedAt };
  }

  function load({ force = false } = {}) {
    if (pending) return pending;
    const time = now();
    if (time < retryAt && failure) return failure.error ? Promise.reject(failure.error) : Promise.resolve(failure.value);
    const current = getSnapshot();
    if (!force && !failure && current && time - current.savedAt < freshMs) return Promise.resolve(current.value);

    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimer(() => {
        const error = new Error("Request timed out");
        error.name = "TimeoutError";
        reject(error);
        controller.abort(error);
      }, timeoutMs);
    });
    const request = Promise.resolve().then(async () => {
      const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Request unavailable");
      return response.json();
    });
    pending = Promise.race([request, deadline]).then((value) => {
      if (isSuccess(value)) {
        snapshot = { value, savedAt: now() };
        failure = null;
        retryAt = 0;
        try { onSuccess?.(value, snapshot.savedAt); } catch { /* Persistence is optional. */ }
      } else {
        failure = { value };
        retryAt = now() + retryMs;
      }
      return value;
    }).catch((error) => {
      failure = { error };
      retryAt = now() + retryMs;
      throw error;
    }).finally(() => {
      clearTimer(timer);
      pending = null;
    });
    return pending;
  }

  return { load, prime, getSnapshot, getRetryAfter: () => Math.max(0, retryAt - now()) };
}

// Check freshness while visible. Successful requests remain limited to the
// shared 15-minute window; a failure can recover on the next minute's check.
export function startVisibleRefresh(refresh, {
  windowImpl = window, documentImpl = document,
} = {}) {
  const run = () => { if (!documentImpl.hidden) void refresh(); };
  run();
  const interval = windowImpl.setInterval(run, REFRESH_CHECK_MS);
  documentImpl.addEventListener("visibilitychange", run);
  return () => {
    windowImpl.clearInterval(interval);
    documentImpl.removeEventListener("visibilitychange", run);
  };
}
