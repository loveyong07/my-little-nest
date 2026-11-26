export const VISITOR_LANGUAGE_ENDPOINT = "/api/visitor-language";
export const GEO_LANGUAGE_STORAGE_KEY = "hello-nice-site-geo-language";

const CHINESE_REGIONS = new Set(["CN", "HK", "MO", "TW"]);

/**
 * Maps an ISO 3166-1 alpha-2 country code from edge geolocation headers
 * to a supported site language (`zh`, `ja`, or `en`).
 */
export function languageFromCountry(countryCode) {
  if (typeof countryCode !== "string") return null;
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return null;
  if (CHINESE_REGIONS.has(code)) return "zh";
  if (code === "JP") return "ja";
  return "en";
}
