import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const root = createRequire(import.meta.url);
const picomatch = root("picomatch");

test("the Vite glob consumers share the local picomatch backport", () => {
  const vite = createRequire(root.resolve("vite"));
  const tinyglobby = createRequire(vite.resolve("tinyglobby"));
  const fdir = createRequire(tinyglobby.resolve("fdir"));
  const patchedEntry = root.resolve("../vendor/picomatch");
  for (const resolveFrom of [vite, tinyglobby, fdir]) {
    assert.equal(resolveFrom.resolve("picomatch"), patchedEntry);
  }
});

test("filename globs and literal repetition keep their matching behavior", () => {
  const components = picomatch("**/*.jsx");
  assert.equal(components("src/pages/PostsPage.jsx"), true);
  assert.equal(components("src/utils/date.js"), false);
  assert.equal(picomatch("+(tag-)file.js")("tag-tag-file.js"), true);
});

test("a repeated single wildcard branch compiles without an outer unbounded quantifier", () => {
  const branch = "asset-*.css";
  for (const options of [{}, { maxExtglobRecursion: false }]) {
    const plus = picomatch.makeRe("+(" + branch + ")", options);
    const star = picomatch.makeRe("*(" + branch + ")index", options);
    assert.ok(plus.test("asset-main.css"));
    assert.ok(!plus.test("folder/asset-main.css"));
    assert.ok(star.test("asset-main.cssindex"));
    assert.ok(star.test("index"));
    assert.ok(!plus.source.includes(")+"));
    assert.ok(!star.source.includes(")*"));
  }
});
