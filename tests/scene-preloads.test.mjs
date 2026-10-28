import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withScenePreloads, withFontPreloads } from "../build/scene-preloads.mjs";

test("first-paint fonts are preloaded with the hashed Quicksand bundle name", () => {
  const bundle = {
    "assets/quicksand-latin-700-normal-DNRMnynu.woff2": {},
    "assets/quicksand-latin-500-normal-BKohNur2.woff2": {},
  };
  const html = withFontPreloads("<html><head></head><body></body></html>", bundle);
  assert.match(html, /href="\/assets\/quicksand-latin-700-normal-DNRMnynu\.woff2" crossorigin/);
  assert.doesNotMatch(html, /quicksand-latin-500/);
  assert.match(html, /href="\/assets\/fonts\/nest-ui-2026-09-30\.woff"/);
  assert.equal((withFontPreloads(html, bundle).match(/data-font-preload/g) ?? []).length, 2);
});

test("direct route shells replace home preloads rather than fetching unrelated scenes", () => {
  const home = withScenePreloads("<html><head></head><body></body></html>", "home");
  assert.match(home, /media="\(max-width: 700px\)"/);
  assert.match(home, /media="not all and \(max-width: 700px\)"/);
  for (const [page, scene] of [
    ["posts", "posts-winter"],
    ["contact", "contact-sky"],
  ]) {
    const html = withScenePreloads(home, page);
    assert.equal((html.match(/data-scene-preload/g) ?? []).length, 1);
    assert.match(html, new RegExp(scene));
    assert.doesNotMatch(html, /home-beach-(?:mobile|desktop)/);
  }
});

// The built-shell rewrite assertions live in tests/build/artifacts.test.mjs:
// they read dist/ and must not gate the logic-only tests on a produced build.

test("long immutable caching matches hashed build files while excluding fixed scene and avatar names", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const rule = config.headers.find(({ headers }) => headers.some(({ value }) => value.includes("immutable")));
  const pattern = new RegExp("^/assets/" + rule.source.slice("/assets/:file(".length, -1) + "$");
  assert.equal(pattern.test("/assets/index-1234a_Bc.js"), true);
  assert.equal(pattern.test("/assets/cormorant-garamond-latin-700-italic-1ifP4r4a.woff2"), true);
  for (const name of [
    "home-beach-desktop-cadff3fb.webp",
    "contact-sky-letter-v2-clean-q90.webp",
    "x-avatar.jpg",
    "site-favicon-chibi-2026-10-28.png",
  ])
    assert.equal(pattern.test(`/assets/${name}`), false);
});
