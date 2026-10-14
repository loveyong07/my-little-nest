import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowRight, FaXTwitter } from "react-icons/fa6";
import { FiChevronLeft, FiChevronRight, FiMaximize2 } from "react-icons/fi";
import { FALLBACK_AVATAR, ASSETS } from "../constants/site.js";
import { handleAvatarError } from "../utils/profile.js";
import { formatPostDate } from "../utils/date.js";
import { mediaDimensions, mediaFrameRatio } from "../utils/posts.js";
import { xMediaSrc, xVideoSrc } from "../media-urls.js";
import { useMediaRequest } from "../hooks/useMediaRequest.js";
import { prefetchImage } from "../feed-cache.js";
import { MediaLightbox } from "./MediaLightbox.jsx";

export function PostCard({ post, feedSource, language, t, label, profile, priorityMedia = false, nextPost }) {
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
        .slice(0, 4)
        .map((media) => ({ ...media, src: xMediaSrc(media?.url, false, media?.proxyUrl) }))
    : [];
  const video = Array.isArray(post.media) ? post.media.find((media) => media?.type === "video") : null;
  const videoSrc = video ? xVideoSrc(video.url, video.proxyUrl) : null;
  const [photoIndex, setPhotoIndex] = useState(0);
  const [expandedMedia, setExpandedMedia] = useState(null);
  const returnFocusRef = useRef(null);
  const photoOpenRef = useRef(null);
  const photoRetryRef = useRef(null);
  const videoPlayerRef = useRef(null);
  const videoRetryRef = useRef(null);
  const currentPhotoIndex = Math.min(photoIndex, photos.length - 1);
  const currentPhoto = photos[currentPhotoIndex];
  const photoDimensions = mediaDimensions(currentPhoto);
  const videoDimensions = mediaDimensions(video);
  const photoRequest = useMediaRequest(currentPhoto?.src);
  const videoRequest = useMediaRequest(videoSrc);
  const resetPhotoRequest = photoRequest.reset;
  useEffect(() => {
    if (photoRequest.retryCount > 0) (photoRequest.unavailable ? photoRetryRef : photoOpenRef).current?.focus();
  }, [photoRequest.retryCount, photoRequest.unavailable]);
  useEffect(() => {
    if (videoRequest.retryCount > 0) (videoRequest.unavailable ? videoRetryRef : videoPlayerRef).current?.focus();
  }, [videoRequest.retryCount, videoRequest.unavailable]);
  function openMedia(kind, event) {
    if (kind === "video") event.currentTarget.parentElement.querySelector("video")?.pause();
    returnFocusRef.current = event.currentTarget;
    setExpandedMedia(kind);
  }
  const changePhotoIndex = useCallback(
    (updater) => {
      resetPhotoRequest();
      setPhotoIndex(updater);
    },
    [resetPhotoRequest],
  );
  return (
    <>
      <article className="post-card">
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
            <span>@{profile.username}</span>
          </div>
          <time className="post-date" dateTime={post.created_at}>
            {formatPostDate(post.created_at, language)}
          </time>
          <FaXTwitter className="post-x-mark" aria-hidden="true" />
        </div>
        {post.text.trim() && (
          <div className="post-text">
            {post.text.split(/(?:\r?\n){2,}/).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        )}
        {photos.length > 0 && (
          <div
            className={`post-media post-media-frame${photos.length === 1 ? " post-media-single" : ""}`}
            style={{ aspectRatio: mediaFrameRatio(photos) }}
          >
            {photoRequest.unavailable || !photoRequest.src ? (
              <div className="post-media-unavailable" role="status">
                <span>{t.photoUnavailable}</span>
                {photoRequest.src && (
                  <button ref={photoRetryRef} type="button" onClick={photoRequest.retry}>
                    {t.retry}
                  </button>
                )}
              </div>
            ) : (
              <button
                ref={photoOpenRef}
                className="post-media-open"
                type="button"
                onClick={(event) => openMedia("photo", event)}
                aria-label={`${t.enlargePhoto} · ${t.postPhotoAlt(currentPhotoIndex + 1)}`}
              >
                <img
                  key={photoRequest.src}
                  src={photoRequest.src}
                  alt={currentPhoto.alt || t.postPhotoAlt(currentPhotoIndex + 1)}
                  width={photoDimensions?.width}
                  height={photoDimensions?.height}
                  loading={priorityMedia ? "eager" : "lazy"}
                  fetchPriority={priorityMedia ? "high" : undefined}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onLoad={() => {
                    photoRequest.onLoad();
                    const nextPhoto = photos.length > 1 ? photos[(currentPhotoIndex + 1) % photos.length]?.src : null;
                    prefetchImage(nextPhoto);
                    const nextPostPhoto = nextPost?.media?.find((media) => (media.type ?? "photo") === "photo");
                    prefetchImage(xMediaSrc(nextPostPhoto?.url, false, nextPostPhoto?.proxyUrl));
                  }}
                  onError={photoRequest.onError}
                />
                {!photoRequest.loaded && (
                  <span className="post-media-loading" role="status">
                    {t.photoLoading}
                  </span>
                )}
              </button>
            )}
            <button
              className="post-media-nav post-media-prev"
              type="button"
              aria-label={t.prevPhoto}
              onClick={() =>
                changePhotoIndex((index) => (Math.min(index, photos.length - 1) - 1 + photos.length) % photos.length)
              }
            >
              <FiChevronLeft aria-hidden="true" />
            </button>
            <button
              className="post-media-nav post-media-next"
              type="button"
              aria-label={t.nextPhoto}
              onClick={() => changePhotoIndex((index) => (Math.min(index, photos.length - 1) + 1) % photos.length)}
            >
              <FiChevronRight aria-hidden="true" />
            </button>
            <span className="post-media-count" aria-live="polite">
              {t.postNumber(currentPhotoIndex + 1, photos.length)}
            </span>
          </div>
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
          <a href={post.permalink} target="_blank" rel="noopener noreferrer">
            {t.openPost}
            <FaArrowRight aria-hidden="true" />
          </a>
        </div>
        <div className="glass-panel-backdrop glass-reading-backdrop" aria-hidden="true" />
      </article>
      {expandedMedia && (expandedMedia === "photo" ? currentPhoto : video) && (
        <MediaLightbox
          kind={expandedMedia}
          photo={currentPhoto ? { ...currentPhoto, src: photoRequest.src, number: currentPhotoIndex + 1 } : null}
          photoCount={photos.length}
          onPhotoChange={changePhotoIndex}
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
