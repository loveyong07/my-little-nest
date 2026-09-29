import { useEffect, useState } from "react";
import { ASSETS, HANDLE } from "../constants/site.js";

export function useXProfile(page, ready = true) {
  const [profile, setProfile] = useState({ name: "初咏", username: HANDLE, avatar: `${ASSETS}/x-avatar.jpg` });

  useEffect(() => {
    // Keep the first Posts request clear of the non-critical profile lookup.
    if (page === "posts" && !ready) return undefined;
    let mounted = true;
    async function refreshProfile() {
      try {
        const response = await fetch("/api/x-profile", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json();
        if (mounted && result.status === "ok" && result.profile?.username) {
          setProfile({ name: result.profile.name, username: result.profile.username, avatar: result.profile.avatar || `${ASSETS}/x-avatar.jpg` });
        }
      } catch { /* Keep the last known profile. */ }
    }
    refreshProfile();
    const interval = window.setInterval(refreshProfile, 15 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) refreshProfile(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { mounted = false; window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [page, ready]);

  return profile;
}
