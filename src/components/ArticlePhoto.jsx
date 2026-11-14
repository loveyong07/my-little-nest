import { useRef, useState } from "react";
import { xMediaSrc } from "../media-urls.js";
import { useMediaRequest } from "../hooks/useMediaRequest.js";
import { MediaLightbox } from "./MediaLightbox.jsx";

export function ArticlePhoto({ photos, number, t }) {
  const photo = photos[number - 1];
  const source = xMediaSrc(photo.url, false, photo.proxyUrl);
  const request = useMediaRequest(source);
  const [expanded, setExpanded] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(number - 1);
  const currentPhotoIndex = Math.min(photoIndex, photos.length - 1);
  const expandedPhoto = photos[currentPhotoIndex];
  const returnFocusRef = useRef(null);
  const alt = photo.alt || t.postPhotoAlt(number);

  return (
    <div className="article-photo">
      {request.unavailable || !request.src ? (
        <div className="post-media-unavailable" role="status">
          <span>{t.photoUnavailable}</span>
          {source && (
            <button type="button" onClick={request.retry}>
              {t.retry}
            </button>
          )}
        </div>
      ) : (
        <button
          ref={returnFocusRef}
          className="article-photo-open"
          type="button"
          aria-label={`${t.enlargePhoto} · ${alt}`}
          onClick={() => {
            setPhotoIndex(number - 1);
            setExpanded("photo");
          }}
        >
          <img
            key={request.src}
            className="article-cover"
            src={request.src}
            alt={alt}
            width={photo.width}
            height={photo.height}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={request.onLoad}
            onError={request.onError}
          />
        </button>
      )}
      {expanded && (
        <MediaLightbox
          kind="photo"
          photo={{
            ...expandedPhoto,
            src: xMediaSrc(expandedPhoto.url, false, expandedPhoto.proxyUrl),
            number: currentPhotoIndex + 1,
          }}
          photoAlt={t.postPhotoAlt(currentPhotoIndex + 1)}
          photos={photos.map((item) => ({ ...item, src: xMediaSrc(item.url, false, item.proxyUrl) }))}
          photoCount={photos.length}
          onPhotoChange={(next) =>
            setPhotoIndex((index) => (typeof next === "function" ? next(Math.min(index, photos.length - 1)) : next))
          }
          t={t}
          onClose={setExpanded}
          returnFocusRef={returnFocusRef}
        />
      )}
    </div>
  );
}
