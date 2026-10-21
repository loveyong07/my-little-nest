import { useEffect, useRef, useState } from "react";
import { FiMenu, FiX, FiHome, FiFeather, FiMail } from "react-icons/fi";
import { PiFlowerLight } from "react-icons/pi";
import { LANGUAGES } from "../constants/languages.js";
import { navIds } from "../constants/site.js";
import { pagePaths } from "../routes/site-route.js";

const navIcons = [FiHome, FiFeather, FiMail];

export function Header({ page, t, language, changeLanguage }) {
  const [menuPage, setMenuPage] = useState(null);
  const menuOpen = menuPage === page;
  // A route change closes the menu before paint, including browser back/forward.
  if (menuPage !== null && menuPage !== page) setMenuPage(null);
  const headerRef = useRef(null);
  const menuToggleRef = useRef(null);
  const menuOpenedByKeyboardRef = useRef(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    if (menuOpenedByKeyboardRef.current) headerRef.current?.querySelector(".site-nav a")?.focus();
    function closeMenuOnEscape(event) {
      if (event.key !== "Escape") return;
      setMenuPage(null);
      menuToggleRef.current?.focus();
    }
    function closeMenuOutside(event) {
      if (!headerRef.current?.contains(event.target)) setMenuPage(null);
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
      setMenuPage(null);
    }
  }

  return (
    <header className="site-header" ref={headerRef}>
      <a className="skip-to-content" href="#page-heading">
        {t.skipToContent}
      </a>
      <a className="brand" href={pagePaths.home} aria-label={t.homeLinkLabel} onClick={closeMenuOnNavigation}>
        <span className="brand-script">
          Nest
          <PiFlowerLight aria-hidden="true" />
        </span>
        <span className="brand-caption">{t.homePlaceLabel}</span>
      </a>
      <nav className={"site-nav " + (menuOpen ? "is-open" : "")} id="site-navigation" aria-label={t.navLabel}>
        {navIds.map((id, index) => {
          const Icon = navIcons[index];
          return (
            <a
              key={id}
              data-page={id}
              className={page === id ? "active" : ""}
              href={pagePaths[id]}
              onClick={closeMenuOnNavigation}
              aria-current={page === id ? "page" : undefined}
            >
              <PiFlowerLight className="nav-active-flower" aria-hidden="true" />
              <span className="nav-page-number" aria-hidden="true">
                0{index + 1}
              </span>
              <Icon className="nav-page-icon" aria-hidden="true" />
              {t.nav[index]}
            </a>
          );
        })}
      </nav>
      <div className="language-picker" role="group" aria-label={t.languageLabel}>
        {LANGUAGES.map(({ code, label }) => (
          <button
            key={code}
            className={language === code ? "active" : ""}
            onClick={() => changeLanguage(code)}
            aria-pressed={language === code}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        className="menu-toggle"
        ref={menuToggleRef}
        type="button"
        onClick={(event) => {
          menuOpenedByKeyboardRef.current = event.detail === 0;
          setMenuPage((current) => (current === page ? null : page));
        }}
        aria-label={menuOpen ? t.closeMenu : t.openMenu}
        aria-expanded={menuOpen}
        aria-controls="site-navigation"
      >
        {menuOpen ? <FiX /> : <FiMenu />}
      </button>
    </header>
  );
}
