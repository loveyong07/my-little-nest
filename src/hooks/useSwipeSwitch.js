import { useLayoutEffect, useRef } from "react";
import { bindSwipeSwitch } from "../../public/assets/swipe-switch.js";

export function useSwipeSwitch({ activeIndex, onChange, itemSelector, layoutKey = undefined }) {
  const ref = useRef(null);
  const changeRef = useRef(onChange);
  const wheelLockRef = useRef(0);
  useLayoutEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  useLayoutEffect(() => {
    const { destroy } = bindSwipeSwitch({
      control: ref.current,
      activeIndex,
      onChange: (index) => changeRef.current(index),
      itemSelector,
      wheelLock: wheelLockRef,
    });
    return destroy;
  }, [activeIndex, itemSelector, layoutKey]);

  return ref;
}
