import { BsPostageHeart } from "react-icons/bs";
import { FaArrowRight, FaEnvelope, FaXTwitter } from "react-icons/fa6";
import { HiOutlineSparkles } from "react-icons/hi2";
import { PiFlowerLight } from "react-icons/pi";
import { FALLBACK_AVATAR, xProfileUrl } from "../constants/site.js";
import { xMediaSrc } from "../media-urls.js";
import { pagePaths } from "../routes/site-route.js";
import { handleAvatarError } from "../utils/profile.js";
import { GlassFlorals } from "./GlassFlorals.jsx";
import { LetterSeaside } from "./ScrapbookAccents.jsx";

export function HomeLetter({ t, chapter, profile }) {
  return (
    <article className="hero-copy" aria-labelledby="page-heading">
      <GlassFlorals />
      <div className="hero-postmark" aria-hidden="true">
        <BsPostageHeart />
        <span>FROM CHUYONG</span>
      </div>
      <p className="hero-chapter">{chapter}</p>
      <div className="hero-sender hero-identity">
        <div className="profile">
          <img
            src={xMediaSrc(profile.avatar, true, profile.avatarProxy?.highRes) || FALLBACK_AVATAR}
            data-avatar-low-res={xMediaSrc(profile.avatar, false, profile.avatarProxy?.normal) || undefined}
            alt={t.profileAlt}
            onError={handleAvatarError}
          />
          <div className="profile-meta">
            <h1 id="page-heading" tabIndex={-1}>
              {profile.name}
            </h1>
            <a href={xProfileUrl(profile.username)} target="_blank" rel="noopener noreferrer">
              @{profile.username}
            </a>
          </div>
        </div>
      </div>
      <div className="ornament hero-starline" aria-hidden="true">
        <span />
        <HiOutlineSparkles className="ornament-sparkle" />
        <PiFlowerLight />
        <HiOutlineSparkles className="ornament-sparkle" />
        <span />
      </div>
      <div className="hero-sender-note">
        <p className="bio">{t.bio}</p>
        <p className="motto">{t.motto}</p>
      </div>
      <p className="hero-letter-caption">Little moments, from me to you.</p>
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
      </div>
      <LetterSeaside />
    </article>
  );
}
