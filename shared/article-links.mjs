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

function bareLinkText(value) {
  // Plain text has no authoritative end offset. Split a CJK suffix on an
  // ASCII-looking URL, while allowing an international domain or a Unicode
  // segment that begins immediately after a URL delimiter.
  const boundary = value.search(
    /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]/u,
  );
  if (boundary > 0) {
    const stem = value.slice(0, boundary);
    const [, host, path] = /^(?:https?:\/\/|www\.)([^/?#]+)([/?#].*)?$/i.exec(stem) ?? [];
    const remainingHost = value.slice(boundary).split(/[/?#]/, 1)[0];
    if (
      /^[a-z\d.-]+(?::\d+)?$/i.test(host ?? "") &&
      /^[!-~]+$/.test(stem) &&
      !/[/?#=&]$/.test(stem) &&
      (path || !remainingHost.includes("."))
    ) {
      value = stem;
    }
  }
  return value.replace(/[.,!?;:"']+$/, "");
}

export function textLinkParts(text, links = [], { authorFallback = false } = {}) {
  const explicit = links.filter((link) => link?.text && safeArticleLink(link.url));
  const definitions = authorFallback
    ? [...explicit, ...authorLinks.filter((link) => !explicit.some((item) => item.text === link.text))]
    : explicit;
  const candidates = [];
  const positionedLabels = new Set();
  const overlaps = (start, end, except = -1) =>
    candidates.some((item, index) => index !== except && start < item.end && end > item.start);
  // Document ranges refer to this block's UTF-16 string offsets. Keep each linked
  // occurrence distinct, even when its label also appears elsewhere as plain text.
  for (const link of explicit) {
    if (link.offset === undefined && link.length === undefined) continue;
    positionedLabels.add(link.text);
    const start = link.offset;
    const end = start + link.length;
    if (
      Number.isSafeInteger(start) &&
      Number.isSafeInteger(link.length) &&
      start >= 0 &&
      link.length > 0 &&
      end <= text.length &&
      text.slice(start, end) === link.text &&
      !overlaps(start, end)
    ) {
      candidates.push({ start, end, text: link.text, url: safeArticleLink(link.url) });
    }
  }
  const pattern =
    /\[([^\]\n]+)\]\((https?:\/\/(?:[^\s()<>]|\([^\s()<>]*\))+)\)|(?:https?:\/\/|www\.)(?:[^\s()<>"，。！？；、：）］｝》〉」』】（［｛《〈「『【“”‘’…]|\([^\s()<>"\u3000]*\))+/giu;
  for (const match of text.matchAll(pattern)) {
    const raw = match[2] ?? bareLinkText(match[0]);
    const url = safeArticleLink(/^www\./i.test(raw) ? `https://${raw}` : raw);
    const end = match.index + (match[2] ? match[0].length : raw.length);
    // An expanded X entity inside Markdown supplies the authoritative href.
    const destination = match[2]
      ? candidates.findIndex((item) => item.start === end - raw.length - 1 && item.end === end - 1)
      : -1;
    if (url && !overlaps(match.index, end, destination)) {
      const candidate = { start: match.index, end, text: match[1] ?? raw, url: candidates[destination]?.url ?? url };
      if (destination < 0) candidates.push(candidate);
      else candidates[destination] = candidate;
    }
  }
  // Older caches and plain-text API responses may have no positions. Restore only
  // unambiguous labels; conflicting destinations cannot safely be assigned by name.
  const destinations = new Map();
  for (const link of definitions) {
    if (positionedLabels.has(link.text)) continue;
    const urls = destinations.get(link.text) ?? new Set();
    urls.add(safeArticleLink(link.url));
    destinations.set(link.text, urls);
  }
  const fallback = [];
  for (const [label, urls] of destinations) {
    if (urls.size !== 1) continue;
    for (let start = text.indexOf(label); start >= 0; start = text.indexOf(label, start + label.length)) {
      const end = start + label.length;
      if (!overlaps(start, end)) fallback.push({ start, end, text: label, url: [...urls][0] });
    }
  }
  candidates.push(...fallback);
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

export function articleLinkParts(text, links = []) {
  return textLinkParts(text, links, { authorFallback: true });
}
