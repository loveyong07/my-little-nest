import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { FaArrowUpRightFromSquare, FaGithub, FaStar } from "react-icons/fa6";
import { Header } from "./components/Header.jsx";
import { HeroSection } from "./components/HeroSection.jsx";
import { LazyRegionBoundary, SiteRouteLayout } from "./components/SiteRouteLayout.jsx";
import { TipModal } from "./components/TipModal.jsx";
import { navIds, SITE_SOURCE_REPOSITORY } from "./constants/site.js";
import { useI18n } from "./hooks/useI18n.js";
import { useXProfile } from "./hooks/useXProfile.js";
import { useSiteRoute, warmSiblingScenes } from "./hooks/useSiteRoute.js";
import { useSceneActivity } from "./hooks/useSceneActivity.js";
import { useFantasyPreferences } from "./hooks/useFantasyPreferences.js";
import { sceneStyle } from "./routes/scene-assets.js";

const loadPostsPage = () => import("./pages/PostsPage.jsx");
const loadContactPage = () => import("./pages/ContactPage.jsx");
const PostsPage = lazy(loadPostsPage);
const ContactPage = lazy(loadContactPage);
const FantasyExtras = lazy(() => import("./components/fantasy/FantasyExtras.jsx"));
const prefetchedRouteChunks = new Set();

function prefetchRouteChunk(targetPage) {
  if (prefetchedRouteChunks.has(targetPage)) return;
  prefetchedRouteChunks.add(targetPage);
  if (targetPage === "posts") {
    loadPostsPage().catch(() => prefetchedRouteChunks.delete(targetPage));
  } else if (targetPage === "contact") {
    loadContactPage().catch(() => prefetchedRouteChunks.delete(targetPage));
  }
}

export function App() {
  const { language, t, f, changeLanguage } = useI18n();
  const { page, routeSearch, handleRouteClick, prepareRoute, navigatePage, historyReading, rememberReading } =
    useSiteRoute(prefetchRouteChunk);
  const [postsReady, setPostsReady] = useState(false);
  const profile = useXProfile(page, page !== "posts" || postsReady);
  const preferences = useFantasyPreferences();
  const [extrasReady, setExtrasReady] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const tipTriggerRef = useRef(null);
  const [sceneTransition, setSceneTransition] = useState({ current: page, outgoing: null, key: 0 });
  if (sceneTransition.current !== page) {
    setSceneTransition({ current: page, outgoing: sceneTransition.current, key: sceneTransition.key + 1 });
  }
  useEffect(() => {
    if (!sceneTransition.outgoing) return undefined;
    const timer = window.setTimeout(
      () => setSceneTransition((state) => (state.key === sceneTransition.key ? { ...state, outgoing: null } : state)),
      preferences.motion ? 360 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [sceneTransition.outgoing, sceneTransition.key, preferences.motion]);
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
  useEffect(() => {
    if (extrasReady) warmSiblingScenes(page);
  }, [extrasReady, page]);
  const sceneActive = useSceneActivity(page);
  const outgoingScene =
    preferences.motion && sceneTransition.outgoing ? (
      <div
        key={sceneTransition.key}
        className={"site-scene-outgoing site-scene-outgoing-" + sceneTransition.outgoing}
        style={sceneStyle(sceneTransition.outgoing)}
        aria-hidden="true"
      />
    ) : null;
  const extras = extrasReady ? (
    <LazyRegionBoundary fallback={null}>
      <Suspense fallback={null}>
        <FantasyExtras f={f} page={page} preferences={preferences} />
      </Suspense>
    </LazyRegionBoundary>
  ) : null;
  return (
    <div
      style={sceneStyle(page)}
      className={
        "site language-" +
        language +
        (sceneActive ? "" : " scene-paused") +
        (preferences.motion ? "" : " motion-off") +
        (page === "home" ? "" : " site-route site-route-" + page)
      }
      onClick={handleRouteClick}
      onPointerOver={prepareRoute}
      onFocus={prepareRoute}
      onTouchStart={prepareRoute}
    >
      <Header page={page} t={t} language={language} changeLanguage={changeLanguage} onNavigate={navigatePage} />
      {page === "home" ? (
        <HeroSection
          language={language}
          t={t}
          f={f}
          profile={profile}
          extras={extras}
          outgoingScene={outgoingScene}
          entering={Boolean(outgoingScene)}
        />
      ) : (
        <SiteRouteLayout page={page} t={t} extras={extras} outgoingScene={outgoingScene}>
          {page === "posts" ? (
            <PostsPage
              language={language}
              t={t}
              profile={profile}
              onFeedReady={setPostsReady}
              routeSearch={routeSearch}
              historyReading={historyReading}
              rememberReading={rememberReading}
            />
          ) : (
            <ContactPage t={t} profile={profile} />
          )}
        </SiteRouteLayout>
      )}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {t.nav[navIds.indexOf(page)]}
      </div>
      <div className="site-corner-bar">
        <button
          ref={tipTriggerRef}
          type="button"
          className="site-tip-trigger"
          aria-label={t.tipButtonLabel}
          aria-haspopup="dialog"
          aria-expanded={tipOpen}
          onClick={() => setTipOpen(true)}
        >
          <FaStar aria-hidden="true" />
          <span>{t.tipLabel}</span>
        </button>
        {page === "home" ? (
          <div className="home-corner-links">
            <a
              className="home-source-link"
              href={SITE_SOURCE_REPOSITORY}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.siteSourceLink}
              title={t.siteSourceLink}
            >
              <FaGithub aria-hidden="true" />
              <span>{t.siteSource}</span>
              <FaArrowUpRightFromSquare className="home-source-external" aria-hidden="true" />
            </a>
            <footer className="site-legal-links" aria-label={t.legalLinksLabel}>
              <a href={language === "zh" ? "/privacy" : `/privacy#${language}`}>{t.privacyPolicy}</a>
              <a href={language === "zh" ? "/terms" : `/terms#${language}`}>{t.termsOfService}</a>
            </footer>
          </div>
        ) : (
          <footer className="site-legal-links" aria-label={t.legalLinksLabel}>
            <a href={language === "zh" ? "/privacy" : `/privacy#${language}`}>{t.privacyPolicy}</a>
            <a href={language === "zh" ? "/terms" : `/terms#${language}`}>{t.termsOfService}</a>
          </footer>
        )}
      </div>
      {tipOpen && <TipModal t={t} onClose={() => setTipOpen(false)} returnFocusRef={tipTriggerRef} />}
    </div>
  );
}
