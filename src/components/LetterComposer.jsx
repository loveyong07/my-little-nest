import { FiCheck, FiChevronDown, FiEdit3 } from "react-icons/fi";

export function LetterComposer({ t, topic, setTopic, body, setBody }) {
  return (
    <div className="letter-composer">
      <fieldset className="letter-topics">
        <legend>{t.letterTopicLabel}</legend>
        {t.letterTopics.map((label, index) => (
          <button key={index} type="button" aria-pressed={topic === index} onClick={() => setTopic(index)}>
            {topic === index && <FiCheck aria-hidden="true" />}
            {label}
          </button>
        ))}
      </fieldset>
      <details className="letter-draft">
        <summary>
          <FiEdit3 aria-hidden="true" />
          {t.letterDraftOpen}
          <FiChevronDown aria-hidden="true" />
        </summary>
        <label htmlFor="letter-draft-body">{t.letterDraftLabel}</label>
        <textarea
          id="letter-draft-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={800}
          rows={4}
          placeholder={t.letterDraftPlaceholder}
        />
        <div className="letter-draft-note">
          <span>{t.letterDraftHint}</span>
          <span>{body.length}/800</span>
        </div>
      </details>
    </div>
  );
}
