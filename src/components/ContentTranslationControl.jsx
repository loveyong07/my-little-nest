import { FiGlobe, FiX } from "react-icons/fi";
import { translationLanguageName } from "../utils/translation.js";

export function ContentTranslationControl({ translation, language, t, className = "" }) {
  if (!translation.hasText) return null;
  const name = translationLanguageName(translation.targetLanguage, language);
  const busy = ["detecting", "downloading", "translating"].includes(translation.stage);
  const continuing = translation.error === "activationRequired";
  const label = busy
    ? t.translationWorking
    : translation.showing
      ? t.translationShowOriginal
      : continuing
        ? t.translationContinue
        : t.translationTranslate;
  const status =
    translation.stage === "downloading"
      ? t.translationDownloading(translation.progress)
      : translation.stage === "detecting"
        ? t.translationDetecting
        : translation.error
          ? (t.translationErrors[translation.error] ?? t.translationErrors.failed)
          : translation.sameLanguage
            ? t.translationSameLanguage(name)
            : translation.showing
              ? t.translationByBrowser(name)
              : "";
  return (
    <div className={`content-translation ${className}`.trim()}>
      <button
        className="content-translation-button"
        type="button"
        onClick={translation.toggleTranslation}
        disabled={busy}
        aria-pressed={translation.showing}
        aria-label={label}
      >
        <FiGlobe aria-hidden="true" />
        <span>{label}</span>
      </button>
      {busy && (
        <button
          className="content-translation-cancel"
          type="button"
          onClick={translation.cancelTranslation}
          aria-label={t.translationCancel}
        >
          <FiX aria-hidden="true" />
          {t.translationCancel}
        </button>
      )}
      <span className="content-translation-status" role="status" aria-live="polite" aria-atomic="true">
        {status}
      </span>
    </div>
  );
}
