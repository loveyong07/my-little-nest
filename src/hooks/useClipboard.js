import { useEffect, useRef, useState } from "react";

export function useClipboard() {
  const [copiedId, setCopiedId] = useState("");
  const [copyFailedId, setCopyFailedId] = useState("");
  const manualCopyRef = useRef(null);
  const copyTimerRef = useRef(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (copyFailedId) {
      manualCopyRef.current?.focus();
      manualCopyRef.current?.select();
    }
  }, [copyFailedId]);

  useEffect(
    () => () => {
      attemptRef.current++;
      window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  async function copyId(id) {
    const attempt = ++attemptRef.current;
    window.clearTimeout(copyTimerRef.current);
    setCopiedId("");
    setCopyFailedId("");
    try {
      await navigator.clipboard.writeText(id);
      // An older clipboard request may finish after the visitor selects another account.
      if (attempt !== attemptRef.current) return;
      setCopyFailedId("");
      setCopiedId(id);
      copyTimerRef.current = window.setTimeout(() => setCopiedId(""), 2400);
    } catch {
      if (attempt !== attemptRef.current) return;
      setCopiedId("");
      setCopyFailedId(id);
    }
  }

  return { copiedId, copyFailedId, manualCopyRef, copyId };
}
