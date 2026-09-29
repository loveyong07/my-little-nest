import assert from "node:assert/strict";
import test from "node:test";
import { LANGUAGE_EVENT } from "../src/hooks/useI18n.js";

test("LANGUAGE_EVENT is defined and dispatched as expected", () => {
  assert.equal(LANGUAGE_EVENT, "site-language-change");

  let received = null;
  const listener = (event) => {
    received = event.detail;
  };

  globalThis.window = {
    addEventListener: (type, fn) => {
      if (type === LANGUAGE_EVENT) globalThis._listener = fn;
    },
    removeEventListener: () => {},
    dispatchEvent: (event) => {
      globalThis._listener?.(event);
    },
  };

  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };

  globalThis.window.addEventListener(LANGUAGE_EVENT, listener);
  globalThis.window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: "ja" }));
  assert.equal(received, "ja");
});
