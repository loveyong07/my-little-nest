import { useEffect } from "react";
import { applySiteMotion } from "../utils/motion.js";
import { useReducedMotion } from "./useReducedMotion.js";

export function useFantasyPreferences() {
  const reduced = useReducedMotion();
  const motion = !reduced;
  // Keep <html> in step so the same preference reaches CSS scrolling and explicit JS scroll calls.
  useEffect(() => {
    applySiteMotion(motion);
  }, [motion]);
  return { reduced, motion };
}
