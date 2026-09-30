import assert from "node:assert/strict";
import test from "node:test";
import { xMediaSrc, xVideoSrc } from "../src/media-urls.js";

function authorizedSrc(route, source, expires = "1791993600") {
  return `${route}?url=${encodeURIComponent(source)}&expires=${expires}&signature=${"a".repeat(64)}`;
}

test("X media URLs remain on the site's image route, including avatar upgrades", () => {
  const avatar = "https://pbs.twimg.com/profile_images/123/avatar_normal.jpg";
  const photo = "https://pbs.twimg.com/media/abc?format=jpg&name=large";
  assert.equal(xMediaSrc(avatar), `/api/x-media?url=${encodeURIComponent(avatar)}`);
  assert.equal(xMediaSrc(avatar, true), `/api/x-media?url=${encodeURIComponent("https://pbs.twimg.com/profile_images/123/avatar_400x400.jpg")}`);
  assert.equal(xMediaSrc(photo), `/api/x-media?url=${encodeURIComponent(photo)}`);
});

test("unapproved browser media URLs cannot bypass the image route", () => {
  for (const url of [
    "http://pbs.twimg.com/media/abc.jpg",
    "https://pbs.twimg.com.evil.example/media/abc.jpg",
    "https://user@pbs.twimg.com/media/abc.jpg",
    "https://pbs.twimg.com:444/media/abc.jpg",
    "https://pbs.twimg.com/other/abc.jpg",
    "https://video.twimg.com/ext_tw_video/abc.jpg",
  ]) assert.equal(xMediaSrc(url), null, url);
  assert.equal(xMediaSrc(null), null);
});

test("X MP4 URLs stay on the site's range-enabled video route", () => {
  const mp4 = "https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/720x720/abc.mp4";
  assert.equal(xVideoSrc(mp4), `/api/x-video?url=${encodeURIComponent(mp4)}`);
  for (const url of [
    "http://video.twimg.com/ext_tw_video/abc.mp4",
    "https://pbs.twimg.com/ext_tw_video/abc.mp4",
    "https://video.twimg.com/other/abc.mp4",
    "https://user@video.twimg.com/ext_tw_video/abc.mp4",
  ]) assert.equal(xVideoSrc(url), null, url);
});

test("published photos and both avatar resolutions retain their authorized image URLs", () => {
  const photo = "https://pbs.twimg.com/media/abc?format=jpg&name=orig";
  const avatar = "https://pbs.twimg.com/profile_images/123/avatar_normal.jpg";
  const highResAvatar = avatar.replace("_normal", "_400x400");
  const photoSrc = authorizedSrc("/api/x-media", photo);
  const normalSrc = authorizedSrc("/api/x-media", avatar);
  const highResSrc = authorizedSrc("/api/x-media", highResAvatar);
  assert.equal(xMediaSrc(photo, false, photoSrc), photoSrc);
  assert.equal(xMediaSrc(avatar, false, normalSrc), normalSrc);
  assert.equal(xMediaSrc(avatar, true, highResSrc), highResSrc);
  assert.equal(xMediaSrc(avatar, true, normalSrc), null);
  // The server owns expiry checks; a wrong visitor clock must not hide media.
  const olderSrc = authorizedSrc("/api/x-media", photo, "1");
  assert.equal(xMediaSrc(photo, false, olderSrc), olderSrc);
});

test("published videos and posters retain separate authorized routes", () => {
  const video = "https://video.twimg.com/ext_tw_video/123/pu/vid/720x720/clip.mp4?tag=12";
  const poster = "https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/preview.jpg";
  const videoSrc = authorizedSrc("/api/x-video", video);
  const posterSrc = authorizedSrc("/api/x-media", poster);
  assert.equal(xVideoSrc(video, videoSrc), videoSrc);
  assert.equal(xMediaSrc(poster, false, posterSrc), posterSrc);
  assert.equal(xVideoSrc(video, posterSrc), null);
  assert.equal(xMediaSrc(poster, false, videoSrc), null);
});

test("invalid proxy fields cannot redirect media or silently fall back to unsigned requests", () => {
  const photo = "https://pbs.twimg.com/media/abc.jpg";
  const source = authorizedSrc("/api/x-media", photo);
  for (const candidate of [
    `https://example.com${source}`,
    `//example.com${source}`,
    `${source}#ignored`,
    source.replace("/api/x-media?", "/api/x-media/other?"),
    authorizedSrc("/api/x-media", "https://pbs.twimg.com/media/other.jpg"),
    source.replace("signature=", "signature=bad"),
    source.replace("expires=1791993600", "expires=0"),
    source.replace("expires=1791993600", "expires=9007199254740992"),
    `${source}&url=${encodeURIComponent(photo)}`,
    `${source}&extra=1`,
    "",
    {},
  ]) assert.equal(xMediaSrc(photo, false, candidate), null, String(candidate));
  assert.equal(xMediaSrc("https://example.com/image.jpg", false, source), null);
  assert.equal(xMediaSrc(photo, false, undefined), `/api/x-media?url=${encodeURIComponent(photo)}`);
});
