import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMediaRequest } from "../hooks/useMediaRequest.js";

function PreviewPhoto({ photo, active, enabled, photoAlt, t, closeRef }) {
  const request = useMediaRequest(enabled ? photo?.src : null, "lightboxRetry");
  return (
    <div className="media-lightbox-slide" aria-hidden={!active}>
      {!enabled ? null : request.src && !request.unavailable ? (
        <img src={request.src} alt={photo.alt || photoAlt} draggable="false" onError={request.onError} />
      ) : (
        <div className="media-lightbox-unavailable" role="status">
          <span>{t.photoUnavailable}</span>
          {photo?.src && (
            <button
              type="button"
              tabIndex={active ? 0 : -1}
              onClick={() => {
                request.retry();
                closeRef.current?.focus();
              }}
            >
              {t.retry}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function LightboxPhotoStrip({ photos, index, onChange, t, photoAlt, closeRef }) {
  const trackRef = useRef(null);
  const reportedIndex = useRef(index);
  const gesture = useRef(null);
  const programmaticTarget = useRef(null);
  const [dragging, setDragging] = useState(false);
  const initialPosition = useRef(true);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || (!initialPosition.current && reportedIndex.current === index)) return;
    const smooth = !initialPosition.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    initialPosition.current = false;
    reportedIndex.current = index;
    programmaticTarget.current = index;
    track.scrollTo?.({ left: index * track.clientWidth, behavior: smooth ? "smooth" : "instant" });
  }, [index, photos.length]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const track = trackRef.current;
    const observer = new ResizeObserver(() => {
      track.scrollLeft = reportedIndex.current * track.clientWidth;
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  function finishDrag(event) {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    const track = event.currentTarget;
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    track.style.scrollSnapType = "";
    setDragging(false);
    if (current.moved) {
      const target = Math.max(0, Math.min(photos.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
      programmaticTarget.current = target;
      onChange?.(target);
      track.scrollTo({
        left: target * track.clientWidth,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
    }
  }

  return (
    <div
      ref={trackRef}
      className={`media-lightbox-strip${dragging ? " is-dragging" : ""}`}
      dir="ltr"
      onScroll={(event) => {
        const track = event.currentTarget;
        if (!track.clientWidth) return;
        if (programmaticTarget.current !== null) {
          if (Math.abs(track.scrollLeft - programmaticTarget.current * track.clientWidth) > 1) return;
          programmaticTarget.current = null;
        }
        const next = Math.max(0, Math.min(photos.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
        if (reportedIndex.current !== next) {
          reportedIndex.current = next;
          onChange?.(next);
        }
      }}
      onPointerDown={(event) => {
        programmaticTarget.current = null;
        if (
          event.pointerType !== "mouse" ||
          event.button !== 0 ||
          photos.length < 2 ||
          (event.target instanceof Element && event.target.closest("button"))
        )
          return;
        gesture.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (!current) return;
        const delta = event.clientX - current.x;
        if (Math.abs(delta) > 6 && !current.moved) {
          event.currentTarget.style.scrollSnapType = "none";
          current.moved = true;
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        if (current.moved) {
          event.preventDefault();
          event.currentTarget.scrollLeft = current.left - delta;
        }
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      {photos.map((photo, number) => (
        <PreviewPhoto
          key={`${photo.src}-${number}`}
          photo={photo}
          active={index === number}
          enabled={Math.abs(index - number) <= 1}
          photoAlt={photos.length > 1 ? t.postPhotoAlt(number + 1) : photoAlt}
          t={t}
          closeRef={closeRef}
        />
      ))}
    </div>
  );
}
