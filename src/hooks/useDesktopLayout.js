import { useEffect, useState } from "react";
import { DESKTOP_FIT_QUERY } from "../constants/media-queries.js";

// Desktop enhancements follow the same boundary as the one-viewport Home layout.
export function useDesktopLayout() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_FIT_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_FIT_QUERY);
    const update = () => setDesktop(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}
