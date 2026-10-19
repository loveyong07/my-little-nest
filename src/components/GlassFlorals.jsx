const BOUQUET = "/assets/glass-blue-bouquet-2026-10-19.webp";

export function GlassFlorals() {
  return (
    <div className="glass-florals" aria-hidden="true">
      {["top-left", "top-right", "bottom-left", "bottom-right"].map((position) => (
        <img
          key={position}
          className={"glass-bouquet glass-bouquet-" + position}
          src={BOUQUET}
          alt=""
          width="256"
          height="251"
          loading={position.startsWith("bottom") ? "lazy" : "eager"}
          decoding="async"
          fetchPriority="low"
          draggable="false"
        />
      ))}
    </div>
  );
}
