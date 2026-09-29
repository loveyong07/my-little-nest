import { useEffect, useRef, useState } from "react";
import { HiOutlineSparkles } from "react-icons/hi2";

export function ClickSparkles({ sparkle: propSparkle }) {
  const [internalSparkle, setInternalSparkle] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    // If controlled via props, do not attach internal event listeners
    if (propSparkle !== undefined) return;

    function handlePointerDown(event) {
      const control = event.target?.closest?.("button, a");
      if (control) {
        const id = Date.now() + "-" + Math.random();
        setInternalSparkle({ id, x: event.clientX, y: event.clientY });
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(
          () => setInternalSparkle((current) => (current?.id === id ? null : current)),
          700
        );
      }
    }

    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.clearTimeout(timerRef.current);
    };
  }, [propSparkle]);

  const sparkle = propSparkle !== undefined ? propSparkle : internalSparkle;
  if (!sparkle) return null;

  return (
    <span
      key={sparkle.id}
      className="click-sparkle"
      style={{ left: sparkle.x, top: sparkle.y }}
      aria-hidden="true"
    >
      <HiOutlineSparkles className="click-sparkle__main" />
      <HiOutlineSparkles className="click-sparkle__small click-sparkle__small--one" />
      <HiOutlineSparkles className="click-sparkle__small click-sparkle__small--two" />
    </span>
  );
}
