import { createDetector, type Detector, type DetectorAssets } from "./vision";

type Request =
  | { type: "init"; baseUrl: string; assets?: DetectorAssets | null }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number };
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown): void;
};
let detector: Detector | null = null;
scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") {
    void createDetector(message.baseUrl, false, message.assets ?? null)
      .then((result) => {
        detector = result.detector;
        scope.postMessage({ type: "ready", delegate: result.delegate });
      })
      .catch((error) =>
        scope.postMessage({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    return;
  }
  try {
    if (!detector) throw new Error("Hand detector is not ready");
    const result = detector.detectForVideo(message.bitmap, message.timestamp);
    scope.postMessage({
      type: "result",
      landmarks: result.landmarks[0] ?? [],
      timestamp: message.timestamp,
    });
  } catch (error) {
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    message.bitmap.close();
  }
};
