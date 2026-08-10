import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" para que el build funcione cargado desde file:// en Electron.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
