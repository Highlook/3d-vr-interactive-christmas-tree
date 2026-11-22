import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  // Relative asset URLs: the build runs from any path (site root, /sub/,
  // static host, LAN server) without editing the bundle.
  base: "./",
  plugins: [react()],
  worker: { format: "es" },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"], react: ["react", "react-dom"] },
      },
    },
  },
});
