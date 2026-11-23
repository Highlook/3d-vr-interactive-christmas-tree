import { gestureConfig } from "../config/gestureConfig";
import type { Landmark } from "./classifier";

/** 预处理好的本地资源（可跨 worker 传递）。 */
export interface DetectorAssets {
  loaderUrl: string;
  wasmUrl: string;
  modelBuffer: Uint8Array;
}

export interface Detector {
  detectForVideo(
    source: HTMLVideoElement | ImageBitmap,
    timestamp: number,
  ): { landmarks: Landmark[][] };
  close(): void;
}

type VisionFileset = { wasmLoaderPath: string; wasmBinaryPath: string };

/**
 * assets 由 assetLoader 预先下载好（wasm 解压成 blob 地址、模型是内存 buffer），
 * 这样 MediaPipe 不需要再联网，也不会重复下载。
 * assets 为空时退回 MediaPipe 自己按 baseUrl 取文件的老路径。
 */
export async function createDetector(
  baseUrl: string,
  cpuOnly = false,
  assets: DetectorAssets | null = null,
): Promise<{ detector: Detector; delegate: "GPU" | "CPU" }> {
  // The app pins @mediapipe/tasks-vision to 0.10.22-rc.20250304.
  const { FilesetResolver, HandLandmarker } = await import(
    "@mediapipe/tasks-vision"
  );
  const filesets: Array<() => Promise<VisionFileset>> = [];
  if (assets)
    filesets.push(async () => ({
      wasmLoaderPath: assets.loaderUrl,
      wasmBinaryPath: assets.wasmUrl,
    }));
  // 兜底：让 MediaPipe 自己按相对路径取文件（老路径，慢但不依赖预处理）。
  filesets.push(() =>
    FilesetResolver.forVisionTasks(new URL(gestureConfig.wasmPath, baseUrl).href),
  );
  const delegates: readonly ("GPU" | "CPU")[] = cpuOnly
    ? ["CPU"]
    : ["GPU", "CPU"];
  let lastError: unknown;
  for (const delegate of delegates) {
    for (const makeFileset of filesets) {
      try {
        const files = await makeFileset();
        const detector = await HandLandmarker.createFromOptions(files, {
          baseOptions: {
            ...(assets
              ? { modelAssetBuffer: assets.modelBuffer }
              : { modelAssetPath: new URL(gestureConfig.modelPath, baseUrl).href }),
            delegate,
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
        return { detector, delegate };
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError;
}
