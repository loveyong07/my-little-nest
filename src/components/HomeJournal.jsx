import { useState } from "react";
import { FiRefreshCw } from "react-icons/fi";
import { PiFlowerLight } from "react-icons/pi";
import { GiStrawberry } from "react-icons/gi";
import { fantasyCopy, interests } from "../constants/fantasy.js";

export function HomeJournal({ language }) {
  const f = fantasyCopy[language];
  const [notice] = useState(() => Math.floor(Math.random() * f.notices.length));
  const [quote, setQuote] = useState(() => Math.floor(Math.random() * f.quotes.length));

  function shuffleQuote() {
    if (f.quotes.length < 2) return;
    const next = Math.floor(Math.random() * (f.quotes.length - 1));
    setQuote(next >= quote ? next + 1 : next);
  }

  return (
    <section className="home-journal" aria-label={f.journal}>
      <article className="journal-note journal-notice">
        <GiStrawberry className="journal-sticker" aria-hidden="true" />
        <h2>{f.notice}</h2>
        <p>{f.notices[notice]}</p>
        {interests[language].length > 0 && (
          <ul className="interest-tags" aria-label={f.interests}>
            {interests[language].map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </article>
      <article className="journal-note journal-quote">
        <h2>
          <PiFlowerLight aria-hidden="true" />
          {f.quote}
        </h2>
        <p aria-live="polite">{f.quotes[quote]}</p>
        <button type="button" onClick={shuffleQuote} aria-label={f.shuffle}>
          <FiRefreshCw aria-hidden="true" />
        </button>
      </article>
    </section>
  );
}
