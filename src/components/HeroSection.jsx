import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FaArrowRight } from "react-icons/fa6";
import { HiOutlineSparkles } from "react-icons/hi2";
import { ASSETS } from "../constants/site.js";
import { DESKTOP_FIT_QUERY, MOBILE_QUERY } from "../constants/media-queries.js";
import { pagePaths } from "../routes/site-route.js";
import { formatLocalDate, formatVisitDate } from "../utils/date.js";
import { HomeJournal } from "./HomeJournal.jsx";
import { HomeLetter } from "./HomeLetter.jsx";
import { DesktopStationery } from "./DesktopStationery.jsx";
import zhFantasy from "../constants/fantasy/zh.js";
import { StarryGalBalloon } from "./StarryGalBalloon.jsx";

export function HeroSection({ header, language, t, f = zhFantasy, profile, extras = null }) {
  const heroRef = useRef(null);
  const introRef = useRef(null);
  useLayoutEffect(() => {
    const desktop = matchMedia(DESKTOP_FIT_QUERY);
    const hero = heroRef.current;
    const intro = introRef.current;
    const fit = () => {
      if (!desktop.matches) {
        hero.style.removeProperty("--home-fit");
        return;
      }
      const available = Math.max(1, innerHeight - intro.getBoundingClientRect().top - 44);
      hero.style.setProperty("--home-fit", String(Math.min(1, available / intro.offsetHeight)));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(intro);
    observer.observe(hero.querySelector(".site-header"));
    window.addEventListener("resize", fit);
    desktop.addEventListener("change", fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      desktop.removeEventListener("change", fit);
    };
  }, []);
  const [visitDate, setVisitDate] = useState(() => new Date());
  const [mobileScene, setMobileScene] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const timer = window.setInterval(() => setVisitDate(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const updateScene = () => setMobileScene(query.matches);
    query.addEventListener("change", updateScene);
    return () => query.removeEventListener("change", updateScene);
  }, []);

  return (
    <div className="hero" ref={heroRef}>
      <div className="home-floating-elements" aria-hidden="true">
        {mobileScene ? (
          <>
            <img
              className="home-floating-element home-floating-dove-mobile"
              src={ASSETS + "/home-mobile-dove-motion.webp"}
              alt=""
              draggable="false"
              fetchPriority="low"
              decoding="async"
            />
            <img
              className="home-mobile-petal home-mobile-petal-one"
              src={ASSETS + "/home-floating-petal.webp"}
              alt=""
              draggable="false"
              fetchPriority="low"
              decoding="async"
            />
            <img
              className="home-mobile-petal home-mobile-petal-two"
              src={ASSETS + "/home-floating-petal.webp"}
              alt=""
              draggable="false"
              fetchPriority="low"
              decoding="async"
            />
          </>
        ) : (
          <>
            <img
              className="home-floating-element home-floating-dove"
              src={ASSETS + "/home-dove-motion.webp"}
              alt=""
              draggable="false"
              fetchPriority="low"
              decoding="async"
            />
            <img
              className="home-floating-element home-floating-petal"
              src={ASSETS + "/home-petal-motion.webp"}
              alt=""
              draggable="false"
              fetchPriority="low"
              decoding="async"
            />
          </>
        )}
      </div>
      {header}
      {extras}
      <main className="hero-layout" aria-labelledby="page-heading">
        <div className="hero-intro-stack" ref={introRef}>
          <HomeLetter language={language} t={t} chapter={f.chapter} profile={profile} />
          <HomeJournal f={f} t={t} />
        </div>
      </main>
      <p className="sky-quote">
        {t.heroScript}
        <HiOutlineSparkles aria-hidden="true" />
      </p>
      <div className="handwritten-note">
        <p>{t.note}</p>
        <span>
          Nice people
          <br />
          Brighter tomorrow
          <br />
          <time dateTime={formatLocalDate(visitDate)}>— {formatVisitDate(visitDate, language)} ✧</time>
        </span>
        <a className="sky-letter-link" href={pagePaths.contact}>
          {t.skyLetterAction}
          <FaArrowRight aria-hidden="true" />
        </a>
      </div>
      <DesktopStationery />
      <StarryGalBalloon t={t} contentRef={introRef} />
    </div>
  );
}
