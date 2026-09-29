export const prerender = false;

import { proxyXVideo } from "../../../server/x-video.mjs";

export async function GET({ request }) {
  return proxyXVideo(request);
}

export async function ALL({ request }) {
  return proxyXVideo(request);
}
