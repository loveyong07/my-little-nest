import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pagePaths, resolvePage } from "../src/routes/site-route.js";
import { scenePreloads } from "../src/routes/scene-assets.js";
import { siteMetadata } from "../src/routes/site-metadata.js";
import { ROUTE_SHELLS } from "../shared/hosting-policy.mjs";

function serveLegalPage(request, _response, next) {
  const url = new URL(request.url, "http://localhost");
  const destination = ROUTE_SHELLS[url.pathname];
  if (destination?.startsWith("/legal/")) request.url = destination + url.search;
  next();
}

export function withRouteMetadata(html, page) {
  const meta = siteMetadata(page);
  const escape = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return html
    .replace(/<meta\b[^>]*>/g, (tag) => {
      const value = /(?:name|property)="(?:description|og:description|twitter:description)"/.test(tag)
        ? meta.description
        : /property="og:url"/.test(tag)
          ? meta.url
          : /name="robots"/.test(tag)
            ? meta.robots
            : null;
      return value === null ? tag : tag.replace(/content="[^"]*"/, `content="${escape(value)}"`);
    })
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/, `<link rel="canonical" href="${meta.url}" />`);
}

export function withScenePreloads(html, page) {
  const links = scenePreloads(page)
    .map(
      ({ href, media }) =>
        `<link data-scene-preload rel="preload" as="image" type="image/webp" href="${href}" fetchpriority="high"${media ? ` media="${media}"` : ""} />`,
    )
    .join("\n    ");
  return html.replace(/\s*<link\b[^>]*data-scene-preload[^>]*>/g, "").replace("</head>", `    ${links}\n  </head>`);
}

// Fonts used by the first paint are referenced from CSS, so the browser would
// otherwise wait for the stylesheet before requesting them. Preloading them in
// HTML lets the download start alongside the stylesheet.
// Quicksand's file name is hashed at build time, so it is looked up in the bundle.
export function withFontPreloads(html, bundle = {}) {
  const quicksand = Object.keys(bundle).find((name) => /^assets\/quicksand-latin-700-normal-[\w-]+\.woff2$/.test(name));
  const hrefs = [quicksand && `/${quicksand}`, "/assets/fonts/nest-ui-2026-09-30.woff"].filter(Boolean);
  const links = hrefs
    .map(
      (href) =>
        `<link data-font-preload rel="preload" as="font" type="${href.endsWith(".woff2") ? "font/woff2" : "font/woff"}" href="${href}" crossorigin />`,
    )
    .join("\n    ");
  return html.replace(/\s*<link\b[^>]*data-font-preload[^>]*>/g, "").replace("</head>", `    ${links}\n  </head>`);
}

// Separate shells discover only the current scene before JavaScript starts.
// The React entry and routing remain shared across all pages.
export function scenePreloadPlugin() {
  let outputDirectory;
  let building = false;
  return {
    name: "little-nest-scene-preloads",
    configResolved(config) {
      outputDirectory = path.resolve(config.root, config.build.outDir);
      building = config.command === "build";
    },
    transformIndexHtml(html, context) {
      const pathname = new URL(context.originalUrl ?? context.path, "http://localhost").pathname;
      const page = resolvePage(pathname);
      return withFontPreloads(withScenePreloads(withRouteMetadata(html, page), page), context.bundle);
    },
    closeBundle() {
      if (!building) return;
      const html = readFileSync(path.join(outputDirectory, "index.html"), "utf8");
      const directory = path.join(outputDirectory, "route-shells");
      mkdirSync(directory, { recursive: true });
      for (const page of Object.keys(pagePaths).filter((page) => page !== "home")) {
        writeFileSync(path.join(directory, `${page}.html`), withRouteMetadata(withScenePreloads(html, page), page));
      }
    },
    configureServer(server) {
      server.middlewares.use(serveLegalPage);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveLegalPage);
      server.middlewares.use((request, _response, next) => {
        const url = new URL(request.url, "http://localhost");
        const page = resolvePage(url.pathname);
        if (page !== "home") request.url = `/route-shells/${page}.html${url.search}`;
        next();
      });
    },
  };
}
