import assert from "node:assert/strict";
import test from "node:test";
import { xMediaSrc, xVideoSrc } from "../src/media-urls.js";

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
