import { useEffect, useState } from "react";
import { copy } from "../constants/locales.js";
import { LANGUAGE_STORAGE_KEY } from "../constants/site.js";

export const LANGUAGE_EVENT = "site-language-change";

function readStoredLanguage() {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return Object.hasOwn(copy, saved) ? saved : "zh";
  } catch {
    return "zh";
  }
}

function syncDomLanguage(lang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : lang === "ja" ? "ja" : "en";
  document.documentElement.classList.remove("language-zh", "language-ja", "language-en");
  document.documentElement.classList.add(`language-${lang}`);

  const siteMain = document.querySelector(".site");
  if (siteMain) {
    siteMain.classList.remove("language-zh", "language-ja", "language-en");
    siteMain.classList.add(`language-${lang}`);
  }
}

export function useI18n() {
  const [language, setLanguage] = useState(readStoredLanguage);

  useEffect(() => {
    syncDomLanguage(language);

    function handleExternalChange(event) {
      const next = event.detail;
      if (next && Object.hasOwn(copy, next) && next !== language) {
        setLanguage(next);
      }
    }

    window.addEventListener(LANGUAGE_EVENT, handleExternalChange);
    return () => window.removeEventListener(LANGUAGE_EVENT, handleExternalChange);
  }, [language]);

  function changeLanguage(nextLanguage) {
    if (!Object.hasOwn(copy, nextLanguage)) return;
    setLanguage(nextLanguage);
    syncDomLanguage(nextLanguage);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {}
    window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: nextLanguage }));
  }

  return { language, t: copy[language], changeLanguage };
}
