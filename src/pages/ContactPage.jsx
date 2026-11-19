import { useRef, useState } from "react";
import { FaDiscord, FaEnvelope, FaLine, FaQq, FaTelegram, FaWhatsapp, FaWeixin, FaXTwitter } from "react-icons/fa6";
import { HiOutlineSparkles } from "react-icons/hi2";
import { FiCopy, FiMessageCircle, FiFeather, FiMail, FiArrowUpRight } from "react-icons/fi";
import { PiFlowerLight } from "react-icons/pi";
import { ContactTile, CopyFallback } from "../components/ContactTile.jsx";
import { ContactPostcard } from "../components/ScrapbookAccents.jsx";
import { mailboxes, contactChannels, xProfileUrl } from "../constants/site.js";
import { useClipboard } from "../hooks/useClipboard.js";
import { useSectionEntrance } from "../hooks/useSectionEntrance.js";
import { SectionHeading } from "../components/SectionHeading.jsx";
import { LetterComposer } from "../components/LetterComposer.jsx";
import { preferredScrollBehavior } from "../utils/motion.js";
import "../styles/contact-route.css";

const contactIcons = {
  x: FaXTwitter,
  line: FaLine,
  telegram: FaTelegram,
  discord: FaDiscord,
  whatsapp: FaWhatsapp,
  wechat: FaWeixin,
  qq: FaQq,
};
const letterIcons = [FiMessageCircle, FiFeather, FiMail];

