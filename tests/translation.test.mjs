import assert from "node:assert/strict";
import test from "node:test";
import {
  systemTranslationLanguage,
  translationLanguage,
  translationLanguageName,
  translatableParts,
  translatedPartText,
  translateSegments,
} from "../src/utils/translation.js";
import { textLinkParts } from "../shared/article-links.mjs";

function nativeApi({
  sourceLanguage = "ja",
  confidence = 0.99,
  translate = (text) => `译文：${text}`,
  createError,
} = {}) {
  const calls = { detect: [], translate: [], create: [], destroyed: [] };
  const api = {
    LanguageDetector: {
      async create(options) {
        calls.create.push(["detector", options]);
        return {
          async detect(text) {
            calls.detect.push(text);
            return [{ detectedLanguage: sourceLanguage, confidence }];
          },
          destroy() {
            calls.destroyed.push("detector");
          },
        };
      },
    },
    Translator: {
      async create(options) {
        calls.create.push(["translator", options]);
        if (createError) throw createError;
        return {
          async translate(text, options) {
            calls.translate.push([text, options]);
            return translate(text, options);
          },
          destroy() {
            calls.destroyed.push("translator");
          },
        };
      },
    },
  };
  return { api, calls };
}

test("translation follows the first system language, preserving Chinese script rather than the UI setting", () => {
  for (const [locale, expected] of [
    ["zh-CN", "zh"],
    ["zh-SG", "zh"],
    ["zh-TW", "zh-Hant"],
    ["zh_HK", "zh-Hant"],
    ["zh-Hans-TW", "zh"],
    ["zh-Hant-CN", "zh-Hant"],
    ["en-GB", "en"],
    ["ja-JP", "ja"],
    ["pt-BR", "pt"],
    ["nb-NO", "no"],
  ]) {
    assert.equal(translationLanguage(locale), expected, locale);
  }
  assert.equal(systemTranslationLanguage({ languages: ["fr-CA", "zh-CN"], language: "en-US" }), "fr");
  assert.equal(systemTranslationLanguage({ language: "ja-JP" }), "ja");
  assert.equal(systemTranslationLanguage({ languages: ["invalid-tag-!", "zh-TW"] }), "zh-Hant");
  assert.equal(systemTranslationLanguage({}), "en");
  assert.equal(translationLanguage(null), null);
  assert.ok(translationLanguageName("zh-Hant", "en").includes("Chinese"));
});

test("translation segments preserve inline links, punctuation, and their original destinations", () => {
  const segments = [];
  const parts = translatableParts(
    textLinkParts("こんにちは [リンク](https://example.com/?x=1&y=2) ありがとう 🌸"),
    segments,
  );
  assert.deepEqual(segments, ["こんにちは ", " ありがとう 🌸"]);
  assert.deepEqual(
    parts.filter((part) => part.url),
    [{ text: "リンク", url: "https://example.com/?x=1&y=2" }],
  );
  assert.equal(translatedPartText(parts[0], ["你好 ", " 谢谢 🌸"]), "你好 ");
  assert.equal(translatedPartText(parts[0], undefined), "こんにちは ");
  assert.deepEqual(translatableParts([{ text: "🌸 123!" }], []), [{ text: "🌸 123!" }]);
});

test("native translation is sequential, preserves link-adjacent whitespace, releases resources, and reuses results", async () => {
  const { api, calls } = nativeApi();
  const stages = [];
  const segments = ["一番目の段落 ", " 二番目の段落"];
  const result = await translateSegments(segments, {
    targetLanguage: "zh",
    api,
    onProgress: (event) => stages.push(event.stage),
  });
  assert.equal(result.sourceLanguage, "ja");
  assert.equal(result.sameLanguage, false);
  assert.deepEqual(result.segments, ["译文：一番目の段落 ", " 译文： 二番目の段落"]);
  assert.deepEqual(
    calls.translate.map(([text]) => text),
    segments,
  );
  assert.deepEqual(calls.destroyed, ["detector", "translator"]);
  assert.ok(stages.includes("detecting") && stages.includes("translating"));
  assert.equal(calls.create[1][1].targetLanguage, "zh");
  assert.deepEqual(await translateSegments(segments, { targetLanguage: "zh", api: {} }), result);
  assert.equal(calls.translate.length, 2);
});

