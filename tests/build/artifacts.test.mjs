// Build-artifact checks. These read dist/, so they only pass after `npm run build`
// (or `npm run check`, which builds first and is what CI and deploys run).
import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const client = fileURLToPath(new URL("../../dist/client/", import.meta.url));
const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
const vercelConfig = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));

test("the build-artifact checks have a produced build to inspect", () => {
  assert.ok(existsSync(client), `Missing ${client}. Run \`npm run build\` before \`npm run test:build\`; these checks never skip silently.`);
  assert.ok(existsSync(path.join(client, "index.html")), "The build did not leave dist/client/index.html");
});

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

test("production rewrites point to built shells sharing the current React entry", async () => {
  const home = await readFile(path.join(client, "index.html"), "utf8");
  const entry = home.match(/<script[^>]+src="([^"]+)"/)[1];
  for (const page of ["posts", "contact"]) {
    const rewrite = vercelConfig.rewrites.find(({ source }) => source === `/${page}`);
    assert.equal(rewrite.destination, `/route-shells/${page}.html`);
    assert.equal(vercelConfig.rewrites.find(({ source }) => source === `/${page}/`).destination, `/route-shells/${page}.html`);
    const html = await readFile(path.join(client, "route-shells", `${page}.html`), "utf8");
    assert.ok(html.includes(entry));
    assert.equal((html.match(/data-scene-preload/g) ?? []).length, 1);
    assert.doesNotMatch(html, /hero-sky-(?:mobile|alt)/);
  }
});

test("hashed build assets are shipped with the names the cache rule expects", async () => {
  const files = await readdir(path.join(client, "assets"));
  assert.ok(files.some((name) => /-[\w-]{8}\.js$/.test(name)), "No hashed JS entry was emitted");
  assert.ok(files.some((name) => /-[\w-]{8}\.css$/.test(name)), "No hashed CSS entry was emitted");
});

test("emits the files required by Sites packaging", async () => {
  await access(path.join(client, "index.html"));
  await access(path.join(dist, "server/index.js"));
  await access(path.join(dist, "server/x-feed-plugin.mjs"));
  await access(path.join(dist, ".openai/hosting.json"));
});
