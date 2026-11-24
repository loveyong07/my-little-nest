import { Fragment } from "react";
import { PiFlowerLight } from "react-icons/pi";
import { navIds } from "../constants/site.js";
import { pagePaths } from "../routes/site-route.js";
import { RouteGarland } from "./ScrapbookAccents.jsx";

export function RouteHero({ page, t }) {
  return (
    <div className={"route-hero route-hero-" + page}>
      <div className="route-page-title" key={page}>
        <nav className="route-breadcrumb" aria-label={t.routeBreadcrumbLabel}>
          {navIds.map((id, index) => (
            <Fragment key={id}>
              {index > 0 && <span aria-hidden="true">/</span>}
              {id === page ? (
                <span aria-current="page">{t.nav[index]}</span>
              ) : (
                <a href={pagePaths[id]}>{t.nav[index]}</a>
              )}
            </Fragment>
          ))}
        </nav>
        <span className="route-page-kicker">
          <PiFlowerLight aria-hidden="true" />
          {t.pageKicker[page]}
        </span>
        <h1 id="page-heading" tabIndex={-1}>
          {t.pageTitle[page]}
        </h1>
        <p className="route-page-intro">{t.routeIntro[page]}</p>
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
