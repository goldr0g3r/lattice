import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `apps/desktop` is the Vite root for the renderer. Tauri reads `dist/` at
// `tauri build` time; see `apps/desktop/src-tauri/tauri.conf.json` (PR #3).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
