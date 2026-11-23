import { useEffect, useRef, useState } from "react";
import { COMMENT_LIMIT, COMMENT_MAX_LENGTH } from "../../shared/post-comments.mjs";
import { formatPostDate } from "../utils/date.js";

export function PostComments({ url, t, language }) {
  const [comments, setComments] = useState(
    /** @type {import("../../shared/contracts.mjs").PostComment[] | null} */ (null),
  );
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const draftId = useRef("");
  const sendingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
        const response = await fetch(url, { signal });
        const data = await response.json();
        if (!response.ok || data?.status !== "ok" || !Array.isArray(data.comments))
          throw new Error("Comments unavailable");
        if (!controller.signal.aborted) setComments(data.comments);
      } catch {
        if (!controller.signal.aborted) setLoadFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [url, loadAttempt]);

  async function submit(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setFeedback("");
    try {
      draftId.current ||= crypto.randomUUID();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draftId.current, text }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json();
      if (response.ok && data?.status === "ok" && Array.isArray(data.comments)) {
        setComments(data.comments);
        setDraft("");
        draftId.current = "";
        setFeedback("published");
      } else {
        setFeedback(data?.status === "rate_limited" ? "rateLimited" : data?.status === "full" ? "full" : "failed");
      }
    } catch {
      setFeedback("failed");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (loadFailed) {
    return (
      <div className="feed-status-actions">
        <p role="status">{t.commentsUnavailable}</p>
        <button
          type="button"
          onClick={() => {
            setLoadFailed(false);
            setLoadAttempt((value) => value + 1);
          }}
        >
          {t.retry}
        </button>
      </div>
    );
  }
  if (!comments) return <p role="status">{t.commentsLoading}</p>;

  const full = comments.length >= COMMENT_LIMIT || feedback === "full";
  return (
    <>
      {full ? (
        <p role="status">{t.commentsFull}</p>
      ) : (
        <form className="post-comment-form" onSubmit={submit}>
          <label>
            {t.commentText}
            <textarea
              rows={3}
              value={draft}
              maxLength={COMMENT_MAX_LENGTH}
              required
              disabled={sending}
              onChange={(event) => {
                draftId.current = "";
                setDraft(event.target.value);
                setFeedback("");
              }}
            />
          </label>
          <div className="post-comment-actions">
            <small>{t.commentPublic}</small>
            <button className="post-action" type="submit" disabled={sending || !draft.trim()}>
              {sending ? t.commentSending : t.commentSubmit}
            </button>
          </div>
          <p role="status">
            {feedback === "published"
              ? t.commentPublished
              : feedback === "rateLimited"
                ? t.commentRateLimited
                : feedback === "failed"
                  ? t.commentFailed
                  : null}
          </p>
        </form>
      )}
      {comments.length ? (
        <ul className="post-comment-list">
          {comments.slice(0, visibleCount).map((comment) => (
            <li key={comment.id}>
              <div>
                <strong>{t.commentGuest}</strong>{" "}
                <time dateTime={comment.createdAt}>{formatPostDate(comment.createdAt, language)}</time>
              </div>
              <p dir="auto">{comment.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="post-comment-empty">{t.commentsEmpty}</p>
      )}
      {comments.length > visibleCount && (
        <button type="button" className="post-action" onClick={() => setVisibleCount((count) => count + 20)}>
          {t.commentsMore}
        </button>
      )}
    </>
  );
}
