import { useRef } from "react";
import { FiCheck, FiChevronDown, FiEdit3, FiRotateCcw } from "react-icons/fi";
import { HiOutlineSparkles } from "react-icons/hi2";

export function LetterComposer({ t, topic, setTopic, body, setBody, detailsRef }) {
  const textareaRef = useRef(null);

  function insertPrompt(prompt) {
    setBody((current) => {
      if (!current.trim()) return `${prompt}\n`;
      if (current.includes(prompt)) return current;
      return `${current.replace(/\s+$/, "")}\n\n${prompt}\n`.slice(0, 800);
    });
    textareaRef.current?.focus();
  }

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
      <div className="letter-subject-preview" aria-live="polite">
        <span className="letter-subject-tag">
          <HiOutlineSparkles aria-hidden="true" />
          {t.letterSubjectPreview}
        </span>
        <strong>{t.letterSubjects[topic]}</strong>
      </div>
      <details className="letter-draft" ref={detailsRef}>
        <summary>
          <FiEdit3 aria-hidden="true" />
          {t.letterDraftOpen}
          <FiChevronDown aria-hidden="true" />
        </summary>
        <div className="letter-prompts" role="group" aria-label={t.letterPromptsLabel}>
          <span className="letter-prompts-label">{t.letterPromptsLabel}</span>
          <div className="letter-prompts-list">
            {t.letterPrompts.map((prompt, index) => (
              <button key={index} type="button" className="letter-prompt-chip" onClick={() => insertPrompt(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        </div>
        <label htmlFor="letter-draft-body">{t.letterDraftLabel}</label>
        <textarea
          ref={textareaRef}
          id="letter-draft-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={800}
          rows={4}
          placeholder={t.letterDraftPlaceholder}
        />
        <div className="letter-draft-note">
          <span>{t.letterDraftHint}</span>
          <div className="letter-draft-meta">
            {body.length > 0 && (
              <button type="button" className="letter-draft-clear" onClick={() => setBody("")}>
                <FiRotateCcw aria-hidden="true" />
                {t.letterDraftClear}
              </button>
            )}
            <span>{body.length}/800</span>
          </div>
        </div>
      </details>
    </div>
  );
}
