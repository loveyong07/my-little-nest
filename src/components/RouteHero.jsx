import { PiFlowerLight } from "react-icons/pi";
import { RouteGarland } from "./ScrapbookAccents.jsx";
import { pagePaths } from "../routes/site-route.js";

export function RouteHero({ page, t, header }) {
  return (
    <section className={"route-hero route-hero-" + page} aria-label={t.pageTitle[page]}>
      {header}
      <div className="route-page-title" key={page}>
        <div className="route-breadcrumb">
          <a href={pagePaths.home}>{t.nav[0]}</a>
          <span aria-hidden="true">/</span>
          <span>{t.pageTitle[page]}</span>
        </div>
        <span className="route-page-kicker">
          <PiFlowerLight aria-hidden="true" />
          {t.pageKicker[page]}
        </span>
        <h1 id="page-heading" tabIndex={-1}>
          {t.pageTitle[page]}
        </h1>
        <p className="route-page-intro">{t.routeIntro[page]}</p>
      </div>
      <div className="route-edition" aria-hidden="true">
        <span>MY LITTLE NEST</span>
        <strong>0{page === "posts" ? 2 : 3}</strong>
        <span>{page === "posts" ? "STORIES & MOMENTS" : "LETTERS & HELLOS"}</span>
      </div>
      <RouteGarland page={page} />
    </section>
  );
}
