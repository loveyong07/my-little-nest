const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Wait for horizontal intent so taps and vertical scrolling work normally.
export function bindSwipeSwitch({
  control,
  activeIndex,
  onChange,
  itemSelector,
  wheelLock = { current: 0 },
  onPosition = undefined,
}) {
  const items = [...control.querySelectorAll(itemSelector)];
  let gesture = null;
  let pointerListenersActive = false;
  let escapeListenerActive = false;
  let selectionTimer;
  let settlingTimer;
  let wheelTimer;
  let suppressClick = false;

  function attachPointerListeners() {
    if (pointerListenersActive) return;
    pointerListenersActive = true;
    window.addEventListener("pointermove", pointerMove, { passive: false });
    window.addEventListener("pointerup", pointerUp, { passive: false });
    window.addEventListener("pointercancel", cancelPointer, { passive: false });
    window.addEventListener("blur", reset, { passive: true });
  }

  function detachPointerListeners() {
    if (!pointerListenersActive) return;
    pointerListenersActive = false;
    window.removeEventListener("pointermove", pointerMove);
    window.removeEventListener("pointerup", pointerUp);
    window.removeEventListener("pointercancel", cancelPointer);
    window.removeEventListener("blur", reset);
  }

  function attachEscapeListener() {
    if (escapeListenerActive) return;
    escapeListenerActive = true;
    window.addEventListener("keydown", keyDown, { passive: true });
  }

  function detachEscapeListener() {
    if (!escapeListenerActive) return;
    escapeListenerActive = false;
    window.removeEventListener("keydown", keyDown);
  }

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
    onPosition?.(bounded);
    for (const key of ["x", "y", "width", "height"]) {
      const edge = key === (vertical ? "y" : "x") ? resistance : 0;
      control.style.setProperty(`--switch-${key}`, `${from[key] + (to[key] - from[key]) * fraction + edge}px`);
    }
    control.dataset.swipeReady = "true";
  }

  function clearGesture() {
    clearTimeout(selectionTimer);
    clearTimeout(settlingTimer);
    clearTimeout(wheelTimer);
    detachPointerListeners();
    detachEscapeListener();
    const pointerId = gesture?.pointerId;
    gesture = null;
    delete control.dataset.swiping;
    delete control.dataset.swipeSettling;
    control.style.setProperty("--swipe-offset", "0px");
    if (pointerId !== undefined && control.hasPointerCapture?.(pointerId)) control.releasePointerCapture(pointerId);
  }

  function reset() {
    clearGesture();
    paint(activeIndex);
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
    attachEscapeListener();
    if (pointerId !== undefined) attachPointerListeners();
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
    select(next, current.boxes);
  }

  function select(next, boxes = measure()) {
    reset();
    paint(next, boxes);
    control.dataset.swipeSettling = "true";
    settlingTimer = setTimeout(() => delete control.dataset.swipeSettling, 320);
    // Let the settling motion be visible before a route replaces its header.
    const settleTime =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches || control.closest(".motion-off") ? 0 : 160;
    if (next !== activeIndex) {
      attachEscapeListener();
      selectionTimer = setTimeout(() => {
        detachEscapeListener();
        onChange(next);
      }, settleTime);
    }
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

  function lostPointerCapture(event) {
    // Touch starts with capture on the child link, then transfers it to the switch.
    if (event.target === control) cancelPointer(event);
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
    if (performance.now() < wheelLock.current) {
      wheelLock.current = performance.now() + 180;
      return;
    }
    if (!gesture) start(0, 0, event.timeStamp);
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? control.clientWidth : 1;
    move(gesture.lastX + event.deltaX * scale, event.timeStamp);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      finish(performance.now());
      wheelLock.current = performance.now() + 260;
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
    lostpointercapture: lostPointerCapture,
    wheel,
    dragstart: preventNativeDrag,
  };
  for (const [name, handler] of Object.entries(handlers)) control.addEventListener(name, handler, { passive: false });
  control.addEventListener("click", click, true);
  const observer = new ResizeObserver(() => {
    if (!gesture) paint(activeIndex);
  });
  observer.observe(control);
  for (const item of items) observer.observe(item);
  paint(activeIndex);
  function destroy() {
    clearGesture();
    observer.disconnect();
    control.removeEventListener("click", click, true);
    for (const [name, handler] of Object.entries(handlers)) control.removeEventListener(name, handler);
  }

  return { select, destroy };
}
