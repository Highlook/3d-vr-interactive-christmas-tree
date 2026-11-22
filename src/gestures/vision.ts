import { gestureConfig } from "../config/gestureConfig";
import type { Landmark } from "./classifier";

export interface Detector {
  detectForVideo(
    source: HTMLVideoElement | ImageBitmap,
    timestamp: number,
  ): { landmarks: Landmark[][] };
  close(): void;
}

export async function createDetector(
  baseUrl: string,
  cpuOnly = false,
): Promise<{ detector: Detector; delegate: "GPU" | "CPU" }> {
  // The app pins @mediapipe/tasks-vision to 0.10.22-rc.20250304.
  const { FilesetResolver, HandLandmarker } = await import(
    "@mediapipe/tasks-vision"
  );
  const files = await FilesetResolver.forVisionTasks(
    new URL(gestureConfig.wasmPath, baseUrl).href,
  );
  let gpuError: unknown;
  const delegates: readonly ("GPU" | "CPU")[] = cpuOnly
    ? ["CPU"]
    : ["GPU", "CPU"];
  for (const delegate of delegates) {
    try {
      const detector = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: new URL(gestureConfig.modelPath, baseUrl).href,
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
      gpuError = error;
    }
  }
  throw gpuError;
}
