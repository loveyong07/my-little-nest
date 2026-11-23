import { useEffect, useId, useRef, useState } from "react";
import { FaArrowRight, FaXTwitter } from "react-icons/fa6";
import { FiCheck, FiLink, FiMessageCircle, FiRepeat, FiShare2 } from "react-icons/fi";
import { FALLBACK_AVATAR, ASSETS } from "../constants/site.js";
import { handleAvatarError } from "../utils/profile.js";
import { formatPostDate } from "../utils/date.js";
import { xMediaSrc } from "../media-urls.js";
import { useClipboard } from "../hooks/useClipboard.js";
import { useDesktopLayout } from "../hooks/useDesktopLayout.js";
import { PhotoGallery } from "./PhotoGallery.jsx";
import { PostVideo } from "./PostVideo.jsx";
import { MediaLightbox } from "./MediaLightbox.jsx";
import { CopyFallback } from "./ContactTile.jsx";
import { displayXText } from "../utils/x-text.js";
import { postShareDetails } from "../utils/post-sharing.js";
import { textLinkParts } from "../../shared/article-links.mjs";
import { JSON_REQUEST_TIMEOUT_MS } from "../../shared/request-budgets.mjs";
import { translatableParts, translatedPartText } from "../utils/translation.js";
import { useContentTranslation } from "../hooks/useContentTranslation.js";
import { ContentTranslationControl } from "./ContentTranslationControl.jsx";
import { PostComments } from "./PostComments.jsx";

function postParagraphs(post, segments) {
  const links = Array.isArray(post.links) ? post.links : [];
  const paragraphs = [];
  let end = 0;
  for (const [index, raw] of post.text.split(/((?:\r?\n){2,})/).entries()) {
    const start = end;
    end += raw.length;
    if (index % 2 !== 0) continue;
    // Server positions refer to raw post text. Decode each prefix and label
    // once so their positions still match the displayed paragraph.
    const positionedLinks = links.flatMap((link) => {
      if (
        !Number.isSafeInteger(link?.offset) ||
        !Number.isSafeInteger(link?.length) ||
        link.offset < start ||
        link.length < 1 ||
        link.offset + link.length > end
      )
        return [];
      const offset = link.offset - start;
      if (raw.slice(offset, offset + link.length) !== link.text) return [];
      const text = displayXText(link.text);
      return [{ ...link, text, offset: displayXText(raw.slice(0, offset)).length, length: text.length }];
    });
    paragraphs.push(translatableParts(textLinkParts(displayXText(raw), positionedLinks), segments));
  }
  return paragraphs;
}

function PostReplies({ url, t, language, profile }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(
    /** @type {import("../../shared/contracts.mjs").RepliesResponse | null} */ (null),
  );

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(JSON_REQUEST_TIMEOUT_MS)]);
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error("Replies unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) {
          setResult(data?.status === "ok" && Array.isArray(data.replies) ? data : { status: "unavailable" });
        }
      } catch {
        if (!controller.signal.aborted) setResult({ status: "unavailable" });
      }
    }
    void load();
    return () => controller.abort();
  }, [url, attempt]);

  if (!result) return <p role="status">{t.repliesLoading}</p>;
  if (result.status === "unavailable") {
    return (
      <div className="feed-status-actions">
        <p role="status">{t.repliesUnavailable}</p>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setAttempt((value) => value + 1);
          }}
        >
          {t.retry}
        </button>
      </div>
    );
  }
  if (!result.replies.length) return <p role="status">{result.limited ? t.repliesLimited : t.repliesEmpty}</p>;
  return (
    <>
      <p role="status">{result.limited ? t.repliesLimited : t.repliesRecent}</p>
      <ul className="post-reply-list">
        {result.replies.map((reply) => (
          <li key={reply.id}>
            <PostCard post={reply} feedSource="live" language={language} t={t} profile={profile} variant="reply" />
          </li>
        ))}
      </ul>
    </>
  );
}

