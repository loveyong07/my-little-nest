// X Article plain_text can lose anchor destinations. These label/destination
// pairs were explicitly supplied by the author; never guess destinations by name.
const authorLinks = [
  { text: "TouchGal - 一站式Galgame文化社区!", url: "https://www.touchgal.ink/" },
  { text: "Muse.ai", url: "https://muse.ai/" },
];

export function safeArticleLink(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizedArticleLinks(entities) {
  return (Array.isArray(entities?.urls) ? entities.urls : []).flatMap((entity) => {
    const url = [entity?.unwound_url, entity?.expanded_url, entity?.url, entity?.text]
      .map(safeArticleLink)
      .find(Boolean);
    if (!url) return [];
    const text = typeof entity.text === "string" ? entity.text : entity.url;
    return typeof text === "string" && text ? [{ text, url }] : [];
  });
}

export function articleLinkParts(text, links = []) {
  const definitions = [...links, ...authorLinks].filter((link) => link?.text && safeArticleLink(link.url));
  const candidates = [];
  for (const link of definitions) {
    for (let start = text.indexOf(link.text); start >= 0; start = text.indexOf(link.text, start + link.text.length)) {
      candidates.push({ start, end: start + link.text.length, text: link.text, url: safeArticleLink(link.url) });
    }
  }
  const pattern =
    /\[([^\]\n]+)\]\((https?:\/\/(?:[^\s()<>]|\([^\s()<>]*\))+)\)|https?:\/\/(?:[^\s()<>，。！？；、」』】]|\([^\s()<>]*\))+/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[2] ?? match[0].replace(/[.,!;:]+$/, "");
    const url = safeArticleLink(raw);
    if (url)
      candidates.push({
        start: match.index,
        end: match.index + (match[2] ? match[0].length : raw.length),
        text: match[1] ?? raw,
        url,
      });
  }
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const parts = [];
  let cursor = 0;
  for (const candidate of candidates) {
    if (candidate.start < cursor) continue;
    if (candidate.start > cursor) parts.push({ text: text.slice(cursor, candidate.start) });
    parts.push({ text: candidate.text, url: candidate.url });
    cursor = candidate.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
