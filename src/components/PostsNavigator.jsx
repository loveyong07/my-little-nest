import { useEffect, useRef, useState } from "react";
import { FiFeather, FiType, FiBookOpen, FiRepeat } from "react-icons/fi";
import { HiOutlineSparkles } from "react-icons/hi2";
import { PiPushPinFill, PiFlowerLight } from "react-icons/pi";
import { useDesktopLayout } from "../hooks/useDesktopLayout.js";
import { preferredScrollBehavior } from "../utils/motion.js";

const targets = ["pinned-posts-heading", "latest-posts", "x-reposts", "x-articles"];

export function PostsNavigator({
  t,
  pinnedCount,
  postCount,
  articleCount,
  repostCount,
  largeText,
  onToggleText,
  focusReading,
  onToggleFocus,
  library,
}) {
  const [activeSection, setActiveSection] = useState(targets[0]);
  const [directoryAway, setDirectoryAway] = useState(false);
  const navRef = useRef(null);
  const desktop = useDesktopLayout();

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = targets[0];
      for (const id of targets) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= window.innerHeight * 0.35) current = id;
      }
      // The final heading cannot reach the upper third once scrolling is clamped.
      if (
        window.scrollY > 0 &&
        Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight
      ) {
        current = targets.at(-1);
      }
      setActiveSection(current);
      setDirectoryAway((navRef.current?.getBoundingClientRect().bottom ?? 0) < 0);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    const content = navRef.current?.parentElement;
    if (content) observer.observe(content);
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  function jumpToSection(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const heading = target.matches("h2") ? target : target.querySelector("h2");
    heading?.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: preferredScrollBehavior() });
  }

  const sections = [
    { label: t.quickNavPinned, icon: PiPushPinFill, tone: "pin", count: pinnedCount },
    { label: t.quickNavDaily, icon: HiOutlineSparkles, tone: "daily", count: postCount },
    { label: t.repostsHeading, icon: FiRepeat, tone: "reposts", count: repostCount },
    { label: t.quickNavArticles, icon: FiFeather, tone: "articles", count: articleCount },
  ];

  return (
    <nav className="posts-quick-nav" id="posts-reading-directory" ref={navRef} aria-label={t.postsQuickNavLabel}>
      <div className="reading-directory-heading">
        <FiBookOpen className="directory-cover-icon" aria-hidden="true" />
        <h2 tabIndex={-1}>{t.readingDirectory}</h2>
        <p>{t.readingDirectoryText}</p>
      </div>
      {library}
      {directoryAway && (
        <button
          type="button"
          className="reading-directory-return"
          aria-controls="posts-reading-directory"
          onClick={() => {
            navRef.current?.querySelector("h2")?.focus({ preventScroll: true });
            navRef.current?.scrollIntoView({ block: "start", behavior: preferredScrollBehavior() });
          }}
        >
          <FiBookOpen aria-hidden="true" />
          {t.returnToDirectory}
        </button>
      )}
      <div className="reading-directory-links">
        {sections.map(({ label, icon: Icon, tone, count }, index) => (
          <button
            type="button"
            className={`quick-nav-pill quick-nav-${tone}${activeSection === targets[index] ? " is-active" : ""}`}
            key={tone}
            aria-current={activeSection === targets[index] ? "location" : undefined}
            onClick={() => jumpToSection(targets[index])}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
            {count > 0 && <em className="quick-nav-badge">{count}</em>}
          </button>
        ))}
      </div>
      <div className="reading-tools">
        <span>{t.readingSettings}</span>
        <button type="button" className="reading-text-toggle" aria-pressed={largeText} onClick={onToggleText}>
          <FiType aria-hidden="true" />
          <span>{t.largeReadingText}</span>
          <i aria-hidden="true" />
        </button>
        {desktop && (
          <button type="button" className="reading-focus-toggle" aria-pressed={focusReading} onClick={onToggleFocus}>
            <FiBookOpen aria-hidden="true" />
            <span>{t.focusReading}</span>
            <i aria-hidden="true" />
          </button>
        )}
        <p>
          <PiFlowerLight aria-hidden="true" />
          {t.readingSlowNote}
        </p>
        {desktop && <span className="reading-shortcut-note">{t.keyboardNavHint}</span>}
      </div>
    </nav>
  );
}
