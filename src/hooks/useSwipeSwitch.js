import { useLayoutEffect, useRef } from "react";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// The whole control is a gesture surface. A press still belongs to the original
// link/button until horizontal intent is clear, so taps and page scrolling work.
export function useSwipeSwitch({ activeIndex, onChange, itemSelector, layoutKey = undefined }) {
  const ref = useRef(null);
  const changeRef = useRef(onChange);
  const wheelLockRef = useRef(0);
  useLayoutEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  useLayoutEffect(() => {
    const control = ref.current;
    const items = [...control.querySelectorAll(itemSelector)];
    let gesture = null;
    let selectionTimer;
    let settlingTimer;
    let wheelTimer;
    let suppressClick = false;

    function measure() {
      return items.map((item) => ({
        x: item.offsetLeft,
        y: item.offsetTop,
        width: item.offsetWidth,
        height: item.offsetHeight,
      }));
    }

    function paint(position, boxes = measure()) {
      const bounded = clamp(position, 0, items.length - 1);
      const from = boxes[Math.floor(bounded)];
      const to = boxes[Math.ceil(bounded)];
      if (!from?.width || !to?.width) return;
      const fraction = bounded % 1;
      const vertical = boxes[0].y !== boxes.at(-1).y;
      const resistance = (position - bounded) * 12;
      for (const key of ["x", "y", "width", "height"]) {
        const edge = key === (vertical ? "y" : "x") ? resistance : 0;
        control.style.setProperty(`--switch-${key}`, `${from[key] + (to[key] - from[key]) * fraction + edge}px`);
      }
      control.dataset.swipeReady = "true";
    }

    function reset() {
      clearTimeout(selectionTimer);
      clearTimeout(settlingTimer);
      clearTimeout(wheelTimer);
      const pointerId = gesture?.pointerId;
      gesture = null;
      delete control.dataset.swiping;
      delete control.dataset.swipeSettling;
      control.style.setProperty("--swipe-offset", "0px");
      paint(activeIndex);
      if (pointerId !== undefined && control.hasPointerCapture?.(pointerId)) control.releasePointerCapture(pointerId);
    }

    function start(x, y, time, pointerId) {
      reset();
      const boxes = measure();
      const horizontal = boxes[0].y === boxes.at(-1).y;
      const step = horizontal ? (boxes.at(-1).x - boxes[0].x) / (items.length - 1) : control.clientWidth / items.length;
      gesture = {
        pointerId,
        x,
        y,
        lastX: x,
        time,
        velocity: 0,
        delta: 0,
        step: Math.max(32, step),
        boxes,
        dragging: false,
      };
    }

    function move(x, time) {
      const current = gesture;
      current.velocity = (x - current.lastX) / Math.max(1, time - current.time);
      current.lastX = x;
      current.time = time;
      current.delta = x - current.x;
      current.dragging = true;
      control.dataset.swiping = "true";
      control.style.setProperty("--swipe-offset", `${clamp(current.delta * 0.08, -9, 9)}px`);
      paint(activeIndex + current.delta / current.step, current.boxes);
    }

    function finish(time) {
      const current = gesture;
      if (!current?.dragging) {
        reset();
        return;
      }
      const velocity = time - current.time < 100 ? current.velocity : 0;
      const distance = Math.abs(current.delta);
      const committed = distance >= Math.min(38, current.step * 0.28) || (distance >= 14 && Math.abs(velocity) > 0.45);
      const direction = Math.sign(current.delta);
      const projected = activeIndex + current.delta / current.step + clamp((velocity * 45) / current.step, -0.25, 0.25);
      const next = committed
        ? clamp(
            direction > 0
              ? Math.max(activeIndex + 1, Math.round(projected))
              : Math.min(activeIndex - 1, Math.round(projected)),
            0,
            items.length - 1,
          )
        : activeIndex;
      reset();
      paint(next, current.boxes);
      control.dataset.swipeSettling = "true";
      settlingTimer = setTimeout(() => delete control.dataset.swipeSettling, 320);
      // Let the settling motion be visible before a route replaces its header.
      const settleTime =
        window.matchMedia("(prefers-reduced-motion: reduce)").matches || control.closest(".motion-off") ? 0 : 160;
      if (next !== activeIndex) selectionTimer = setTimeout(() => changeRef.current(next), settleTime);
    }

    function pointerDown(event) {
      if (event.isPrimary === false || event.button !== 0 || gesture) return;
      suppressClick = false;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      start(event.clientX, event.clientY, event.timeStamp, event.pointerId);
    }

    function pointerMove(event) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (!gesture.dragging) {
        if (Math.abs(dy) > Math.max(8, Math.abs(dx) * 1.15)) return reset();
        if (Math.abs(dx) < 8) return;
        control.setPointerCapture?.(event.pointerId);
      }
      event.preventDefault();
      suppressClick = true;
      move(event.clientX, event.timeStamp);
    }

    function pointerUp(event) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      finish(event.timeStamp);
    }

    function cancelPointer(event) {
      if (gesture && event.pointerId === gesture.pointerId) reset();
    }

    function click(event) {
      if (event.detail !== 0 && suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      reset();
    }

    function wheel(event) {
      // Two-finger horizontal trackpad gestures, without consuming page scroll.
      if (
        Math.abs(event.deltaX) <= Math.max(1, Math.abs(event.deltaY) * 1.15) ||
        event.ctrlKey ||
        gesture?.pointerId !== undefined
      )
        return;
      event.preventDefault();
      if (performance.now() < wheelLockRef.current) {
        wheelLockRef.current = performance.now() + 180;
        return;
      }
      if (!gesture) start(0, 0, event.timeStamp);
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? control.clientWidth : 1;
      move(gesture.lastX + event.deltaX * scale, event.timeStamp);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        finish(performance.now());
        wheelLockRef.current = performance.now() + 260;
      }, 110);
    }

    function preventNativeDrag(event) {
      event.preventDefault();
    }

    function keyDown(event) {
      if (event.key === "Escape") reset();
    }

    const handlers = {
      pointerdown: pointerDown,
      lostpointercapture: cancelPointer,
      wheel,
      dragstart: preventNativeDrag,
    };
    const windowHandlers = {
      pointermove: pointerMove,
      pointerup: pointerUp,
      pointercancel: cancelPointer,
      keydown: keyDown,
      blur: reset,
    };
    for (const [name, handler] of Object.entries(handlers)) control.addEventListener(name, handler, { passive: false });
    for (const [name, handler] of Object.entries(windowHandlers))
      window.addEventListener(name, handler, { passive: false });
    control.addEventListener("click", click, true);
    const observer = new ResizeObserver(() => {
      if (!gesture) paint(activeIndex);
    });
    observer.observe(control);
    for (const item of items) observer.observe(item);
    paint(activeIndex);
    return () => {
      reset();
      observer.disconnect();
      control.removeEventListener("click", click, true);
      for (const [name, handler] of Object.entries(handlers)) control.removeEventListener(name, handler);
      for (const [name, handler] of Object.entries(windowHandlers)) window.removeEventListener(name, handler);
    };
  }, [activeIndex, itemSelector, layoutKey]);

  return ref;
}
