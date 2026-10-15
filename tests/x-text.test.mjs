import assert from "node:assert/strict";
import { test } from "node:test";
import { displayXText } from "../src/utils/x-text.js";
import { postExcerpt } from "../src/utils/posts.js";

test("X text restores the reported emoticons, ampersands and line breaks", () => {
  assert.equal(displayXText("感谢帮助&gt;_&lt;\n可爱&gt;_&lt; &amp; 开心😊"), "感谢帮助>_<\n可爱>_< & 开心😊");
  const original = "原文>_< 🥰 ❤️ 👨‍👩‍👧‍👦 文字 & https://example.com/?a=1&b=2";
  assert.equal(displayXText(original), original);
});

test("decoding is one pass and preserves intentionally written entity syntax", () => {
  assert.equal(displayXText("&amp;lt; &amp;gt; &amp;amp; &unknown;"), "&lt; &gt; &amp; &unknown;");
});

test("date-index excerpts decode before counting and truncating characters", () => {
  assert.equal(postExcerpt({ text: "可爱&gt;_&lt;\n😊" }, {}), "可爱>_< 😊");
  assert.equal(postExcerpt({ text: "&gt;".repeat(39) }, {}), `${">".repeat(38)}…`);
});
