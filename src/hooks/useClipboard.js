import { useEffect, useRef, useState } from "react";

export function useClipboard() {
  const [copiedId, setCopiedId] = useState("");
  const [copyFailedId, setCopyFailedId] = useState("");
  const manualCopyRef = useRef(null);
  const copyTimerRef = useRef(null);

  useEffect(() => {
    if (copyFailedId) {
      manualCopyRef.current?.focus();
      manualCopyRef.current?.select();
    }
  }, [copyFailedId]);

  useEffect(() => () => window.clearTimeout(copyTimerRef.current), []);

  async function copyId(id) {
    try {
      await navigator.clipboard.writeText(id);
      window.clearTimeout(copyTimerRef.current);
      setCopyFailedId("");
      setCopiedId(id);
      copyTimerRef.current = window.setTimeout(() => setCopiedId(""), 2400);
    } catch {
      window.clearTimeout(copyTimerRef.current);
      setCopiedId("");
      setCopyFailedId(id);
    }
  }

  return { copiedId, copyFailedId, manualCopyRef, copyId };
}
