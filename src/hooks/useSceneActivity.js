import { useEffect, useState } from "react";

export function useSceneActivity(_page) {
  const [active, setActive] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setActive(!document.hidden);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return active;
}
