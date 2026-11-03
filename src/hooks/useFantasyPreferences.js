import { useEffect, useState } from "react";
import { applySiteMotion } from "../utils/motion.js";
import { REDUCED_MOTION_QUERY } from "../constants/media-queries.js";

export function useFantasyPreferences() {
  const [reduced, setReduced] = useState(() => matchMedia(REDUCED_MOTION_QUERY).matches);
  const motion = !reduced;
  useEffect(() => {
    const query = matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  // Keep <html> in step so the same preference reaches CSS scrolling and explicit JS scroll calls.
  useEffect(() => {
    applySiteMotion(motion);
  }, [motion]);
  return { reduced, motion };
}
