import { handleSchedule } from "@vercel/schedules";
import { collectVideoSources, createDriveVideoArchive } from "../server/drive-video-archive.mjs";
import { createBlobXSnapshotStore } from "../server/x-feed-snapshot.mjs";

const drive = createDriveVideoArchive();
const source = createBlobXSnapshotStore();
let running;

async function syncVideos() {
  const result = { archived: 0, stored: 0, skipped: 0, failed: 0, remaining: 0 };
  if (!drive || !source.configured) return { ...result, reason: "unconfigured" };
  const stored = await source.read();
  if (!stored) return { ...result, reason: "snapshot_unavailable" };
  const videos = collectVideoSources(stored.snapshot.checkpoint.feed);
  const deadline = AbortSignal.timeout(46_000);
  const archivedPaths = await drive.archivedPaths(deadline);
  result.remaining = videos.length;
  for (const url of videos) {
    if (deadline.aborted) break;
    const signal = AbortSignal.any([deadline, AbortSignal.timeout(24_000)]);
    try {
      result[await drive.archive(url, signal, archivedPaths)]++;
    } catch {
      result.failed++;
    }
    result.remaining--;
  }
  return result;
}

export const POST = handleSchedule(async () => {
  if (process.env.VERCEL_ENV !== "production") return;
  running ??= syncVideos().finally(() => {
    running = undefined;
  });
  const result = await running;
  console.info(JSON.stringify({ type: "x_video_drive_sync", ...result }));
});
