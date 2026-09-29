import { useI18n } from "../hooks/useI18n.js";
import { useXProfile } from "../hooks/useXProfile.js";
import PostsPage from "./PostsPage.jsx";

export default function PostCarousel({
  language: propLang,
  t: propT,
  profile: propProfile,
} = {}) {
  const i18n = useI18n();
  const profileState = useXProfile("posts", true);

  const language = propLang || i18n.language;
  const t = propT || i18n.t;
  const profile = propProfile || profileState;

  return (
    <PostsPage
      language={language}
      t={t}
      profile={profile}
      onFeedReady={() => {}}
    />
  );
}

export { PostCarousel };
