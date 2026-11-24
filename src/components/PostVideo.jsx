import { useEffect, useRef, useState } from "react";
import { FiMaximize2 } from "react-icons/fi";
import { mediaDimensions, mediaFrameRatio } from "../utils/posts.js";
import { xMediaSrc, xVideoSrc } from "../media-urls.js";
import { useMediaRequest } from "../hooks/useMediaRequest.js";
import { useReducedMotion } from "../hooks/useReducedMotion.js";
import { readVideoPlayback, restoreVideoPlayback } from "../utils/video-playback.js";
import { MediaLightbox } from "./MediaLightbox.jsx";

// Every attachment owns its player, retry and preview state, including animated GIFs.
export function PostVideo({ video, t, deferOffscreen = false }) {
  const source = xVideoSrc(video.url, video.proxyUrl);
  const request = useMediaRequest(source);
  const dimensions = mediaDimensions(video);
  const reducedMotion = useReducedMotion();
  const playerRef = useRef(null);
  const frameRef = useRef(null);
  const retryRef = useRef(null);
  const returnFocusRef = useRef(null);
  const previewOpenRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [playback, setPlayback] = useState(null);
  const [inView, setInView] = useState(false);
  const [hasEnteredView, setHasEnteredView] = useState(false);
  const shouldObserve = deferOffscreen && typeof IntersectionObserver !== "undefined";
  const autoplay = Boolean(video.animated) && !reducedMotion && (!shouldObserve || inView);

  useEffect(() => {
    if (!shouldObserve || !frameRef.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
      if (entry.isIntersecting) setHasEnteredView(true);
    });
    observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, [shouldObserve]);

  useEffect(() => {
    if (request.retryCount > 0) (request.unavailable ? retryRef : playerRef).current?.focus();
  }, [request.retryCount, request.unavailable]);
  useEffect(() => {
    const player = playerRef.current;
    if (!video.animated || !player) return;
    if (!autoplay || previewOpenRef.current) player.pause();
    else player.play()?.catch(() => {});
  }, [video.animated, autoplay, request.src, request.unavailable]);

  return (
    <>
      <div
        ref={frameRef}
        className="post-video post-video-frame"
        style={{ aspectRatio: mediaFrameRatio(video, 16 / 9) }}
      >
        {request.unavailable || !source ? (
          <div className="post-media-unavailable" role="status">
            <span>{t.videoUnavailable}</span>
            {source && (
              <button ref={retryRef} type="button" onClick={request.retry}>
                {t.retry}
              </button>
            )}
          </div>
        ) : (
          <>
            <video
              ref={playerRef}
              key={request.src}
              controls
              playsInline
              preload="none"
              loop={Boolean(video.animated)}
              muted={Boolean(video.animated)}
              autoPlay={autoplay}
              tabIndex={0}
              poster={
                !shouldObserve || hasEnteredView
                  ? xMediaSrc(video.poster, false, video.posterProxyUrl) || undefined
                  : undefined
              }
              width={dimensions?.width}
              height={dimensions?.height}
              aria-label={video.alt || t.postVideoAlt}
              onError={request.onError}
            >
              <source src={request.src} type="video/mp4" />
            </video>
            <button
              className="post-video-open"
              type="button"
              aria-label={t.enlargeVideo}
              onClick={(event) => {
                previewOpenRef.current = true;
                setPlayback(readVideoPlayback(playerRef.current));
                playerRef.current?.pause();
                returnFocusRef.current = event.currentTarget;
                setExpanded(true);
              }}
            >
              <span className="post-video-expand">
                <FiMaximize2 aria-hidden="true" />
                {t.enlargeVideo}
              </span>
            </button>
          </>
        )}
      </div>
      {expanded && (
        <MediaLightbox
          kind="video"
          video={video}
          videoSrc={request.src}
          videoPlayback={playback}
          onVideoPlaybackChange={(state) => restoreVideoPlayback(playerRef.current, state)}
          t={t}
          onClose={() => {
            previewOpenRef.current = false;
            setExpanded(false);
          }}
          returnFocusRef={returnFocusRef}
        />
      )}
    </>
  );
}
