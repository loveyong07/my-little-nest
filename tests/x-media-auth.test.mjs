import assert from "node:assert/strict";
import test from "node:test";
import {
  parseMediaSource,
  signedMediaUrl,
  authorizedMediaRequest,
  boundedMediaCache,
  authorizeFeed,
  authorizeProfile,
  MEDIA_RETRY_LIMIT,
} from "../server/x-media-auth.mjs";
import { MAX_MEDIA_RETRY, mediaRetrySrc } from "../src/media-urls.js";
import { LEGACY_IMAGE_URLS, LEGACY_VIDEO_URLS } from "../server/x-media-legacy.mjs";

const NOW = Date.UTC(2026, 8, 30, 12);
const DAY_MS = 86400 * 1000;
const AUTH = { secret: "test-only-secret-never-in-public-feed", now: NOW };
const IMAGE_URL = "https://pbs.twimg.com/media/site-photo?format=jpg&name=orig";
const VIDEO_URL = "https://video.twimg.com/ext_tw_video/123/pu/vid/1280x720/site-video.mp4";
const AVATAR_URL = "https://pbs.twimg.com/profile_images/123/avatar_normal.jpg";
const POSTER_URL = "https://pbs.twimg.com/amplify_video_thumb/123/pu/img/poster.jpg";

function requestFor(value, options) {
  return new Request(new URL(value, "https://site.test"), options);
}

async function isAuthorized(value, kind, options = AUTH, requestOptions) {
  const request = requestFor(value, requestOptions);
  const source = parseMediaSource(new URL(request.url).searchParams.get("url"), kind);
  return authorizedMediaRequest(request, source, kind, options);
}

test("only signs expected HTTPS hosts and X media path families", async (t) => {
  for (const [kind, value] of [
    ["image", "https://example.com/media/photo.jpg"],
    ["image", "https://pbs.twimg.com.evil.test/media/photo.jpg"],
    ["image", "https://abs.twimg.com/media/photo.jpg"],
    ["image", "http://pbs.twimg.com/media/photo.jpg"],
    ["image", "https://user:password@pbs.twimg.com/media/photo.jpg"],
    ["image", "https://pbs.twimg.com:444/media/photo.jpg"],
    ["image", "https://pbs.twimg.com/media/photo.jpg#fragment"],
    ["image", "https://pbs.twimg.com/arbitrary/photo.jpg"],
    ["image", "https://pbs.twimg.com/amplify_video_thumbnail/123/poster.jpg"],
    ["video", "https://video.twimg.com/arbitrary/video.mp4"],
    ["video", IMAGE_URL],
    ["image", VIDEO_URL],
    ["image", `https://pbs.twimg.com/media/${"x".repeat(2048)}`],
  ]) {
    await t.test(`${kind}: ${value.slice(0, 100)}`, async () => {
      assert.equal(parseMediaSource(value, kind), null);
      assert.equal(await signedMediaUrl(value, kind, AUTH), null);
    });
  }
});

test("a secret is necessary to sign or accept new resources", async () => {
  assert.equal(await signedMediaUrl(IMAGE_URL, "image", { ...AUTH, secret: "" }), null);
  const url = await signedMediaUrl(IMAGE_URL, "image", AUTH);
  assert.equal(await isAuthorized(url, "image", { ...AUTH, secret: "" }), false);
  assert.equal(await isAuthorized(url, "image", { ...AUTH, secret: "different-test-secret" }), false);
});

