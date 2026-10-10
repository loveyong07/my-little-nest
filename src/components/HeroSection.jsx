import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FaArrowRight, FaEnvelope, FaXTwitter } from "react-icons/fa6";
import { HiOutlineSparkles } from "react-icons/hi2";
import { PiFlowerLight } from "react-icons/pi";
import { GiBowTieRibbon } from "react-icons/gi";
import { ASSETS, FALLBACK_AVATAR } from "../constants/site.js";
import { pagePaths } from "../routes/site-route.js";
import { xMediaSrc } from "../media-urls.js";
import { handleAvatarError } from "../utils/profile.js";
import { formatLocalDate, formatVisitDate } from "../utils/date.js";
import { HomeJournal } from "./HomeJournal.jsx";
import { fantasyCopy } from "../constants/fantasy.js";

export function HeroSection({ header, language, t, profile }) {
  const heroRef = useRef(null);
  const introRef = useRef(null);
  useLayoutEffect(() => {
    const desktop = matchMedia("(min-width: 901px) and (pointer: fine)");
    const hero = heroRef.current;
    const intro = introRef.current;
    const fit = () => {
      if (!desktop.matches) { hero.style.removeProperty("--home-fit"); return; }
      const headerHeight = hero.querySelector(".site-header").offsetHeight;
      const available = Math.max(1, innerHeight - headerHeight - 110);
      hero.style.setProperty("--home-fit", String(Math.min(1, available / intro.offsetHeight)));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(intro);
    observer.observe(hero.querySelector(".site-header"));
    window.addEventListener("resize", fit);
    desktop.addEventListener("change", fit);
    fit();
    return () => {
      observer.disconnect(); window.removeEventListener("resize", fit);
      desktop.removeEventListener("change", fit);
    };
  }, []);
  const [visitDate, setVisitDate] = useState(() => new Date());
  const [mobileScene, setMobileScene] = useState(() => window.matchMedia("(max-width: 700px)").matches);
  useEffect(() => {
    const timer = window.setInterval(() => setVisitDate(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const updateScene = () => setMobileScene(query.matches);
    query.addEventListener("change", updateScene);
    return () => query.removeEventListener("change", updateScene);
  }, []);

  return <section className="hero" ref={heroRef} aria-label={t.homeLabel}>
      <div className="home-floating-elements" aria-hidden="true">
        {mobileScene ? <>
          <img className="home-floating-element home-floating-dove-mobile" src={ASSETS + "/home-mobile-dove-motion.webp"} alt="" draggable="false" fetchPriority="low" decoding="async" />
          <img className="home-mobile-petal home-mobile-petal-one" src={ASSETS + "/home-floating-petal.webp"} alt="" draggable="false" fetchPriority="low" decoding="async" />
          <img className="home-mobile-petal home-mobile-petal-two" src={ASSETS + "/home-floating-petal.webp"} alt="" draggable="false" fetchPriority="low" decoding="async" />
        </> : <>
          <img className="home-floating-element home-floating-dove" src={ASSETS + "/home-dove-motion.webp"} alt="" draggable="false" fetchPriority="low" decoding="async" />
          <img className="home-floating-element home-floating-petal" src={ASSETS + "/home-petal-motion.webp"} alt="" draggable="false" fetchPriority="low" decoding="async" />
        </>}
      </div>
      {header}
      <div className="hero-layout">
      <div className="hero-intro-stack" ref={introRef}>
      <div className="hero-copy">
        <GiBowTieRibbon className="hero-bow" aria-hidden="true" />
        <p className="home-place-badge">
          <span className="home-place-seal" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M9 20V9l3-4 3 4v11M8 9h8M10 13h1m2 0h1M7.5 20h9M12 2v1.5M3.9 6.8l1.4.7m14.8-.7-1.4.7" />
            </svg>
          </span>
          {t.homePlaceLabel}
        </p>
        <p className="hero-chapter">{fantasyCopy[language].chapter}</p>
        <h1 id="page-heading" tabIndex={-1} aria-label="Welcome to my little nest！"><span aria-hidden="true">{"Welcome".split("").map((letter, i) => <b className="greeting-letter" style={{ "--letter": i }} key={i}>{letter}</b>)}</span><span className="greeting-line" aria-hidden="true">to my little nest<em>!</em></span></h1>
        <div className="ornament" aria-hidden="true"><span /><PiFlowerLight /><span /></div>
        <div className="profile">
          <img src={xMediaSrc(profile.avatar, true, profile.avatarProxy?.highRes) || FALLBACK_AVATAR}
            data-avatar-low-res={xMediaSrc(profile.avatar, false, profile.avatarProxy?.normal) || undefined} alt={t.profileAlt} onError={handleAvatarError} />
          <div><strong>{profile.name}</strong><a href={`https://x.com/${profile.username}`} target="_blank" rel="noopener noreferrer">@{profile.username}</a></div>
        </div>
        <p className="bio">{t.bio}</p>
        <p className="motto">{t.motto}</p>
        <div className="hero-actions">
          <a className="primary-cta" href={pagePaths.posts}><FaXTwitter aria-hidden="true" />{t.postsCta}<FaArrowRight aria-hidden="true" /></a>
          <a className="secondary-cta" href={pagePaths.contact}><FaEnvelope aria-hidden="true" />{t.contactCta}</a>
        </div>
      </div>
      <HomeJournal language={language} />
      </div>
      <div className="hero-character-space" aria-hidden="true" />
      </div>
      <p className="sky-quote">{t.heroScript}<HiOutlineSparkles aria-hidden="true" /></p>
      <div className="handwritten-note"><p>{t.note}</p><span>Nice people<br />Brighter tomorrow<br /><time dateTime={formatLocalDate(visitDate)}>— {formatVisitDate(visitDate, language)} ✧</time></span></div>
  </section>;
}
