import { FaWandMagicSparkles } from "react-icons/fa6";
import { fantasyCopy } from "../../constants/fantasy.js";
import { SakuraCanvas } from "./SakuraCanvas.jsx";
import { MiniPlayer } from "./MiniPlayer.jsx";
import "../../styles/fantasy-extras.css";

export default function FantasyExtras({ language, page, preferences }) {
  const f = fantasyCopy[language];
  const { effects, setEffects, motion } = preferences;
  return <>
    {motion && <SakuraCanvas snow={page === "posts"} />}
    <aside className="nest-dock" aria-label={f.settings}>
      <MiniPlayer f={f} />
      <button className="dock-toggle" type="button" aria-label={effects ? f.effectsOn : f.effectsOff}
        title={effects ? f.effectsOn : f.effectsOff} aria-pressed={effects} onClick={() => setEffects(!effects)}><FaWandMagicSparkles aria-hidden="true" /></button>
    </aside>
  </>;
}
