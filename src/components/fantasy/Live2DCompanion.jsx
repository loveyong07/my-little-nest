import { useEffect, useRef, useState } from "react";
import { FiX } from "react-icons/fi";

export default function Live2DCompanion({ f, motion, onClose }) {
  const [compact, setCompact] = useState(() => matchMedia("(max-width: 700px)").matches || Boolean(navigator.connection?.saveData));
  const [activated, setActivated] = useState(false);
  const [status, setStatus] = useState("loading");
  const [greeted, setGreeted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const modelRef = useRef(null);
  const showModel = motion && (!compact || activated);
  useEffect(() => {
    const query = matchMedia("(max-width: 700px)");
    const change = () => setCompact(query.matches || Boolean(navigator.connection?.saveData));
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!showModel) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    setStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const { createCompanion } = await import("../../utils/live2d-runtime.js");
        if (cancelled) return;
        const model = await createCompanion("live2d", { fps: compact ? 20 : 30, signal: controller.signal });
        if (!model || cancelled) return;
        modelRef.current = model;
        if (document.hidden) model.pause();
        setStatus("ready");
      } catch { if (!cancelled) setStatus("error"); }
    }, activated ? 0 : 1800);
    const visibility = () => { if (document.hidden) modelRef.current?.pause(); else modelRef.current?.startDraw(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); modelRef.current?.destroy(); modelRef.current = null; };
  }, [showModel, compact, activated, attempt]);
  function greet() { setGreeted((value) => !value); if (motion && compact) setActivated(true); }
  return <aside className={`nest-companion${showModel ? "" : " is-resting"}`} aria-label={f.companion}>
    <button className="companion-close" type="button" onClick={onClose} aria-label={f.hideCompanion}><FiX aria-hidden="true" /></button>
    {(!compact || greeted || (showModel && status !== "ready")) && <div className="companion-bubble" role="status">
      {showModel && status === "error" ? f.modelError : showModel && status === "loading" ? f.loading : greeted ? f.companionTap : f.companionHello}
      {showModel && status === "error" && <button className="companion-retry" type="button" onClick={() => setAttempt((value) => value + 1)}>{f.retry}</button>}
    </div>}
    {showModel ? <button className="companion-stage" type="button" onClick={greet} aria-label={f.greeting}>
      <canvas key={`${attempt}-${compact}`} id="live2d" width={compact ? 280 : 420} height={compact ? 320 : 460} aria-hidden="true" />
    </button> : <button className="companion-static" type="button" onClick={greet} aria-label={motion ? f.showCompanion : f.greeting}>
      <img src="/assets/site-favicon-2026-09-29.png" alt="" width="104" height="104" />
    </button>}
  </aside>;
}
