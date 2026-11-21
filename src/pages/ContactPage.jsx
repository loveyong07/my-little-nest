import { useRef, useState } from "react";
import { FaDiscord, FaLine, FaQq, FaTelegram, FaWhatsapp, FaWeixin, FaXTwitter } from "react-icons/fa6";
import { FiMessageCircle, FiFeather, FiMail, FiArrowUpRight } from "react-icons/fi";
import { ContactTile, CopyFallback } from "../components/ContactTile.jsx";
import { ContactPostcard } from "../components/ScrapbookAccents.jsx";
import { mailboxes, contactChannels, xProfileUrl } from "../constants/site.js";
import { useDesktopLayout } from "../hooks/useDesktopLayout.js";
import { useClipboard } from "../hooks/useClipboard.js";
import { useSectionEntrance } from "../hooks/useSectionEntrance.js";
import { ContactEmail } from "../components/ContactEmail.jsx";
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
  const desktop = useDesktopLayout();
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

  const email = (
    <ContactEmail
      key="email"
      desktop={desktop}
      t={t}
      topic={letterTopic}
      setTopic={setLetterTopic}
      body={letterBody}
      setBody={setLetterBody}
      detailsRef={draftDetailsRef}
      copiedId={copiedId}
      copyId={copyId}
    />
  );
  const channels = (
    <section
      key="channels"
      className="contact-channels"
      id="contact-methods"
      aria-labelledby="contact-channel-heading"
      tabIndex={-1}
    >
      <div className="contact-channel-heading">
        <h2 id="contact-channel-heading">{t.contactChannelHeading}</h2>
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
    </section>
  );

  return (
    <div className="contacts-section" id="contact" ref={sectionRef}>
      {desktop && (
        <div className="contact-page-links">
          <a href="#email-options">
            <FiMail aria-hidden="true" />
            {t.emailHeading}
          </a>
          <a href="#contact-methods">
            <FiMessageCircle aria-hidden="true" />
            {t.contactChannelHeading}
          </a>
        </div>
      )}
      <div className="contact-desk">{desktop ? [email, channels] : [channels, email]}</div>
      {mailboxes.some(({ address }) => address === copyFailedId) && (
        <CopyFallback value={copyFailedId} message={t.copyFailed} label={t.manualCopyId} inputRef={manualCopyRef} />
      )}
      <div className="letter-guide">
        <ul>
          {t.letterGuideActions.map((label, index) => {
            const Icon = letterIcons[index];
            return (
              <li key={index} data-reveal>
                <Icon aria-hidden="true" />
                <button type="button" className="letter-guide-action" onClick={() => handleGuideAction(index)}>
                  <span>{label}</span>
                  <FiArrowUpRight aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="panel-footer">
        <ContactPostcard />
      </div>
    </div>
  );
}
