import { handleSchedule } from "@vercel/schedules";
import { syncXSnapshot } from "../server/x-feed-snapshot.mjs";

let running;
export const POST = handleSchedule(async ({ scheduledAt }) => {
  if (process.env.VERCEL_ENV !== "production") return;
  running ??= syncXSnapshot({ runAt: scheduledAt.getTime() }).finally(() => {
    running = undefined;
  });
  const outcome = await running;
  console.info(JSON.stringify({ type: "x_snapshot_sync", outcome }));
});
