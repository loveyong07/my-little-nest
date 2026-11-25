// Modern browsers supporting ES modules all support WOFF2. Strip legacy WOFF
// fallback URLs from emitted CSS bundles and omit unused .woff asset slices so
// over a hundred redundant font files are not shipped in dist/client/assets.
const WOFF1_SOURCE = /,\s*url\([^)]+\.woff['"]?\)\s*format\(['"]?woff['"]?\)/g;

export function stripFontsourceWoff1(css) {
  return css.replace(WOFF1_SOURCE, "");
}

export function woff2OnlyFontsourcePlugin() {
  return {
    name: "little-nest-woff2-only-fontsource",
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== "asset") continue;
        if (fileName.endsWith(".woff")) {
          delete bundle[fileName];
        } else if (fileName.endsWith(".css")) {
          const source = typeof chunk.source === "string" ? chunk.source : Buffer.from(chunk.source).toString("utf8");
          chunk.source = stripFontsourceWoff1(source);
        }
      }
    },
  };
}
