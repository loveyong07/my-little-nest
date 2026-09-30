import { useEffect, useMemo, useRef } from "react";
import { FaArrowDown, FaArrowRight } from "react-icons/fa6";
import { FiChevronLeft, FiChevronRight, FiCalendar, FiRefreshCw } from "react-icons/fi";
import { HiOutlineSparkles } from "react-icons/hi2";
import { PiPushPinFill } from "react-icons/pi";
import { PostCard } from "../components/PostCard.jsx";
import { useXFeed } from "../hooks/useXFeed.js";
import { formatPostDate } from "../utils/date.js";
import { postExcerpt, postMonthKey, postMonths } from "../utils/posts.js";
import { canPrefetch } from "../utils/network.js";

function PostControls({ postIndex, total, onChange, t, sticky = false }) {
  return <div className={`post-controls${sticky ? " post-controls-reading" : ""}`} role="group" aria-label={t.postNavigation}>
    <button type="button" onClick={() => onChange((postIndex - 1 + total) % total)} aria-label={t.prevPost}>
      <FiChevronLeft aria-hidden="true" />{sticky && <span>{t.previousShort}</span>}
    </button>
    <span className="post-position" aria-live={sticky ? "polite" : "off"}>{t.postNumber(postIndex + 1, total)}</span>
    <button type="button" onClick={() => onChange((postIndex + 1) % total)} aria-label={t.nextPost}>
      {sticky && <span>{t.nextShort}</span>}<FiChevronRight aria-hidden="true" />
    </button>
  </div>;
}

