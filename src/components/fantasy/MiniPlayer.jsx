import { useEffect, useRef, useState } from "react";
import { FaMusic, FaPause, FaPlay } from "react-icons/fa6";
import { createNestAudio } from "../../utils/nest-audio.js";

export function MiniPlayer({ f }) {
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [volume, setVolume] = useState(.6);
  const engine = useRef(null);
  const alive = useRef(true);
  const requested = useRef(false);
  useEffect(() => {
    alive.current = true;
    // Pause when the tab hides or a post video starts; music never competes with it.
    const pause = (event) => {
      if (event.type === "visibilitychange" && !document.hidden) return;
      if (event.type === "play" && !(event.target instanceof HTMLVideoElement)) return;
      requested.current = false;
      void engine.current?.pause(); setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause); document.addEventListener("play", pause, true);
    return () => { alive.current = false; requested.current = false; engine.current?.close(); engine.current = null;
      document.removeEventListener("visibilitychange", pause); document.removeEventListener("play", pause, true); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let audio;
    try {
      audio = createNestAudio(window.Audio);
      engine.current = audio;
      audio.volume(.6);
      void audio.play(true).then((started) => {
        if (!cancelled && alive.current) {
          if (document.hidden) { void audio.pause(); return; }
          setPlaying(started);
        }
      }).catch(() => { /* Autoplay may be blocked; keep the play button available. */ });
    } catch { /* Manual playback can report an unsupported audio environment. */ }
    return () => { cancelled = true; };
  }, []);
  async function toggle() {
    setBusy(true); setError(false);
    try {
      if (!engine.current) engine.current = createNestAudio(window.Audio);
      if (playing) { requested.current = false; await engine.current.pause(); setPlaying(false); }
      else {
        requested.current = true; engine.current.volume(volume); await engine.current.play();
        if (!alive.current || !requested.current || document.hidden) { await engine.current?.pause(); return; }
        setPlaying(true);
      }
    } catch { if (alive.current) { setError(true); setPlaying(false); } }
    finally { if (alive.current) setBusy(false); }
  }
  return <div className={`mini-player${playing ? " is-playing" : ""}`}>
    <span className="player-disc" aria-hidden="true"><FaMusic /></span>
    <span className="player-copy"><strong>{f.music}</strong><small className={error ? "player-error" : undefined} role={error ? "status" : undefined}>{error ? f.audioError : f.musicNote}</small></span>
    <button type="button" disabled={busy} onClick={toggle} aria-label={playing ? f.pause : f.play} title={playing ? f.pause : f.play}>{playing ? <FaPause /> : <FaPlay />}</button>
    <input type="range" min="0" max=".6" step=".02" value={volume} aria-label={f.volume} onChange={(event) => {
      const value = Number(event.target.value); setVolume(value); engine.current?.volume(value);
    }} />
  </div>;
}
