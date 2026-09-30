import { HiOutlineSparkles } from "react-icons/hi2";

export function ClickSparkles({ sparkle }) {
  if (!sparkle) return null;
  return <span key={sparkle.id} className="click-sparkle" style={{ left: sparkle.x, top: sparkle.y }} aria-hidden="true">
    <HiOutlineSparkles className="click-sparkle__main" />
    <HiOutlineSparkles className="click-sparkle__small click-sparkle__small--one" />
    <HiOutlineSparkles className="click-sparkle__small click-sparkle__small--two" />
  </span>;
}
