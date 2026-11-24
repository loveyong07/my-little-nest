import { useEffect, useId, useRef } from "react";
import { FaArrowUpRightFromSquare, FaGithub } from "react-icons/fa6";
import { STARRY_GAL_REPOSITORY } from "../constants/site.js";
import { DESKTOP_FIT_QUERY } from "../constants/media-queries.js";

export function StarryGalBalloon({ t, contentRef }) {
  const id = useId();
  const skyRef = useRef(null);
  useEffect(() => {
    const sky = skyRef.current;
    const content = contentRef.current;
    const letter = content.querySelector(".hero-copy");
    const journal = content.querySelector(".home-journal");
    const desktop = window.matchMedia(DESKTOP_FIT_QUERY);
    let frame;
    const measure = () => {
      const bounds = content.getBoundingClientRect();
      const letterBounds = letter.getBoundingClientRect();
      const journalBounds = journal.getBoundingClientRect();
      const split = desktop.matches && journalBounds.left > letterBounds.right;
      const hero = sky.closest(".hero").getBoundingClientRect();
      const headerElement = (sky.closest(".site") ?? sky.closest(".hero")).querySelector(".site-header");
      const header = headerElement.getBoundingClientRect();
      const topSpace = bounds.top - header.bottom - 24;
      const topWidth = Math.min(88, Math.floor((topSpace - 64) / 1.1));
      const topLane = !desktop.matches && topWidth >= 60;
      const width = topLane ? topWidth : desktop.matches ? 112 : 88;
      const left = topLane ? 16 : Math.ceil(split ? letterBounds.right : bounds.right) + 24;
      const right = topLane
        ? Math.max(left + width, innerWidth * 0.4)
        : split
          ? journalBounds.left - 24
          : desktop.matches
            ? innerWidth * 0.7
            : innerWidth - 24;
      const travel = right - left - width;
      sky.dataset.lane = topLane ? "top" : "side";
      sky.style.setProperty("--balloon-width", `${width}px`);
      sky.style.setProperty("--flight-top", `${topLane ? header.bottom - hero.top + 12 : header.bottom + 12}px`);
      sky.style.setProperty("--flight-left", `${left}px`);
      sky.style.setProperty("--flight-x", `${Math.max(0, Math.min(120, travel))}px`);
      sky.dataset.ready = String(topLane || travel >= 0);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(content);
    observer.observe(letter);
    observer.observe(journal);
    window.addEventListener("resize", schedule);
    desktop.addEventListener("change", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      desktop.removeEventListener("change", schedule);
    };
  }, [contentRef]);

  return (
    <div className="starrygal-sky" ref={skyRef} data-ready="false">
      <div className="starrygal-flight">
        <a
          className="starrygal-balloon"
          href={STARRY_GAL_REPOSITORY}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.starrygalLink}
          title={t.starrygalLink}
          draggable="false"
        >
          <span className="starrygal-rig" aria-hidden="true">
            <svg className="starrygal-envelope" viewBox="0 0 160 176" fill="none" focusable="false">
              <defs>
                <linearGradient id={`${id}-silk`} x1="39" y1="20" x2="122" y2="136" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#f8fcff" />
                  <stop offset="0.55" stopColor="#e5f3ff" />
                  <stop offset="1" stopColor="#b9d9f0" />
                </linearGradient>
                <linearGradient id={`${id}-basket`} x1="62" y1="152" x2="98" y2="176" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#fff4dc" />
                  <stop offset="1" stopColor="#e7cfae" />
                </linearGradient>
              </defs>
              <g stroke="#7f9fbc" strokeWidth="1.4" strokeLinejoin="round">
                <path
                  d="M80 12C47 12 25 34 26 63c1 30 24 49 37 70h34c13-21 36-40 37-70 1-29-21-51-54-51Z"
                  fill={`url(#${id}-silk)`}
                />
                <path
                  d="M80 12C56 19 44 39 49 68c4 26 17 47 23 65h-9C50 112 27 93 26 63 25 34 47 12 80 12Z"
                  fill="#c5e0f5"
                />
                <path
                  d="M80 12c24 7 36 27 31 56-4 26-17 47-23 65h9c13-21 36-40 37-70 1-29-21-51-54-51Z"
                  fill="#f4dfe9"
                />
                <path
                  d="M80 12c-17 18-20 43-16 66 4 24 10 42 12 55h8c2-13 8-31 12-55 4-23 1-48-16-66Z"
                  fill="#f6fbff"
                />
                <path d="M33 83c25 15 69 15 94 0" stroke="#fff" strokeWidth="2.5" />
                <path d="m38 87 6 13 10-7M65 96l7 12 9-11M92 97l9 10 6-13" fill="#fff0ce" stroke="#d0b98d" />
                <path
                  d="m80 43 4.4 9.1 10 1.5-7.2 7.1 1.7 10-8.9-4.7-8.9 4.7 1.7-10-7.2-7.1 10-1.5Z"
                  fill="#fff1c9"
                  stroke="#c7af7f"
                />
                <path d="M42 45c3-8 8-14 14-18" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
                <path d="m64 139 4 17m28-17-4 17m-20-17 2 17m14-17-2 17" strokeLinecap="round" />
                <rect x="62" y="130" width="36" height="10" rx="4" fill="#d8e8f6" />
                <path d="M61 155h38l-3 15a5 5 0 0 1-5 4H69a5 5 0 0 1-5-4Z" fill={`url(#${id}-basket)`} />
                <path d="M63 161h34m-32 6h30m-23-11 1 17m7-17v18m8-18-1 17" stroke="#c3a984" strokeOpacity="0.65" />
                <rect x="60" y="153" width="40" height="7" rx="3" fill="#fff0d5" />
              </g>
              <g fill="#fff0ce" stroke="#c8b78e" strokeWidth="1" strokeLinejoin="round">
                <path d="m141 34 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
                <path d="m19 106 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5Z" />
              </g>
            </svg>
            <span className="starrygal-tag">
              <svg className="starrygal-ropes" viewBox="0 0 160 18" fill="none" focusable="false">
                <path d="M65 0 27 18M95 0l38 18" stroke="#87a5bf" strokeWidth="1.4" />
              </svg>
              <span className="starrygal-card">
                <strong>StarryGal</strong>
                <span className="starrygal-card-caption">
                  <FaGithub />
                  GitHub
                  <FaArrowUpRightFromSquare />
                </span>
              </span>
            </span>
          </span>
        </a>
      </div>
    </div>
  );
}
