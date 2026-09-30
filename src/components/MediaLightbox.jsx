import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiChevronLeft, FiChevronRight, FiX } from "react-icons/fi";
import { xMediaSrc } from "../media-urls.js";

export function MediaLightbox({ kind, photo, photoAlt, photoCount, onPhotoChange, video, videoSrc, t, onClose, returnFocusRef }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const [photoUnavailable, setPhotoUnavailable] = useState(false);
  const [photoRetryCount, setPhotoRetryCount] = useState(0);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [videoRetryCount, setVideoRetryCount] = useState(0);
  const photoLightboxSrc = photo?.src ? `${photo.src}${photoRetryCount ? `&lightboxRetry=${photoRetryCount}` : ""}` : null;
  const videoLightboxSrc = videoSrc ? `${videoSrc}${videoRetryCount ? `&lightboxRetry=${videoRetryCount}` : ""}` : null;

  useEffect(() => {
    setPhotoUnavailable(false);
    setPhotoRetryCount(0);
  }, [photo?.src]);

  useEffect(() => {
    setVideoUnavailable(false);
    setVideoRetryCount(0);
  }, [videoSrc]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose(null);
      } else if (kind === "photo" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        onPhotoChange((index) => (index + (event.key === "ArrowLeft" ? -1 : 1) + photoCount) % photoCount);
      } else if (event.key === "Tab") {
        if (!dialogRef.current.contains(document.activeElement)) {
          event.preventDefault();
          closeRef.current?.focus();
          return;
        }
        const focusable = [...dialogRef.current.querySelectorAll("video[controls], button")];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [kind, onClose, onPhotoChange, photoCount, returnFocusRef]);

  return createPortal(<div className="media-lightbox" role="presentation"
    onClick={(event) => { if (event.target === event.currentTarget) onClose(null); }}>
    <div className="media-lightbox-content" role="dialog" aria-modal="true"
      aria-label={kind === "photo" ? t.enlargePhoto : t.enlargeVideo} ref={dialogRef}>
      {kind === "photo"
        ? <>{photoLightboxSrc && !photoUnavailable ? <img key={photoLightboxSrc} src={photoLightboxSrc} alt={photo.alt || photoAlt} onError={() => setPhotoUnavailable(true)} />
          : <div className="media-lightbox-unavailable" role="status"><span>{t.photoUnavailable}</span>
            {photo?.src && <button type="button" onClick={() => { setPhotoRetryCount((count) => count + 1); setPhotoUnavailable(false); closeRef.current?.focus(); }}>{t.retry}</button>}</div>}
          <div className="media-lightbox-navigation">
            <button className="media-lightbox-prev" type="button" aria-label={t.prevPhoto}
              onClick={() => onPhotoChange((index) => (index - 1 + photoCount) % photoCount)}><FiChevronLeft aria-hidden="true" /></button>
            <span className="media-lightbox-count" aria-live="polite">{t.postNumber(photo.number, photoCount)}</span>
            <button className="media-lightbox-next" type="button" aria-label={t.nextPhoto}
              onClick={() => onPhotoChange((index) => (index + 1) % photoCount)}><FiChevronRight aria-hidden="true" /></button>
          </div></>
        : videoLightboxSrc && !videoUnavailable ? <video key={videoLightboxSrc} controls playsInline preload="metadata" poster={xMediaSrc(video.poster, false, video.posterProxyUrl) || undefined}
          aria-label={video.alt || t.postVideoAlt} tabIndex="0" onError={() => setVideoUnavailable(true)}>
          <source src={videoLightboxSrc} type="video/mp4" />
        </video> : <div className="media-lightbox-unavailable" role="status"><span>{t.videoUnavailable}</span>
          {videoSrc && <button type="button" onClick={() => { setVideoRetryCount((count) => count + 1); setVideoUnavailable(false); closeRef.current?.focus(); }}>{t.retry}</button>}</div>}
      <button ref={closeRef} className="media-lightbox-close" type="button"
        aria-label={t.closePreview} onClick={() => onClose(null)}><FiX aria-hidden="true" /></button>
    </div>
  </div>, document.body);
}
