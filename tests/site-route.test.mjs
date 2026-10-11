import test from "node:test";
import assert from "node:assert/strict";
import { resolvePage, siteNavigation } from "../src/routes/site-route.js";

test("resolves the three supported direct routes with trailing slashes", () => {
  assert.equal(resolvePage("/"), "home");
  assert.equal(resolvePage("/posts/"), "posts");
  assert.equal(resolvePage("/contact///"), "contact");
  assert.equal(resolvePage("/business/"), "home");
  assert.equal(resolvePage("/posts/123"), "home");
});

test("intercepts only same-origin links to the three plain routes", () => {
  const current = "https://example.test/";
  assert.deepEqual(siteNavigation("/posts/", current), { page: "posts", path: "/posts" });
  assert.deepEqual(siteNavigation("https://example.test/contact", current), { page: "contact", path: "/contact" });
  for (const href of [
    "/posts?from=home",
    "/posts#latest-posts",
    "/posts/123",
    "https://x.com/posts",
    "/business",
    "/business/",
    "/business?from=home",
    "/business#details",
    "/business/services",
  ]) {
    assert.equal(siteNavigation(href, current), null);
  }
});
