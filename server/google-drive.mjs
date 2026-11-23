import { VIDEO_TYPE } from "./video-cache.mjs";

const files = "https://www.googleapis.com/drive/v3/files";
const uploads = "https://www.googleapis.com/upload/drive/v3/files";
const fileFields = "id,mimeType,size,trashed,appProperties";
export const validDriveId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(value);

async function checked(response, operation) {
  if (response.ok) return response;
  await response.body?.cancel();
  throw new Error(`Drive ${operation} failed (HTTP ${response.status})`);
}

export function createDriveClient({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const secret = env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const refreshToken = env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!clientId || !secret || !refreshToken) return null;

  let token;
  let refreshing;
  async function authorize() {
    if (token && now() < token.expires) return token.value;
    refreshing ??= (async () => {
      const response = await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: secret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
        redirect: "error",
        signal: AbortSignal.timeout(6000),
      });
      const result = await (await checked(response, "authorization")).json();
      if (!result.access_token || !Number.isFinite(result.expires_in))
        throw new Error("Drive authorization is invalid");
      token = { value: result.access_token, expires: now() + Math.max(0, result.expires_in - 60) * 1000 };
      return token.value;
    })().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }

  /** @param {string | URL} url @param {RequestInit} options */
  async function call(url, options) {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${await authorize()}`);
    const response = await fetchImpl(url, { ...options, headers, redirect: "error" });
    if (response.status === 401) token = undefined;
    return response;
  }

  return {
    async generateId(signal) {
      const result = await (
        await checked(await call(`${files}/generateIds?count=1`, { signal }), "ID allocation")
      ).json();
      if (!validDriveId(result.ids?.[0])) throw new Error("Invalid Drive file ID");
      return result.ids[0];
    },
    async metadata(id, signal) {
      const response = await call(`${files}/${id}?fields=${fileFields}`, { signal });
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      return (await checked(response, "file lookup")).json();
    },
    download(id, signal, range = null) {
      return call(`${files}/${id}?alt=media`, { signal, headers: range ? { Range: range } : undefined });
    },
    /** @param {string} id @param {string} key @param {number} size @param {ReadableStream<Uint8Array>} stream @param {AbortSignal} signal */
    async upload(id, key, size, stream, signal) {
      const session = await call(`${uploads}?uploadType=resumable&fields=${fileFields}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Upload-Content-Type": VIDEO_TYPE,
          "X-Upload-Content-Length": String(size),
        },
        body: JSON.stringify({
          id,
          name: `Nest X ${key.slice(0, 20)}.mp4`,
          mimeType: VIDEO_TYPE,
          appProperties: { nestVideo: key },
        }),
        signal,
      });
      if (session.status === 409) {
        await session.body?.cancel();
        return this.metadata(id, signal);
      }
      await checked(session, "upload initialization");
      const location = new URL(session.headers.get("location") ?? "", uploads);
      await session.body?.cancel();
      if (
        location.origin !== new URL(uploads).origin ||
        location.pathname !== new URL(uploads).pathname ||
        !location.searchParams.has("upload_id") ||
        location.username ||
        location.password
      )
        throw new Error("Invalid Drive upload session");

      const options = {
        method: "PUT",
        headers: { "Content-Type": VIDEO_TYPE, "Content-Length": String(size) },
        body: stream,
        duplex: "half",
        signal,
      };
      const response = await call(location, options);
      if (response.status === 409) {
        await response.body?.cancel();
        return this.metadata(id, signal);
      }
      return (await checked(response, "upload")).json();
    },
  };
}
