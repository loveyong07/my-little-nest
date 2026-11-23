import { syncXSnapshot } from "../server/x-feed-snapshot.mjs";

try {
  console.log(await syncXSnapshot());
} catch {
  console.error("X snapshot sync failed. Check the X and Blob service status.");
  process.exitCode = 1;
}
