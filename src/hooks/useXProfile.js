import { useEffect, useState } from "react";
import { ASSETS, HANDLE } from "../constants/site.js";
import { fetchProfile, getProfileSnapshot } from "../profile-cache.js";
import { startVisibleRefresh } from "../request-cache.js";

function displayProfile(profile) {
  return { name: profile.name || profile.username, username: profile.username, avatar: profile.avatar || `${ASSETS}/x-avatar.jpg`, avatarProxy: profile.avatarProxy };
}

function initialProfile() {
  const cached = getProfileSnapshot();
  return cached ? displayProfile(cached.profile) : { name: "初咏", username: HANDLE, avatar: `${ASSETS}/x-avatar.jpg` };
}

export function useXProfile(page, ready = true) {
  const [profile, setProfile] = useState(initialProfile);

  useEffect(() => {
    // Keep the first Posts request clear of the non-critical profile lookup.
    if (page === "posts" && !ready) return undefined;
    let mounted = true;
    async function refreshProfile() {
      try {
        const result = await fetchProfile();
        // "stale" is the service's last known profile after a failed refresh: usable, not fresh.
        if (mounted && (result?.status === "ok" || result?.status === "stale") && typeof result.profile?.name === "string"
          && typeof result.profile?.username === "string" && /^[A-Za-z0-9_]{1,15}$/.test(result.profile.username)) {
          setProfile(displayProfile(result.profile));
        }
      } catch { /* Keep the last known profile. */ }
    }
    const stop = startVisibleRefresh(refreshProfile);
    return () => { mounted = false; stop(); };
  }, [page, ready]);

  return profile;
}
