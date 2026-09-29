import { useEffect, useState } from "react";
import { copy } from "../constants/locales.js";
import { LANGUAGE_STORAGE_KEY } from "../constants/site.js";

function readStoredLanguage() {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return Object.hasOwn(copy, saved) ? saved : "zh";
  } catch { return "zh"; }
}

export function useI18n() {
  const [language, setLanguage] = useState(readStoredLanguage);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : language === "ja" ? "ja" : "en";
  }, [language]);

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage); } catch { /* Storage is optional. */ }
  }

  return { language, t: copy[language], changeLanguage };
}
