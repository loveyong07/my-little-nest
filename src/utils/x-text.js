// X escapes &, < and > in post text. Decode once at the display boundary so
// live responses and existing cached posts follow the same rule. Keep the API
// and cache raw: decoding twice would corrupt literal text such as &amp;lt;.
export function displayXText(text) {
  const entities = { amp: "&", lt: "<", gt: ">" };
  return text.replace(/&(amp|lt|gt);/g, (_, name) => entities[name]);
}
