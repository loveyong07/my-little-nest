import { useEffect, useRef } from "react";
import { FiAlertCircle, FiCpu, FiExternalLink, FiGithub, FiGlobe, FiMonitor, FiSend, FiX } from "react-icons/fi";
import { businessCopy, businessLinks } from "../constants/business.js";
import { pagePaths } from "../routes/site-route.js";

const cardIcons = { network: FiGlobe, sailing: FiSend, clash: FiGithub, memberships: FiSend, ai: FiCpu, "chatgpt-desktop": FiMonitor };

export default function BusinessPage({ language }) {
  const text = businessCopy[language];
  const dialogRef = useRef(null);
  const headingRef = useRef(null);
  const continueRef = useRef(null);
  const overflowRef = useRef("");
  const returnFocusRef = useRef(null);

  function openDisclaimer() {
    if (dialogRef.current.open) return;
    overflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current.showModal();
    headingRef.current?.focus({ preventScroll: true });
    dialogRef.current.scrollTop = 0;
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    openDisclaimer();
    return () => {
      dialog.close();
      document.body.style.overflow = overflowRef.current;
    };
  }, []);

  function restorePage() {
    // StrictMode can dispatch a queued close after the dialog has reopened.
    if (dialogRef.current?.open) return;
    document.body.style.overflow = overflowRef.current;
    (returnFocusRef.current ?? document.getElementById("page-heading"))?.focus({ preventScroll: true });
  }

  function keepFocusInDialog(event) {
    if (event.key !== "Tab") return;
    const first = dialogRef.current.querySelector("button");
    const last = continueRef.current;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return <section className="business-section" aria-label={text.cardsLabel}>
    <div className="business-toolbar">
      <button type="button" className="business-disclaimer-trigger" onClick={(event) => {
        returnFocusRef.current = event.currentTarget;
        openDisclaimer();
      }}><FiAlertCircle aria-hidden="true" />{text.viewDisclaimer}</button>
    </div>
    <div className="business-grid">
      {text.cards.map((card) => {
        const Icon = cardIcons[card.id];
        const href = businessLinks[card.id];
        return <article className={"business-card business-card-" + card.id} key={card.id} aria-labelledby={"business-" + card.id}>
          <div className="business-card-heading">
            <span className="business-card-icon"><Icon aria-hidden="true" /></span>
            <h2 id={"business-" + card.id}>{card.title}</h2>
          </div>
          {card.description && <p className="business-card-description">{card.description}</p>}
          {card.price && <p className="business-card-price">{card.price}</p>}
          {href && <p className="business-card-link">
            {card.platformLabel && <strong>{card.platformLabel}：</strong>}
            <a className="business-card-url" href={href} target="_blank" rel="noopener noreferrer">{href}</a>
          </p>}
          {card.iosDescription && <p className="business-card-description"><strong>iOS：</strong>{card.iosDescription}</p>}
          {card.id === "sailing" && <p className="business-promo">{text.promoCode}<strong>touchgal</strong></p>}
          <a className="business-card-action" href={href ?? pagePaths.contact} target={href ? "_blank" : undefined} rel={href ? "noopener noreferrer" : undefined}>
            {href ? text.openLink : text.contact}<FiExternalLink aria-hidden="true" />
          </a>
        </article>;
      })}
    </div>
    <dialog ref={dialogRef} className="business-disclaimer" role="dialog" aria-labelledby="business-disclaimer-heading"
      aria-describedby="business-disclaimer-body" onClose={restorePage} onKeyDown={keepFocusInDialog}>
      <div className="business-disclaimer-header">
        <span className="business-disclaimer-icon"><FiAlertCircle aria-hidden="true" /></span>
        <h2 ref={headingRef} id="business-disclaimer-heading" tabIndex={-1}>{text.disclaimerTitle}</h2>
        <button type="button" className="business-disclaimer-close" aria-label={text.closeDisclaimer} onClick={() => dialogRef.current.close()}><FiX aria-hidden="true" /></button>
      </div>
      <div className="business-disclaimer-body" id="business-disclaimer-body">
        <p>{text.disclaimerIntro}</p>
        <p>{text.responsibilityBefore}<strong>{text.responsibility}</strong>{text.responsibilityAfter}<strong>{text.noLiability}</strong></p>
        <p className="business-disclaimer-sales"><strong>{text.refundPolicy}</strong>{text.supportBefore}<strong>{text.support}</strong>{language === "zh" || language === "ja" ? "。" : "."}</p>
      </div>
      <button ref={continueRef} type="button" className="business-disclaimer-continue" onClick={() => dialogRef.current.close()}>{text.continueBrowsing}</button>
    </dialog>
  </section>;
}
