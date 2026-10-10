import { FaEnvelope, FaLine, FaQq, FaTelegram, FaWeixin, FaXTwitter } from "react-icons/fa6";
import { HiOutlineSparkles } from "react-icons/hi2";
import { PiFlowerLight } from "react-icons/pi";
import { ContactTile } from "../components/ContactTile.jsx";
import { mailboxes, HANDLE, QQ_NUMBER } from "../constants/site.js";
import { useClipboard } from "../hooks/useClipboard.js";

export default function ContactPage({ language, t, profile }) {
  const { copiedId, copyFailedId, manualCopyRef, copyId } = useClipboard();

  const socials = [
    { icon: FaXTwitter, className: "x", title: "X", sub: t.xSub, href: `https://x.com/${profile.username}`, action: t.actionOpen },
    { icon: FaLine, className: "line", title: "LINE", sub: t.lineSub, href: "https://line.me/ti/p/LSaMZQcRLu", action: t.actionOpen },
    { icon: FaTelegram, className: "telegram", title: "Telegram", sub: t.telegramSub, href: "https://t.me/loveyong07", action: t.actionOpen },
    { icon: FaWeixin, className: "wechat", title: language === "zh" ? "微信" : "WeChat", sub: t.wechatSub, onClick: () => copyId(HANDLE), copyLabel: t.copy + ": " + HANDLE, copied: copiedId === HANDLE ? t.copied : undefined, action: t.actionCopy, failedId: copyFailedId === HANDLE ? HANDLE : undefined },
    { icon: FaQq, className: "qq", title: "QQ", sub: t.qqSub, onClick: () => copyId(QQ_NUMBER), copyLabel: t.copy + ": " + QQ_NUMBER, copied: copiedId === QQ_NUMBER ? t.copied : undefined, action: t.actionCopy, failedId: copyFailedId === QQ_NUMBER ? QQ_NUMBER : undefined },
    { icon: FaEnvelope, className: "email", title: language === "zh" ? "邮箱" : language === "ja" ? "メール" : "Email", sub: t.emailSub, href: `mailto:${mailboxes[0].address}`, action: t.actionWrite },
  ];

  return <div className="contacts-section" id="contact">
    <div className="contacts-heading-row">
      <div className="section-heading"><HiOutlineSparkles aria-hidden="true" /><h2>{t.contactsHeading}</h2></div>
      <span className="micro-slogan">{t.footerSmall}</span>
    </div>
    <div className="contact-grid">{socials.map((social) => <ContactTile key={social.title} {...social}
      failureMessage={t.copyFailed} manualCopyLabel={t.manualCopyId} inputRef={manualCopyRef} />)}</div>
    <section className="email-row" id="email-options" aria-labelledby="email-options-heading">
      <h3 id="email-options-heading"><FaEnvelope aria-hidden="true" />{t.emailHeading}</h3>
      <div>{mailboxes.map(({ label, address }) => <a key={address} href={"mailto:" + address} title={address}>{label}<span>{address}</span></a>)}</div>
      <span className="email-stamp" aria-hidden="true"><PiFlowerLight /></span>
    </section>
    <div className="panel-footer">
      <p className="footer-script">{t.footerScript}</p>
      <p className="footer-note">{t.footerNote}</p>
      <PiFlowerLight className="footer-flower" aria-hidden="true" />
    </div>
  </div>;
}
