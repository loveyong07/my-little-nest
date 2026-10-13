import assert from "node:assert/strict";
import test from "node:test";
import { allowedMediaContext } from "../server/media-request-policy.mjs";
import { signedMediaUrl } from "../server/x-media-auth.mjs";
import { proxyXMedia } from "../server/x-media.mjs";
import { proxyXVideo } from "../server/x-video.mjs";
import { LEGACY_IMAGE_URLS, LEGACY_VIDEO_URLS } from "../server/x-media-legacy.mjs";

const AUTH = { secret: "policy-test-secret", now: Date.UTC(2026, 9, 13, 12) };
const cases = [
  ["modern same-origin", { "Sec-Fetch-Site": "same-origin" }, true],
  ["direct navigation", { "Sec-Fetch-Site": "none" }, true],
  ["cross-site", { "Sec-Fetch-Site": "cross-site", Referer: "https://site.test/" }, false],
  ["sibling subdomain", { "Sec-Fetch-Site": "same-site" }, false],
  ["unknown metadata", { "Sec-Fetch-Site": "unexpected" }, false],
  ["duplicate metadata", { "Sec-Fetch-Site": "same-origin, cross-site" }, false],
  ["empty metadata", { "Sec-Fetch-Site": "" }, false],
  ["old browser same origin", { Referer: "https://site.test/posts", Origin: "https://site.test" }, true],
  ["no metadata or referrer", {}, true],
  ["foreign referrer", { Referer: "https://evil.test/" }, false],
  ["foreign origin", { Origin: "https://evil.test" }, false],
  ["conflicting fallback headers", { Referer: "https://site.test/", Origin: "https://evil.test" }, false],
  ["similar hostname", { Referer: "https://site.test.evil.test/" }, false],
  ["different port", { Referer: "https://site.test:444/" }, false],
  ["different scheme", { Referer: "http://site.test/" }, false],
  ["credentials in referrer", { Referer: "https://user@site.test/" }, false],
  ["malformed referrer", { Referer: "not a URL" }, false],
  ["opaque origin", { Origin: "null" }, false],
];

for (const [kind, proxy, legacy, source, mime] of [
  ["image", proxyXMedia, LEGACY_IMAGE_URLS[0], "https://pbs.twimg.com/media/policy.jpg", "image/jpeg"],
  ["video", proxyXVideo, LEGACY_VIDEO_URLS[0], "https://video.twimg.com/ext_tw_video/123/policy.mp4", "video/mp4"],
]) {
  test(`${kind}: context policy protects signed and legacy sources before upstream work`, async (t) => {
    const signed = await signedMediaUrl(source, kind, AUTH);
    const unsigned = `/api/x-${kind === "image" ? "media" : "video"}?url=${encodeURIComponent(legacy)}`;
    for (const [label, headers, allowed] of cases) {
      await t.test(label, async () => {
        for (const value of [signed, unsigned]) {
          let calls = 0;
          const response = await proxy(
            new Request(new URL(value, "https://site.test"), { headers }),
            async () => {
              calls++;
              return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": mime } });
            },
            AUTH,
          );
          assert.equal(response.status, allowed ? 200 : 403);
          assert.equal(calls, allowed ? 1 : 0);
          if (allowed) {
            assert.equal(response.headers.get("vary"), "Sec-Fetch-Site");
            assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
            if (!headers["Sec-Fetch-Site"]) {
              assert.equal(response.headers.get("cache-control"), "no-store");
              assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
            } else {
              assert.match(response.headers.get("cache-control"), /^public,/);
            }
            assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
          } else {
            assert.equal(response.headers.get("cache-control"), "no-store");
            await response.text();
          }
        }
      });
    }
  });

  test(`${kind}: cache lookup separates warmed same-origin media from cross-site requests`, async () => {
    const url = new URL(await signedMediaUrl(source, kind, AUTH), "https://site.test");
    let calls = 0;
    const fetchUpstream = async () => {
      calls++;
      return new Response(new Uint8Array([1]), { headers: { "Content-Type": mime } });
    };
    const warmRequest = new Request(url, { headers: { "Sec-Fetch-Site": "same-origin" } });
    const warm = await proxy(warmRequest, fetchUpstream, AUTH);
    // Model an HTTP cache's Vary matching, not Vercel's production implementation.
    const vary = warm.headers
      .get("vary")
      .toLowerCase()
      .split(/\s*,\s*/);
    for (const site of ["cross-site", "same-site", null]) {
      const other = new Request(url, {
        headers: site ? { "Sec-Fetch-Site": site } : { Referer: "https://evil.test/" },
      });
      assert.equal(
        vary.every((name) => warmRequest.headers.get(name) === other.headers.get(name)),
        false,
      );
      const rejected = await proxy(other, fetchUpstream, AUTH);
      assert.equal(rejected.status, 403);
    }
    assert.equal(calls, 1);
    await warm.arrayBuffer();
  });
}

test("fallback context comparison works for preview hosts and local ports without trusting forwarded headers", () => {
  for (const origin of ["http://127.0.0.1:5173", "http://localhost:4173", "https://nest-preview.vercel.app"]) {
    assert.equal(
      allowedMediaContext(new Request(`${origin}/api/x-media`, { headers: { Referer: `${origin}/posts` } })),
      true,
    );
    assert.equal(
      allowedMediaContext(
        new Request(`${origin}/api/x-media`, {
          headers: { Referer: "https://evil.test/", "X-Forwarded-Host": "evil.test", "X-Forwarded-Proto": "https" },
        }),
      ),
      false,
    );
  }
});
