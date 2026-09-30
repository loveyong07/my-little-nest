import { useEffect, useState } from "react";
import { FaArrowRight, FaEnvelope, FaXTwitter } from "react-icons/fa6";
import { HiOutlineSparkles } from "react-icons/hi2";
import { PiFlowerLight } from "react-icons/pi";
import { ASSETS, FALLBACK_AVATAR } from "../constants/site.js";
import { pagePaths } from "../routes/site-route.js";
import { xMediaSrc } from "../media-urls.js";
import { handleAvatarError } from "../utils/profile.js";
import { formatLocalDate, formatVisitDate } from "../utils/date.js";

export function HeroSection({ header, language, t, profile }) {
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

  return <section className="hero" aria-label={t.homeLabel}>
      <div className="home-floating-elements" aria-hidden="true">
        {mobileScene ? <>
          <img className="home-floating-element home-floating-dove-mobile" src={ASSETS + "/home-mobile-dove-motion.png"} alt="" draggable="false" />
          <img className="home-mobile-petal home-mobile-petal-one" src={ASSETS + "/home-floating-petal.png"} alt="" draggable="false" />
          <img className="home-mobile-petal home-mobile-petal-two" src={ASSETS + "/home-floating-petal.png"} alt="" draggable="false" />
        </> : <>
          <img className="home-floating-element home-floating-dove" src={ASSETS + "/home-dove-motion.png"} alt="" draggable="false" />
          <img className="home-floating-element home-floating-petal" src={ASSETS + "/home-petal-motion.png"} alt="" draggable="false" />
        </>}
      </div>
      {header}
      <div className="hero-layout">
      <div className="hero-copy">
        <p className="home-place-badge">
          <span className="home-place-seal" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M9 20V9l3-4 3 4v11M8 9h8M10 13h1m2 0h1M7.5 20h9M12 2v1.5M3.9 6.8l1.4.7m14.8-.7-1.4.7" />
            </svg>
          </span>
          {t.homePlaceLabel}
        </p>
        <h1 id="page-heading" tabIndex={-1} aria-label="Welcome to my little nest！"><span>Welcome</span><span>to my little nest<em>!</em></span></h1>
        <div className="ornament" aria-hidden="true"><span /><PiFlowerLight /><span /></div>
        <div className="profile">
          <img src={xMediaSrc(profile.avatar, true) || FALLBACK_AVATAR}
            data-avatar-low-res={xMediaSrc(profile.avatar) || undefined} alt={t.profileAlt} onError={handleAvatarError} />
          <div><strong>{profile.name}</strong><a href={`https://x.com/${profile.username}`} target="_blank" rel="noopener noreferrer">@{profile.username}</a></div>
        </div>
        <p className="bio">{t.bio}</p>
        <p className="motto">{t.motto}</p>
        <div className="hero-actions">
          <a className="primary-cta" href={pagePaths.posts}><FaXTwitter aria-hidden="true" />{t.postsCta}<FaArrowRight aria-hidden="true" /></a>
          <a className="secondary-cta" href={pagePaths.contact}><FaEnvelope aria-hidden="true" />{t.contactCta}</a>
        </div>
      </div>
      <div className="hero-character-space" aria-hidden="true" />
      </div>
      <p className="sky-quote">{t.heroScript}<HiOutlineSparkles aria-hidden="true" /></p>
      <div className="handwritten-note"><p>{t.note}</p><span>Nice people<br />Brighter tomorrow<br /><time dateTime={formatLocalDate(visitDate)}>— {formatVisitDate(visitDate, language)} ✧</time></span></div>
  </section>;
}
