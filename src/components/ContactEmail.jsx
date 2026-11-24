import { FaEnvelope } from "react-icons/fa6";
import { FiArrowUpRight, FiCopy } from "react-icons/fi";
import { PiFlowerLight } from "react-icons/pi";
import { mailboxes } from "../constants/site.js";
import { LetterComposer } from "./LetterComposer.jsx";

export function ContactEmail({ t, topic, setTopic, body, setBody, detailsRef, copiedId, copyId }) {
  const composer = (
    <LetterComposer
      key="composer"
      t={t}
      topic={topic}
      setTopic={setTopic}
      body={body}
      setBody={setBody}
      detailsRef={detailsRef}
    />
  );
  const actions = (
    <div className="email-options-list" key="actions">
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
              `?subject=${encodeURIComponent(t.letterSubjects[topic])}&body=${encodeURIComponent(body)}`
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
  );
  return (
    <section className="email-row" id="email-options" aria-labelledby="email-options-heading" tabIndex={-1}>
      <h2 id="email-options-heading">
        <FaEnvelope aria-hidden="true" />
        {t.emailHeading}
      </h2>
      {actions}
      {composer}
      <span className="email-stamp" aria-hidden="true">
        <PiFlowerLight />
      </span>
    </section>
  );
}
