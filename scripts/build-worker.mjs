import { build } from "vite";
// MediaPipe 0.10.x uses synchronous importScripts for its Emscripten loader.
// Bundle the detector into a classic IIFE worker: module workers reject importScripts.
// Keep this separate from the Vite module-worker pipeline in development AND production.
await build({
  configFile: false,
  publicDir: false,
  build: {
    target: "es2022",
    outDir: "public/mediapipe",
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: "src/gestures/handTracker.worker.ts",
      name: "ChristmasHandWorker",
      formats: ["iife"],
      fileName: () => "hand.worker.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
