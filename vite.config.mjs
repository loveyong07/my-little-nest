import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { apiPlugin } from "./server/vite-api-plugin.mjs";
import { scenePreloadPlugin } from "./build/scene-preloads.mjs";

export default defineConfig(({ mode }) => ({
  build: {
    outDir: "dist/client",
    sourcemap: false,
    // Production font-src is self-only: even tiny segmented fonts need local files.
    assetsInlineLimit: (filePath) => (/\.(?:woff2?|ttf|otf)$/i.test(filePath) ? false : undefined),
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
  plugins: [
    scenePreloadPlugin(),
    react(),
    // Server-only secrets from .env.local (never VITE_-prefixed, never bundled).
    apiPlugin(
      loadEnv(mode, process.cwd(), [
        "X_BEARER_TOKEN",
        "X_MEDIA_SIGNING_SECRET",
        "X_MEDIA_SIGNING_SECRET_PREVIOUS",
        "TOUCHGAL_API_TOKEN",
        "RESEND_API_KEY",
        "ANONYMOUS_MESSAGE_FROM",
      ]),
    ),
  ],
}));
