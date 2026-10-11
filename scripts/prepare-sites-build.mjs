#!/usr/bin/env node
// Packages the Sites (Cloudflare-style) worker next to the Vite build: the worker becomes
// dist/server/index.js and keeps importing the shared server and shared modules relatively.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const required = [
  path.join(dist, "client", "index.html"),
  path.join(root, "worker", "index.js"),
  path.join(root, ".openai", "hosting.json"),
];
for (const file of required) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

function copyModules(from, to, skip = () => false) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from).filter((file) => file.endsWith(".mjs") && !skip(file))) {
    copyFileSync(path.join(from, name), path.join(to, name));
  }
}

// The Vite plugin only runs in development, so it stays out of the worker bundle.
copyModules(path.join(root, "server"), path.join(dist, "server"), (file) => file.startsWith("vite-"));
copyModules(path.join(root, "shared"), path.join(dist, "shared"));
copyFileSync(path.join(root, "worker", "index.js"), path.join(dist, "server", "index.js"));
mkdirSync(path.join(dist, ".openai"), { recursive: true });
copyFileSync(path.join(root, ".openai", "hosting.json"), path.join(dist, ".openai", "hosting.json"));

console.log("Prepared Sites build: worker, API services and hosting metadata");
