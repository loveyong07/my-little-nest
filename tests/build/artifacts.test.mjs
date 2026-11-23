// Build-artifact checks. These read dist/, so they only pass after `npm run build`
// (or `npm run check`, which builds first and is what CI and deploys run).
import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SECURITY_HEADERS, ROUTE_SHELLS } from "../../shared/hosting-policy.mjs";

const client = fileURLToPath(new URL("../../dist/client/", import.meta.url));
const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
const vercelConfig = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));

test("the build-artifact checks have a produced build to inspect", () => {
  assert.ok(
    existsSync(client),
    `Missing ${client}. Run \`npm run build\` before \`npm run test:build\`; these checks never skip silently.`,
  );
  assert.ok(existsSync(path.join(client, "index.html")), "The build did not leave dist/client/index.html");
});

test("built fonts remain same-origin files compatible with production font-src self", () => {
  let fontCount = 0;
  for (const name of readdirSync(path.join(client, "assets")).filter((name) => name.endsWith(".css"))) {
    const css = readFileSync(path.join(client, "assets", name), "utf8");
    for (const face of css.matchAll(/@font-face\s*\{[^}]+\}/g)) {
      for (const match of face[0].matchAll(/url\(([^)]+)\)/g)) {
        const url = match[1].replace(/["']/g, "").trim();
        assert.ok(url.startsWith("/assets/"), `Font is not a self-hosted file: ${url.slice(0, 80)}`);
        assert.ok(existsSync(path.join(client, url)), `Missing font: ${url}`);
        fontCount++;
      }
    }
  }
  assert.ok(fontCount > 0, "Check the actual built CSS, not an empty asset folder");
});

test("removed companion and music assets are not shipped", () => {
  assert.equal(existsSync(path.join(client, "assets/live2d")), false);
  assert.equal(existsSync(path.join(client, "assets/audio")), false);
});

test("public artifacts exclude source maps, server code, credentials and environment files", () => {
  const secrets = [
    process.env.X_BEARER_TOKEN,
    process.env.X_MEDIA_SIGNING_SECRET,
    process.env.X_MEDIA_SIGNING_SECRET_PREVIOUS,
    process.env.BLOB_READ_WRITE_TOKEN,
    process.env.VERCEL_OIDC_TOKEN,
    process.env.TOUCHGAL_API_TOKEN,
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
  ].filter(Boolean);
  let checked = 0;
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const relative = path.relative(client, file);
      assert.doesNotMatch(entry.name, /^(?:\.env(?:\.|$)|\.git$)|\.(?:map|pem|key)$/i, relative);
      assert.doesNotMatch(relative, /^(?:server|api|node_modules)(?:[\\/]|$)/, relative);
      if (entry.isDirectory()) inspect(file);
      else if (/\.(?:js|mjs|html|css|json|txt|svg)$/i.test(entry.name)) {
        checked++;
        const code = readFileSync(file, "utf8");
        assert.ok(!/sourceMappingURL\s*=/.test(code), `Source map reference in ${relative}`);
        assert.ok(
          !/X_BEARER_TOKEN|X_MEDIA_SIGNING_SECRET|BLOB_READ_WRITE_TOKEN|VERCEL_OIDC_TOKEN|TOUCHGAL_API_TOKEN|GOOGLE_DRIVE_(?:CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN)|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(
            code,
          ),
          `Server-only material in ${relative}`,
        );
        // Never include a credential or artifact contents in a failure message.
        for (const secret of secrets) assert.ok(!code.includes(secret), `Server credential leaked into ${relative}`);
      }
    }
  }
  inspect(client);
  assert.ok(checked > 0, "Inspect the produced public artifacts");
});

test("production rewrites point to built shells sharing the current React entry", async () => {
  const home = await readFile(path.join(client, "index.html"), "utf8");
  const entry = home.match(/<script[^>]+src="([^"]+)"/)[1];
  for (const page of ["posts", "contact"]) {
    const rewrite = vercelConfig.rewrites.find(({ source }) => source === `/${page}`);
    assert.equal(rewrite.destination, `/route-shells/${page}.html`);
    assert.equal(
      vercelConfig.rewrites.find(({ source }) => source === `/${page}/`).destination,
      `/route-shells/${page}.html`,
    );
    const html = await readFile(path.join(client, "route-shells", `${page}.html`), "utf8");
    assert.ok(html.includes(entry));
    assert.equal((html.match(/data-scene-preload/g) ?? []).length, 1);
    assert.doesNotMatch(html, /hero-sky-(?:mobile|alt)/);
  }
});

