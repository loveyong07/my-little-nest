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

test("the shipped companion has a complete local model graph without automatic audio", () => {
  const folder = path.join(client, "assets/live2d/shizuku");
  const model = JSON.parse(readFileSync(path.join(folder, "shizuku.model.json"), "utf8"));
  const motions = Object.values(model.motions).flat();
  const refs = [model.model, model.physics, model.pose, ...model.textures,
    ...model.expressions.map(item => item.file), ...motions.map(item => item.file)];
  for (const ref of refs) {
    const file = path.resolve(folder, ref);
    assert.ok(file.startsWith(folder + path.sep), `Model path must stay local: ${ref}`);
    assert.ok(existsSync(file), `Missing model asset: ${ref}`);
  }
  assert.ok(motions.every(motion => !motion.sound));
  assert.ok(existsSync(path.join(client, "assets/live2d/live2d-core-1.0.1.min.js")));
});
