import { useEffect, useRef, useState } from "react";
import { GEO_LANGUAGE_STORAGE_KEY, VISITOR_LANGUAGE_ENDPOINT } from "../../shared/geo-language.mjs";
import zhLocale from "../constants/locales/zh.js";
import zhFantasy from "../constants/fantasy/zh.js";
import { DEFAULT_LANGUAGE, LANGUAGES, LANGUAGE_STORAGE_KEY, htmlLang } from "../constants/languages.js";

const VALID_LANGUAGES = new Set(LANGUAGES.map(({ code }) => code));
const localeCache = { zh: zhLocale };
const fantasyCache = { zh: zhFantasy };
const inflight = new Map();

const loaders = {
  ja: () => Promise.all([import("../constants/locales/ja.js"), import("../constants/fantasy/ja.js")]),
  en: () => Promise.all([import("../constants/locales/en.js"), import("../constants/fantasy/en.js")]),
};

export function detectBrowserLanguage(navigatorLike = typeof navigator === "undefined" ? null : navigator) {
  const candidates =
    Array.isArray(navigatorLike?.languages) && navigatorLike.languages.length
      ? navigatorLike.languages
      : navigatorLike?.language
        ? [navigatorLike.language]
        : [];
  for (const entry of candidates) {
    if (typeof entry !== "string") continue;
    const primary = entry.trim().toLowerCase().split(/[-_]/)[0];
    if (VALID_LANGUAGES.has(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}

export function hasManualLanguagePreference() {
  try {
    return VALID_LANGUAGES.has(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function readGeoLanguage() {
  try {
    const cached = window.sessionStorage.getItem(GEO_LANGUAGE_STORAGE_KEY);
    if (VALID_LANGUAGES.has(cached)) return cached;
  } catch {
    /* Storage is optional. */
  }
  return null;
}

export function readStoredLanguage() {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (VALID_LANGUAGES.has(saved)) return saved;
  } catch {
    /* Storage is optional. */
  }
  const geo = readGeoLanguage();
  if (geo) return geo;
  return detectBrowserLanguage(typeof window === "undefined" ? null : window.navigator);
}

export function isLanguageLoaded(code) {
  return Boolean(localeCache[code] && fantasyCache[code]);
}

export function preloadLanguage(code) {
  if (isLanguageLoaded(code)) return Promise.resolve();
  const load = loaders[code];
  if (!load) return Promise.resolve();
  if (!inflight.has(code)) {
    const pending = load()
      .then(([localeMod, fantasyMod]) => {
        localeCache[code] = localeMod.default;
        fantasyCache[code] = fantasyMod.default;
      })
      .finally(() => {
        inflight.delete(code);
      });
    inflight.set(code, pending);
  }
  return inflight.get(code);
}

export function useI18n() {
  const initial = readStoredLanguage();
  const [state, setState] = useState(() => ({
    language: isLanguageLoaded(initial) ? initial : DEFAULT_LANGUAGE,
    requested: initial,
  }));
  const requestIdRef = useRef(0);
  const manualRef = useRef(hasManualLanguagePreference());

  useEffect(() => {
    document.documentElement.lang = htmlLang(state.language);
  }, [state.language]);

  useEffect(() => {
    if (manualRef.current || readGeoLanguage() || typeof fetch !== "function") return undefined;
    let active = true;
    const controller = new AbortController();
    fetch(VISITOR_LANGUAGE_ENDPOINT, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data || data.status !== "ok" || !VALID_LANGUAGES.has(data.language)) return;
        try {
          window.sessionStorage.setItem(GEO_LANGUAGE_STORAGE_KEY, data.language);
        } catch {
          /* Storage is optional. */
        }
        if (manualRef.current) return;
        setState((current) =>
          isLanguageLoaded(data.language)
            ? { language: data.language, requested: data.language }
            : { ...current, requested: data.language },
        );
      })
      .catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (state.language === state.requested) return undefined;
    let active = true;
    const target = state.requested;
    preloadLanguage(target)
      .then(() => {
        if (active && isLanguageLoaded(target)) {
          setState((current) => (current.requested === target ? { language: target, requested: target } : current));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [state.language, state.requested]);

  function changeLanguage(nextLanguage) {
    if (!VALID_LANGUAGES.has(nextLanguage)) return;
    manualRef.current = true;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      /* Storage is optional. */
    }
    const id = ++requestIdRef.current;
    if (isLanguageLoaded(nextLanguage)) {
      setState({ language: nextLanguage, requested: nextLanguage });
      return;
    }
    setState((current) => ({ ...current, requested: nextLanguage }));
    preloadLanguage(nextLanguage)
      .then(() => {
        if (requestIdRef.current === id && isLanguageLoaded(nextLanguage)) {
          setState({ language: nextLanguage, requested: nextLanguage });
        }
      })
      .catch(() => {});
  }

  return {
    language: state.language,
    t: localeCache[state.language] ?? zhLocale,
    f: fantasyCache[state.language] ?? zhFantasy,
    changeLanguage,
  };
}
