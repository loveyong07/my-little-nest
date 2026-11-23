// Vercel function: every API route shares server/api-handler.mjs.
import { waitUntil } from "@vercel/functions";
import { createApiHandler } from "../server/api-handler.mjs";
import { createBlobVideoCache } from "../server/video-cache.mjs";
import { createDriveVideoArchive } from "../server/drive-video-archive.mjs";

const blob = createBlobVideoCache();
const drive = process.env.VERCEL_ENV === "production" ? createDriveVideoArchive({ legacy: blob }) : null;
const videoCache = drive
  ? {
      async read(source, headers, signal) {
        return (await drive.read(source, headers, signal)) ?? (await blob?.read(source, headers, signal));
      },
      warm: () => null,
    }
  : blob;
const handleApi = createApiHandler(process.env, { defer: waitUntil, videoCache });

export const config = {
  supportsResponseStreaming: true,
};

export default {
  async fetch(request) {
    return (await handleApi(request)) ?? new Response("Not found", { status: 404 });
  },
};
