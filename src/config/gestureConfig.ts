/** Local WASM/model files must match the pinned Tasks Vision runtime. */
export const gestureConfig = {
  runtimeVersion: "0.10.22-rc.20250304",
  // Relative so the build also works under a sub-path (GitHub Pages etc.).
  wasmPath: "mediapipe/wasm",
  modelPath: "models/hand_landmarker.task",
  maxFps: 30,
  gestureConfirmMs: 160,
  gestureConfidenceThreshold: 0.75,
  gestureCooldownMs: 200,
  gestureStableFrames: 3,
  smoothingAlpha: 0.4,
  pinchRatio: 0.25,
  okRaisedPinchRatio: 0.33,
  okProjectedPinchRatio: 0.22,
  okDepthTolerance: 0.45,
  palmPinchExclusionRatio: 0.42,
  okMinReach: 0.4,
  okMinWristReach: 1.15,
  okMinOpening: 0.35,
  palmPipAngle: 135,
  palmDipAngle: 130,
  // 慢网络（手机流量 / 隧道）首次要下载约 9 MB 的 WASM + 模型，20 秒会误判超时。
  workerInitTimeoutMs: 90000,
  frameTimeoutMs: 5000,
} as const;
