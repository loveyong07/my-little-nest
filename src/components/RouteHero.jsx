import { PiFlowerLight } from "react-icons/pi";
import { RouteGarland } from "./ScrapbookAccents.jsx";

export function RouteHero({ page, t, header }) {
  return (
    <div className={"route-hero route-hero-" + page}>
      {header}
      <div className="route-page-title" key={page}>
        <span className="route-page-kicker">
          <PiFlowerLight aria-hidden="true" />
          {t.pageKicker[page]}
        </span>
        <h1 id="page-heading" tabIndex={-1}>
          {t.pageTitle[page]}
        </h1>
        <p className="route-page-intro">{t.routeIntro[page]}</p>
      </div>
      <RouteGarland page={page} />
    </div>
  );
}
