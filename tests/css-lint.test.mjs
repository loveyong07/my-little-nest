import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { checkCssSyntax } from "../scripts/check-css-syntax.mjs";

const BIOME_BIN = resolve("node_modules/@biomejs/biome/bin/biome");
const BIOME_CONFIG = resolve("biome.json");

function lintCss(source) {
  const dir = mkdtempSync(join(tmpdir(), "little-nest-css-lint-"));
  const file = join(dir, "src", "sample.css");
  mkdirSync(join(dir, "src"), { recursive: true });
  copyFileSync(BIOME_CONFIG, join(dir, "biome.json"));
  writeFileSync(file, source, { flag: "wx" });
  try {
    const result = spawnSync(
      process.execPath,
      [BIOME_BIN, "lint", "src/sample.css", "--error-on-warnings", "--colors=off"],
      {
        cwd: dir,
        encoding: "utf8",
      },
    );
    assert.ifError(result.error);
    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("CSS gate rejects refactor mistakes in selectors and declarations", () => {
  const result = lintCss(`
    .duplicate { color: red; }
    .duplicate { color: blue; }
    .properties { color: red; color: blue; }
    .custom { --surface: red; --surface: blue; }
    .override { margin-left: 1px; margin: 0; }
    .empty {}
    @keyframes bad { from { opacity: 0 !important; } }
  `);
  assert.equal(result.status, 1, result.output);
  for (const rule of [
    "noDuplicateSelectors",
    "noDuplicateProperties",
    "noDuplicateCustomProperties",
    "noShorthandPropertyOverrides",
    "noEmptyBlock",
    "noImportantInKeyframe",
  ])
    assert.ok(result.output.includes(rule), result.output);
});

test("CSS gate retains syntax errors for invalid colors and line comments", () => {
  for (const css of [".a { color: #12; }", ".a { color: #xyz; }", "// invalid\n.a { color: red; }"]) {
    const result = lintCss(css);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /parse/, result.output);
  }
});

test("CSS gate allows responsive overrides and image fallbacks without ignoring duplicate errors", () => {
  const source = `
    .scene {
      background-image: url("fallback.jpg");
      color: red;
    }
    @supports (background-image: image-set(url("") type("image/webp"))) {
      .scene { background-image: image-set("scene.webp" type("image/webp")); }
    }
    @media (max-width: 600px) { .scene { color: blue; } }
  `;
  const result = lintCss(source);
  assert.equal(result.status, 0, result.output);
  const broken = lintCss(source.replace("color: red;", "color: red; color: blue;"));
  assert.equal(broken.status, 1, broken.output);
  assert.match(broken.output, /noDuplicateProperties/);
});

test("CSS gate rejects unspaced math including nested expressions and variables", () => {
  for (const expression of [
    "calc(100% -10px)",
    "calc(100%+10px)",
    "calc(10px-2px)",
    "calc(10px+ 2px)",
    "calc(var(--gap)+10px)",
    "calc((100% -10px) / 2)",
    "min(100%, 10px+2px)",
  ]) {
    assert.ok(checkCssSyntax(`.a { width: ${expression}; }`).length > 0, expression);
  }
});

test("CSS gate preserves valid math and ignores lookalikes in text and variables", () => {
  assert.deepEqual(
    checkCssSyntax(`
    /* :before and calc(100%+10px) are examples, not styles. */
    .a::before {
      --gap: calc(10px + 2px);
      content: ":before calc(100%+10px)";
      width: calc((100% - 10px) / 2 + var(--gap));
      height: max(-10px, calc(1e-3 * 10px));
    }
  `),
    [],
  );
  assert.ok(checkCssSyntax(".a { --gap: calc(10px+2px); }").length > 0);
});

test("CSS gate requires double-colon pseudo-elements, including nested selectors", () => {
  for (const pseudo of ["before", "after", "first-line", "first-letter"]) {
    assert.equal(checkCssSyntax(`.a:${pseudo} { color: red; }`).length, 1);
    assert.deepEqual(checkCssSyntax(`.a::${pseudo} { color: red; }`), []);
  }
  assert.equal(checkCssSyntax(".a:is(:before) { color: red; }").length, 1);
});
