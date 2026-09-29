export const prerender = false;

import { proxyXMedia } from "../../../server/x-media.mjs";

export async function GET({ request }) {
  return proxyXMedia(request);
}

export async function ALL({ request }) {
  return proxyXMedia(request);
}
