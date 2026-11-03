import { useEffect, useState } from "react";
import { FiArrowUp } from "react-icons/fi";
import { fantasyCopy } from "../../constants/fantasy.js";
import { preferredScrollBehavior } from "../../utils/motion.js";
import { SakuraCanvas } from "./SakuraCanvas.jsx";
import "../../styles/fantasy-extras.css";

function ScrollCompanion({ page, label }) {
  const [scrollState, setScrollState] = useState({ progress: 0, showTop: false });

  useEffect(() => {
    if (page === "home") return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const y = window.scrollY || 0;
      const progress = Math.min(1, Math.max(0, y / maxScroll));
      const showTop = y > 200;
      setScrollState((prev) =>
        Math.abs(prev.progress - progress) < 0.005 && prev.showTop === showTop ? prev : { progress, showTop },
      );
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [page]);

  if (page === "home") return null;

  const dashOffset = (100 - scrollState.progress * 100).toFixed(1);

  return (
    <>
      <div className="scroll-progress-track" aria-hidden="true">
        <span className="scroll-progress-bar" style={{ transform: `scaleX(${scrollState.progress.toFixed(3)})` }} />
      </div>
      {scrollState.showTop && (
        <button
          type="button"
          className="scroll-top-btn"
          aria-label={label}
          title={label}
          onClick={() => window.scrollTo({ top: 0, behavior: preferredScrollBehavior() })}
        >
          <svg className="scroll-top-ring" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
            <circle className="scroll-top-ring-bg" cx="20" cy="20" r="16" pathLength="100" />
            <circle
              className="scroll-top-ring-fill"
              cx="20"
              cy="20"
              r="16"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={dashOffset}
            />
          </svg>
          <FiArrowUp aria-hidden="true" />
        </button>
      )}
    </>
  );
}

export default function FantasyExtras({ language, page, preferences }) {
  const f = fantasyCopy[language];
  const { motion } = preferences;
  return (
    <>
      {motion && <SakuraCanvas snow={page === "posts"} />}
      <ScrollCompanion page={page} label={f.backToTop} />
    </>
  );
}
