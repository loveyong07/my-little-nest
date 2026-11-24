import { FiCopy, FiLink2 } from "react-icons/fi";
import { ANONYMOUS_MESSAGE_ID } from "../../shared/anonymous-message.mjs";
import { useClipboard } from "../hooks/useClipboard.js";
import { SITE_ORIGIN } from "../routes/site-metadata.js";
import { pagePaths } from "../routes/site-route.js";
import { CopyFallback } from "./ContactTile.jsx";

export function ContactShare({ t }) {
  const { copiedId, copyFailedId, manualCopyRef, copyId } = useClipboard();
  const links = [
    { url: SITE_ORIGIN + pagePaths.home, label: t.contactShareHome },
    {
      url: SITE_ORIGIN + pagePaths.contact + "#" + ANONYMOUS_MESSAGE_ID,
      label: t.contactShareMessage,
    },
  ];
  const failedLink = links.find(({ url }) => url === copyFailedId);

  return (
    <section className="contact-letter-card contact-share" aria-labelledby="contact-share-heading">
      <h2 id="contact-share-heading">
        <FiLink2 aria-hidden="true" />
        {t.contactShareHeading}
      </h2>
      <div className="contact-share-actions">
        {links.map(({ url, label }) => (
          <button type="button" key={url} aria-label={label} onClick={() => copyId(url)}>
            <FiCopy aria-hidden="true" />
            <span aria-live="polite">{copiedId === url ? t.linkCopied : label}</span>
          </button>
        ))}
      </div>
      {failedLink && (
        <CopyFallback
          value={failedLink.url}
          message={t.copyLinkFailed}
          label={failedLink.label}
          inputRef={manualCopyRef}
        />
      )}
    </section>
  );
}
