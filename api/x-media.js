import { proxyXMedia } from "../server/x-media.mjs";

export default {
  async fetch(request) {
    return proxyXMedia(request);
  },
};
