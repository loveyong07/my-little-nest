import { FaEnvelope, FaLine, FaQq, FaTelegram, FaWhatsapp, FaWeixin, FaXTwitter } from "react-icons/fa6";
import { HiOutlineSparkles } from "react-icons/hi2";
import { FiCopy, FiMessageCircle, FiFeather, FiMail } from "react-icons/fi";
import { PiFlowerLight } from "react-icons/pi";
import { ContactTile, CopyFallback } from "../components/ContactTile.jsx";
import { ContactPostcard } from "../components/ScrapbookAccents.jsx";
import { mailboxes, contactChannels, xProfileUrl } from "../constants/site.js";
import { useClipboard } from "../hooks/useClipboard.js";

const contactIcons = {
  x: FaXTwitter,
  line: FaLine,
  telegram: FaTelegram,
  whatsapp: FaWhatsapp,
  wechat: FaWeixin,
  qq: FaQq,
};
const letterIcons = [FiMessageCircle, FiFeather, FiMail];

export default function ContactPage({ t, profile }) {
  const { copiedId, copyFailedId, manualCopyRef, copyId } = useClipboard();
  // The service name belongs in the accessible name of a copy tile, not only in the visible title.
  const copyLabel = (service, account) => `${service} · ${t.copy}: ${account}`;

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

  return (
    <div className="contacts-section" id="contact">
      <div className="contacts-heading-row">
        <div className="section-heading">
          <HiOutlineSparkles aria-hidden="true" />
          <h2>{t.contactsHeading}</h2>
        </div>
        <span className="micro-slogan">{t.footerSmall}</span>
      </div>
      <p className="contact-intro">{t.contactIntro}</p>
      <div className="contact-grid">
        {socials.map((social) => (
          <ContactTile
            key={social.title}
            {...social}
            failureMessage={t.copyFailed}
            manualCopyLabel={t.manualCopyId}
            inputRef={manualCopyRef}
          />
        ))}
      </div>
      <section className="email-row" id="email-options" aria-labelledby="email-options-heading">
        <h3 id="email-options-heading">
          <FaEnvelope aria-hidden="true" />
          {t.emailHeading}
        </h3>
        <div>
          {mailboxes.map(({ label, address }) => (
            <div className="email-option" key={address}>
              <a href={"mailto:" + address} title={address}>
                {label}
                <span>{address}</span>
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
      {mailboxes.some(({ address }) => address === copyFailedId) && (
        <CopyFallback value={copyFailedId} message={t.copyFailed} label={t.manualCopyId} inputRef={manualCopyRef} />
      )}
      <section className="letter-guide" aria-labelledby="letter-guide-heading">
        <h3 id="letter-guide-heading">{t.letterGuideHeading}</h3>
        <ul>
          {t.letterGuide.map(({ title, text }, index) => {
            const Icon = letterIcons[index];
            return (
              <li key={title}>
                <Icon aria-hidden="true" />
                <div>
                  <h4>{title}</h4>
                  <p>{text}</p>
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
