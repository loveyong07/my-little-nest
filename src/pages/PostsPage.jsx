import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FaArrowRight } from "react-icons/fa6";
import { FiChevronLeft, FiChevronRight, FiCalendar, FiRefreshCw } from "react-icons/fi";
import { HiOutlineSparkles } from "react-icons/hi2";
import { PiPushPinFill } from "react-icons/pi";
import { PostCard } from "../components/PostCard.jsx";
import { PostsAgeGate } from "../components/PostsAgeGate.jsx";
import { XArticlesSection } from "../components/XArticlesSection.jsx";
import { XRepostsSection } from "../components/XRepostsSection.jsx";
import { PostsNavigator } from "../components/PostsNavigator.jsx";
import { ReadingLibrary } from "../components/ReadingLibrary.jsx";
import { SectionHeading } from "../components/SectionHeading.jsx";
import { useDesktopLayout } from "../hooks/useDesktopLayout.js";
import { useSectionEntrance } from "../hooks/useSectionEntrance.js";
import { useXFeed } from "../hooks/useXFeed.js";
import { formatPostDate } from "../utils/date.js";
import { postExcerpt, postMonthKey, postMonths } from "../utils/posts.js";
import { preferredScrollBehavior } from "../utils/motion.js";
import { canPrefetch } from "../utils/network.js";
import { sharedPostFromSearch } from "../utils/post-sharing.js";
import { hasAgeConfirmation, rememberAgeConfirmation } from "../utils/age-confirmation.js";
import { xProfileUrl } from "../constants/site.js";
import "../styles/posts-route.css";

