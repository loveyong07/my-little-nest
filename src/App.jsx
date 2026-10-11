import { lazy, Suspense, useEffect, useState } from "react";
import { Header } from "./components/Header.jsx";
import { HeroSection } from "./components/HeroSection.jsx";
import { RouteHero } from "./components/RouteHero.jsx";
import { ASSETS, navIds } from "./constants/site.js";
import { useI18n } from "./hooks/useI18n.js";
import { useXProfile } from "./hooks/useXProfile.js";
import { useSiteRoute } from "./hooks/useSiteRoute.js";
import { useSceneActivity } from "./hooks/useSceneActivity.js";
import { useFantasyPreferences } from "./hooks/useFantasyPreferences.js";

const PostsPage = lazy(() => import("./pages/PostsPage.jsx"));
const ContactPage = lazy(() => import("./pages/ContactPage.jsx"));
const FantasyExtras = lazy(() => import("./components/fantasy/FantasyExtras.jsx"));

export function App() {
  const { language, t, changeLanguage } = useI18n();
  const { page, handleRouteClick, preparePosts } = useSiteRoute();
  const [postsReady, setPostsReady] = useState(false);
  const profile = useXProfile(page, page !== "posts" || postsReady);
  const preferences = useFantasyPreferences();
  const [extrasReady, setExtrasReady] = useState(false);
  useEffect(() => {
    // A direct feed visit prioritizes its first cards; once mounted, keep music alive across routes.
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
  const header = <Header page={page} t={t} language={language} changeLanguage={changeLanguage} />;

  function handleClick(event) {
    handleRouteClick(event);
  }

  return (
    <main
      aria-labelledby="page-heading"
      className={
        "site language-" +
        language +
        (sceneActive ? "" : " scene-paused") +
        (preferences.motion ? "" : " motion-off") +
        (page === "home" ? "" : " site-route site-route-" + page)
      }
      onClick={handleClick}
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
        <HeroSection header={header} language={language} t={t} profile={profile} />
      ) : (
        <>
          <RouteHero page={page} t={t} header={header} />
          <section
            className={"content-panel route-panel route-panel-" + page}
            aria-label={page === "posts" ? t.postsHeading : t.contactsHeading}
          >
            <Suspense
              fallback={
                <div className="pinned-placeholder" role="status">
                  {page === "posts" ? t.feedLoading : t.contactsHeading}
                </div>
              }
            >
              {page === "posts" ? (
                <PostsPage language={language} t={t} profile={profile} onFeedReady={setPostsReady} />
              ) : (
                <ContactPage t={t} profile={profile} />
              )}
            </Suspense>
          </section>
        </>
      )}
      {extrasReady && (
        <Suspense fallback={null}>
          <FantasyExtras language={language} page={page} preferences={preferences} />
        </Suspense>
      )}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {t.nav[navIds.indexOf(page)]}
      </div>
    </main>
  );
}
