// Native translation stays on the visitor's device. Successful results are kept
// only in this tab, bounded so long Articles cannot grow the cache indefinitely.
const resultCache = new Map();
const MAX_CACHE_ENTRIES = 24;
const MAX_CACHE_CHARACTERS = 200_000;
let cachedCharacters = 0;

export class TranslationError extends Error {
  constructor(code) {
    super(code);
    this.name = "TranslationError";
    this.code = code;
  }
}

export function translationLanguage(locale) {
  if (typeof locale !== "string" || !locale.trim()) return null;
  try {
    const parsed = new Intl.Locale(locale.trim().replaceAll("_", "-"));
    if (parsed.language === "zh") {
      return parsed.script === "Hant" || (!parsed.script && ["TW", "HK", "MO"].includes(parsed.region))
        ? "zh-Hant"
        : "zh";
    }
    return parsed.language === "nb" ? "no" : parsed.language;
  } catch {
    return null;
  }
}

export function systemTranslationLanguage(navigator = globalThis.navigator) {
  const locales = [...(navigator?.languages ?? []), navigator?.language];
  return locales.map(translationLanguage).find(Boolean) ?? "en";
}

export function translationLanguageName(targetLanguage, uiLanguage) {
  try {
    return new Intl.DisplayNames([uiLanguage], { type: "language" }).of(targetLanguage) || targetLanguage;
  } catch {
    return targetLanguage;
  }
}

// Keep anchors (including named links) verbatim. The model never receives URLs
// or gets a chance to rewrite destinations, markup, images or document positions.
export function translatableParts(parts, segments) {
  return parts.map((part) => {
    if (part.url || !/\p{L}/u.test(part.text)) return part;
    return { ...part, translationIndex: segments.push(part.text) - 1 };
  });
}

export function translatedPartText(part, translations) {
  return translations?.[part.translationIndex] ?? part.text;
}

function cacheKey(segments, targetLanguage) {
  return JSON.stringify([targetLanguage, segments]);
}

function rememberResult(key, result) {
  const size = key.length + result.segments.reduce((total, text) => total + text.length, 0);
  if (size > MAX_CACHE_CHARACTERS) return;
  if (resultCache.has(key)) {
    cachedCharacters -= resultCache.get(key).size;
    resultCache.delete(key);
  }
  while (resultCache.size >= MAX_CACHE_ENTRIES || cachedCharacters + size > MAX_CACHE_CHARACTERS) {
    const oldestKey = resultCache.keys().next().value;
    cachedCharacters -= resultCache.get(oldestKey).size;
    resultCache.delete(oldestKey);
  }
  resultCache.set(key, { result, size });
  cachedCharacters += size;
}

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException("Translation cancelled", "AbortError");
}

function modelOptions(signal, onProgress) {
  return {
    signal,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        if (signal?.aborted) return;
        const progress = Number.isFinite(event.loaded)
          ? Math.round(Math.max(0, Math.min(1, event.loaded)) * 100)
          : null;
        onProgress({ stage: "downloading", progress });
      });
    },
  };
}

export async function translateSegments(
  segments,
  { targetLanguage, sourceLanguage, signal, api = globalThis, onProgress = () => {}, onSourceLanguage = () => {} },
) {
  checkAbort(signal);
  const key = cacheKey(segments, targetLanguage);
  const cached = resultCache.get(key);
  if (cached) return cached.result;
  if (!api.Translator?.create) throw new TranslationError("unsupported");
  let detector;
  let translator;
  try {
    if (!sourceLanguage) {
      if (!api.LanguageDetector?.create) throw new TranslationError("unsupported");
      onProgress({ stage: "detecting" });
      const availability = await api.LanguageDetector.availability?.();
      if (availability === "unavailable") throw new TranslationError("unsupported");
      if (["downloadable", "downloading"].includes(availability)) {
        onProgress({ stage: "downloading", progress: null });
      }
      // Start model creation within the click handler's activation. Do not
      // download language models speculatively while the visitor reads.
      detector = await api.LanguageDetector.create(modelOptions(signal, onProgress));
      checkAbort(signal);
      onProgress({ stage: "detecting" });
      const results = await detector.detect(segments.join("\n\n"), { signal });
      checkAbort(signal);
      const best = results?.[0];
      sourceLanguage = translationLanguage(best?.detectedLanguage);
      if (!sourceLanguage || !Number.isFinite(best.confidence) || best.confidence < 0.4 || sourceLanguage === "und") {
        throw new TranslationError("detectionFailed");
      }
      onSourceLanguage(sourceLanguage);
    }
    if (sourceLanguage === targetLanguage) {
      const result = { segments: [...segments], sourceLanguage, targetLanguage, sameLanguage: true };
      rememberResult(key, result);
      return result;
    }
    checkAbort(signal);
    onProgress({ stage: "translating" });
    const availability = await api.Translator.availability?.({ sourceLanguage, targetLanguage });
    if (availability === "unavailable") throw new TranslationError("languageUnavailable");
    if (["downloadable", "downloading"].includes(availability)) {
      onProgress({ stage: "downloading", progress: null });
    }
    // A detector download can outlast transient user activation. Remember the
    // detected language and let the visitor continue with one fresh click.
    translator = await api.Translator.create({
      sourceLanguage,
      targetLanguage,
      ...modelOptions(signal, onProgress),
    });
    checkAbort(signal);
    onProgress({ stage: "translating" });
    const translated = [];
    for (const text of segments) {
      checkAbort(signal);
      const value = await translator.translate(text, { signal });
      checkAbort(signal);
      if (typeof value !== "string" || !value.trim()) throw new TranslationError("failed");
      // Preserve whitespace adjoining an unchanged inline link.
      translated.push(`${text.match(/^\s*/)[0]}${value.trim()}${text.match(/\s*$/)[0]}`);
    }
    const result = { segments: translated, sourceLanguage, targetLanguage, sameLanguage: false };
    rememberResult(key, result);
    return result;
  } catch (error) {
    checkAbort(signal);
    if (error instanceof TranslationError) throw error;
    if (error?.name === "NotAllowedError") {
      throw new TranslationError(sourceLanguage ? "activationRequired" : "unsupported");
    }
    if (error?.name === "NotSupportedError") throw new TranslationError("languageUnavailable");
    throw new TranslationError("failed");
  } finally {
    detector?.destroy?.();
    translator?.destroy?.();
  }
}
