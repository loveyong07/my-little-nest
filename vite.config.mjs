import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { xFeedPlugin } from "./server/x-feed-plugin.mjs";
import { scenePreloadPlugin } from "./build/scene-preloads.mjs";

export default defineConfig(({ mode }) => ({
  build: {
    outDir: "dist/client",
    // Production font-src is self-only: even tiny segmented fonts need local files.
    assetsInlineLimit: (filePath) => /\.(?:woff2?|ttf|otf)$/i.test(filePath) ? false : undefined,
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [scenePreloadPlugin(), react(), xFeedPlugin({
    token: loadEnv(mode, process.cwd(), "X_BEARER_TOKEN").X_BEARER_TOKEN,
    mediaSigningSecret: loadEnv(mode, process.cwd(), "X_MEDIA_SIGNING_SECRET").X_MEDIA_SIGNING_SECRET,
  })],
}));
