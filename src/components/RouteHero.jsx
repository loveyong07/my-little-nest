import { PiFlowerLight } from "react-icons/pi";
import { pagePaths } from "../routes/site-route.js";
import { RouteGarland } from "./ScrapbookAccents.jsx";

export function RouteHero({ page, t }) {
  return (
    <div className={"route-hero route-hero-" + page}>
      <div className="route-page-title" key={page}>
        {page === "posts" && (
          <div className="route-breadcrumb">
            <a href={pagePaths.home}>{t.nav[0]}</a>
            <span aria-hidden="true">/</span>
            <span>{t.pageTitle.posts}</span>
          </div>
        )}
        <span className="route-page-kicker">
          <PiFlowerLight aria-hidden="true" />
          {t.pageKicker[page]}
        </span>
        <h1 id="page-heading" tabIndex={-1}>
          {t.pageTitle[page]}
        </h1>
        {page === "posts" && <p className="route-page-intro">{t.routeIntro.posts}</p>}
      </div>
      {page === "posts" && (
        <div className="route-edition" aria-hidden="true">
          <span>MY LITTLE NEST</span>
          <strong>02</strong>
          <span>STORIES & MOMENTS</span>
        </div>
      )}
      <RouteGarland page={page} />
    </div>
  );
}
