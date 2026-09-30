import { useEffect, useState } from "react";

function stored(key, fallback) {
  try { const value = localStorage.getItem(key); return value === null ? fallback : value === "true"; }
  catch { return fallback; }
}
export function useFantasyPreferences() {
  const [effects, setEffects] = useState(() => stored("nest-effects", true));
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => { try { localStorage.setItem("nest-effects", String(effects)); } catch { /* Session-only when storage is blocked. */ } }, [effects]);
  return { effects, setEffects, reduced, motion: effects && !reduced };
}
