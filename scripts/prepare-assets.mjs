import { mkdir, cp, stat, writeFile, rename } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
await mkdir("public/mediapipe", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm", {
  recursive: true,
});
await mkdir("public/models", { recursive: true });
const destination = path.join(root, "public/models/hand_landmarker.task");
const url =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
let modelReady = false;
try {
  const s = await stat(destination);
  if (s.size > 7000000) {
    console.log("Local MediaPipe model ready");
    modelReady = true;
  }
} catch {}
if (!modelReady) {
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
}

/**
 * 生成 .gz 副本：网站首屏要下 16.6 MB 的 wasm + 模型，gzip 后只要约 8.3 MB。
 * 国内镜像不做压缩，所以压缩版必须一起进仓库；浏览器用 DecompressionStream 现场解压。
 * 已存在就不重做，保持构建可重复。
 */
const gzTargets = [
  "public/mediapipe/wasm/vision_wasm_internal.wasm",
  "public/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
  "public/models/hand_landmarker.task",
];
for (const target of gzTargets) {
  const output = target + ".gz";
  try {
    const existing = await stat(output);
    const source = await stat(target);
    if (existing.size > 0 && existing.size < source.size) continue;
  } catch {}
  try {
    const source = await stat(target);
    if (source.size < 100000) continue;
    await pipeline(
      createReadStream(target),
      zlib.createGzip({ level: 9 }),
      createWriteStream(output),
    );
    const gz = await stat(output);
    console.log(
      `gzip: ${target} ${(source.size / 1048576).toFixed(2)} MB -> ${(gz.size / 1048576).toFixed(2)} MB`,
    );
  } catch (e) {
    console.warn(`gzip failed for ${target}: ${e.message}`);
  }
}
