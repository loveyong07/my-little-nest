import { useEffect } from "react";
import { useDesktopLayout } from "./useDesktopLayout.js";
import { REDUCED_MOTION_QUERY } from "../constants/media-queries.js";

export function useSectionEntrance(scopeRef) {
  const desktop = useDesktopLayout();
  useEffect(() => {
    if (!desktop || window.matchMedia(REDUCED_MOTION_QUERY).matches || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
          entry.target.dataset.revealed = "true";
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12 },
    );
    scopeRef.current?.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [desktop, scopeRef]);
}
