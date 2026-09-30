import { mkdirSync, cpSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Vendor versioned assets at build/dev preparation time, never from a remote CDN
// in the visitor's browser. The X proxy remains an X-only image proxy.
const root = path.resolve(import.meta.dirname, "..");
const destination = path.join(root, "public/assets/live2d");
const widget = path.join(root, "node_modules/live2d-widgets");
const model = path.join(root, "node_modules/live2d-widget-model-shizuku/assets");
mkdirSync(destination, { recursive: true });
copyFileSync(path.join(widget, "dist/live2d.min.js"), path.join(destination, "live2d-core-1.0.1.min.js"));
copyFileSync(path.join(widget, "LICENSE"), path.join(destination, "LICENSE-widget.txt"));
const modelDestination = path.join(destination, "shizuku");
mkdirSync(modelDestination, { recursive: true });
for (const name of ["moc", "mtn", "exp", "shizuku.physics.json", "shizuku.pose.json"]) {
  cpSync(path.join(model, name), path.join(modelDestination, name), { recursive: true });
}
const settings = JSON.parse(readFileSync(path.join(model, "shizuku.model.json"), "utf8"));
for (const motions of Object.values(settings.motions)) for (const motion of motions) delete motion.sound;
writeFileSync(path.join(modelDestination, "shizuku.model.json"), JSON.stringify(settings));
writeFileSync(path.join(destination, "SOURCES.txt"), [
  "Live2D Widgets 1.0.1 — stevenjoezhang — GPL-3.0-or-later",
  "https://github.com/stevenjoezhang/live2d-widget",
  "https://registry.npmjs.org/live2d-widgets/-/live2d-widgets-1.0.1.tgz",
  "Shizuku model from live2d-widget-model-shizuku 1.0.5 (package declares GPL-2.0)",
  "https://github.com/xiazeyu/live2d-widget-models",
  "https://registry.npmjs.org/live2d-widget-model-shizuku/-/live2d-widget-model-shizuku-1.0.5.tgz",
  "The Live2D Core and model retain their respective upstream notices and terms.",
  "Site modifications: model sound references removed; animation pacing and lifecycle in src/utils/live2d-runtime.js.",
].join("\n") + "\n");
console.log("Prepared local Live2D assets (no runtime CDN requests).");
