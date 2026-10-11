import { useCallback, useState } from "react";
import { mediaRetrySrc } from "../media-urls.js";

const initialAttempt = (source) => ({ source, retryCount: 0, unavailable: false, loaded: false });

// Cards and previews share retry behavior, but each owns its media request state.
export function useMediaRequest(source, retryKey = "retry") {
  const [attempt, setAttempt] = useState(() => initialAttempt(source));
  // Reset before committing a different source, so a failed previous photo cannot
  // briefly hide the next one. Late load/error events belong to their own attempt.
  if (attempt.source !== source) setAttempt(initialAttempt(source));

  function update(patch) {
    setAttempt((current) =>
      current.source === source && current.retryCount === attempt.retryCount ? { ...current, ...patch } : current,
    );
  }

  const reset = useCallback(() => {
    setAttempt((current) => ({
      ...initialAttempt(source),
      loaded: current.source === source && current.retryCount === 0 && current.loaded,
    }));
  }, [source]);

  return {
    src: mediaRetrySrc(source, attempt.retryCount, retryKey),
    retryCount: attempt.retryCount,
    unavailable: attempt.unavailable,
    loaded: attempt.loaded,
    onLoad: () => update({ loaded: true, unavailable: false }),
    onError: () => update({ unavailable: true, loaded: false }),
    retry: () => update({ retryCount: attempt.retryCount + 1, unavailable: false, loaded: false }),
    reset,
  };
}
