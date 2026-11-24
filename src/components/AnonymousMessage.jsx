import { useEffect, useRef, useState } from "react";
import { FiSend } from "react-icons/fi";
import {
  ANONYMOUS_MESSAGE_ENDPOINT,
  ANONYMOUS_MESSAGE_ID,
  ANONYMOUS_MESSAGE_MAX_LENGTH,
} from "../../shared/anonymous-message.mjs";

export function AnonymousMessage({ t }) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("idle");
  const cardRef = useRef(null);
  const submission = useRef(null);
  const sending = status === "sending";
  const message = body.trim();

  useEffect(() => {
    // The Contact chunk can mount after the browser's initial fragment lookup.
    if (window.location.hash !== "#" + ANONYMOUS_MESSAGE_ID) return;
    const frame = window.requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
      cardRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function send(event) {
    event.preventDefault();
    if (!message || sending) return;
    setStatus("sending");
    try {
      if (submission.current?.message !== message) {
        submission.current = { message, id: crypto.randomUUID() };
      }
      const response = await fetch(ANONYMOUS_MESSAGE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission.current),
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status === 429) {
        setStatus("limited");
        return;
      }
      const result = await response.json();
      if (!response.ok || result.status !== "accepted") {
        setStatus(result.status === "unconfigured" ? "unavailable" : "failed");
        return;
      }
      submission.current = null;
      setBody("");
      setStatus("sent");
    } catch {
      setStatus("failed");
    }
  }

  const feedback = {
    sent: t.anonymousMessageSent,
    limited: t.anonymousMessageLimited,
    unavailable: t.anonymousMessageUnavailable,
    failed: t.anonymousMessageFailed,
  }[status];

  return (
    <section
      className="contact-letter-card anonymous-message"
      id={ANONYMOUS_MESSAGE_ID}
      ref={cardRef}
      aria-labelledby="anonymous-message-heading"
      tabIndex={-1}
    >
      <h2 id="anonymous-message-heading">
        <FiSend aria-hidden="true" />
        {t.anonymousMessageHeading}
      </h2>
      <form method="post" action={ANONYMOUS_MESSAGE_ENDPOINT} onSubmit={send}>
        <label className="sr-only" htmlFor="anonymous-message-body">
          {t.anonymousMessageLabel}
        </label>
        <textarea
          id="anonymous-message-body"
          aria-describedby="anonymous-message-length"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setStatus("idle");
          }}
          placeholder={t.anonymousMessagePlaceholder}
          maxLength={ANONYMOUS_MESSAGE_MAX_LENGTH}
          readOnly={sending}
          required
          rows={3}
        />
        <div className="anonymous-message-actions">
          <button type="submit" disabled={sending || !message}>
            {sending ? t.anonymousMessageSending : t.anonymousMessageSend}
          </button>
          <span id="anonymous-message-length">
            {body.length}/{ANONYMOUS_MESSAGE_MAX_LENGTH}
          </span>
        </div>
        <p className="anonymous-message-feedback" role="status" data-status={status}>
          {feedback}
        </p>
      </form>
    </section>
  );
}
