import { useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";
import { mediaDimensions, mediaFrameRatio } from "../utils/posts.js";
import { useMediaRequest } from "../hooks/useMediaRequest.js";
import { prefetchImage } from "../feed-cache.js";
import { xMediaSrc } from "../media-urls.js";

function PhotoSlide({ photo, number, priorityMedia, enabled, onOpen, onLoad, onStatus, t }) {
  const request = useMediaRequest(photo.src);
  const openRef = useRef(null);
  const retryRef = useRef(null);
  const dimensions = mediaDimensions(photo);
  const [visited, setVisited] = useState(enabled);
  if (enabled && !visited) setVisited(true);
  useEffect(() => {
    if (request.retryCount > 0) (request.unavailable ? retryRef : openRef).current?.focus();
  }, [request.retryCount, request.unavailable]);
  return (
    <div
      className="post-photo-tile"
      data-photo-index={number - 1}
      style={{ "--photo-ratio": dimensions ? dimensions.width / dimensions.height : 4 / 3 }}
    >
      {request.unavailable || !request.src ? (
        <div className="post-media-unavailable">
          <span>{t.photoUnavailable}</span>
          {request.src && (
            <button
              ref={retryRef}
              type="button"
              onClick={() => {
                onStatus("loading");
                request.retry();
              }}
            >
              {t.retry}
            </button>
          )}
        </div>
      ) : (
        <button
          ref={openRef}
          className="post-media-open"
          type="button"
          onClick={onOpen}
          aria-label={`${t.enlargePhoto} · ${t.postPhotoAlt(number)}`}
        >
          {visited && (
            <img
              src={request.src}
              alt={photo.alt || t.postPhotoAlt(number)}
              width={dimensions?.width}
              height={dimensions?.height}
              loading={priorityMedia ? "eager" : "lazy"}
              fetchPriority={priorityMedia ? "high" : undefined}
              decoding="async"
              draggable="false"
              referrerPolicy="no-referrer"
              onLoad={() => {
                request.onLoad();
                onStatus("loaded");
                onLoad();
              }}
              onError={() => {
                request.onError();
                onStatus("failed");
              }}
            />
          )}
          {!request.loaded && (
            <span className="post-media-loading" aria-hidden="true">
              {t.photoLoading}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

export function PhotoGallery({ photos, onOpen, priorityMedia, nextPost, t }) {
  const trackRef = useRef(null);
  const geometryRef = useRef([]);
  const frameRef = useRef(null);
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const targetRef = useRef(0);
  const programmatic = useRef(false);
  const [view, setView] = useState({ previous: false, next: photos.length > 1, first: 0, last: 1 });
  const [statuses, setStatuses] = useState([]);
  const single = photos.length === 1;
  const visibleStatuses = photos.slice(view.first, view.last + 1).map((photo, offset) => {
    if (!photo.src) return "failed";
    const saved = statuses[view.first + offset];
    return saved?.source === photo.src ? saved.status : "loading";
  });
  const announcement = visibleStatuses.includes("loading")
    ? t.photoLoading
    : visibleStatuses.includes("failed")
      ? t.photoUnavailable
      : "";

  function readPosition() {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const left = track.scrollLeft;
    const right = left + track.clientWidth;
    if (!programmatic.current) targetRef.current = closestPhoto();
    const items = geometryRef.current;
    const visible = items.filter((item) => item.left + item.width > left + 1 && item.left < right - 1);
    const next = {
      previous: left > 1,
      next: right < track.scrollWidth - 1,
      first: Math.max(0, (visible[0]?.index ?? 0) - 1),
      last: Math.min(photos.length - 1, (visible.at(-1)?.index ?? 0) + 1),
    };
    setView((current) => (Object.keys(next).every((key) => current[key] === next[key]) ? current : next));
  }

  function closestPhoto() {
    const track = trackRef.current;
    if (track.scrollLeft < 1) return 0;
    if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 1) return photos.length - 1;
    const center = track.scrollLeft + track.clientWidth / 2;
    return geometryRef.current.reduce(
      (best, item) =>
        Math.abs(item.left + item.width / 2 - center) < Math.abs(best.left + best.width / 2 - center) ? item : best,
      geometryRef.current[0],
    ).index;
  }

  function moveTo(index, smooth = true) {
    const track = trackRef.current;
    const next = Math.max(0, Math.min(photos.length - 1, index));
    const item = geometryRef.current[next];
    if (!track || !item) return;
    programmatic.current = true;
    targetRef.current = next;
    track.style.scrollSnapType = "";
    track.scrollTo({
      left: Math.max(
        0,
        Math.min(track.scrollWidth - track.clientWidth, item.left - (track.clientWidth - item.width) / 2),
      ),
      behavior: smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant",
    });
  }

  useEffect(() => {
    const track = trackRef.current;
    const measure = () => {
      geometryRef.current = [...track.children].map((tile, index) => ({
        index,
        left: tile.offsetLeft,
        width: tile.offsetWidth,
      }));
      readPosition();
    };
    measure();
    const settle = () => {
      programmatic.current = false;
      targetRef.current = closestPhoto();
    };
    track.addEventListener("scrollend", settle);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(track);
    for (const tile of track.children) observer?.observe(tile);
    return () => {
      track.removeEventListener("scrollend", settle);
      observer?.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
    // The post card is keyed by post ID; signed media refreshes can change tile geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  function finishDrag(event) {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    const track = event.currentTarget;
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    track.classList.remove("is-dragging");
    track.style.scrollSnapType = "";
    if (current.moved) moveTo(closestPhoto());
  }

  return (
    <div className="post-photo-browser">
      <span className="sr-only" role="status">
        {announcement}
      </span>
      <div
        className={`post-media post-media-frame post-photo-carousel${single ? " post-photo-single" : ""}`}
        style={single ? { aspectRatio: mediaFrameRatio(photos) } : undefined}
      >
        <div
          ref={trackRef}
          className="post-photo-track"
          dir="ltr"
          onScroll={() => {
            if (frameRef.current !== null) return;
            frameRef.current = requestAnimationFrame(() => {
              frameRef.current = null;
              readPosition();
            });
          }}
          onPointerDown={(event) => {
            suppressClick.current = false;
            programmatic.current = false;
            targetRef.current = closestPhoto();
            if (
              event.pointerType !== "mouse" ||
              event.button !== 0 ||
              single ||
              (event.target instanceof Element && event.target.closest(".post-media-unavailable"))
            )
              return;
            gesture.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
          }}
          onPointerMove={(event) => {
            const current = gesture.current;
            if (!current) return;
            const delta = event.clientX - current.x;
            if (Math.abs(delta) > 6 && !current.moved) {
              current.moved = true;
              suppressClick.current = true;
              event.currentTarget.style.scrollSnapType = "none";
              event.currentTarget.classList.add("is-dragging");
              event.currentTarget.setPointerCapture(event.pointerId);
            }
            if (current.moved) {
              event.preventDefault();
              event.currentTarget.scrollLeft = current.left - delta;
            }
          }}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onClickCapture={(event) => {
            if (suppressClick.current) {
              event.preventDefault();
              event.stopPropagation();
              suppressClick.current = false;
            }
          }}
          onFocusCapture={(event) => {
            const tile = event.target.closest(".post-photo-tile");
            if (!(tile instanceof HTMLElement) || !trackRef.current.clientWidth) return;
            const number = Number(tile.dataset.photoIndex);
            const item = geometryRef.current[number];
            const track = trackRef.current;
            if (item.left < track.scrollLeft || item.left + item.width > track.scrollLeft + track.clientWidth)
              moveTo(number);
          }}
          onKeyDown={(event) => {
            const keys = {
              ArrowLeft: closestPhoto() - 1,
              ArrowRight: closestPhoto() + 1,
              Home: 0,
              End: photos.length - 1,
            };
            if (event.key in keys) {
              event.preventDefault();
              event.stopPropagation();
              moveTo(keys[event.key]);
            }
          }}
        >
          {photos.map((photo, number) => (
            <PhotoSlide
              key={`${photo.src}-${number}`}
              photo={photo}
              number={number + 1}
              enabled={single || (number >= view.first && number <= view.last)}
              priorityMedia={priorityMedia && number === 0}
              t={t}
              onOpen={(event) => onOpen(number, event)}
              onStatus={(status) => {
                setStatuses((current) => {
                  const next = [...current];
                  next[number] = { source: photo.src, status };
                  return next;
                });
              }}
              onLoad={() => {
                if (number !== 0) return;
                const next = nextPost?.media?.find((media) => (media.type ?? "photo") === "photo");
                prefetchImage(xMediaSrc(next?.url, false, next?.proxyUrl));
              }}
            />
          ))}
        </div>
        {!single && (
          <>
            <button
              type="button"
              className="post-photo-arrow post-photo-previous"
              aria-label={t.prevPhoto}
              hidden={!view.previous}
              onClick={() => moveTo(targetRef.current - 1)}
            >
              <FiArrowLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="post-photo-arrow post-photo-next"
              aria-label={t.nextPhoto}
              hidden={!view.next}
              onClick={() => moveTo(targetRef.current + 1)}
            >
              <FiArrowRight aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
