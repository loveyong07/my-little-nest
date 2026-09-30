import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withScenePreloads } from "../build/scene-preloads.mjs";

test("direct route shells replace home preloads rather than fetching unrelated scenes", () => {
  const home = withScenePreloads("<html><head></head><body></body></html>", "home");
  assert.match(home, /media="\(max-width: 700px\)"/);
  assert.match(home, /media="not all and \(max-width: 700px\)"/);
  for (const [page, scene] of [["posts", "posts-winter"], ["contact", "contact-sky"], ["business", "business-sky-studio-smile-v2"]]) {
    const html = withScenePreloads(home, page);
    assert.equal((html.match(/data-scene-preload/g) ?? []).length, 1);
    assert.match(html, new RegExp(scene));
    assert.doesNotMatch(html, /hero-sky-(?:mobile|alt)/);
  }
});

test("production rewrites point to built shells sharing the current React entry", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const home = readFileSync(new URL("../dist/client/index.html", import.meta.url), "utf8");
  const entry = home.match(/<script[^>]+src="([^"]+)"/)[1];
  for (const page of ["posts", "contact", "business"]) {
    const rewrite = config.rewrites.find(({ source }) => source === `/${page}`);
    assert.equal(rewrite.destination, `/route-shells/${page}.html`);
    assert.equal(config.rewrites.find(({ source }) => source === `/${page}/`).destination, `/route-shells/${page}.html`);
    const html = readFileSync(new URL(`../dist/client/route-shells/${page}.html`, import.meta.url), "utf8");
    assert.ok(html.includes(entry));
    assert.equal((html.match(/data-scene-preload/g) ?? []).length, 1);
    assert.doesNotMatch(html, /hero-sky-(?:mobile|alt)/);
  }
});

test("long immutable caching matches hashed build files while excluding fixed scene and avatar names", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const rule = config.headers.find(({ headers }) => headers.some(({ value }) => value.includes("immutable")));
  const pattern = new RegExp("^/assets/" + rule.source.slice("/assets/:file(".length, -1) + "$");
  assert.equal(pattern.test("/assets/index-1234a_Bc.js"), true);
  assert.equal(pattern.test("/assets/cormorant-garamond-latin-700-italic-1ifP4r4a.woff2"), true);
  for (const name of ["hero-sky-alt-motion-q90.webp", "business-sky-studio-smile-v2-q90.webp", "x-avatar.jpg", "site-favicon-2026-09-29.png"]) assert.equal(pattern.test(`/assets/${name}`), false);
});
