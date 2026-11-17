import { formatLocalDate, formatPostDate } from "./date.js";

export function readingEntryDate(type, item) {
  return (type === "reposts" && item.repostedAt) || item.created_at;
}

export function normalizeReadingQuery(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(
      /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})日?/g,
      (_match, year, month, day) => `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    );
}

export function readingEntryMatches({ item }, query, language) {
  const needle = normalizeReadingQuery(query);
  if (!needle) return true;
  // Match both timestamps for reposts, including the visitor's displayed local
  // date. Raw ISO dates remain searchable for readers who use that format.
  const dates = [item.created_at, item.repostedAt].filter(Boolean).flatMap((value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? [] : [value, formatLocalDate(date), formatPostDate(value, language)];
  });
  return normalizeReadingQuery([item.title, item.text, ...dates].filter(Boolean).join(" ")).includes(needle);
}
