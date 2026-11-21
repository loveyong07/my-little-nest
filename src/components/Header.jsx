import { useEffect, useRef, useState } from "react";
import { FiMenu, FiX, FiHome, FiFeather, FiMail } from "react-icons/fi";
import { PiFlowerLight } from "react-icons/pi";
import { LANGUAGES } from "../constants/languages.js";
import { navIds } from "../constants/site.js";
import { pagePaths } from "../routes/site-route.js";
import { useSwipeSwitch } from "../hooks/useSwipeSwitch.js";

const navIcons = [FiHome, FiFeather, FiMail];

export function Header({ page, t, language, changeLanguage, onNavigate }) {
  const [menuPage, setMenuPage] = useState(null);
  const menuOpen = menuPage === page;
  // A route change closes the menu before paint, including browser back/forward.
  if (menuPage !== null && menuPage !== page) setMenuPage(null);
  const headerRef = useRef(null);
  const menuToggleRef = useRef(null);
  const menuOpenedByKeyboardRef = useRef(false);
  const navRef = useSwipeSwitch({
    activeIndex: navIds.indexOf(page),
    onChange: (index) => onNavigate?.(navIds[index]),
    itemSelector: "a[data-page]",
    layoutKey: `${language}-${menuOpen}`,
  });
  const languageRef = useSwipeSwitch({
    activeIndex: LANGUAGES.findIndex(({ code }) => code === language),
    onChange: (index) => changeLanguage(LANGUAGES[index].code),
    itemSelector: "button",
  });

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
    function closeMenuOnFocusOut(event) {
      if (event.relatedTarget instanceof Node && !headerRef.current?.contains(event.relatedTarget)) {
        setMenuPage(null);
      }
    }
    const header = headerRef.current;
    document.addEventListener("keydown", closeMenuOnEscape);
    document.addEventListener("pointerdown", closeMenuOutside);
    header?.addEventListener("focusout", closeMenuOnFocusOut);
    return () => {
      document.removeEventListener("keydown", closeMenuOnEscape);
      document.removeEventListener("pointerdown", closeMenuOutside);
      header?.removeEventListener("focusout", closeMenuOnFocusOut);
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
      <nav
        className={"site-nav swipe-switch " + (menuOpen ? "is-open" : "")}
        ref={navRef}
        id="site-navigation"
        aria-label={t.navLabel}
      >
        <span
          className={`nav-selection nav-selection-${page}`}
          style={{ "--nav-position": navIds.indexOf(page) }}
          aria-hidden="true"
        />
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
              <Icon className="nav-page-icon" aria-hidden="true" />
              {page === "posts" ? (
                <span className="nav-label-stack">
                  {t.nav[index]}
                  <small aria-hidden="true">{["THE NEST", "JOURNAL", "SAY HELLO"][index]}</small>
                </span>
              ) : (
                t.nav[index]
              )}
            </a>
          );
        })}
      </nav>
      <div className="language-picker swipe-switch" ref={languageRef} role="group" aria-label={t.languageLabel}>
        <span className={`language-selection language-selection-${language}`} aria-hidden="true" />
        {LANGUAGES.map(({ code, label }) => (
          <button
            key={code}
            type="button"
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
        {menuOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
      </button>
    </header>
  );
}
