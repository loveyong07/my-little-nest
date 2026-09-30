import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowRight, FaXTwitter } from "react-icons/fa6";
import { FiChevronLeft, FiChevronRight, FiMaximize2 } from "react-icons/fi";
import { FALLBACK_AVATAR, ASSETS } from "../constants/site.js";
import { handleAvatarError } from "../utils/profile.js";
import { formatPostDate } from "../utils/date.js";
import { mediaDimensions, mediaFrameRatio } from "../utils/posts.js";
import { xMediaSrc, xVideoSrc } from "../media-urls.js";
import { prefetchImage } from "../feed-cache.js";
import { MediaLightbox } from "./MediaLightbox.jsx";

export function PostCard({ post, feedSource, language, t, label, profile, priorityMedia = false, nextPost }) {
  const isSnapshot = feedSource === "snapshot";
  const sourceLabel = label ?? (isSnapshot ? t.feedSnapshot : feedSource === "stale" ? t.feedStale : null);
  const photos = Array.isArray(post.media)
    ? post.media.filter((media) => (media?.type ?? "photo") === "photo").slice(0, 4).map((media) => ({ ...media, src: xMediaSrc(media?.url) }))
    : [];
  const video = Array.isArray(post.media)
    ? post.media.find((media) => media?.type === "video")
    : null;
  const videoSrc = video ? xVideoSrc(video.url) : null;
  const [photoIndex, setPhotoIndex] = useState(0);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [loadedImageSrc, setLoadedImageSrc] = useState(null);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [imageRetryCount, setImageRetryCount] = useState(0);
  const [videoRetryCount, setVideoRetryCount] = useState(0);
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
  const photoRequestSrc = currentPhoto?.src ? `${currentPhoto.src}${imageRetryCount ? `&retry=${imageRetryCount}` : ""}` : null;
  const videoRequestSrc = videoSrc ? `${videoSrc}${videoRetryCount ? `&retry=${videoRetryCount}` : ""}` : null;
  useEffect(() => {
    setImageUnavailable(false);
    setVideoUnavailable(false);
  }, [currentPhoto?.url, videoSrc]);
  useEffect(() => {
    if (imageRetryCount > 0) (imageUnavailable ? photoRetryRef : photoOpenRef).current?.focus();
  }, [imageRetryCount, imageUnavailable]);
  useEffect(() => {
    if (videoRetryCount > 0) (videoUnavailable ? videoRetryRef : videoPlayerRef).current?.focus();
  }, [videoRetryCount, videoUnavailable]);
  function openMedia(kind, event) {
    if (kind === "video") event.currentTarget.parentElement.querySelector("video")?.pause();
    returnFocusRef.current = event.currentTarget;
    setExpandedMedia(kind);
  }
  const changePhotoIndex = useCallback((updater) => {
    setImageUnavailable(false);
    setImageRetryCount(0);
    setPhotoIndex(updater);
  }, []);
  return <><article className="post-card">
    <div className="post-topline">
      <img className="post-avatar" src={xMediaSrc(post.avatar, true) || FALLBACK_AVATAR}
        data-avatar-low-res={xMediaSrc(post.avatar) || undefined} alt="" onError={handleAvatarError} />
      <div className="post-author"><strong>{post.author || profile.name}</strong><span>@{profile.username}</span></div>
      <time className="post-date" dateTime={post.created_at}>{formatPostDate(post.created_at, language)}</time>
      <FaXTwitter className="post-x-mark" aria-hidden="true" />
    </div>
    {post.text.trim() && <div className="post-text">{post.text.split(/(?:\r?\n){2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
    {photos.length > 0 && <div className={`post-media post-media-frame${photos.length === 1 ? " post-media-single" : ""}`} style={{ aspectRatio: mediaFrameRatio(photos) }}>
      {imageUnavailable || !photoRequestSrc
        ? <div className="post-media-unavailable" role="status"><span>{t.photoUnavailable}</span>
          {photoRequestSrc && <button ref={photoRetryRef} type="button" onClick={() => { setImageRetryCount((count) => count + 1); setImageUnavailable(false); }}>{t.retry}</button>}</div>
        : <button ref={photoOpenRef} className="post-media-open" type="button" onClick={(event) => openMedia("photo", event)}
          aria-label={`${t.enlargePhoto} · ${t.postPhotoAlt(currentPhotoIndex + 1)}`}>
          <img key={photoRequestSrc} src={photoRequestSrc} alt={currentPhoto.alt || t.postPhotoAlt(currentPhotoIndex + 1)}
            width={photoDimensions?.width} height={photoDimensions?.height}
            loading={priorityMedia ? "eager" : "lazy"} fetchPriority={priorityMedia ? "high" : undefined}
            decoding="async" referrerPolicy="no-referrer" onLoad={() => {
              setLoadedImageSrc(photoRequestSrc);
              const nextPhoto = photos.length > 1 ? photos[(currentPhotoIndex + 1) % photos.length]?.src : null;
              prefetchImage(nextPhoto);
              prefetchImage(xMediaSrc(nextPost?.media?.find((media) => (media.type ?? "photo") === "photo")?.url));
            }} onError={() => setImageUnavailable(true)} />
          {loadedImageSrc !== photoRequestSrc && <span className="post-media-loading" role="status">{t.photoLoading}</span>}
        </button>}
      <button className="post-media-nav post-media-prev" type="button" aria-label={t.prevPhoto}
        onClick={() => changePhotoIndex((index) => (Math.min(index, photos.length - 1) - 1 + photos.length) % photos.length)}><FiChevronLeft aria-hidden="true" /></button>
      <button className="post-media-nav post-media-next" type="button" aria-label={t.nextPhoto}
        onClick={() => changePhotoIndex((index) => (Math.min(index, photos.length - 1) + 1) % photos.length)}><FiChevronRight aria-hidden="true" /></button>
      <span className="post-media-count" aria-live="polite">{t.postNumber(currentPhotoIndex + 1, photos.length)}</span>
    </div>}
    {video && <div className="post-video post-video-frame" style={{ aspectRatio: mediaFrameRatio(video, 16 / 9) }}>
      {videoUnavailable || !videoSrc
        ? <div className="post-media-unavailable" role="status"><span>{t.videoUnavailable}</span>
          {videoSrc && <button ref={videoRetryRef} type="button" onClick={() => { setVideoRetryCount((count) => count + 1); setVideoUnavailable(false); }}>{t.retry}</button>}</div>
        : <>
          <video ref={videoPlayerRef} key={videoRequestSrc} controls playsInline preload="none" tabIndex="0" poster={xMediaSrc(video.poster) || undefined}
            width={videoDimensions?.width} height={videoDimensions?.height}
            aria-label={video.alt || t.postVideoAlt} onError={() => setVideoUnavailable(true)}>
            <source src={videoRequestSrc} type="video/mp4" />
          </video>
          <button className="post-video-open" type="button" aria-label={t.enlargeVideo}
            onClick={(event) => openMedia("video", event)}>
            <span className="post-video-expand"><FiMaximize2 aria-hidden="true" />{t.enlargeVideo}</span>
          </button>
        </>}
    </div>}
    {isSnapshot && <figure className="post-illustration">
      <img src={`${ASSETS}/post-seaside.png`} alt={t.imageAlt} loading="lazy" decoding="async" />
      <figcaption>{t.artLabel}</figcaption>
    </figure>}
    <div className="post-bottomline">
      {sourceLabel && <span>{sourceLabel}</span>}
      <a href={post.permalink} target="_blank" rel="noopener noreferrer">{t.openPost}<FaArrowRight aria-hidden="true" /></a>
    </div>
  </article>
    {expandedMedia && (expandedMedia === "photo" ? currentPhoto : video) && <MediaLightbox kind={expandedMedia} photo={currentPhoto ? { ...currentPhoto, src: photoRequestSrc, number: currentPhotoIndex + 1 } : null} photoCount={photos.length} onPhotoChange={changePhotoIndex}
      photoAlt={t.postPhotoAlt(currentPhotoIndex + 1)} video={video}
      videoSrc={videoRequestSrc} t={t} onClose={setExpandedMedia} returnFocusRef={returnFocusRef} />}
  </>;
}