test("translation leaves multilingual hashtags intact and excludes them from both native models", async () => {
  const tags = ["#ゆずソフト", "#中文话题", "#Hello_World", "#cafe\u0301", "#العربية", "#한글", "#123", "＃全角标签"];
  const original = `今日は楽しい一日です。 ${tags.join(" ")}！\nまた明日お会いしましょう。`;
  const segments = [];
  const parts = translatableParts(textLinkParts(original), segments);
  assert.equal(
    parts.map((part) => part.text).join(""),
    original,
    "preparing a translation must not alter the original",
  );
  const { api, calls } = nativeApi({ translate: () => "Translated prose." });
  const result = await translateSegments(segments, { targetLanguage: "en", api });
  const output = parts.map((part) => translatedPartText(part, result.segments)).join("");
  assert.ok(output.includes("Translated prose."));
  assert.ok(output.includes(tags.join(" ")), "hashtag spelling, scripts, spacing and order stay unchanged");
  for (const input of [...calls.detect, ...calls.translate.map(([text]) => text)]) {
    assert.ok(!/[#＃]/u.test(input), "neither language detection nor translation receives a hashtag");
  }
});

test("adjacent hashtags, tag-only text, empty titles and URL fragments retain their original content", () => {
  const segments = [];
  const original = "#东京#旅行 ＃日本語 #cafe\u0301";
  const parts = translatableParts(textLinkParts(original), segments);
  assert.deepEqual(segments, [], "a post consisting only of hashtags needs no translation");
  assert.equal(parts.map((part) => translatedPartText(part, [])).join(""), original);
  assert.deepEqual(translatableParts([{ text: "" }], []), [{ text: "" }]);
  const link = { text: "https://example.test/page#section", url: "https://example.test/page#section" };
  assert.deepEqual(translatableParts([link], []), [link]);
});

test("same-language content is identified without creating a translator", async () => {
  const { api, calls } = nativeApi({ sourceLanguage: "en" });
  const result = await translateSegments(["This original is already English."], { targetLanguage: "en", api });
  assert.equal(result.sameLanguage, true);
  assert.deepEqual(result.segments, ["This original is already English."]);
  assert.deepEqual(
    calls.create.map(([kind]) => kind),
    ["detector"],
  );
});

test("failed or unavailable native models never return fake translations", async () => {
  await assert.rejects(translateSegments(["未対応のブラウザー"], { targetLanguage: "zh", api: {} }), {
    code: "unsupported",
  });
  const weak = nativeApi({ confidence: 0.1 });
  await assert.rejects(translateSegments(["短い"], { targetLanguage: "en", api: weak.api }), {
    code: "detectionFailed",
  });
  assert.deepEqual(weak.calls.destroyed, ["detector"]);
  const unsupported = nativeApi({ createError: new DOMException("unavailable pair", "NotSupportedError") });
  await assert.rejects(translateSegments(["対応していない言語"], { targetLanguage: "ar", api: unsupported.api }), {
    code: "languageUnavailable",
  });
  const failed = nativeApi({ translate: () => "" });
  await assert.rejects(translateSegments(["失敗した翻訳"], { targetLanguage: "zh", api: failed.api }), {
    code: "failed",
  });
  assert.deepEqual(failed.calls.destroyed, ["detector", "translator"]);
});

test("download progress is bounded and a fresh click can resume after activation expires", async () => {
  let sourceLanguage;
  const { api } = nativeApi({ createError: new DOMException("click again", "NotAllowedError") });
  const progress = [];
  const originalCreate = api.LanguageDetector.create;
  api.LanguageDetector.create = (options) => {
    options.monitor({ addEventListener: (_name, listener) => listener({ loaded: 0.42 }) });
    return originalCreate(options);
  };
  const segments = ["言語パックの準備を待っています"];
  await assert.rejects(
    translateSegments(segments, {
      targetLanguage: "zh",
      api,
      onProgress: (event) => progress.push(event),
      onSourceLanguage: (language) => (sourceLanguage = language),
    }),
    { code: "activationRequired" },
  );
  assert.equal(sourceLanguage, "ja");
  assert.ok(progress.some((event) => event.stage === "downloading" && event.progress === 42));
  const resumed = nativeApi();
  const result = await translateSegments(segments, { targetLanguage: "zh", sourceLanguage, api: resumed.api });
  assert.equal(result.sameLanguage, false);
  assert.deepEqual(
    resumed.calls.create.map(([kind]) => kind),
    ["translator"],
  );
});

test("cancelling between paragraphs discards partial output and permits a clean retry", async () => {
  const controller = new AbortController();
  const cancelled = nativeApi({
    translate: (text) => {
      controller.abort();
      return text;
    },
  });
  const segments = ["キャンセルする段落", "次の段落"];
  await assert.rejects(
    translateSegments(segments, { targetLanguage: "en", api: cancelled.api, signal: controller.signal }),
    {
      name: "AbortError",
    },
  );
  assert.equal(cancelled.calls.translate.length, 1);
  assert.deepEqual(cancelled.calls.destroyed, ["detector", "translator"]);
  const retried = nativeApi();
  await translateSegments(segments, { targetLanguage: "en", api: retried.api });
  assert.equal(retried.calls.translate.length, 2);
  await assert.rejects(
    translateSegments(segments, { targetLanguage: "en", api: retried.api, signal: controller.signal }),
    {
      name: "AbortError",
    },
  );
});
