import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import flexGap from "./flexgap.mjs";

export default defineConfig({
  plugins: [react(), legacy({ targets: ["chrome >= 49"], modernPolyfills: false })],
  base: "./",
  // The controller's own screen runs an old Chromium (before 80), which cannot
  // read modern JavaScript, so compile down to what Chrome 64 understands.
  css: { postcss: { plugins: [flexGap()] } },
  build: { outDir: "../resources/next", emptyOutDir: true, target: "chrome64", cssTarget: "chrome64" },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/websocket": { target: "ws://localhost:8080", ws: true },
    },
  },
});
