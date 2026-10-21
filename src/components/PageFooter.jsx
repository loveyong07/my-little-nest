import { FiArrowUpRight } from "react-icons/fi";
import { PiFlowerLight } from "react-icons/pi";
import { navIds } from "../constants/site.js";
import { pagePaths } from "../routes/site-route.js";

export function PageFooter({ t, page }) {
  return (
    <footer className="nest-page-footer">
      <p>
        <PiFlowerLight aria-hidden="true" />
        <span>{t.pageFooterNote}</span>
      </p>
      <nav aria-label={t.footerNavLabel}>
        {navIds
          .filter((id) => id !== page)
          .map((id) => (
            <a href={pagePaths[id]} key={id}>
              {t.nav[navIds.indexOf(id)]}
              <FiArrowUpRight aria-hidden="true" />
            </a>
          ))}
      </nav>
      <small>MY LITTLE NEST · SAME BEAUTIFUL SKY</small>
    </footer>
  );
}
