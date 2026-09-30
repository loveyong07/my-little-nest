import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pagePaths, resolvePage } from "../src/routes/site-route.js";
import { scenePreloads } from "../src/routes/scene-assets.js";

export function withScenePreloads(html, page) {
  const links = scenePreloads(page).map(({ href, media }) =>
    `<link data-scene-preload rel="preload" as="image" type="image/webp" href="${href}" fetchpriority="high"${media ? ` media="${media}"` : ""} />`).join("\n    ");
  return html.replace(/\s*<link\b[^>]*data-scene-preload[^>]*>/g, "")
    .replace("</head>", `    ${links}\n  </head>`);
}

// Separate shells discover only the current scene before JavaScript starts.
// The React entry and routing remain shared across all pages.
export function scenePreloadPlugin() {
  let outputDirectory;
  let building = false;
  return {
    name: "little-nest-scene-preloads",
    configResolved(config) { outputDirectory = path.resolve(config.root, config.build.outDir); building = config.command === "build"; },
    transformIndexHtml(html, context) {
      const pathname = new URL(context.originalUrl ?? context.path, "http://localhost").pathname;
      return withScenePreloads(html, resolvePage(pathname));
    },
    closeBundle() {
      if (!building) return;
      const html = readFileSync(path.join(outputDirectory, "index.html"), "utf8");
      const directory = path.join(outputDirectory, "route-shells");
      mkdirSync(directory, { recursive: true });
      for (const page of Object.keys(pagePaths).filter((page) => page !== "home")) {
        writeFileSync(path.join(directory, `${page}.html`), withScenePreloads(html, page));
      }
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        const url = new URL(request.url, "http://localhost");
        const page = resolvePage(url.pathname);
        if (page !== "home") request.url = `/route-shells/${page}.html${url.search}`;
        next();
      });
    },
  };
}
