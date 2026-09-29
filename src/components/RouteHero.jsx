import { PiFlowerLight } from "react-icons/pi";
import { Header } from "./Header.jsx";
import { useI18n } from "../hooks/useI18n.js";

export function RouteHero({ page = "posts", t: propT, header, children }) {
  const i18n = useI18n();
  const t = propT ?? i18n.t;

  return <section className={"route-hero route-hero-" + page} aria-label={t.pageTitle[page]}>
    {header || children || <Header page={page} t={t} language={i18n.language} />}
    <div className="route-page-title">
      <span className="route-page-kicker"><PiFlowerLight aria-hidden="true" />{t.pageKicker[page]}</span>
      <h1>{t.pageTitle[page]}</h1>
    </div>
  </section>;
}
