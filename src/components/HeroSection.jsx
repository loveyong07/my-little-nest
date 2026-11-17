import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FaArrowRight, FaEnvelope, FaPaperPlane, FaXTwitter } from "react-icons/fa6";
import { HiOutlineSparkles } from "react-icons/hi2";
import { PiFlowerLight } from "react-icons/pi";
import { BsPostageHeart } from "react-icons/bs";
import { ASSETS, FALLBACK_AVATAR, SAILING_SIGNUP_URL, xProfileUrl } from "../constants/site.js";
import { DESKTOP_FIT_QUERY, MOBILE_QUERY } from "../constants/media-queries.js";
import { pagePaths } from "../routes/site-route.js";
import { xMediaSrc } from "../media-urls.js";
import { handleAvatarError } from "../utils/profile.js";
import { formatLocalDate, formatVisitDate } from "../utils/date.js";
import { HomeJournal } from "./HomeJournal.jsx";
import { GlassFlorals } from "./GlassFlorals.jsx";
import { DesktopStationery } from "./DesktopStationery.jsx";
import { LetterSeaside } from "./ScrapbookAccents.jsx";
import { fantasyCopy } from "../constants/fantasy.js";
import { StarryGalBalloon } from "./StarryGalBalloon.jsx";

export function HeroSection({ header, language, t, profile, extras = null }) {
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
    <section className="hero" ref={heroRef} aria-label={t.homeLabel}>
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
      <div className="hero-layout">
        <div className="hero-intro-stack" ref={introRef}>
          <div className="hero-copy">
            <GlassFlorals />
            <div className="hero-postmark" aria-hidden="true">
              <BsPostageHeart />
              <span>FROM CHUYONG</span>
            </div>
            <p className="home-place-badge">
              <span className="home-place-seal" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M9 20V9l3-4 3 4v11M8 9h8M10 13h1m2 0h1M7.5 20h9M12 2v1.5M3.9 6.8l1.4.7m14.8-.7-1.4.7" />
                </svg>
              </span>
              {t.homePlaceLabel}
            </p>
            <p className="hero-chapter">{fantasyCopy[language].chapter}</p>
            <div className="hero-letter-overline" aria-hidden="true">
              <span>A LITTLE LETTER</span>
              <span>NO. 01</span>
            </div>
            <h1 id="page-heading" tabIndex={-1} aria-label={t.homeGreeting.join(language === "en" ? " " : "")}>
              {t.homeGreeting.map((line, index) => (
                <span className={index === 0 ? "greeting-opening" : "greeting-line"} key={line} aria-hidden="true">
                  {line}
                </span>
              ))}
            </h1>
            <p className="hero-letter-caption">Little moments, from me to you.</p>
            <div className="ornament" aria-hidden="true">
              <span />
              <PiFlowerLight />
              <span />
            </div>
            <div className="hero-sender">
              <div className="profile">
                <img
                  src={xMediaSrc(profile.avatar, true, profile.avatarProxy?.highRes) || FALLBACK_AVATAR}
                  data-avatar-low-res={xMediaSrc(profile.avatar, false, profile.avatarProxy?.normal) || undefined}
                  alt={t.profileAlt}
                  onError={handleAvatarError}
                />
                <div>
                  <strong>{profile.name}</strong>
                  <a href={xProfileUrl(profile.username)} target="_blank" rel="noopener noreferrer">
                    @{profile.username}
                  </a>
                </div>
              </div>
              <div className="hero-sender-note">
                <p className="bio">{t.bio}</p>
                <p className="motto">{t.motto}</p>
              </div>
            </div>
            <div className="hero-actions">
              <a className="primary-cta" href={pagePaths.posts}>
                <FaXTwitter aria-hidden="true" />
                {t.postsCta}
                <FaArrowRight aria-hidden="true" />
              </a>
              <a className="secondary-cta" href={pagePaths.contact}>
                <FaEnvelope aria-hidden="true" />
                {t.contactCta}
              </a>
              <a
                className="sailing-cta"
                href={SAILING_SIGNUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t.sailingLink}
              >
                <FaPaperPlane aria-hidden="true" />
                风帆Sailing
              </a>
            </div>
            <LetterSeaside />
          </div>
          <HomeJournal language={language} t={t} />
        </div>
        <div className="hero-character-space" aria-hidden="true" />
      </div>
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
      <div className="home-edition" aria-hidden="true">
        <span>MY LITTLE NEST</span>
        <span>01 / 03</span>
        <span>SAME SKY. MORE GOOD FRIENDS.</span>
      </div>
      <DesktopStationery />
      <StarryGalBalloon t={t} contentRef={introRef} />
    </section>
  );
}
