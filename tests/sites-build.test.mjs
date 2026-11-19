import assert from "node:assert/strict";
import test from "node:test";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("repackaging Sites removes renamed and deleted modules without changing client files", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const fixture = mkdtempSync(path.join(tmpdir(), "little-nest-sites-build-"));
  try {
    for (const directory of ["scripts", "worker", "server", "shared", ".openai", "dist/client"]) {
      mkdirSync(path.join(fixture, directory), { recursive: true });
    }
    copyFileSync(
      path.join(root, "scripts/prepare-sites-build.mjs"),
      path.join(fixture, "scripts/prepare-sites-build.mjs"),
    );
    for (const [file, text] of Object.entries({
      "worker/index.js": "export default {};",
      "server/old.mjs": "export const old = true;",
      "server/vite-only.mjs": "export default {};",
      "shared/old.mjs": "export default {};",
      ".openai/hosting.json": "{}",
      "dist/client/index.html": "client must remain unchanged",
    }))
      writeFileSync(path.join(fixture, file), text);
    const build = () => execFileSync(process.execPath, [path.join(fixture, "scripts/prepare-sites-build.mjs")]);
    build();
    unlinkSync(path.join(fixture, "server/old.mjs"));
    unlinkSync(path.join(fixture, "shared/old.mjs"));
    writeFileSync(path.join(fixture, "server/current.mjs"), "export const current = true;");
    writeFileSync(path.join(fixture, "dist/server/notes.txt"), "preserve unrelated output");
    build();
    build();
    assert.deepEqual(readdirSync(path.join(fixture, "dist/server")).sort(), ["current.mjs", "index.js", "notes.txt"]);
    assert.deepEqual(readdirSync(path.join(fixture, "dist/shared")), []);
    assert.equal(readFileSync(path.join(fixture, "dist/client/index.html"), "utf8"), "client must remain unchanged");
    assert.equal(readFileSync(path.join(fixture, "dist/server/current.mjs"), "utf8"), "export const current = true;");
    assert.equal(readFileSync(path.join(fixture, "dist/server/notes.txt"), "utf8"), "preserve unrelated output");
  } finally {
    assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
    assert.ok(path.basename(fixture).startsWith("little-nest-sites-build-"));
    rmSync(fixture, { recursive: true });
  }
});
