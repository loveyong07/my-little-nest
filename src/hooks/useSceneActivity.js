import { useEffect, useState } from "react";

export function useSceneActivity(page) {
  const [active, setActive] = useState(() => !document.hidden);
  useEffect(() => {
    let inView = true;
    const update = () => setActive(inView && !document.hidden);
    const observer = page === "home" && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update(); }) : null;
    const scene = document.querySelector(".home-floating-elements");
    if (scene) observer?.observe(scene);
    document.addEventListener("visibilitychange", update);
    update();
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, [page]);
  return active;
}