test("signatures stay stable within a day, change the next day, and survive a 24-hour cached feed", async () => {
  for (const [kind, source] of [
    ["image", IMAGE_URL],
    ["video", VIDEO_URL],
  ]) {
    const morningUrl = await signedMediaUrl(source, kind, { ...AUTH, now: NOW - 11 * 3600 * 1000 });
    const eveningUrl = await signedMediaUrl(source, kind, { ...AUTH, now: NOW + 11 * 3600 * 1000 });
    const nextDayUrl = await signedMediaUrl(source, kind, { ...AUTH, now: NOW + DAY_MS });
    assert.equal(morningUrl, eveningUrl);
    assert.notEqual(morningUrl, nextDayUrl);
    assert.equal(await isAuthorized(morningUrl, kind), true);
    assert.equal(await isAuthorized(morningUrl, kind, { ...AUTH, now: NOW + DAY_MS }), true);
    const expires = Number(new URL(morningUrl, "https://site.test").searchParams.get("expires"));
    assert.equal(await isAuthorized(morningUrl, kind, { ...AUTH, now: expires * 1000 - 1 }), true);
    assert.equal(await isAuthorized(morningUrl, kind, { ...AUTH, now: expires * 1000 }), false);
  }
});

test("cache freshness plus stale allowance never extends beyond signed resource expiry", async () => {
  const signedUrl = await signedMediaUrl(IMAGE_URL, "image", AUTH);
  const request = requestFor(signedUrl);
  const expires = Number(new URL(request.url).searchParams.get("expires"));
  for (const policy of [
    "public, max-age=86400, stale-while-revalidate=604800",
    "public, s-maxage=86400, stale-while-revalidate=604800",
    "public, max-age=1800, s-maxage=43200",
  ]) {
    const legacyRequest = requestFor(`/api/x-media?url=${encodeURIComponent(LEGACY_IMAGE_URLS[0])}`);
    assert.equal(boundedMediaCache(legacyRequest, policy, NOW), policy);
    for (const now of [NOW, (expires - 30) * 1000, expires * 1000 - 1, expires * 1000]) {
      const result = boundedMediaCache(request, policy, now);
      const freshness = [...result.matchAll(/(?:^|,\s*)(?:s-maxage|max-age)=(\d+)/g)].map((match) => Number(match[1]));
      const stale = Number(result.match(/stale-while-revalidate=(\d+)/)?.[1] ?? 0);
      const remaining = Math.max(0, expires - Math.floor(now / 1000) - 1);
      assert.ok(Math.max(...freshness) + stale <= remaining, `${result} at ${now}`);
      assert.ok(freshness.every((value) => value >= 0));
    }
  }
});

test("source, query, expiry, signature, and signing secret are bound together", async (t) => {
  const signedUrl = new URL(await signedMediaUrl(IMAGE_URL, "image", AUTH), "https://site.test");
  for (const [name, mutate] of [
    ["different source", (url) => url.searchParams.set("url", "https://pbs.twimg.com/media/other-account.jpg")],
    ["different original size", (url) => url.searchParams.set("url", IMAGE_URL.replace("name=orig", "name=small"))],
    ["later expiry", (url) => url.searchParams.set("expires", String(Number(url.searchParams.get("expires")) + 1))],
    ["unbounded future expiry", (url) => url.searchParams.set("expires", String(Math.floor(NOW / 1000) + 10 * 86400))],
    ["noninteger expiry", (url) => url.searchParams.set("expires", "123.5")],
    ["missing expiry", (url) => url.searchParams.delete("expires")],
    ["missing signature", (url) => url.searchParams.delete("signature")],
    [
      "changed signature",
      (url) => {
        const value = url.searchParams.get("signature");
        url.searchParams.set("signature", `${value[0] === "0" ? "1" : "0"}${value.slice(1)}`);
      },
    ],
    ["short signature", (url) => url.searchParams.set("signature", "a")],
  ]) {
    await t.test(name, async () => {
      const tampered = new URL(signedUrl);
      mutate(tampered);
      assert.equal(await isAuthorized(tampered, "image"), false);
    });
  }
});

