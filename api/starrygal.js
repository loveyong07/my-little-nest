/** Deploy this server-only function to loveyong07.top. Never use a VITE_* token. */
import { createStarryGalFetchHandler, parseRequest, publicData } from "../server/starrygal.mjs";

export { parseRequest, publicData };

export function createHandler({ fetchImpl = fetch, token = () => process.env.TOUCHGAL_API_TOKEN } = {}) {
  const handle = createStarryGalFetchHandler({ fetchImpl, token });
  return async function handler(req, res) {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers ?? {})) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
    }
    let requestUrl;
    try {
      requestUrl = new URL(req.url || "/", "https://relay.invalid");
    } catch {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "BAD_REQUEST" } });
      return;
    }
    const request = new Request(requestUrl, {
      method: req.method || "GET",
      headers,
    });
    const response = await handle(request, { remoteAddress: req.socket?.remoteAddress });
    for (const [name, value] of response.headers) {
      // Preserve canonical header casing expected by Node/Vercel consumers and unit tests.
      const canonical = name.replace(/(^|-)[a-z]/g, (part) => part.toUpperCase());
      res.setHeader(canonical, value);
    }
    if (response.status === 204) {
      res.status(204).end();
      return;
    }
    res.status(response.status).json(await response.json());
  };
}

export default createHandler();
