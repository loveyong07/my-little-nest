import { useLayoutEffect, useRef } from "react";
import { bindSwipeSwitch } from "../../public/assets/swipe-switch.js";

export function useSwipeSwitch({ activeIndex, onChange, itemSelector, layoutKey = undefined, onPosition = undefined }) {
  const ref = useRef(null);
  const changeRef = useRef(onChange);
  const positionRef = useRef(onPosition);
  const wheelLockRef = useRef(0);
  useLayoutEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);
  useLayoutEffect(() => {
    positionRef.current = onPosition;
  }, [onPosition]);

  useLayoutEffect(() => {
    const control = ref.current;
    if (!control) return undefined;
    const { destroy } = bindSwipeSwitch({
      control,
      activeIndex,
      onChange: (index) => changeRef.current(index),
      itemSelector,
      wheelLock: wheelLockRef,
      onPosition: (position) => positionRef.current?.(position),
    });
    let frameOne = 0;
    let frameTwo = 0;
    if (!control.dataset.swipeAnimated) {
      frameOne = window.requestAnimationFrame(() => {
        frameTwo = window.requestAnimationFrame(() => {
          control.dataset.swipeAnimated = "true";
        });
      });
    }
    return () => {
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
      destroy();
    };
  }, [activeIndex, itemSelector, layoutKey]);

  return ref;
}
