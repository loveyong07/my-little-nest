import { useEffect, useRef, useState } from "react";

export function useClickSparkles() {
  const [sparkle, setSparkle] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function showClickSparkle(event) {
    const control = event.target.closest("button, a");
    if (control && event.detail !== 0) {
      const id = Date.now() + "-" + Math.random();
      setSparkle({ id, x: event.clientX, y: event.clientY });
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setSparkle((current) => current?.id === id ? null : current), 700);
    }
  }

  return { sparkle, showClickSparkle };
}
