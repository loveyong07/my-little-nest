import { useEffect, useState } from "react";
import { copy } from "../constants/locales.js";
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, htmlLang } from "../constants/languages.js";

function readStoredLanguage() {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return Object.hasOwn(copy, saved) ? saved : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function useI18n() {
  const [language, setLanguage] = useState(readStoredLanguage);

  useEffect(() => {
    document.documentElement.lang = htmlLang(language);
  }, [language]);

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      /* Storage is optional. */
    }
  }

  return { language, t: copy[language], changeLanguage };
}