export default function ContactPage({ t, profile }) {
  const [channelFilter, setChannelFilter] = useState("all");
  const [letterTopic, setLetterTopic] = useState(0);
  const [letterBody, setLetterBody] = useState("");
  const sectionRef = useRef(null);
  const draftDetailsRef = useRef(null);
  useSectionEntrance(sectionRef);
  const { copiedId, copyFailedId, manualCopyRef, copyId } = useClipboard();
  // The service name belongs in the accessible name of a copy tile, not only in the visible title.
  const copyLabel = (service, account) => `${service} · ${t.copy}: ${account}`;

  function handleGuideAction(index) {
    if (index === 0) {
      setChannelFilter("all");
      const list = document.getElementById("contact-channel-list");
      list?.scrollIntoView({ block: "center", behavior: preferredScrollBehavior() });
      const firstChannel = list?.querySelector(".contact-tile");
      if (firstChannel instanceof HTMLElement) firstChannel.focus({ preventScroll: true });
      return;
    }
    setLetterTopic(index);
    if (draftDetailsRef.current) {
      draftDetailsRef.current.open = true;
    }
    window.requestAnimationFrame(() => {
      const textarea = document.getElementById("letter-draft-body");
      textarea?.scrollIntoView({ block: "center", behavior: preferredScrollBehavior() });
      textarea?.focus({ preventScroll: true });
    });
  }

  const socials = contactChannels.map(({ id, title, titleKey, descriptionKey, href, account }) => {
    const name = titleKey ? t[titleKey] : title;
    return {
      icon: contactIcons[id],
      className: id,
      title: name,
      sub: t[descriptionKey],
      href: id === "x" ? xProfileUrl(profile.username) : href,
      onClick: account ? () => copyId(account) : undefined,
      copyLabel: account ? copyLabel(name, account) : undefined,
      copied: account && copiedId === account ? t.copied : undefined,
      action: account ? t.actionCopy : t.actionOpen,
      failedId: account && copyFailedId === account ? account : undefined,
    };
  });
  const visibleSocials = socials.filter(
    (social) => channelFilter === "all" || (channelFilter === "open" ? social.href : !social.href),
  );

  return (
    <div className="contacts-section" id="contact" ref={sectionRef}>
      <div className="contacts-heading-row">
        <SectionHeading icon={HiOutlineSparkles} number="✦" kicker="A LITTLE HELLO">
          {t.contactsHeading}
        </SectionHeading>
        <span className="micro-slogan">{t.footerSmall}</span>
      </div>
      <p className="contact-intro">{t.contactIntro}</p>
      <div className="contact-desk">
        <div className="contact-channels">
          <div className="contact-channel-heading">
            <h3>{t.contactChannelHeading}</h3>
            <span>{String(socials.length).padStart(2, "0")} WAYS TO SAY HELLO</span>
          </div>
          <div className="contact-filters" role="group" aria-label={t.contactFilterLabel}>
            {["all", "open", "copy"].map((filter, index) => (
              <button
                key={filter}
                type="button"
                aria-pressed={channelFilter === filter}
                aria-controls="contact-channel-list"
                onClick={() => setChannelFilter(filter)}
              >
                {t.contactFilters[index]}
                <span aria-hidden="true">
                  {filter === "all"
                    ? socials.length
                    : socials.filter((social) => (filter === "open" ? social.href : !social.href)).length}
                </span>
              </button>
            ))}
          </div>
          <div className="contact-grid" id="contact-channel-list">
            {visibleSocials.map((social) => (
              <ContactTile
                key={social.className}
                {...social}
                failureMessage={t.copyFailed}
                manualCopyLabel={t.manualCopyId}
                inputRef={manualCopyRef}
              />
            ))}
          </div>
          <span className="sr-only" role="status">
            {t.contactFilters[["all", "open", "copy"].indexOf(channelFilter)]} · {visibleSocials.length}
          </span>
        </div>
        <section className="email-row" id="email-options" aria-labelledby="email-options-heading">
          <div className="mail-card-heading" aria-hidden="true">
            <span>A LETTER, JUST BETWEEN US</span>
            <span>01</span>
          </div>
          <div className="mail-card-art" aria-hidden="true">
            <FiMail />
            <PiFlowerLight />
            <span>
              FROM CHUYONG
              <br />
              WITH A LITTLE LOVE
            </span>
          </div>
          <h3 id="email-options-heading">
            <FaEnvelope aria-hidden="true" />
            {t.emailHeading}
          </h3>
          <p className="mail-card-note">{t.mailCardNote}</p>
          <LetterComposer
            t={t}
            topic={letterTopic}
            setTopic={setLetterTopic}
            body={letterBody}
            setBody={setLetterBody}
            detailsRef={draftDetailsRef}
          />
          <div className="email-options-list">
            {mailboxes.map(({ label, address }) => (
              <div className="email-option" key={address}>
                <div className="email-address">
                  {label}
                  <span>{address}</span>
                </div>
                <a
                  className="mail-compose-link"
                  href={
                    "mailto:" +
                    address +
                    `?subject=${encodeURIComponent(t.letterSubjects[letterTopic])}&body=${encodeURIComponent(letterBody)}`
                  }
                >
                  {t.mailCardAction}
                  <FiArrowUpRight aria-hidden="true" />
                </a>
                <button type="button" onClick={() => copyId(address)} aria-label={`${t.copyEmail}: ${address}`}>
                  <FiCopy aria-hidden="true" />
                  <span role="status">{copiedId === address ? t.copied : t.copyEmail}</span>
                </button>
              </div>
            ))}
          </div>
          <span className="email-stamp" aria-hidden="true">
            <PiFlowerLight />
          </span>
        </section>
      </div>
      {mailboxes.some(({ address }) => address === copyFailedId) && (
        <CopyFallback value={copyFailedId} message={t.copyFailed} label={t.manualCopyId} inputRef={manualCopyRef} />
      )}
      <section className="letter-guide" aria-labelledby="letter-guide-heading">
        <h3 id="letter-guide-heading">{t.letterGuideHeading}</h3>
        <ul>
          {t.letterGuide.map(({ title, text }, index) => {
            const Icon = letterIcons[index];
            return (
              <li key={index} data-reveal>
                <Icon aria-hidden="true" />
                <div>
                  <h4>{title}</h4>
                  <p>{text}</p>
                  <button type="button" className="letter-guide-action" onClick={() => handleGuideAction(index)}>
                    <span>{t.letterGuideActions[index]}</span>
                    <FiArrowUpRight aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <div className="panel-footer">
        <p className="footer-script">{t.footerScript}</p>
        <p className="footer-note">{t.footerNote}</p>
        <PiFlowerLight className="footer-flower" aria-hidden="true" />
        <ContactPostcard />
      </div>
    </div>
  );
}
