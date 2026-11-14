import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FiChevronLeft, FiChevronRight, FiX } from "react-icons/fi";
import { LightboxPhotoStrip } from "./LightboxPhotoStrip.jsx";
import { xMediaSrc } from "../media-urls.js";
import { useMediaRequest } from "../hooks/useMediaRequest.js";

export function MediaLightbox({
  kind,
  photo,
  photoAlt,
  photos,
  photoCount,
  onPhotoChange,
  video,
  videoSrc,
  t,
  onClose,
  returnFocusRef,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const videoRequest = useMediaRequest(videoSrc, "lightboxRetry");

  useEffect(() => {
    const returnFocus = returnFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
    };
  }, [returnFocusRef]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose(null);
      } else if (kind === "photo" && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        onPhotoChange((index) =>
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? photoCount - 1
              : Math.max(0, Math.min(photoCount - 1, index + (event.key === "ArrowLeft" ? -1 : 1))),
        );
      } else if (event.key === "Tab") {
        if (!dialogRef.current.contains(document.activeElement)) {
          event.preventDefault();
          closeRef.current?.focus();
          return;
        }
        const focusable = [...dialogRef.current.querySelectorAll("video[controls], button:not(:disabled)")].filter(
          (element) => !element.closest('[aria-hidden="true"]'),
        );
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
    };
  }, [kind, onClose, onPhotoChange, photoCount]);

  return createPortal(
    <div
      className="media-lightbox"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose(null);
      }}
    >
      <div
        className={`media-lightbox-content media-lightbox-content-${kind}`}
        role="dialog"
        aria-modal="true"
        aria-label={kind === "photo" ? t.enlargePhoto : t.enlargeVideo}
        ref={dialogRef}
      >
        {kind === "photo" ? (
          <>
            <LightboxPhotoStrip
              photos={photos || [photo]}
              index={photos ? photo.number - 1 : 0}
              onChange={photos ? onPhotoChange : undefined}
              t={t}
              photoAlt={photoAlt}
              closeRef={closeRef}
            />
            <div className="media-lightbox-navigation">
              {photoCount > 1 && (
                <button
                  type="button"
                  className="media-lightbox-prev"
                  aria-label={t.prevPhoto}
                  disabled={photo.number <= 1}
                  onClick={() => onPhotoChange((index) => Math.max(0, index - 1))}
                >
                  <FiChevronLeft aria-hidden="true" />
                </button>
              )}
              <span className="media-lightbox-count" aria-live="polite">
                {t.postNumber(photo.number, photoCount)}
              </span>
              {photoCount > 1 && (
                <button
                  type="button"
                  className="media-lightbox-next"
                  aria-label={t.nextPhoto}
                  disabled={photo.number >= photoCount}
                  onClick={() => onPhotoChange((index) => Math.min(photoCount - 1, index + 1))}
                >
                  <FiChevronRight aria-hidden="true" />
                </button>
              )}
            </div>
          </>
        ) : videoRequest.src && !videoRequest.unavailable ? (
          <video
            key={videoRequest.src}
            controls
            playsInline
            preload="metadata"
            poster={xMediaSrc(video.poster, false, video.posterProxyUrl) || undefined}
            aria-label={video.alt || t.postVideoAlt}
            tabIndex="0"
            onError={videoRequest.onError}
          >
            <source src={videoRequest.src} type="video/mp4" />
          </video>
        ) : (
          <div className="media-lightbox-unavailable" role="status">
            <span>{t.videoUnavailable}</span>
            {videoSrc && (
              <button
                type="button"
                onClick={() => {
                  videoRequest.retry();
                  closeRef.current?.focus();
                }}
              >
                {t.retry}
              </button>
            )}
          </div>
        )}
        <button
          ref={closeRef}
          className="media-lightbox-close"
          type="button"
          aria-label={t.closePreview}
          onClick={() => onClose(null)}
        >
          <FiX aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
