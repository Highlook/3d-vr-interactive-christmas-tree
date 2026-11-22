import { mkdir, cp, stat, writeFile, rename } from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
await mkdir("public/mediapipe", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm", {
  recursive: true,
});
await mkdir("public/models", { recursive: true });
const destination = path.join(root, "public/models/hand_landmarker.task");
const url =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
try {
  const s = await stat(destination);
  if (s.size > 7000000) {
    console.log("Local MediaPipe model ready");
    process.exit(0);
  }
} catch {}
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error("HTTP " + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 7000000) throw Error("Incomplete model");
  await writeFile(destination + ".download", bytes);
  await rename(destination + ".download", destination);
  console.log("Model downloaded:", bytes.length, "bytes");
} catch (e) {
  console.warn(
    "Camera model download failed. Keyboard mode works. Retry npm run assets. " +
      e.message,
  );
}
