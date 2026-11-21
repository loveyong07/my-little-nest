import { Component, Suspense } from "react";
import { ASSETS } from "../constants/site.js";
import { DesktopStationery } from "./DesktopStationery.jsx";
import { GlassFlorals } from "./GlassFlorals.jsx";
import { PageFooter } from "./PageFooter.jsx";
import { RouteHero } from "./RouteHero.jsx";

/** @extends {Component<{ fallback: import("react").ReactNode, children?: import("react").ReactNode }>} */
export class LazyRegionBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function RouteLoadError({ t }) {
  return (
    <div className="feed-status">
      <div className="feed-status-copy" role="alert">
        <span>{t.routeLoadError}</span>
      </div>
      <div className="feed-status-actions">
        <button type="button" onClick={() => window.location.reload()}>
          {t.routeReload}
        </button>
      </div>
    </div>
  );
}

export function SiteRouteLayout({ page, t, header, extras, children }) {
  return (
    <>
      <div className="route-floating-elements" aria-hidden="true">
        {page === "contact" && (
          <img className="route-floating-dove" src={ASSETS + "/contact-sky-dove-v2.webp"} alt="" draggable="false" />
        )}
      </div>
      <RouteHero page={page} t={t} header={header} />
      <main key={page} className={`content-panel route-panel route-panel-${page}`} aria-labelledby="page-heading">
        <GlassFlorals />
        <LazyRegionBoundary fallback={<RouteLoadError t={t} />}>
          <Suspense
            fallback={
              <div className="pinned-placeholder" role="status">
                {page === "posts" ? t.feedLoading : t.pageTitle.contact}
              </div>
            }
          >
            {children}
          </Suspense>
        </LazyRegionBoundary>
        <div className="glass-panel-backdrop" aria-hidden="true" />
      </main>
      <PageFooter t={t} page={page} />
      {extras}
      <DesktopStationery page={page} />
    </>
  );
}
