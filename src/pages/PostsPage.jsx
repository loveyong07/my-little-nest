import { useEffect } from "react";
import { FaArrowRight } from "react-icons/fa6";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { HiOutlineSparkles } from "react-icons/hi2";
import { PiPushPinFill } from "react-icons/pi";
import { PostCard } from "../components/PostCard.jsx";
import { useXFeed } from "../hooks/useXFeed.js";
import { formatPostDate } from "../utils/date.js";
import { postExcerpt } from "../utils/posts.js";

export default function PostsPage({ language, t, profile, onFeedReady }) {
  const { posts, feedSource, feedLoading, feedUpdatedAt, retryDisabled, pinnedPost, pinState, postIndex, setPostIndex, retryFeed } = useXFeed();
  useEffect(() => { if (!feedLoading) onFeedReady(true); }, [feedLoading, onFeedReady]);

  return <div className="posts-section" id="posts">
    {feedSource === "stale" && feedUpdatedAt && <div className="feed-status" role="status">
      <span>{language === "zh" ? "当前显示缓存内容。上次获取：" : language === "ja" ? "保存された内容を表示中。取得日時：" : "Showing saved posts. Last fetched: "}{formatPostDate(new Date(feedUpdatedAt).toISOString(), language)}</span>
    </div>}
    {feedSource === "snapshot" && <div className="feed-status" role="status">
      <span>{feedLoading ? t.feedLoading : t.feedUnavailable}</span>
      {!feedLoading && <div className="feed-status-actions">
        <a href={`https://x.com/${profile.username}`} target="_blank" rel="noopener noreferrer">{t.visitX}<FaArrowRight aria-hidden="true" /></a>
        <button type="button" onClick={retryFeed} disabled={retryDisabled || feedLoading}>{t.retry}</button>
      </div>}
    </div>}
    {(feedSource === "stale" || (feedSource === "live" && pinState === "stale")) && <div className="feed-status" role="status">
      <span>{feedSource === "stale" ? t.feedStale : t.pinnedStale}</span>
      <div className="feed-status-actions">
        <a href={`https://x.com/${profile.username}`} target="_blank" rel="noopener noreferrer">{t.visitX}<FaArrowRight aria-hidden="true" /></a>
        <button type="button" onClick={retryFeed} disabled={retryDisabled || feedLoading}>{t.retry}</button>
      </div>
    </div>}
    <section className="posts-group" aria-label={t.pinnedHeading}>
      <div className="section-heading"><PiPushPinFill aria-hidden="true" /><h2>{t.pinnedHeading}</h2>
        <a className="posts-jump-link" href="#latest-posts">{t.latestPosts}<FaArrowRight aria-hidden="true" /></a>
      </div>
      {pinnedPost ? <PostCard key={pinnedPost.id} post={pinnedPost} feedSource={pinState} language={language} t={t} profile={profile} label={pinState === "stale" ? t.pinnedStale : undefined} priorityMedia />
        : <div className="pinned-placeholder" role="status">{pinState === "loading" ? t.pinnedLoading : pinState === "none" ? t.pinnedNone : t.pinnedUnavailable}
          {pinState === "unavailable" && feedSource !== "snapshot" && <span className="feed-status-actions">
            <a href={`https://x.com/${profile.username}`} target="_blank" rel="noopener noreferrer">{t.visitX}<FaArrowRight aria-hidden="true" /></a>
            <button type="button" onClick={retryFeed} disabled={retryDisabled || feedLoading}>{t.retry}</button>
          </span>}
        </div>}
    </section>
    <section className="posts-group" id="latest-posts" tabIndex="-1" aria-label={t.postsHeading}>
      <div className="section-heading"><HiOutlineSparkles aria-hidden="true" /><h2>{t.postsHeading}</h2></div>
      {posts.length > 1 && <div className="post-index" role="group" aria-label={t.postsIndexLabel}>
        {posts.map((post, index) => <button key={post.id} className={`post-index-button${index === postIndex ? " is-active" : ""}`}
          type="button" aria-current={index === postIndex ? "true" : undefined} onClick={() => setPostIndex(index)}>
          <span>{t.postNumber(index + 1, posts.length)}</span>
          <time dateTime={post.created_at}>{formatPostDate(post.created_at, language)}</time>
          <span className="post-index-excerpt">{postExcerpt(post, t)}</span>
        </button>)}
      </div>}
      {posts.length > 0 ? <PostCard key={posts[postIndex].id} post={posts[postIndex]} feedSource={feedSource} language={language} t={t} profile={profile} nextPost={posts.length > 1 ? posts[(postIndex + 1) % posts.length] : null} priorityMedia={!pinnedPost} />
        : <div className="pinned-placeholder" role="status">{t.feedEmpty} <a href={`https://x.com/${profile.username}`} target="_blank" rel="noopener noreferrer">{t.visitX}</a></div>}
      {posts.length > 1 && <div className="post-controls">
        <button type="button" onClick={() => setPostIndex((postIndex - 1 + posts.length) % posts.length)} aria-label={t.prevPost}><FiChevronLeft /></button>
        <span aria-live="polite">{t.postNumber(postIndex + 1, posts.length)}</span>
        <button type="button" onClick={() => setPostIndex((postIndex + 1) % posts.length)} aria-label={t.nextPost}><FiChevronRight /></button>
      </div>}
    </section>
  </div>;
}