export default function PostsPage({ language, t, profile, onFeedReady }) {
  useEffect(() => {
    // Decorative glyphs must not compete with post photos on constrained links.
    if (!canPrefetch()) return undefined;
    let timer;
    const schedule = () => { timer = setTimeout(() => {
      if (canPrefetch()) import("../styles/post-font.css").catch(() => {});
    }, 3000); };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => { clearTimeout(timer); window.removeEventListener("load", schedule); };
  }, []);
  const { posts, feedSource, feedLoading, feedUpdatedAt, retryDisabled, pinnedPost, pinState, postIndex, setPostIndex, retryFeed } = useXFeed();
  const latestRef = useRef(null);
  const readingRef = useRef(null);
  const indexRef = useRef(null);
  const currentPost = posts[Math.min(postIndex, Math.max(0, posts.length - 1))];
  const months = useMemo(() => postMonths(posts, language), [posts, language]);
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => { if (!feedLoading) onFeedReady(true); }, [feedLoading, onFeedReady]);
  useEffect(() => {
    const strip = indexRef.current;
    const selected = strip?.querySelector('[aria-current="true"]');
    if (!strip || !selected) return;
    const left = selected.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    const right = left + selected.offsetWidth;
    if (left < strip.scrollLeft || right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: Math.max(0, left - (strip.clientWidth - selected.offsetWidth) / 2), behavior: "instant" });
    }
  }, [postIndex, posts, language]);

  function goLatest(event) {
    event.preventDefault();
    setPostIndex(0);
    latestRef.current?.focus({ preventScroll: true });
    latestRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "instant" : "smooth" });
  }
  function changeReadingPost(index) {
    setPostIndex(index);
    // Keep the start of a new card in reach when leaving a long post halfway down.
    readingRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "instant" : "smooth" });
  }
  const statusText = feedLoading ? (feedSource === "snapshot" ? t.feedLoading : t.feedRefreshing)
    : feedSource === "snapshot" ? t.feedUnavailable
      : feedSource === "stale" ? t.feedStale : pinState === "stale" ? t.pinnedStale : null;
  const showRecovery = !feedLoading && (feedSource === "snapshot" || feedSource === "stale" || pinState === "stale");
  const xProfileUrl = `https://x.com/${profile.username}`;

  return <div className="posts-section" id="posts">
    <div className="posts-reading-entry">
      <div><span className="posts-entry-kicker">{t.postsEntryKicker}</span><p>{t.postsReadingIntro}</p></div>
      <a className="posts-jump-link" href="#latest-posts" onClick={goLatest}>
        <span>{t.latestPosts}{posts[0] && <time dateTime={posts[0].created_at}>{formatPostDate(posts[0].created_at, language)}</time>}</span>
        <FaArrowDown aria-hidden="true" />
      </a>
    </div>
    {statusText && <div className={`feed-status${feedLoading ? " is-loading" : ""}`} role="status">
      <FiRefreshCw aria-hidden="true" />
      <div className="feed-status-copy"><span>{statusText}</span>
        {feedSource === "stale" && feedUpdatedAt && <small>{t.lastFetched}{formatPostDate(new Date(feedUpdatedAt).toISOString(), language)}</small>}
      </div>
      {showRecovery && <div className="feed-status-actions">
        <button type="button" onClick={retryFeed} disabled={retryDisabled || feedLoading}>{t.retry}</button>
        <a href={xProfileUrl} target="_blank" rel="noopener noreferrer">{t.visitX}<FaArrowRight aria-hidden="true" /></a>
      </div>}
    </div>}
    <section className="posts-group" aria-labelledby="pinned-posts-heading">
      <div className="section-heading"><PiPushPinFill aria-hidden="true" /><h2 id="pinned-posts-heading">{t.pinnedHeading}</h2></div>
      {pinnedPost ? <PostCard key={pinnedPost.id} post={pinnedPost} feedSource={pinState} language={language} t={t} profile={profile} label={pinState === "stale" ? t.pinnedStale : undefined} priorityMedia />
        : <div className={`pinned-placeholder${pinState === "loading" ? " pinned-placeholder-loading" : ""}`} role="status">
          <span>{pinState === "loading" ? t.pinnedLoading : pinState === "none" ? t.pinnedNone : t.pinnedUnavailable}</span>
          {pinState === "loading" && <div className="post-skeleton" aria-hidden="true"><span /><span /><span /><div /></div>}
          {pinState === "unavailable" && feedSource !== "snapshot" && <div className="feed-status-actions">
            <button type="button" onClick={retryFeed} disabled={retryDisabled || feedLoading}>{t.retry}</button>
            <a href={xProfileUrl} target="_blank" rel="noopener noreferrer">{t.visitX}<FaArrowRight aria-hidden="true" /></a>
          </div>}
        </div>}
    </section>
    <section className="posts-group" id="latest-posts" ref={latestRef} tabIndex="-1" aria-labelledby="daily-posts-heading">
      <div className="posts-daily-heading">
        <div className="section-heading"><HiOutlineSparkles aria-hidden="true" /><h2 id="daily-posts-heading">{t.postsHeading}</h2></div>
        {months.length > 1 && <label className="post-month-picker"><FiCalendar aria-hidden="true" /><span>{t.choosePostMonth}</span>
          <select value={postMonthKey(currentPost)} onChange={(event) => {
            const month = months.find((item) => item.key === event.target.value);
            if (month) setPostIndex(month.index);
          }}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select>
        </label>}
      </div>
      {posts.length > 1 && <div className="post-index" ref={indexRef} role="group" aria-label={t.postsIndexLabel}>
        {posts.map((post, index) => <button key={post.id} className={`post-index-button${index === postIndex ? " is-active" : ""}`}
          type="button" aria-current={index === postIndex ? "true" : undefined} onClick={() => setPostIndex(index)}>
          <span>{t.postNumber(index + 1, posts.length)}</span>
          <time dateTime={post.created_at}>{formatPostDate(post.created_at, language)}</time>
          <span className="post-index-excerpt">{postExcerpt(post, t)}</span>
        </button>)}
      </div>}
      <div className="post-reading" ref={readingRef}>
        {currentPost ? <PostCard key={currentPost.id} post={currentPost} feedSource={feedSource} language={language} t={t} profile={profile} nextPost={posts.length > 1 ? posts[(postIndex + 1) % posts.length] : null} priorityMedia={!pinnedPost} />
          : <div className="pinned-placeholder feed-empty" role="status"><span>{feedLoading ? t.feedRefreshing : t.feedEmpty}</span>
            {!feedLoading && <a href={xProfileUrl} target="_blank" rel="noopener noreferrer">{t.visitX}<FaArrowRight aria-hidden="true" /></a>}
          </div>}
        {posts.length > 1 && <PostControls postIndex={postIndex} total={posts.length} onChange={changeReadingPost} t={t} />}
      </div>
    </section>
  </div>;
}