export function PostCard({
  post,
  feedSource,
  language,
  t,
  label = undefined,
  profile,
  priorityMedia = false,
  nextPost = null,
  variant = "post",
}) {
  const desktop = useDesktopLayout();
  const { copiedId, copyFailedId, manualCopyRef, copyId } = useClipboard();
  const [showReplies, setShowReplies] = useState(false);
  const repliesId = useId();
  const [showComments, setShowComments] = useState(false);
  const commentsId = useId();
  const standalone = variant === "post";
  const quoted = variant === "quote";
  const share = standalone ? postShareDetails(post) : null;
  const shareCopied = share && copiedId === share.url;
  const text = displayXText(post.text);
  const segments = [];
  const paragraphs = postParagraphs(post, segments);
  const translation = useContentTranslation(segments);
  const isSnapshot = feedSource === "snapshot";
  const sourceLabel =
    label ??
    (isSnapshot
      ? t.feedSnapshot(String(post.created_at ?? "").slice(0, 10))
      : feedSource === "stale"
        ? t.feedStale
        : null);
  const photos = Array.isArray(post.media)
    ? post.media
        .filter((media) => (media?.type ?? "photo") === "photo")
        .map((media) => ({ ...media, src: xMediaSrc(media?.url, false, media?.proxyUrl) }))
    : [];
  const videos = Array.isArray(post.media) ? post.media.filter((media) => media?.type === "video") : [];
  const [photoIndex, setPhotoIndex] = useState(0);
  const [expandedMedia, setExpandedMedia] = useState(null);
  const returnFocusRef = useRef(null);
  const currentPhotoIndex = Math.min(photoIndex, photos.length - 1);
  const currentPhoto = photos[currentPhotoIndex];
  function openMedia(kind, event) {
    returnFocusRef.current = event.currentTarget;
    setExpandedMedia(kind);
  }

  async function sharePost() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url: share.url });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    await copyId(share.url);
  }

  return (
    <>
      <article className="post-card" id={share?.cardId} tabIndex={share ? -1 : undefined}>
        {post.repostId && (
          <p className="post-repost-context">
            <FiRepeat aria-hidden="true" />
            {t.repostedBy(profile.name)}
          </p>
        )}
        <div className="post-topline">
          <img
            className="post-avatar"
            src={xMediaSrc(post.avatar, true, post.avatarProxy?.highRes) || FALLBACK_AVATAR}
            data-avatar-low-res={xMediaSrc(post.avatar, false, post.avatarProxy?.normal) || undefined}
            alt=""
            onError={handleAvatarError}
          />
          <div className="post-author">
            <strong>{post.author || profile.name}</strong>
            <span>@{post.username || profile.username}</span>
          </div>
          {post.created_at && (
            <time className="post-date" dateTime={post.created_at}>
              {formatPostDate(post.created_at, language)}
            </time>
          )}
          <FaXTwitter className="post-x-mark" aria-hidden="true" />
        </div>
        <ContentTranslationControl translation={translation} language={language} t={t} className="post-translation" />
        {text.trim() && (
          <div className="post-text">
            {paragraphs.map((parts, index) => (
              <p key={index} lang={translation.showing ? translation.targetLanguage : undefined} dir="auto">
                {parts.map((part, partIndex) =>
                  part.url ? (
                    <a key={partIndex} href={part.url} target="_blank" rel="noopener noreferrer">
                      {part.text}
                    </a>
                  ) : (
                    translatedPartText(part, translation.texts)
                  ),
                )}
              </p>
            ))}
          </div>
        )}
        {photos.length > 0 && (
          <PhotoGallery
            photos={photos}
            onOpen={(index, event) => {
              setPhotoIndex(index);
              openMedia("photo", event);
            }}
            priorityMedia={priorityMedia}
            nextPost={nextPost}
            t={t}
          />
        )}
        {videos.map((video, index) => (
          <PostVideo key={`${video.url}-${index}`} video={video} t={t} />
        ))}
        {standalone && post.quotedPost && (
          <section className="post-quote" aria-label={t.selfQuote}>
            <strong>{t.selfQuote}</strong>
            <PostCard
              key={post.quotedPost.id}
              post={post.quotedPost}
              feedSource="live"
              language={language}
              t={t}
              profile={profile}
              variant="quote"
            />
          </section>
        )}
        {isSnapshot && (
          <figure className="post-illustration">
            <img src={`${ASSETS}/post-seaside.webp`} alt={t.imageAlt} loading="lazy" decoding="async" />
            <figcaption>{t.artLabel}</figcaption>
          </figure>
        )}
        <div className="post-bottomline">
          {sourceLabel && <span>{sourceLabel}</span>}
          {standalone && post.repliesUrl && (
            <button
              type="button"
              className="post-action"
              aria-expanded={showReplies}
              aria-controls={repliesId}
              onClick={() => setShowReplies((value) => !value)}
            >
              <FiMessageCircle aria-hidden="true" />
              {showReplies ? t.hideReplies : t.viewReplies}
            </button>
          )}
          {standalone && post.commentsUrl && (
            <button
              type="button"
              className="post-action"
              aria-expanded={showComments}
              aria-controls={commentsId}
              onClick={() => setShowComments((value) => !value)}
            >
              {showComments ? t.hideComments : t.viewComments}
            </button>
          )}
          {share && (
            <button type="button" className="post-action" onClick={sharePost}>
              {shareCopied ? <FiCheck aria-hidden="true" /> : <FiShare2 aria-hidden="true" />}
              <span aria-live="polite">{shareCopied ? t.linkCopied : t.sharePost}</span>
            </button>
          )}
          {standalone && desktop && post.permalink && (
            <button
              type="button"
              className={`post-copy-link${copiedId === post.permalink ? " is-copied" : ""}`}
              onClick={() => copyId(post.permalink)}
              aria-label={copiedId === post.permalink ? t.linkCopied : t.copyPostLink}
            >
              {copiedId === post.permalink ? <FiCheck aria-hidden="true" /> : <FiLink aria-hidden="true" />}
              <span>{copiedId === post.permalink ? t.linkCopied : t.copyPostLink}</span>
            </button>
          )}
          <a href={post.permalink} target="_blank" rel="noopener noreferrer">
            {quoted ? t.quotedPostLink : t.openPost}
            <FaArrowRight aria-hidden="true" />
          </a>
        </div>
        {copyFailedId && (
          <CopyFallback
            value={copyFailedId}
            message={t.copyLinkFailed}
            label={copyFailedId === share?.url ? t.sharePost : t.copyPostLink}
            inputRef={manualCopyRef}
          />
        )}
        {standalone && post.repliesUrl && (
          <section id={repliesId} className="post-discussion" aria-label={t.viewReplies} hidden={!showReplies}>
            {showReplies && (
              <PostReplies key={post.repliesUrl} url={post.repliesUrl} t={t} language={language} profile={profile} />
            )}
          </section>
        )}
        {standalone && post.commentsUrl && (
          <section id={commentsId} className="post-discussion" aria-label={t.viewComments} hidden={!showComments}>
            {showComments && <PostComments key={post.commentsUrl} url={post.commentsUrl} t={t} language={language} />}
          </section>
        )}
        {!quoted && <div className="glass-panel-backdrop glass-reading-backdrop" aria-hidden="true" />}
      </article>
      {expandedMedia && currentPhoto && (
        <MediaLightbox
          kind={expandedMedia}
          photo={currentPhoto ? { ...currentPhoto, src: currentPhoto.src, number: currentPhotoIndex + 1 } : null}
          photos={photos}
          photoCount={photos.length}
          onPhotoChange={setPhotoIndex}
          photoAlt={t.postPhotoAlt(currentPhotoIndex + 1)}
          t={t}
          onClose={setExpandedMedia}
          returnFocusRef={returnFocusRef}
        />
      )}
    </>
  );
}
