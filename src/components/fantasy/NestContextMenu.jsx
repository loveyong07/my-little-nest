import { useEffect, useRef, useState } from "react";
import { FaHouse, FaRegEnvelope, FaArrowUp, FaWandMagicSparkles, FaBookOpen } from "react-icons/fa6";

export function NestContextMenu({ f, page, effects, onToggleEffects }) {
  const [position, setPosition] = useState(null);
  const ref = useRef(null);
  const previousFocus = useRef(null);
  useEffect(() => { setPosition(null); }, [page]);
  useEffect(() => {
    function open(event) {
      // Keep native save/copy/open actions for text selections, media and links.
      if (event.shiftKey || window.getSelection()?.toString() || event.target.closest("a,button,input,select,textarea,video,audio,img,canvas,[contenteditable],[role=dialog]")) return;
      event.preventDefault(); previousFocus.current = document.activeElement;
      setPosition({ x: Math.max(8, Math.min(event.clientX || 24, innerWidth - 254)), y: Math.max(8, Math.min(event.clientY || 80, innerHeight - 380)) });
    }
    document.addEventListener("contextmenu", open);
    return () => document.removeEventListener("contextmenu", open);
  }, []);
  useEffect(() => {
    if (!position) return undefined;
    ref.current?.querySelector('[role="menuitem"]')?.focus();
    const close = () => setPosition(null);
    const outside = (event) => { if (!ref.current?.contains(event.target)) close(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", close, { passive: true }); window.addEventListener("resize", close);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("scroll", close); window.removeEventListener("resize", close); };
  }, [position]);
  if (!position) return null;
  function keyboard(event) {
    const items = [...ref.current.querySelectorAll('[role^="menuitem"]')];
    const current = items.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      setPosition(null); previousFocus.current?.focus();
      if (event.key === "Escape") event.preventDefault();
    }
  }
  return <div className="nest-context-menu" ref={ref} style={{ left: position.x, top: position.y }} role="menu" aria-label={f.menu} onKeyDown={keyboard}>
    <p>{f.menu}</p>
    {[["/", f.home, FaHouse], ["/posts", f.posts, FaBookOpen], ["/contact", f.contact, FaRegEnvelope]].map(([href, label, Icon]) => <a key={href} role="menuitem" tabIndex={-1} href={href} onClick={() => setPosition(null)}><Icon aria-hidden="true" />{label}</a>)}
    <button type="button" role="menuitem" tabIndex={-1} onClick={() => { setPosition(null); window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); previousFocus.current?.focus(); }}><FaArrowUp aria-hidden="true" />{f.top}</button>
    <button type="button" role="menuitemcheckbox" aria-checked={effects} tabIndex={-1} onClick={() => { onToggleEffects(); setPosition(null); previousFocus.current?.focus(); }}><FaWandMagicSparkles aria-hidden="true" />{effects ? f.effectsOn : f.effectsOff}</button>
    <small>{f.nativeMenu}</small>
  </div>;
}
