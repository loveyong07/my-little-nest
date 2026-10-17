import { useEffect, useMemo, useRef } from "react";
import { FaArrowRight, FaXTwitter } from "react-icons/fa6";
import { FiCalendar, FiChevronLeft, FiChevronRight, FiFeather } from "react-icons/fi";
import { formatPostDate } from "../utils/date.js";
import { postMonthKey, postMonths } from "../utils/posts.js";
import { displayXText } from "../utils/x-text.js";
import { preferredScrollBehavior } from "../utils/motion.js";
import { ArticlePhoto } from "./ArticlePhoto.jsx";
import { articleLinkParts } from "../../shared/article-links.mjs";

export function XArticlesSection({
  articles,
  articleIndex,
  setArticleIndex,
  articleState,
  feedLoading,
  retryDisabled,
  retryFeed,
  language,
  t,
  profile,
}) {
  const readingRef = useRef(null);
  const timelineRef = useRef(null);
  const currentIndex = Math.min(articleIndex, Math.max(0, articles.length - 1));
  const article = articles[currentIndex];
  const months = useMemo(() => postMonths(articles, language), [articles, language]);
  const text = article?.text ?? "";
  const sourcePhotos = (article?.media ?? []).filter((media) => (media.type ?? "photo") === "photo");
  const blocks = article?.blocks;
  const photos = blocks?.length
    ? [
        sourcePhotos[0],
        ...blocks
          .filter((block) => block.type === "photo")
          .map((block) => sourcePhotos.find((photo) => photo.url === block.url)),
      ].filter(Boolean)
    : sourcePhotos;
  const recovering = ["stale", "unavailable"].includes(articleState);
  const message =
    articleState === "loading"
      ? t.articlesLoading
      : articleState === "none"
        ? t.articlesEmpty
        : articleState === "stale"
          ? t.articlesStale
          : articleState === "unavailable"
            ? t.articlesUnavailable
            : null;

  useEffect(() => {
    const strip = timelineRef.current;
    const selected = strip?.querySelector('[aria-current="true"]');
    if (!strip || !selected) return;
    const left = selected.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    if (left < strip.scrollLeft || left + selected.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: Math.max(0, left - (strip.clientWidth - selected.offsetWidth) / 2), behavior: "instant" });
    }
  }, [currentIndex, articles, language]);

  function changeArticle(index) {
    setArticleIndex(index);
  }

  function turnArticle(index) {
    changeArticle(index);
    readingRef.current?.scrollIntoView({ block: "start", behavior: preferredScrollBehavior() });
  }

  return (
    <section className="posts-group articles-group" id="x-articles" aria-labelledby="x-articles-heading">
      <div className="posts-daily-heading">
        <div className="section-heading">
          <FiFeather aria-hidden="true" />
          <h2 id="x-articles-heading">{t.articlesHeading}</h2>
        </div>
        {months.length > 1 && (
          <label className="post-month-picker">
            <FiCalendar aria-hidden="true" />
            <span>{t.chooseArticleMonth}</span>
            <select
              value={postMonthKey(article)}
              onChange={(event) => {
                const month = months.find((item) => item.key === event.target.value);
                if (month) changeArticle(month.index);
              }}
            >
              {months.map((month) => (
                <option key={month.key} value={month.key}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {articles.length > 0 && (
        <nav className="article-timeline" ref={timelineRef} aria-label={t.articlesTimeline}>
          <ol>
            {articles.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`post-index-button article-timeline-button${index === currentIndex ? " is-active" : ""}`}
                  aria-current={index === currentIndex ? "true" : undefined}
                  onClick={() => changeArticle(index)}
                >
                  <time dateTime={item.created_at}>{formatPostDate(item.created_at, language)}</time>
                  <span className="article-timeline-title">{item.title || t.articleUntitled}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {message && (
        <div className={`article-status${article ? " article-status-compact" : ""}`} role="status">
          {!article && <FiFeather className="article-empty-mark" aria-hidden="true" />}
          <span>{message}</span>
          {recovering && (
            <div className="feed-status-actions">
              <button type="button" onClick={retryFeed} disabled={retryDisabled || feedLoading}>
                {t.retry}
              </button>
              <a href={`https://x.com/${profile.username}/articles`} target="_blank" rel="noopener noreferrer">
                {t.visitX}
                <FaArrowRight aria-hidden="true" />
              </a>
            </div>
          )}
          <div className="glass-panel-backdrop glass-reading-backdrop article-frost-backdrop" aria-hidden="true" />
        </div>
      )}
      {article && (
        <div className="article-reading" ref={readingRef}>
          <article className="post-card x-article-card" aria-labelledby="x-article-title" key={article.id}>
            <div className="article-byline">
              <span>{article.author || profile.name}</span>
              <span>@{profile.username}</span>
              <FaXTwitter aria-hidden="true" />
            </div>
            <h3 id="x-article-title">{article.title || t.articleUntitled}</h3>
            {article.created_at && (
              <time className="article-date" dateTime={article.created_at}>
                <FiCalendar aria-hidden="true" />
                {formatPostDate(article.created_at, language)}
              </time>
            )}
            {photos[0] && <ArticlePhoto key={photos[0].url} photos={photos} number={1} t={t} />}
            {(blocks?.length || text.trim()) && (
              <div className="article-text">
                {(blocks?.length
                  ? blocks
                  : text.split(/(?:\r?\n){2,}/).map((paragraph) => ({ type: "text", text: paragraph }))
                ).map((block, index) => {
                  if (block.type === "divider") return <hr key={index} />;
                  if (block.type === "photo") {
                    const photoIndex = photos.findIndex((photo) => photo.url === block.url);
                    return photoIndex >= 0 ? (
                      <ArticlePhoto key={index} photos={photos} number={photoIndex + 1} t={t} />
                    ) : null;
                  }
                  return (
                    <p key={index}>
                      {articleLinkParts(blocks?.length ? block.text : displayXText(block.text), [
                        ...(article.links ?? []),
                        ...(block.links ?? []),
                      ]).map((part, partIndex) =>
                        part.url ? (
                          <a key={partIndex} href={part.url} target="_blank" rel="noopener noreferrer">
                            {part.text}
                          </a>
                        ) : (
                          part.text
                        ),
                      )}
                    </p>
                  );
                })}
              </div>
            )}
            {!blocks?.length && photos.length > 1 && (
              <p className="article-layout-unavailable" role="status">
                {t.articleLayoutUnavailable}
              </p>
            )}
            <div className="post-bottomline">
              <a href={article.permalink} target="_blank" rel="noopener noreferrer">
                {t.openArticle}
                <FaArrowRight aria-hidden="true" />
              </a>
            </div>
            <div className="glass-panel-backdrop glass-reading-backdrop article-frost-backdrop" aria-hidden="true" />
          </article>
          {articles.length > 1 && (
            <div className="post-controls article-controls" role="group" aria-label={t.articleNavigation}>
              <button
                type="button"
                onClick={() => turnArticle((currentIndex - 1 + articles.length) % articles.length)}
                aria-label={t.prevArticle}
              >
                <FiChevronLeft aria-hidden="true" />
              </button>
              <span className="post-position" aria-live="polite">
                {t.postNumber(currentIndex + 1, articles.length)}
              </span>
              <button
                type="button"
                onClick={() => turnArticle((currentIndex + 1) % articles.length)}
                aria-label={t.nextArticle}
              >
                <FiChevronRight aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
