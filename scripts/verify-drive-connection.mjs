import { createDriveClient } from "../server/google-drive.mjs";

if (process.env.VERCEL_ENV === "production") {
  const client = createDriveClient();
  if (!client) throw new Error("Set all three Google Drive variables in Production before deploying");
  await client.generateId(AbortSignal.timeout(12_000));
  console.log("Production Drive OAuth refresh and file ID allocation verified");
}
