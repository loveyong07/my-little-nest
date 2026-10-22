import { createBlobPhotoCache } from "../server/photo-cache.mjs";
import { warmPhotoCache } from "../server/photo-cache-warm.mjs";

const args = process.argv.slice(2);
const limitIndex = args.indexOf("--limit");
const limit = limitIndex < 0 ? Infinity : Number(args[limitIndex + 1]);
if (!(limit > 0)) throw new Error("--limit must be positive");
const result = await warmPhotoCache({
  origin: "https://loveyong07.top",
  cache: createBlobPhotoCache({ readTimeoutMs: 10000, writeTimeoutMs: 30000 }),
  limit,
  onProgress: (progress) => console.log(JSON.stringify(progress)),
});
if (result.failed) process.exitCode = 1;
