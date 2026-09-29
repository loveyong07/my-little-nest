import { FaEnvelope, FaLine, FaQq, FaTelegram, FaWeixin, FaXTwitter } from "react-icons/fa6";
import { HiOutlineSparkles } from "react-icons/hi2";
import { PiFlowerLight } from "react-icons/pi";
import { ContactTile } from "../components/ContactTile.jsx";
import { mailboxes, HANDLE } from "../constants/site.js";
import { useClipboard } from "../hooks/useClipboard.js";

export default function ContactPage({ language, t, profile }) {
  const { copiedId, copyFailedId, manualCopyRef, copyId } = useClipboard();

  const socials = [
    { icon: FaXTwitter, className: "x", title: "X", sub: t.xSub, href: `https://x.com/${profile.username}`, action: t.actionOpen },
    { icon: FaLine, className: "line", title: "LINE", sub: t.lineSub, href: "https://line.me/ti/p/LSaMZQcRLu", action: t.actionOpen },
    { icon: FaTelegram, className: "telegram", title: "Telegram", sub: t.telegramSub, href: "https://t.me/loveyong07", action: t.actionOpen },
    { icon: FaWeixin, className: "wechat", title: language === "zh" ? "微信" : "WeChat", sub: t.wechatSub, onClick: () => copyId(HANDLE), copyLabel: t.copy + ": " + HANDLE, copied: copiedId === HANDLE ? t.copied : undefined, action: t.actionCopy, failedId: copyFailedId === HANDLE ? HANDLE : undefined },
    { icon: FaQq, className: "qq", title: "QQ", sub: t.qqSub, onClick: () => copyId("3437702786"), copyLabel: t.copy + ": 3437702786", copied: copiedId === "3437702786" ? t.copied : undefined, action: t.actionCopy, failedId: copyFailedId === "3437702786" ? "3437702786" : undefined },
    { icon: FaEnvelope, className: "email", title: language === "zh" ? "邮箱" : language === "ja" ? "メール" : "Email", sub: t.emailSub, href: "#email-options", action: t.actionWrite },
  ];

  return <div className="contacts-section" id="contact">
    <div className="contacts-heading-row">
      <div className="section-heading"><HiOutlineSparkles aria-hidden="true" /><h2>{t.contactsHeading}</h2></div>
      <span className="micro-slogan">{t.footerSmall}</span>
    </div>
    <div className="contact-grid">{socials.map((social) => <ContactTile key={social.title} {...social}
      failureMessage={t.copyFailed} manualCopyLabel={t.manualCopyId} inputRef={manualCopyRef} />)}</div>
    <div className="email-row" id="email-options">
      <span><FaEnvelope aria-hidden="true" />{t.emailHeading}</span>
      <div>{mailboxes.map(({ label, address }) => <a key={address} href={"mailto:" + address} title={address}>{label}<span>{address}</span></a>)}</div>
      <span className="email-stamp" aria-hidden="true"><PiFlowerLight /></span>
    </div>
    <div className="panel-footer">
      <p className="footer-script">{t.footerScript}</p>
      <p className="footer-note">{t.footerNote}</p>
      <PiFlowerLight className="footer-flower" aria-hidden="true" />
    </div>
  </div>;
}
