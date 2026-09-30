import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { xFeedPlugin } from "./server/x-feed-plugin.mjs";
import { scenePreloadPlugin } from "./build/scene-preloads.mjs";

export default defineConfig(({ mode }) => ({
  build: {
    outDir: "dist/client",
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
  plugins: [scenePreloadPlugin(), react(), xFeedPlugin({ token: loadEnv(mode, process.cwd(), "X_BEARER_TOKEN").X_BEARER_TOKEN })],
}));
