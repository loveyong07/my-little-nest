export const READING_PREFERENCES_KEY = "nest-reading-preferences";

export function retainedPostIndex(previousPosts, previousIndex, nextPosts) {
  return Math.max(0, restoreReadingIndex(nextPosts, previousPosts[previousIndex]?.id));
}

export function restoreReadingIndex(items, id, key = "id") {
  return id ? items.findIndex((item) => item[key] === id) : -1;
}

export function readReadingPreferences() {
  try {
    const raw = window.localStorage.getItem(READING_PREFERENCES_KEY);
    if (!raw) return { largeText: false, viewMode: "card" };
    const parsed = JSON.parse(raw);
    return {
      largeText: Boolean(parsed?.largeText),
      viewMode: parsed?.viewMode === "stream" ? "stream" : "card",
    };
  } catch {
    return { largeText: false, viewMode: "card" };
  }
}

export function saveReadingPreferences({ largeText, viewMode }) {
  try {
    window.localStorage.setItem(
      READING_PREFERENCES_KEY,
      JSON.stringify({
        largeText: Boolean(largeText),
        viewMode: viewMode === "stream" ? "stream" : "card",
      }),
    );
  } catch {
    /* Storage is optional. */
  }
}
