import { PiFlowerLight } from "react-icons/pi";
import { RouteGarland } from "./ScrapbookAccents.jsx";

export function RouteHero({ page, t, header }) {
  return (
    <section className={"route-hero route-hero-" + page} aria-label={t.pageTitle[page]}>
      {header}
      <div className="route-page-title">
        <span className="route-page-kicker">
          <PiFlowerLight aria-hidden="true" />
          {t.pageKicker[page]}
        </span>
        <h1 id="page-heading" tabIndex={-1}>
          {t.pageTitle[page]}
        </h1>
      </div>
      <RouteGarland page={page} />
    </section>
  );
}