function PostControls({ postIndex, total, onChange, t }) {
  return (
    <div className="post-controls" role="group" aria-label={t.postNavigation}>
      <button type="button" onClick={() => onChange((postIndex - 1 + total) % total)} aria-label={t.prevPost}>
        <FiChevronLeft aria-hidden="true" />
      </button>
      <span className="post-position" aria-live="polite">
        {t.postNumber(postIndex + 1, total)}
      </span>
      <button type="button" onClick={() => onChange((postIndex + 1) % total)} aria-label={t.nextPost}>
        <FiChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}

export default function PostsPage(props) {
  const [confirmed, setConfirmed] = useState(hasAgeConfirmation);

  function confirmAge() {
    rememberAgeConfirmation();
    setConfirmed(true);
    // The confirmation button is removed; give keyboard readers a stable focus target.
    window.requestAnimationFrame(() => document.getElementById("page-heading")?.focus({ preventScroll: true }));
  }

  return confirmed ? <PostsContent {...props} /> : <PostsAgeGate t={props.t} onConfirm={confirmAge} />;
}

function PostsContent({ language, t, profile, onFeedReady, historyReading = null, rememberReading = undefined }) {
  const [sharedPost] = useState(() => (historyReading ? null : sharedPostFromSearch(window.location.search)));
  const [sharedPostOpened, setSharedPostOpened] = useState(false);
  const [largeText, setLargeText] = useState(() => Boolean(historyReading?.largeText));
  const [focusReading, setFocusReading] = useState(() => Boolean(historyReading?.focusReading));
  const desktop = useDesktopLayout();
  const sectionRef = useRef(null);
  useSectionEntrance(sectionRef);
  useEffect(() => {
    // Decorative glyphs must not compete with post photos on constrained links.
    if (!canPrefetch()) return undefined;
    let timer;
    const schedule = () => {
      timer = setTimeout(() => {
        if (canPrefetch()) import("../styles/post-font.css").catch(() => {});
      }, 3000);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("load", schedule);
    };
  }, []);
  const {
    posts,
    feedSource,
    feedLoading,
    feedUpdatedAt,
    retryDisabled,
    pinnedPost,
    pinState,
    postIndex,
    setPostIndex,
    retryFeed,
    articles,
    articleIndex,
    setArticleIndex,
    articleState,
    reposts,
    repostIndex,
    setRepostIndex,
    repostState,
    selectedPostId,
    selectedRepostId,
    selectedArticleId,
  } = useXFeed(historyReading, sharedPost);
  const readingRef = useRef(null);
  const indexRef = useRef(null);
  const currentPost = posts[Math.min(postIndex, Math.max(0, posts.length - 1))];
  const sharedCardExists =
    sharedPost &&
    (!feedLoading || feedSource !== "snapshot") &&
    (sharedPost.type === "post"
      ? sharedPost.id === pinnedPost?.id || sharedPost.id === currentPost?.id
      : sharedPost.id === reposts[repostIndex]?.repostId);
  const months = useMemo(() => postMonths(posts, language), [posts, language]);
  useEffect(() => {
    if (!sharedPost || !sharedCardExists || sharedPostOpened) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const card = document.getElementById(`${sharedPost.type}-${sharedPost.id}`);
      if (!card) return;
      card.focus({ preventScroll: true });
      card.scrollIntoView({ block: "start", behavior: "instant" });
      setSharedPostOpened(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sharedPost, sharedCardExists, sharedPostOpened]);
  useLayoutEffect(() => {
    rememberReading?.({
      postId: selectedPostId,
      repostId: selectedRepostId,
      articleId: selectedArticleId,
      largeText,
      focusReading,
    });
  }, [rememberReading, selectedPostId, selectedRepostId, selectedArticleId, largeText, focusReading]);
  useEffect(() => {
    if (!feedLoading) onFeedReady(true);
  }, [feedLoading, onFeedReady]);
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

  useEffect(() => {
    if (!desktop || posts.length < 2) return undefined;
    function handleKeyNavigation(event) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (document.querySelector(".media-lightbox, dialog[open]")) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          "a, button, input, textarea, select, video, audio, [contenteditable], [role=slider], [role=tablist], dialog, .media-lightbox, #x-articles, #x-reposts",
        )
      ) {
        return;
      }
      event.preventDefault();
      setPostIndex((current) =>
        event.key === "ArrowLeft" ? (current - 1 + posts.length) % posts.length : (current + 1) % posts.length,
      );
    }
    window.addEventListener("keydown", handleKeyNavigation);
    return () => window.removeEventListener("keydown", handleKeyNavigation);
  }, [desktop, posts.length, setPostIndex]);

  function changeReadingPost(index) {
    setPostIndex(index);
    // Keep the start of a new card in reach when leaving a long post halfway down.
    readingRef.current?.scrollIntoView({ block: "start", behavior: preferredScrollBehavior() });
  }

  function chooseFromLibrary(type, index) {
    if (type === "posts") setPostIndex(index);
    if (type === "articles") setArticleIndex(index);
    if (type === "reposts") setRepostIndex(index);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(
        type === "pinned"
          ? "pinned-posts-heading"
          : type === "articles"
            ? "x-articles"
            : type === "reposts"
              ? "x-reposts"
              : "daily-posts-heading",
      );
      (target?.matches("h2") ? target : target?.querySelector("h2"))?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "start", behavior: preferredScrollBehavior() });
    });
  }

  const statusText = feedLoading
    ? feedSource === "snapshot"
      ? t.feedLoading
      : t.feedRefreshing
    : feedSource === "snapshot"
      ? t.feedUnavailable
      : feedSource === "stale"
        ? t.feedStale
        : pinState === "stale"
          ? t.pinnedStale
          : null;
  const showRecovery = !feedLoading && (feedSource === "snapshot" || feedSource === "stale" || pinState === "stale");
  const profileUrl = xProfileUrl(profile.username);

  return (
    <div
      className={`posts-section${largeText ? " is-reading-large" : ""}${focusReading ? " is-reading-focused" : ""}`}
      id="posts"
      ref={sectionRef}
    >
      <PostsNavigator
        t={t}
        pinnedCount={pinnedPost ? 1 : 0}
        postCount={posts.length}
        articleCount={articles.length}
        repostCount={reposts.length}
        largeText={largeText}
        onToggleText={() => setLargeText((value) => !value)}
        focusReading={focusReading}
        onToggleFocus={() => setFocusReading((value) => !value)}
        library={
          <ReadingLibrary
            t={t}
            language={language}
            posts={posts}
            articles={articles}
            reposts={reposts}
            pinnedPost={pinnedPost}
            onChoose={chooseFromLibrary}
          />
        }
      />
      <div className="posts-flow">
        {sharedPost && !sharedPostOpened && !sharedCardExists && (
          <p className="feed-status" role="status">
            {feedLoading ? t.sharedPostLoading : t.sharedPostUnavailable}
          </p>
        )}
        {statusText && (
          <div className={`feed-status${feedLoading ? " is-loading" : ""}`} role="status">
            <FiRefreshCw aria-hidden="true" />
            <div className="feed-status-copy">
              <span>{statusText}</span>
              {feedSource === "stale" && feedUpdatedAt && (
                <small>
                  {t.lastFetched}
                  {formatPostDate(new Date(feedUpdatedAt).toISOString(), language)}
                </small>
              )}
            </div>
            {showRecovery && (
              <div className="feed-status-actions">
                <button type="button" onClick={retryFeed} disabled={retryDisabled || feedLoading}>
                  {t.retry}
                </button>
                <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                  {t.visitX}
                  <FaArrowRight aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        )}
        <section className="posts-group" aria-labelledby="pinned-posts-heading">
          <SectionHeading icon={PiPushPinFill} number="01" kicker="A NOTE TO KEEP" id="pinned-posts-heading">
            {t.pinnedHeading}
          </SectionHeading>
          {pinnedPost ? (
            <PostCard
              key={pinnedPost.id}
              post={pinnedPost}
              feedSource={pinState}
              language={language}
              t={t}
              profile={profile}
              label={pinState === "stale" ? (feedLoading ? t.feedRefreshing : t.pinnedStale) : undefined}
              priorityMedia
            />
          ) : (
            <div
              className={`pinned-placeholder${pinState === "loading" ? " pinned-placeholder-loading" : ""}`}
              role="status"
            >
              <span>
                {pinState === "loading" ? t.pinnedLoading : pinState === "none" ? t.pinnedNone : t.pinnedUnavailable}
              </span>
              {pinState === "loading" && (
                <div className="post-skeleton" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <div />
                </div>
              )}
              {pinState === "unavailable" && feedSource !== "snapshot" && (
                <div className="feed-status-actions">
                  <button type="button" onClick={retryFeed} disabled={retryDisabled || feedLoading}>
                    {t.retry}
                  </button>
                  <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                    {t.visitX}
                    <FaArrowRight aria-hidden="true" />
                  </a>
                </div>
              )}
            </div>
          )}
        </section>
        <section className="posts-group" id="latest-posts" aria-labelledby="daily-posts-heading">
          <div className="posts-daily-heading">
            <SectionHeading icon={HiOutlineSparkles} number="02" kicker="EVERYDAY MOMENTS" id="daily-posts-heading">
              {t.postsHeading}
            </SectionHeading>
            {months.length > 1 && (
              <label className="post-month-picker">
                <FiCalendar aria-hidden="true" />
                <span>{t.choosePostMonth}</span>
                <select
                  value={postMonthKey(currentPost)}
                  onChange={(event) => {
                    const month = months.find((item) => item.key === event.target.value);
                    if (month) setPostIndex(month.index);
                  }}
                >
                  {months.map((month) => (
                    <option key={month.key} value={month.key}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {posts.length > 1 && (
            <div className="post-index" ref={indexRef} role="group" aria-label={t.postsIndexLabel}>
              {posts.map((post, index) => (
                <button
                  key={post.id}
                  className={`post-index-button${index === postIndex ? " is-active" : ""}`}
                  type="button"
                  aria-current={index === postIndex ? "true" : undefined}
                  onClick={() => setPostIndex(index)}
                >
                  <span>{t.postNumber(index + 1, posts.length)}</span>
                  <time dateTime={post.created_at}>{formatPostDate(post.created_at, language)}</time>
                  <span className="post-index-excerpt">{postExcerpt(post, t)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="post-reading" ref={readingRef}>
            {currentPost ? (
              <PostCard
                key={currentPost.id}
                post={currentPost}
                feedSource={feedSource}
                label={feedLoading && feedSource === "stale" ? t.feedRefreshing : undefined}
                language={language}
                t={t}
                profile={profile}
                nextPost={posts.length > 1 ? posts[(postIndex + 1) % posts.length] : null}
                priorityMedia={!pinnedPost}
              />
            ) : (
              <div className="pinned-placeholder feed-empty" role="status">
                <span>{feedLoading ? t.feedRefreshing : t.feedEmpty}</span>
                {!feedLoading && (
                  <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                    {t.visitX}
                    <FaArrowRight aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
            {posts.length > 1 && (
              <PostControls postIndex={postIndex} total={posts.length} onChange={changeReadingPost} t={t} />
            )}
          </div>
        </section>
        <XRepostsSection
          reposts={reposts}
          repostIndex={repostIndex}
          setRepostIndex={setRepostIndex}
          repostState={repostState}
          feedLoading={feedLoading}
          retryDisabled={retryDisabled}
          retryFeed={retryFeed}
          language={language}
          t={t}
          profile={profile}
        />
        <XArticlesSection
          articles={articles}
          articleIndex={articleIndex}
          setArticleIndex={setArticleIndex}
          articleState={articleState}
          feedLoading={feedLoading}
          retryDisabled={retryDisabled}
          retryFeed={retryFeed}
          language={language}
          t={t}
          profile={profile}
        />
      </div>
    </div>
  );
}
