import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const client = fileURLToPath(new URL("../dist/client/", import.meta.url));
test("built fonts remain same-origin files compatible with production font-src self", () => {
  let fontCount = 0;
  for (const name of readdirSync(path.join(client, "assets")).filter(name => name.endsWith(".css"))) {
    const css = readFileSync(path.join(client, "assets", name), "utf8");
    for (const face of css.matchAll(/@font-face\s*\{[^}]+\}/g)) {
      for (const match of face[0].matchAll(/url\(([^)]+)\)/g)) {
        const url = match[1].replace(/["']/g, "").trim();
        assert.ok(url.startsWith("/assets/"), `Font is not a self-hosted file: ${url.slice(0,80)}`);
        assert.ok(existsSync(path.join(client, url)), `Missing font: ${url}`);
        fontCount++;
      }
    }
  }
  assert.ok(fontCount > 0, "Check the actual built CSS, not an empty asset folder");
});

test("removed companion assets are not shipped", () => {
  assert.equal(existsSync(path.join(client, "assets/live2d")), false);
  assert.ok(existsSync(path.join(client, "assets/audio/air-tori-no-uta-piano-uno.mp3")));
});
