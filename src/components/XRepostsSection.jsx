import { useEffect, useRef } from "react";
import { FaArrowRight } from "react-icons/fa6";
import { FiChevronLeft, FiChevronRight, FiRepeat } from "react-icons/fi";
import { PostCard } from "./PostCard.jsx";
import { SectionHeading } from "./SectionHeading.jsx";
import { formatPostDate } from "../utils/date.js";
import { postExcerpt } from "../utils/posts.js";
import { preferredScrollBehavior } from "../utils/motion.js";
import { xProfileUrl } from "../constants/site.js";

export function XRepostsSection({
  reposts,
  repostIndex,
  setRepostIndex,
  repostState,
  feedLoading,
  retryDisabled,
  retryFeed,
  language,
  t,
  profile,
}) {
  const readingRef = useRef(null);
  const timelineRef = useRef(null);
  const index = Math.min(repostIndex, Math.max(0, reposts.length - 1));
  const post = reposts[index];
  const recovering = ["stale", "unavailable"].includes(repostState);
  const message =
    repostState === "loading"
      ? t.repostsLoading
      : repostState === "none"
        ? t.repostsEmpty
        : repostState === "stale"
          ? t.repostsStale
          : repostState === "unavailable"
            ? t.repostsUnavailable
            : null;

  useEffect(() => {
    const strip = timelineRef.current;
    const selected = strip?.querySelector('[aria-current="true"]');
    if (!strip || !selected) return;
    const left = selected.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    if (left < strip.scrollLeft || left + selected.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: Math.max(0, left - (strip.clientWidth - selected.offsetWidth) / 2), behavior: "instant" });
    }
  }, [index, reposts, language]);

  function turnPost(next) {
    setRepostIndex(next);
    readingRef.current?.scrollIntoView({ block: "start", behavior: preferredScrollBehavior() });
  }

  return (
    <section className="posts-group reposts-group" id="x-reposts" aria-labelledby="x-reposts-heading">
      <div className="posts-daily-heading">
        <SectionHeading icon={FiRepeat} number="03" kicker="FOUND & SHARED" id="x-reposts-heading">
          {t.repostsHeading}
        </SectionHeading>
      </div>
      {reposts.length > 0 && (
        <nav className="article-timeline repost-timeline" ref={timelineRef} aria-label={t.repostsTimeline}>
          <ol>
            {reposts.map((item, position) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`post-index-button article-timeline-button${position === index ? " is-active" : ""}`}
                  aria-current={position === index ? "true" : undefined}
                  onClick={() => setRepostIndex(position)}
                >
                  <time dateTime={item.repostedAt}>{formatPostDate(item.repostedAt, language)}</time>
                  <span className="article-timeline-title">{postExcerpt(item, t)}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {message && (
        <div className={`article-status repost-status${post ? " article-status-compact" : ""}`} role="status">
          {!post && <FiRepeat className="article-empty-mark" aria-hidden="true" />}
          <span>{message}</span>
          {recovering && (
            <div className="feed-status-actions">
              <button type="button" onClick={retryFeed} disabled={retryDisabled || feedLoading}>
                {t.retry}
              </button>
              <a href={xProfileUrl(profile.username)} target="_blank" rel="noopener noreferrer">
                {t.visitX}
                <FaArrowRight aria-hidden="true" />
              </a>
            </div>
          )}
          <div className="glass-panel-backdrop glass-reading-backdrop article-frost-backdrop" aria-hidden="true" />
        </div>
      )}
      {post && (
        <div className="post-reading repost-reading" ref={readingRef}>
          <PostCard
            key={post.id}
            post={post}
            feedSource={repostState}
            label={repostState === "stale" ? t.repostsStale : undefined}
            language={language}
            t={t}
            profile={profile}
            nextPost={reposts.length > 1 ? reposts[(index + 1) % reposts.length] : null}
          />
          {reposts.length > 1 && (
            <div className="post-controls" role="group" aria-label={t.repostNavigation}>
              <button
                type="button"
                onClick={() => turnPost((index - 1 + reposts.length) % reposts.length)}
                aria-label={t.prevRepost}
              >
                <FiChevronLeft aria-hidden="true" />
              </button>
              <span className="post-position" aria-live="polite">
                {t.postNumber(index + 1, reposts.length)}
              </span>
              <button type="button" onClick={() => turnPost((index + 1) % reposts.length)} aria-label={t.nextRepost}>
                <FiChevronRight aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
