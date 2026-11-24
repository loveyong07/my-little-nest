import { sendAnonymousMessage } from "../../../server/anonymous-message.mjs";
import { ANONYMOUS_MESSAGE_ENDPOINT } from "../../../shared/anonymous-message.mjs";
import { SITE_ORIGIN } from "../../../src/routes/site-metadata.js";

const siteOrigins = [SITE_ORIGIN, "https://my-little-nest.vercel.app"];

export default {
  fetch(request) {
    if (new URL(request.url).pathname !== ANONYMOUS_MESSAGE_ENDPOINT) {
      return new Response("Not found", { status: 404 });
    }
    return sendAnonymousMessage(request, process.env, fetch, siteOrigins);
  },
};
