import { lazy, Suspense, useState } from "react";
import { Header } from "./components/Header.jsx";
import { HeroSection } from "./components/HeroSection.jsx";
import { RouteHero } from "./components/RouteHero.jsx";
import { ClickSparkles } from "./components/ClickSparkles.jsx";
import { ASSETS } from "./constants/site.js";
import { useI18n } from "./hooks/useI18n.js";
import { useXProfile } from "./hooks/useXProfile.js";
import { useSiteRoute } from "./hooks/useSiteRoute.js";
import { useClickSparkles } from "./hooks/useClickSparkles.js";
import { useSceneActivity } from "./hooks/useSceneActivity.js";

const PostsPage = lazy(() => import("./pages/PostsPage.jsx"));
const ContactPage = lazy(() => import("./pages/ContactPage.jsx"));

export function App() {
  const { language, t, changeLanguage } = useI18n();
  const { page, handleRouteClick, preparePosts } = useSiteRoute();
  const [postsReady, setPostsReady] = useState(false);
  const profile = useXProfile(page, page !== "posts" || postsReady);
  const { sparkle, showClickSparkle } = useClickSparkles();
  const sceneActive = useSceneActivity(page);
  const header = <Header page={page} t={t} language={language} changeLanguage={changeLanguage} />;

  function handleClick(event) {
    showClickSparkle(event);
    handleRouteClick(event);
  }

  return <main aria-labelledby="page-heading" className={"site language-" + language + (sceneActive ? "" : " scene-paused") + (page === "home" ? "" : " site-route site-route-" + page)}
    onClick={handleClick} onPointerOver={preparePosts} onFocus={preparePosts} onTouchStart={preparePosts}>
    {page === "posts" && <div className="route-floating-elements" aria-hidden="true" />}
    {page === "contact" && <div className="route-floating-elements" aria-hidden="true">
      <img className="route-floating-dove" src={ASSETS + "/contact-sky-dove-v2.png"} alt="" draggable="false" />
    </div>}
    {page === "home" ? <HeroSection header={header} language={language} t={t} profile={profile} /> : <>
      <RouteHero page={page} t={t} header={header} />
      <section className={"content-panel route-panel route-panel-" + page}
        aria-label={page === "posts" ? t.postsHeading : t.contactsHeading}>
        <Suspense fallback={<div className="pinned-placeholder" role="status">{page === "posts" ? t.feedLoading : t.contactsHeading}</div>}>
          {page === "posts"
            ? <PostsPage language={language} t={t} profile={profile} onFeedReady={setPostsReady} />
            : <ContactPage language={language} t={t} profile={profile} />}
        </Suspense>
      </section>
    </>}
    <ClickSparkles sparkle={sparkle} />
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{t.nav[["home", "posts", "contact"].indexOf(page)]}</div>
  </main>;
}
