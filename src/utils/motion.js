// One applied motion preference drives CSS animation, CSS scrolling and explicit JS scrolling.
// The class on <html> is the single applied value: the system setting always wins,
// and the in-site switch can only turn motion further off.
export const MOTION_OFF_CLASS = "motion-off";

export function systemPrefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function applySiteMotion(motion) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(MOTION_OFF_CLASS, !motion);
}

export function siteMotionOff() {
  return typeof document !== "undefined" && document.documentElement.classList.contains(MOTION_OFF_CLASS);
}

// CSS scroll-behavior cannot cover window.scrollTo/scrollIntoView calls that pass
// behavior explicitly, so those callers ask for the same decision here.
export function preferredScrollBehavior() {
  return systemPrefersReducedMotion() || siteMotionOff() ? "instant" : "smooth";
}
