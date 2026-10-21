import { useEffect, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";
import { PiFlowerLight } from "react-icons/pi";
import { GiStrawberry } from "react-icons/gi";
import { fantasyCopy, interests } from "../constants/fantasy.js";
import { useDesktopLayout } from "../hooks/useDesktopLayout.js";

export function HomeJournal({ language, t }) {
  const f = fantasyCopy[language];
  const [notice] = useState(() => Math.floor(Math.random() * f.notices.length));
  const [quote, setQuote] = useState(() => Math.floor(Math.random() * f.quotes.length));
  const [spinning, setSpinning] = useState(false);
  const [activeNote, setActiveNote] = useState("about");
  const desktop = useDesktopLayout();

  function moveTab(event) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home" ? "about" : event.key === "End" ? "quote" : activeNote === "about" ? "quote" : "about";
    setActiveNote(next);
    event.currentTarget.parentElement.querySelector(`#journal-tab-${next}`)?.focus();
  }

  useEffect(() => {
    if (!spinning) return undefined;
    const timer = window.setTimeout(() => setSpinning(false), 320);
    return () => window.clearTimeout(timer);
  }, [spinning]);

  function shuffleQuote() {
    if (f.quotes.length < 2) return;
    const next = Math.floor(Math.random() * (f.quotes.length - 1));
    setQuote(next >= quote ? next + 1 : next);
    setSpinning(true);
  }

  return (
    <section className="home-journal" aria-label={f.journal}>
      {desktop && (
        <div className="journal-tabs-row">
          <span className="journal-label">
            <PiFlowerLight aria-hidden="true" />
            {f.journal}
          </span>
          <div className="journal-tabs" role="tablist" aria-label={f.journal}>
            {["about", "quote"].map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`journal-tab-${id}`}
                aria-controls={`journal-panel-${id}`}
                aria-selected={activeNote === id}
                tabIndex={activeNote === id ? 0 : -1}
                onClick={() => setActiveNote(id)}
                onKeyDown={moveTab}
              >
                {id === "about" ? t.homeJournalAbout : t.homeJournalQuote}
              </button>
            ))}
          </div>
        </div>
      )}
      <article
        className="journal-note journal-notice"
        id="journal-panel-about"
        role={desktop ? "tabpanel" : undefined}
        aria-labelledby={desktop ? "journal-tab-about" : undefined}
        hidden={desktop && activeNote !== "about"}
        tabIndex={desktop ? 0 : undefined}
      >
        <GiStrawberry className="journal-sticker" aria-hidden="true" />
        <h2>{t.homeAboutHeading}</h2>
        <p>{t.homeAboutText}</p>
        <p className="journal-welcome">{f.notices[notice]}</p>
        {interests[language].length > 0 && (
          <ul className="interest-tags" aria-label={f.interests}>
            {interests[language].map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </article>
      <article
        className={`journal-note journal-quote${spinning ? " is-shuffling" : ""}`}
        id="journal-panel-quote"
        role={desktop ? "tabpanel" : undefined}
        aria-labelledby={desktop ? "journal-tab-quote" : undefined}
        hidden={desktop && activeNote !== "quote"}
        tabIndex={desktop ? 0 : undefined}
      >
        <h2>
          <PiFlowerLight aria-hidden="true" />
          {f.quote}
        </h2>
        <p aria-live="polite">{f.quotes[quote]}</p>
        <button
          type="button"
          className={spinning ? "is-spinning" : undefined}
          onClick={shuffleQuote}
          aria-label={f.shuffle}
          title={f.shuffle}
        >
          <FiRefreshCw aria-hidden="true" />
        </button>
      </article>
    </section>
  );
}
