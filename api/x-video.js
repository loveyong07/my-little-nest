import { proxyXVideo } from "../server/x-video.mjs";

export default {
  async fetch(request) {
    return proxyXVideo(request);
  },
};
