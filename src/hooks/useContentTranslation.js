import { useEffect, useRef, useState } from "react";
import { systemTranslationLanguage, translateSegments } from "../utils/translation.js";

export function useContentTranslation(segments) {
  const [targetLanguage, setTargetLanguage] = useState(systemTranslationLanguage);
  const [state, setState] = useState(null);
  const operationRef = useRef(null);
  const sourceRef = useRef(null);
  const key = JSON.stringify([targetLanguage, segments]);
  const current = state?.key === key ? state : null;

  useEffect(() => {
    const updateLanguage = () => setTargetLanguage(systemTranslationLanguage());
    window.addEventListener("languagechange", updateLanguage);
    return () => window.removeEventListener("languagechange", updateLanguage);
  }, []);

  useEffect(() => {
    return () => {
      operationRef.current?.abort();
      operationRef.current = null;
    };
  }, [key]);

  async function toggleTranslation() {
    if (operationRef.current) return;
    if (current?.result && !current.result.sameLanguage) {
      setState({ ...current, showing: !current.showing });
      return;
    }
    const controller = new AbortController();
    operationRef.current = controller;
    setState({ key, stage: "detecting" });
    const timeout = window.setTimeout(() => {
      if (operationRef.current !== controller) return;
      controller.abort();
      operationRef.current = null;
      setState({ key, stage: "error", error: "timedOut" });
    }, 120_000);
    controller.signal.addEventListener("abort", () => window.clearTimeout(timeout), { once: true });
    try {
      const result = await translateSegments(segments, {
        targetLanguage,
        sourceLanguage: sourceRef.current?.key === key ? sourceRef.current.language : undefined,
        signal: controller.signal,
        api: window,
        onSourceLanguage: (language) => {
          sourceRef.current = { key, language };
        },
        onProgress: (progress) => {
          if (!controller.signal.aborted) setState({ key, ...progress });
        },
      });
      if (!controller.signal.aborted) {
        setState({ key, stage: "complete", result, showing: !result.sameLanguage });
      }
    } catch (error) {
      if (!controller.signal.aborted) setState({ key, stage: "error", error: error.code ?? "failed" });
    } finally {
      window.clearTimeout(timeout);
      if (operationRef.current === controller) operationRef.current = null;
    }
  }

  function cancelTranslation() {
    operationRef.current?.abort();
    operationRef.current = null;
    setState(null);
  }

  return {
    hasText: segments.length > 0,
    targetLanguage,
    stage: current?.stage ?? "idle",
    progress: current?.progress,
    error: current?.error,
    sameLanguage: current?.result?.sameLanguage ?? false,
    showing: current?.showing ?? false,
    texts: current?.showing ? current.result.segments : undefined,
    toggleTranslation,
    cancelTranslation,
  };
}
