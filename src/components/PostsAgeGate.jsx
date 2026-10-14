import { FiArrowRight, FiShield } from "react-icons/fi";
import { pagePaths } from "../routes/site-route.js";

export function PostsAgeGate({ t, onConfirm }) {
  return (
    <section className="posts-age-gate" aria-labelledby="posts-age-heading" aria-describedby="posts-age-description">
      <span className="posts-age-badge" aria-hidden="true">
        <FiShield />
        18+
      </span>
      <h2 id="posts-age-heading">{t.ageGateHeading}</h2>
      <p id="posts-age-description">{t.ageGateDescription}</p>
      <div className="posts-age-actions">
        <button type="button" className="posts-age-confirm" onClick={onConfirm}>
          {t.ageGateConfirm}
          <FiArrowRight aria-hidden="true" />
        </button>
        <a className="posts-age-exit" href={pagePaths.home}>
          {t.ageGateExit}
        </a>
      </div>
      <p className="posts-age-note">{t.ageGateNote}</p>
      <div className="glass-panel-backdrop glass-reading-backdrop" aria-hidden="true" />
    </section>
  );
}
