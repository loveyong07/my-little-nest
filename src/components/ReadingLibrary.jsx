import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FiArrowUpRight, FiBookOpen, FiFeather, FiRepeat, FiSearch, FiX } from "react-icons/fi";
import { PiPushPinFill } from "react-icons/pi";
import { formatPostDate } from "../utils/date.js";
import { postExcerpt } from "../utils/posts.js";

// The library selects existing readers; it never creates a second feed or changes
// the independent daily-post and Article reading positions.
export function ReadingLibrary({ t, language, posts, articles, reposts = [], pinnedPost, onChoose }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const entries = useMemo(
    () => [
      ...(pinnedPost ? [{ type: "pinned", item: pinnedPost, index: 0 }] : []),
      ...posts.map((item, index) => ({ type: "posts", item, index })),
      ...reposts.map((item, index) => ({ type: "reposts", item, index })),
      ...articles.map((item, index) => ({ type: "articles", item, index })),
    ],
    [posts, articles, reposts, pinnedPost],
  );
  const filterCounts = useMemo(
    () => ({
      all: entries.length,
      posts: (pinnedPost ? 1 : 0) + posts.length,
      articles: articles.length,
      reposts: reposts.length,
    }),
    [entries.length, pinnedPost, posts.length, articles.length, reposts.length],
  );
  const needle = query.trim().normalize("NFKC").toLocaleLowerCase();
  const results = entries.filter(({ type, item }) => {
    if (filter !== "all" && (filter === "posts" ? !["pinned", "posts"].includes(type) : type !== filter)) return false;
    return `${item.title || ""} ${item.text || ""} ${item.created_at || ""}`
      .normalize("NFKC")
      .toLocaleLowerCase()
      .includes(needle);
  });

  useEffect(() => {
    function handleShortcut(event) {
      if (open || event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches("input, textarea, select, [contenteditable]") || target.closest("dialog, .media-lightbox"))
      ) {
        return;
      }
      if (document.querySelector(".media-lightbox, dialog[open]")) return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [open]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (open) {
      dialog.showModal();
      searchRef.current?.focus();
    } else if (dialog.open) dialog.close();
  }, [open]);

  function choose(entry) {
    // Close synchronously so native focus restoration happens before the reader
    // focuses its heading. This also keeps Escape and result activation distinct.
    dialogRef.current.close();
    setOpen(false);
    onChoose(entry.type, entry.index);
  }

  function keepFocusInDrawer(event) {
    if (event.key !== "Tab") return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll("button:not(:disabled), input:not(:disabled)"),
    ).filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <>
      <button className="reading-library-trigger" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <FiSearch aria-hidden="true" />
        <span>{t.libraryOpen}</span>
        <kbd className="library-shortcut-kbd" aria-hidden="true">
          /
        </kbd>
        <FiArrowUpRight aria-hidden="true" />
      </button>
      <dialog
        className="reading-library"
        ref={dialogRef}
        aria-labelledby="reading-library-heading"
        onClose={() => setOpen(false)}
        onKeyDown={keepFocusInDrawer}
      >
        <div className="library-heading">
          <div>
            <span className="desk-eyebrow">THE STORY DRAWER</span>
            <h2 id="reading-library-heading">{t.libraryHeading}</h2>
          </div>
          <button type="button" className="library-close" aria-label={t.libraryClose} onClick={() => setOpen(false)}>
            <FiX aria-hidden="true" />
          </button>
        </div>
        <p className="library-intro">{t.libraryIntro}</p>
        <label className="library-search">
          <FiSearch aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.librarySearch}
            aria-label={t.librarySearch}
            aria-controls="library-results"
          />
        </label>
        <div className="library-filters" role="group" aria-label={t.libraryFilter}>
          {["all", "posts", "reposts", "articles"].map((id, index) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              <span>{t.libraryFilters[index]}</span>
              <small aria-hidden="true">{filterCounts[id]}</small>
            </button>
          ))}
          <span role="status" aria-live="polite">
            {t.libraryResults(results.length)}
          </span>
        </div>
        <div className="library-results" id="library-results">
          {results.length === 0 ? (
            <div className="library-empty">
              <FiBookOpen aria-hidden="true" />
              <p>{entries.length === 0 ? t.libraryUnavailable : t.libraryEmpty}</p>
              {(query || filter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  {t.libraryReset}
                </button>
              )}
            </div>
          ) : (
            <ul>
              {results.map((entry) => {
                const { type, item } = entry;
                const Icon =
                  type === "articles"
                    ? FiFeather
                    : type === "reposts"
                      ? FiRepeat
                      : type === "pinned"
                        ? PiPushPinFill
                        : FiBookOpen;
                return (
                  <li key={`${type}-${item.id}`}>
                    <button type="button" className="library-result" onClick={() => choose(entry)}>
                      <span className={`library-result-icon library-result-${type}`}>
                        <Icon aria-hidden="true" />
                      </span>
                      <span className="library-result-copy">
                        <small>
                          {type === "pinned"
                            ? t.quickNavPinned
                            : type === "articles"
                              ? t.quickNavArticles
                              : type === "reposts"
                                ? t.repostsHeading
                                : t.quickNavDaily}
                        </small>
                        <strong>{item.title || postExcerpt(item, t)}</strong>
                        <time dateTime={item.created_at}>{formatPostDate(item.created_at, language)}</time>
                      </span>
                      <FiArrowUpRight aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}
