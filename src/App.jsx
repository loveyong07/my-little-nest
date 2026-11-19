import { Component, lazy, Suspense, useEffect, useState } from "react";
import { Header } from "./components/Header.jsx";
import { HeroSection } from "./components/HeroSection.jsx";
import { GlassFlorals } from "./components/GlassFlorals.jsx";
import { DesktopStationery } from "./components/DesktopStationery.jsx";
import { RouteHero } from "./components/RouteHero.jsx";
import { PageFooter } from "./components/PageFooter.jsx";
import { ASSETS, navIds } from "./constants/site.js";
import { useI18n } from "./hooks/useI18n.js";
import { useXProfile } from "./hooks/useXProfile.js";
import { useSiteRoute } from "./hooks/useSiteRoute.js";
import { useSceneActivity } from "./hooks/useSceneActivity.js";
import { useFantasyPreferences } from "./hooks/useFantasyPreferences.js";

const PostsPage = lazy(() => import("./pages/PostsPage.jsx"));
const ContactPage = lazy(() => import("./pages/ContactPage.jsx"));
const FantasyExtras = lazy(() => import("./components/fantasy/FantasyExtras.jsx"));

/** @extends {Component<{ fallback: import("react").ReactNode, children?: import("react").ReactNode }>} */
class LazyRegionBoundary extends Component {
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

export function App() {
  const { language, t, f, changeLanguage } = useI18n();
  const { page, handleRouteClick, preparePosts, navigatePage, historyReading, rememberReading } = useSiteRoute();
  const [postsReady, setPostsReady] = useState(false);
  const profile = useXProfile(page, page !== "posts" || postsReady);
  const preferences = useFantasyPreferences();
  const [extrasReady, setExtrasReady] = useState(false);
  useEffect(() => {
    // A direct feed visit prioritizes its first cards before loading decorative extras.
    if (extrasReady || (page === "posts" && !postsReady)) return undefined;
    // Let the initial scene, CSS and fonts finish before requesting extras.
    let timer;
    const schedule = () => {
      timer = setTimeout(() => setExtrasReady(true), 1800);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("load", schedule);
    };
  }, [page, postsReady, extrasReady]);
  const sceneActive = useSceneActivity(page);
  const extras = extrasReady ? (
    <LazyRegionBoundary fallback={null}>
      <Suspense fallback={null}>
        <FantasyExtras f={f} page={page} preferences={preferences} />
      </Suspense>
    </LazyRegionBoundary>
  ) : null;
  const header = (
    <Header page={page} t={t} language={language} changeLanguage={changeLanguage} onNavigate={navigatePage} />
  );

  return (
    <div
      className={
        "site language-" +
        language +
        (sceneActive ? "" : " scene-paused") +
        (preferences.motion ? "" : " motion-off") +
        (page === "home" ? "" : " site-route site-route-" + page)
      }
      onClick={handleRouteClick}
      onPointerOver={preparePosts}
      onFocus={preparePosts}
      onTouchStart={preparePosts}
    >
      {page === "posts" && <div className="route-floating-elements" aria-hidden="true" />}
      {page === "contact" && (
        <div className="route-floating-elements" aria-hidden="true">
          <img className="route-floating-dove" src={ASSETS + "/contact-sky-dove-v2.webp"} alt="" draggable="false" />
        </div>
      )}
      {page === "home" ? (
        <HeroSection header={header} language={language} t={t} f={f} profile={profile} extras={extras} />
      ) : (
        <>
          <RouteHero page={page} t={t} header={header} />
          <main key={page} className={"content-panel route-panel route-panel-" + page} aria-labelledby="page-heading">
            <GlassFlorals />
            <LazyRegionBoundary fallback={<RouteLoadError t={t} />}>
              <Suspense
                fallback={
                  <div className="pinned-placeholder" role="status">
                    {page === "posts" ? t.feedLoading : t.contactsHeading}
                  </div>
                }
              >
                {page === "posts" ? (
                  <PostsPage
                    language={language}
                    t={t}
                    profile={profile}
                    onFeedReady={setPostsReady}
                    historyReading={historyReading}
                    rememberReading={rememberReading}
                  />
                ) : (
                  <ContactPage t={t} profile={profile} />
                )}
              </Suspense>
            </LazyRegionBoundary>
            <div className="glass-panel-backdrop" aria-hidden="true" />
          </main>
          <PageFooter t={t} page={page} />
        </>
      )}
      {page !== "home" && extras}
      {page !== "home" && <DesktopStationery page={page} />}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {t.nav[navIds.indexOf(page)]}
      </div>
    </div>
  );
}
