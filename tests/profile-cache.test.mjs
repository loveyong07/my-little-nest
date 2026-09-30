import test from "node:test";
import assert from "node:assert/strict";
import { readProfileCache, writeProfileCache, fetchProfile, getProfileSnapshot } from "../src/profile-cache.js";

function storage() {
  let value = null;
  return { getItem: () => value, setItem: (_, next) => { value = next; } };
}

test("profile fallback expires after 24 hours and a failure cannot renew it", () => {
  const store = storage();
  const profile = { name: "初咏", username: "loveyong07", avatar: "https://pbs.twimg.com/avatar.jpg" };
  writeProfileCache(store, { status: "ok", profile }, 1000);
  assert.deepEqual(readProfileCache(store, 2000), { savedAt: 1000, profile });
  writeProfileCache(store, { status: "unavailable", profile }, 3000);
  assert.equal(readProfileCache(store, 4000).savedAt, 1000);
  assert.equal(readProfileCache(store, 1000 + 86_400_001), null);
  assert.equal(readProfileCache(store, 999), null);
});

test("invalid profiles and blocked storage do not replace a valid fallback", () => {
  const store = storage();
  writeProfileCache(store, { status: "ok", profile: { name: "Name", username: "invalid handle" } }, 1000);
  writeProfileCache(store, { status: "ok", profile: { name: "Name", username: 123 } }, 1000);
  assert.equal(readProfileCache(store, 1001), null);
  assert.equal(readProfileCache({ getItem: () => "{broken" }), null);
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  assert.equal(readProfileCache(blocked), null);
  assert.doesNotThrow(() => writeProfileCache(blocked, { status: "ok", profile: { name: "Name", username: "valid" } }));
});

test("profile route and foreground consumers share the same successful request and timestamp", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "/api/x-profile");
    assert.equal(options.cache, "no-store");
    return { ok: true, json: async () => ({ status: "ok", profile: { name: "初咏", username: "loveyong07", avatar: null } }) };
  };
  try {
    const first = fetchProfile();
    assert.equal(fetchProfile(), first);
    await first;
    const savedAt = getProfileSnapshot().savedAt;
    await fetchProfile();
    assert.equal(calls, 1);
    assert.equal(getProfileSnapshot().savedAt, savedAt);
  } finally { globalThis.fetch = original; }
});
