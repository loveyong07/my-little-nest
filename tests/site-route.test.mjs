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

test("intercepts same-origin links to the three routes, including cross-route queries and fragments", () => {
  const current = "https://example.test/";
  assert.deepEqual(siteNavigation("/posts/", current), { page: "posts", path: "/posts" });
  assert.deepEqual(siteNavigation("https://example.test/contact", current), { page: "contact", path: "/contact" });
  assert.deepEqual(siteNavigation("/posts?article=123", current), {
    page: "posts",
    path: "/posts",
    search: "?article=123",
  });
  assert.deepEqual(siteNavigation("/contact#anonymous-message", current), {
    page: "contact",
    path: "/contact",
    hash: "#anonymous-message",
  });
  assert.deepEqual(siteNavigation("/posts?post=42#latest-posts", current), {
    page: "posts",
    path: "/posts",
    search: "?post=42",
    hash: "#latest-posts",
  });
  // Native in-page fragment navigation remains unhandled when already on the same route and query.
  assert.equal(siteNavigation("#anonymous-message", "https://example.test/contact"), null);
  assert.equal(siteNavigation("/contact/#email-options", "https://example.test/contact"), null);
  for (const href of [
    "/posts/123",
    "https://x.com/posts",
    "/privacy",
    "/terms",
    "/business",
    "/business/",
    "/business?from=home",
    "/business#details",
    "/business/services",
  ]) {
    assert.equal(siteNavigation(href, current), null);
  }
});
