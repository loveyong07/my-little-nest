import assert from "node:assert/strict";
import test from "node:test";
import { articleLinkParts, normalizedArticleLinks } from "../shared/article-links.mjs";

test("restores the author's named Article links without linking arbitrary product names", () => {
  const parts = articleLinkParts("TouchGal - 一站式Galgame文化社区! 和 Muse.ai；Grok 保持原文");
  assert.equal(
    articleLinkParts("Muse.ai", [{ text: "Muse.ai", url: "https://muse.ai/new" }])[0].url,
    "https://muse.ai/new",
  );
  assert.deepEqual(
    parts.filter((part) => part.url),
    [
      { text: "TouchGal - 一站式Galgame文化社区!", url: "https://www.touchgal.ink/" },
      { text: "Muse.ai", url: "https://muse.ai/" },
    ],
  );
});

test("renders Markdown, raw URLs, punctuation and balanced URL parentheses without losing surrounding text", () => {
  const text = "看[示例](https://example.com/a_(b))，再看 https://example.com/?a=1&b=2。谢谢";
  const parts = articleLinkParts(text);
  assert.deepEqual(
    parts.filter((part) => part.url),
    [
      { text: "示例", url: "https://example.com/a_(b)" },
      { text: "https://example.com/?a=1&b=2", url: "https://example.com/?a=1&b=2" },
    ],
  );
  assert.equal(parts.map((part) => part.text).join(""), "看示例，再看 https://example.com/?a=1&b=2。谢谢");
});

test("preserves API Article anchors and rejects unsafe schemes or credential-bearing destinations", () => {
  const links = normalizedArticleLinks({
    urls: [
      { text: "官方页面", expanded_url: "https://example.com/official" },
      { text: "https://www.touchgal.ink/" },
      { text: "坏链接", url: "javascript:alert(1)" },
      { text: "密码", url: "https://user:password@example.com/" },
    ],
  });
  assert.equal(links.length, 2);
  assert.equal(articleLinkParts("官方页面", links)[0].url, "https://example.com/official");
  const unsafe = "[坏链接](javascript:alert(1)) <script>alert(1)</script>";
  assert.deepEqual(articleLinkParts(unsafe), [{ text: unsafe }]);
});