test("duplicate and unexpected proxy parameters cannot bypass authorization", async (t) => {
  const signedUrl = new URL(await signedMediaUrl(IMAGE_URL, "image", AUTH), "https://site.test");
  for (const name of ["url", "expires", "signature", "retry", "lightboxRetry"]) {
    await t.test(`duplicate ${name}`, async () => {
      const url = new URL(signedUrl);
      if (["retry", "lightboxRetry"].includes(name)) url.searchParams.set(name, "1");
      url.searchParams.append(name, url.searchParams.get(name));
      assert.equal(await isAuthorized(url, "image"), false);
    });
  }
  for (const [name, value] of [
    ["cacheBust", "1"],
    ["retry", "4"],
    ["retry", "101"],
    ["retry", "0"],
    ["retry", "00"],
    ["retry", "-1"],
    ["retry", "abc"],
    ["lightboxRetry", "1000"],
    ["lightboxRetry", "10"],
  ]) {
    await t.test(`${name}=${value}`, async () => {
      const url = new URL(signedUrl);
      url.searchParams.set(name, value);
      assert.equal(await isAuthorized(url, "image"), false);
    });
  }
});

test("normal browser requests and bounded image/lightbox retries retain their signatures", async () => {
  const signedUrl = new URL(await signedMediaUrl(IMAGE_URL, "image", AUTH), "https://site.test");
  signedUrl.searchParams.set("retry", "1");
  signedUrl.searchParams.set("lightboxRetry", "3");
  assert.equal(await isAuthorized(signedUrl, "image"), true);
  assert.equal(await isAuthorized(signedUrl, "image", AUTH, { headers: { "Sec-Fetch-Site": "same-origin" } }), true);
  assert.equal(await isAuthorized(signedUrl, "image", AUTH, { headers: { "Sec-Fetch-Site": "cross-site" } }), false);
});

test("the accepted retry variants are canonical, bounded, and identical on both sides", async () => {
  assert.equal(MAX_MEDIA_RETRY, MEDIA_RETRY_LIMIT);
  const signedUrl = await signedMediaUrl(IMAGE_URL, "image", AUTH);
  for (const kind of ["retry", "lightboxRetry"]) {
    for (let value = 1; value <= MEDIA_RETRY_LIMIT; value += 1) {
      const url = new URL(signedUrl, "https://site.test");
      url.searchParams.set(kind, String(value));
      assert.equal(await isAuthorized(url, "image"), true, `${kind}=${value}`);
      assert.equal(
        mediaRetrySrc(signedUrl, value, kind),
        `${signedUrl}&${kind}=${value}`,
        `${kind}=${value} client URL`,
      );
    }
    for (const value of ["0", "00", "01", String(MEDIA_RETRY_LIMIT + 1), "10", "100", " "]) {
      const url = new URL(signedUrl, "https://site.test");
      url.searchParams.set(kind, value);
      assert.equal(await isAuthorized(url, "image"), false, `${kind}=${value}`);
    }
  }
  // Repeated failures vary the URL over the same bounded set instead of growing it.
  const variants = new Set();
  for (let attempt = 1; attempt <= 12; attempt += 1) variants.add(mediaRetrySrc(signedUrl, attempt));
  assert.deepEqual(
    [...variants].sort(),
    [1, 2, 3].map((value) => `${signedUrl}&retry=${value}`),
  );
  assert.equal(mediaRetrySrc(signedUrl, 0), signedUrl);
  assert.equal(mediaRetrySrc(null, 2), null);
});

test("unsigned compatibility permissions cover exactly previously published resources", async () => {
  for (const [kind, sources] of [
    ["image", LEGACY_IMAGE_URLS],
    ["video", LEGACY_VIDEO_URLS],
  ]) {
    for (const source of sources) {
      const url = `/api/x-${kind === "image" ? "media" : "video"}?url=${encodeURIComponent(source)}`;
      assert.equal(await isAuthorized(url, kind, { ...AUTH, secret: "" }), true, source);
      assert.equal(await isAuthorized(`${url}&retry=1&lightboxRetry=2`, kind), true, source);
      assert.equal(await isAuthorized(url, kind, AUTH, { headers: { "Sec-Fetch-Site": "cross-site" } }), false, source);
      const changed = `${source}?name=small`;
      assert.equal(
        await isAuthorized(`/api/x-${kind === "image" ? "media" : "video"}?url=${encodeURIComponent(changed)}`, kind),
        false,
        changed,
      );
    }
  }
});

