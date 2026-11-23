import { handleSchedule } from "@vercel/schedules";
import { createDriveVideoArchive, syncDriveVideos } from "../server/drive-video-archive.mjs";
import { createBlobXSnapshotStore } from "../server/x-feed-snapshot.mjs";

const drive = createDriveVideoArchive();
const source = createBlobXSnapshotStore();
let running;

export const POST = handleSchedule(async () => {
  if (process.env.VERCEL_ENV !== "production") return;
  running ??= syncDriveVideos({ drive, source }).finally(() => {
    running = undefined;
  });
  const result = await running;
  console.info(JSON.stringify({ type: "x_video_drive_sync", ...result }));
});
