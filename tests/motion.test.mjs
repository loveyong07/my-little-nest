import assert from "node:assert/strict";
import test from "node:test";
import { MOTION_OFF_CLASS, applySiteMotion, preferredScrollBehavior, siteMotionOff, systemPrefersReducedMotion } from "../src/utils/motion.js";

function fakeClassList() {
  const applied = new Set();
  return {
    toggle: (name, force) => { if (force) applied.add(name); else applied.delete(name); },
    contains: (name) => applied.has(name),
    has: (name) => applied.has(name),
    size: () => applied.size,
  };
}

function stubEnvironment({ reduced }) {
  const classList = fakeClassList();
  globalThis.document = { documentElement: { classList } };
  globalThis.window = { matchMedia: (query) => ({ matches: query.includes("prefers-reduced-motion") ? reduced : false, query }) };
  return classList;
}

test("the in-site switch and the system preference share one applied decision", () => {
  const classList = stubEnvironment({ reduced: false });
  assert.equal(MOTION_OFF_CLASS, "motion-off");
  assert.equal(systemPrefersReducedMotion(), false);

  applySiteMotion(true);
  assert.equal(siteMotionOff(), false);
  assert.equal(classList.size(), 0);
  assert.equal(preferredScrollBehavior(), "smooth");

  applySiteMotion(false);
  assert.equal(siteMotionOff(), true);
  assert.equal(classList.contains(MOTION_OFF_CLASS), true);
  assert.equal(preferredScrollBehavior(), "instant", "an explicit JS scroll must follow the site switch");
});

test("the system reduce setting wins even while the site switch is on", () => {
  stubEnvironment({ reduced: true });
  applySiteMotion(true);
  assert.equal(systemPrefersReducedMotion(), true);
  assert.equal(siteMotionOff(), false);
  assert.equal(preferredScrollBehavior(), "instant");
});

test("a missing browser environment never throws and reports motion as available", () => {
  delete globalThis.document;
  delete globalThis.window;
  assert.equal(systemPrefersReducedMotion(), false);
  assert.equal(siteMotionOff(), false);
  assert.equal(preferredScrollBehavior(), "smooth");
  assert.doesNotThrow(() => applySiteMotion(false));
});
