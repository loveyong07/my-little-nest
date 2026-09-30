import test from "node:test";
import assert from "node:assert/strict";
import { retainedPostIndex } from "../src/utils/feed-reading.js";

const posts = (...ids) => ids.map((id) => ({ id }));

test("inserting newer posts retains the post being read, including the previous latest post", () => {
  assert.equal(retainedPostIndex(posts("3", "2", "1"), 1, posts("5", "4", "3", "2", "1")), 3);
  assert.equal(retainedPostIndex(posts("3", "2", "1"), 0, posts("4", "3", "2", "1")), 1);
});

test("deleting a different post preserves identity rather than its former numeric position", () => {
  assert.equal(retainedPostIndex(posts("3", "2", "1"), 2, posts("3", "1")), 1);
});

test("a removed or newly pinned reading post falls back to the latest daily post", () => {
  assert.equal(retainedPostIndex(posts("3", "2", "1"), 1, posts("3", "1")), 0);
  assert.equal(retainedPostIndex(posts("snapshot"), 0, posts("3", "2", "1")), 0);
  assert.equal(retainedPostIndex(posts("3"), 0, []), 0);
});