test("profile signatures cover normal and high resolution avatars without mutating the profile", async () => {
  const input = { status: "ok", profile: { name: "Site owner", avatar: AVATAR_URL, description: "Original text" } };
  const original = structuredClone(input);
  const output = await authorizeProfile(input, AUTH);
  assert.deepEqual(input, original);
  assert.equal(output.profile.avatar, AVATAR_URL);
  assert.equal(output.profile.description, input.profile.description);
  assert.equal(new URL(output.profile.avatarProxy.normal, "https://site.test").searchParams.get("url"), AVATAR_URL);
  assert.equal(
    new URL(output.profile.avatarProxy.highRes, "https://site.test").searchParams.get("url"),
    AVATAR_URL.replace("_normal", "_400x400"),
  );
  assert.equal(await isAuthorized(output.profile.avatarProxy.normal, "image"), true);
  assert.equal(await isAuthorized(output.profile.avatarProxy.highRes, "image"), true);
  assert.equal(JSON.stringify(output).includes(AUTH.secret), false);
  const noProfile = { status: "unavailable" };
  assert.equal(await authorizeProfile(noProfile, AUTH), noProfile);
});

test("feed adds valid media permissions while preserving content, order, pinned data, and original source URLs", async () => {
  const post = {
    id: "post-1",
    text: "Original post",
    url: "https://x.com/owner/status/1",
    avatar: AVATAR_URL,
    metrics: { likes: 4 },
    media: [
      { type: "photo", url: IMAGE_URL, width: 1280, height: 720 },
      { type: "video", url: VIDEO_URL, poster: POSTER_URL, duration: 1200 },
    ],
  };
  const input = {
    status: "ok",
    fetchedAt: "2026-09-30T12:00:00Z",
    posts: [post, { ...post, id: "post-2", text: "Second post" }],
    pinnedPost: { ...post, id: "pinned-1" },
    pinnedStatus: "ok",
  };
  const original = structuredClone(input);
  const output = await authorizeFeed(input, AUTH);
  assert.deepEqual(input, original);
  assert.equal(output.status, input.status);
  assert.equal(output.fetchedAt, input.fetchedAt);
  assert.equal(output.pinnedStatus, input.pinnedStatus);
  assert.deepEqual(
    output.posts.map(({ id }) => id),
    ["post-1", "post-2"],
  );
  for (const [signedPost, originalPost] of [
    [output.posts[0], input.posts[0]],
    [output.posts[1], input.posts[1]],
    [output.pinnedPost, input.pinnedPost],
  ]) {
    const { avatarProxy, media, ...content } = signedPost;
    const { media: originalMedia, ...originalContent } = originalPost;
    assert.deepEqual(content, originalContent);
    assert.equal(await isAuthorized(avatarProxy.normal, "image"), true);
    assert.equal(await isAuthorized(avatarProxy.highRes, "image"), true);
    for (let index = 0; index < media.length; index += 1) {
      const { proxyUrl, posterProxyUrl, ...itemContent } = media[index];
      assert.deepEqual(itemContent, originalMedia[index]);
      assert.equal(await isAuthorized(proxyUrl, itemContent.type === "video" ? "video" : "image"), true);
      if (itemContent.poster) assert.equal(await isAuthorized(posterProxyUrl, "image"), true);
    }
  }
  const serialized = JSON.stringify(output);
  assert.equal(serialized.includes(AUTH.secret), false);
  assert.equal(serialized.includes("X_BEARER_TOKEN"), false);
  assert.equal(serialized.includes("X_MEDIA_SIGNING_SECRET"), false);
});
