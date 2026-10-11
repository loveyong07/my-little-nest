// The three site languages, in picker order, with the locale tags each one uses.
export const LANGUAGES = [
  { code: "zh", label: "中文", htmlLang: "zh-CN", intlLocale: "zh-CN" },
  { code: "ja", label: "日本語", htmlLang: "ja", intlLocale: "ja-JP" },
  { code: "en", label: "EN", htmlLang: "en", intlLocale: "en-US" },
];

export const DEFAULT_LANGUAGE = "zh";
export const LANGUAGE_STORAGE_KEY = "hello-nice-site-language";

const byCode = new Map(LANGUAGES.map((language) => [language.code, language]));

export function intlLocale(code) {
  return byCode.get(code)?.intlLocale ?? "en-US";
}

export function htmlLang(code) {
  return byCode.get(code)?.htmlLang ?? "en";
}
