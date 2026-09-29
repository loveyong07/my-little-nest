export function formatLocalDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function formatVisitDate(value, language) {
  const locale = language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP-u-ca-gregory" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    calendar: "gregory", year: "numeric", month: "long", day: "numeric",
  }).format(value);
}

export function formatPostDate(value, language) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US";
  const dateText = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  if (!String(value).includes("T")) return dateText;
  const timeText = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${dateText} ${timeText}`;
}
