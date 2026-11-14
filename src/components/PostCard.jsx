import { useEffect, useRef, useState } from "react";
import { FaArrowRight, FaXTwitter } from "react-icons/fa6";
import { FiCheck, FiLink, FiMaximize2, FiRepeat } from "react-icons/fi";
import { FALLBACK_AVATAR, ASSETS } from "../constants/site.js";
import { handleAvatarError } from "../utils/profile.js";
import { formatPostDate } from "../utils/date.js";
import { mediaDimensions, mediaFrameRatio } from "../utils/posts.js";
import { xMediaSrc, xVideoSrc } from "../media-urls.js";
import { useClipboard } from "../hooks/useClipboard.js";
import { useDesktopLayout } from "../hooks/useDesktopLayout.js";
import { useMediaRequest } from "../hooks/useMediaRequest.js";
import { PhotoGallery } from "./PhotoGallery.jsx";
import { MediaLightbox } from "./MediaLightbox.jsx";
import { CopyFallback } from "./ContactTile.jsx";
import { displayXText } from "../utils/x-text.js";
import { textLinkParts } from "../../shared/article-links.mjs";
import { translatableParts, translatedPartText } from "../utils/translation.js";
import { useContentTranslation } from "../hooks/useContentTranslation.js";
import { ContentTranslationControl } from "./ContentTranslationControl.jsx";

export function PostCard({ post, feedSource, language, t, label, profile, priorityMedia = false, nextPost }) {
  const desktop = useDesktopLayout();
  const { copiedId, copyFailedId, manualCopyRef, copyId } = useClipboard();
  const text = displayXText(post.text);
  const segments = [];
  const paragraphs = text
    .split(/(?:\r?\n){2,}/)
    .map((paragraph) => translatableParts(textLinkParts(paragraph), segments));
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
  const video = Array.isArray(post.media) ? post.media.find((media) => media?.type === "video") : null;
  const videoSrc = video ? xVideoSrc(video.url, video.proxyUrl) : null;
  const [photoIndex, setPhotoIndex] = useState(0);
  const [expandedMedia, setExpandedMedia] = useState(null);
  const returnFocusRef = useRef(null);
  const videoPlayerRef = useRef(null);
  const videoRetryRef = useRef(null);
  const currentPhotoIndex = Math.min(photoIndex, photos.length - 1);
  const currentPhoto = photos[currentPhotoIndex];
  const videoDimensions = mediaDimensions(video);
  const videoRequest = useMediaRequest(videoSrc);
  useEffect(() => {
    if (videoRequest.retryCount > 0) (videoRequest.unavailable ? videoRetryRef : videoPlayerRef).current?.focus();
  }, [videoRequest.retryCount, videoRequest.unavailable]);
  function openMedia(kind, event) {
    if (kind === "video") event.currentTarget.parentElement.querySelector("video")?.pause();
    returnFocusRef.current = event.currentTarget;
    setExpandedMedia(kind);
  }
  return (
    <>
      <article className="post-card">
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
          <time className="post-date" dateTime={post.created_at}>
            {formatPostDate(post.created_at, language)}
          </time>
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
        {video && (
          <div className="post-video post-video-frame" style={{ aspectRatio: mediaFrameRatio(video, 16 / 9) }}>
            {videoRequest.unavailable || !videoSrc ? (
              <div className="post-media-unavailable" role="status">
                <span>{t.videoUnavailable}</span>
                {videoSrc && (
                  <button ref={videoRetryRef} type="button" onClick={videoRequest.retry}>
                    {t.retry}
                  </button>
                )}
              </div>
            ) : (
              <>
                <video
                  ref={videoPlayerRef}
                  key={videoRequest.src}
                  controls
                  playsInline
                  preload="none"
                  tabIndex="0"
                  poster={xMediaSrc(video.poster, false, video.posterProxyUrl) || undefined}
                  width={videoDimensions?.width}
                  height={videoDimensions?.height}
                  aria-label={video.alt || t.postVideoAlt}
                  onError={videoRequest.onError}
                >
                  <source src={videoRequest.src} type="video/mp4" />
                </video>
                <button
                  className="post-video-open"
                  type="button"
                  aria-label={t.enlargeVideo}
                  onClick={(event) => openMedia("video", event)}
                >
                  <span className="post-video-expand">
                    <FiMaximize2 aria-hidden="true" />
                    {t.enlargeVideo}
                  </span>
                </button>
              </>
            )}
          </div>
        )}
        {isSnapshot && (
          <figure className="post-illustration">
            <img src={`${ASSETS}/post-seaside.webp`} alt={t.imageAlt} loading="lazy" decoding="async" />
            <figcaption>{t.artLabel}</figcaption>
          </figure>
        )}
        <div className="post-bottomline">
          {sourceLabel && <span>{sourceLabel}</span>}
          {desktop && post.permalink && (
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
            {t.openPost}
            <FaArrowRight aria-hidden="true" />
          </a>
        </div>
        {copyFailedId && copyFailedId === post.permalink && (
          <CopyFallback
            value={copyFailedId}
            message={t.copyLinkFailed}
            label={t.copyPostLink}
            inputRef={manualCopyRef}
          />
        )}
        <div className="glass-panel-backdrop glass-reading-backdrop" aria-hidden="true" />
      </article>
      {expandedMedia && (expandedMedia === "photo" ? currentPhoto : video) && (
        <MediaLightbox
          kind={expandedMedia}
          photo={currentPhoto ? { ...currentPhoto, src: currentPhoto.src, number: currentPhotoIndex + 1 } : null}
          photos={photos}
          photoCount={photos.length}
          onPhotoChange={setPhotoIndex}
          photoAlt={t.postPhotoAlt(currentPhotoIndex + 1)}
          video={video}
          videoSrc={videoRequest.src}
          t={t}
          onClose={setExpandedMedia}
          returnFocusRef={returnFocusRef}
        />
      )}
    </>
  );
}
