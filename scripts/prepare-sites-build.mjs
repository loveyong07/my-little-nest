#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");
const worker = path.join(root, "worker", "index.js");
const feedService = path.join(root, "server", "x-feed-plugin.mjs");
const mediaService = path.join(root, "server", "x-media.mjs");
const hosting = path.join(root, ".openai", "hosting.json");

for (const file of [index, worker, feedService, mediaService, hosting]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

mkdirSync(path.join(dist, "server"), { recursive: true });
mkdirSync(path.join(dist, ".openai"), { recursive: true });
copyFileSync(worker, path.join(dist, "server", "index.js"));
copyFileSync(feedService, path.join(dist, "server", "x-feed-plugin.mjs"));
copyFileSync(mediaService, path.join(dist, "server", "x-media.mjs"));
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));

console.log("Prepared Sites build: worker, X feed and media services, and hosting metadata");
