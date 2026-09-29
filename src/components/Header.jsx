import { useEffect, useRef, useState } from "react";
import { FiMenu, FiX } from "react-icons/fi";
import { PiFlowerLight } from "react-icons/pi";
import { navIds } from "../constants/site.js";
import { pagePaths } from "../routes/site-route.js";
import { useI18n } from "../hooks/useI18n.js";

export function Header({ page = "home", t: propT, language: propLang, changeLanguage: propChangeLanguage }) {
  const i18n = useI18n();
  const t = propT ?? i18n.t;
  const language = propLang ?? i18n.language;
  const changeLanguage = propChangeLanguage ?? i18n.changeLanguage;
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef(null);
  const menuToggleRef = useRef(null);
  const menuOpenedByKeyboardRef = useRef(false);

  useEffect(() => { setMenuOpen(false); }, [page]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    if (menuOpenedByKeyboardRef.current) headerRef.current?.querySelector(".site-nav a")?.focus();
    function closeMenuOnEscape(event) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuToggleRef.current?.focus();
    }
    function closeMenuOutside(event) {
      if (!headerRef.current?.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener("keydown", closeMenuOnEscape);
    document.addEventListener("pointerdown", closeMenuOutside);
    return () => {
      document.removeEventListener("keydown", closeMenuOnEscape);
      document.removeEventListener("pointerdown", closeMenuOutside);
    };
  }, [menuOpen]);

  function closeMenuOnNavigation(event) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      setMenuOpen(false);
    }
  }

  return <header className="site-header" ref={headerRef}>
    <a className="brand" href={pagePaths.home} aria-label={t.homeLinkLabel} onClick={closeMenuOnNavigation}>
      <span className="brand-script">Nest<PiFlowerLight aria-hidden="true" /></span>
      <span className="brand-caption">{t.homePlaceLabel}</span>
    </a>
    <nav className={"site-nav " + (menuOpen ? "is-open" : "")} id="site-navigation" aria-label={t.navLabel}>
      {navIds.map((id, index) => <a key={id} className={page === id ? "active" : ""} href={pagePaths[id]} onClick={closeMenuOnNavigation} aria-current={page === id ? "page" : undefined}><PiFlowerLight className="nav-active-flower" aria-hidden="true" />{t.nav[index]}</a>)}
    </nav>
    <div className="language-picker" role="group" aria-label={t.languageLabel}>
      {[["zh", "中文"], ["ja", "日本語"], ["en", "EN"]].map(([code, label]) => <button key={code} className={language === code ? "active" : ""} onClick={() => changeLanguage(code)} aria-pressed={language === code}>{label}</button>)}
    </div>
    <button className="menu-toggle" ref={menuToggleRef} type="button" onClick={(event) => {
      menuOpenedByKeyboardRef.current = event.detail === 0;
      setMenuOpen((current) => !current);
    }} aria-label={menuOpen ? t.closeMenu : t.openMenu} aria-expanded={menuOpen} aria-controls="site-navigation">{menuOpen ? <FiX /> : <FiMenu />}</button>
  </header>;
}