test("hashed build assets are shipped with the names the cache rule expects", async () => {
  const files = await readdir(path.join(client, "assets"));
  assert.ok(
    files.some((name) => /-[\w-]{8}\.js$/.test(name)),
    "No hashed JS entry was emitted",
  );
  assert.ok(
    files.some((name) => /-[\w-]{8}\.css$/.test(name)),
    "No hashed CSS entry was emitted",
  );
});

test("emits the files required by Sites packaging", async () => {
  await access(path.join(client, "index.html"));
  await access(path.join(dist, "server/index.js"));
  await access(path.join(dist, "server/api-handler.mjs"));
  await access(path.join(dist, ".openai/hosting.json"));
  assert.equal(
    existsSync(path.join(dist, "server/vite-api-plugin.mjs")),
    false,
    "the dev-server plugin is not shipped",
  );
});

test("every relative import in the Sites worker bundle resolves to a shipped file", () => {
  let imports = 0;
  for (const directory of ["server", "shared"]) {
    for (const name of readdirSync(path.join(dist, directory))) {
      const file = path.join(dist, directory, name);
      const code = readFileSync(file, "utf8");
      for (const [, target] of code.matchAll(/(?:from|import)\s*["'](\.{1,2}\/[^"']+)["']/g)) {
        imports++;
        assert.ok(
          existsSync(path.resolve(path.dirname(file), target)),
          `${directory}/${name} imports missing ${target}`,
        );
      }
    }
  }
  assert.ok(imports > 0, "Check the packaged worker, not an empty folder");
});

test("Sites module outputs match current sources without obsolete or Vercel-only modules", () => {
  const vercelOnly = new Set([
    "article-cache.mjs",
    "drive-video-archive.mjs",
    "google-drive.mjs",
    "photo-cache.mjs",
    "photo-cache-warm.mjs",
    "video-cache.mjs",
    "x-feed-snapshot.mjs",
  ]);
  for (const directory of ["server", "shared"]) {
    const source = fileURLToPath(new URL(`../../${directory}/`, import.meta.url));
    const expected = readdirSync(source).filter(
      (name) =>
        name.endsWith(".mjs") && !(directory === "server" && (name.startsWith("vite-") || vercelOnly.has(name))),
    );
    const actual = readdirSync(path.join(dist, directory)).filter((name) => name.endsWith(".mjs"));
    assert.deepEqual(actual.sort(), expected.sort(), directory);
  }
});

test("Vercel and Sites share identical security headers and route shells", () => {
  const globalHeaders = vercelConfig.headers.find(({ source }) => source === "/(.*)")?.headers ?? [];
  const vercelHeaderMap = Object.fromEntries(globalHeaders.map(({ key, value }) => [key, value]));
  assert.deepEqual(vercelHeaderMap, SECURITY_HEADERS);
  for (const [source, destination] of Object.entries(ROUTE_SHELLS)) {
    assert.equal(vercelConfig.rewrites.find((rule) => rule.source === source)?.destination, destination, source);
  }
});

test("public legal pages include all translations without running the app", async () => {
  const home = await readFile(path.join(client, "index.html"), "utf8");
  for (const name of ["privacy", "terms"]) {
    const html = await readFile(path.join(client, ROUTE_SHELLS[`/${name}`]), "utf8");
    assert.ok(html.includes(`rel="canonical" href="https://loveyong07.top/${name}"`));
    assert.ok(home.includes(`href="/${name}"`));
    for (const [id, language] of [
      ["zh", "zh-CN"],
      ["ja", "ja"],
      ["en", "en"],
    ]) {
      assert.ok(html.includes(`id="${id}" lang="${language}"`));
    }
    const navigationScript = '<script type="module" src="/legal/legal-navigation.js"></script>';
    assert.ok(html.includes(navigationScript));
    assert.doesNotMatch(html.replace(navigationScript, ""), /<script\b/);
  }
});
