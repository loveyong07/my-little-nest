import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import { xFeedPlugin } from "./server/x-feed-plugin.mjs";

export default defineConfig({
  output: "static",
  adapter: vercel(),
  integrations: [react()],
  vite: {
    plugins: [xFeedPlugin()],
    optimizeDeps: {
      include: ["react", "react-dom/client", "react-icons"],
    },
  },
});
