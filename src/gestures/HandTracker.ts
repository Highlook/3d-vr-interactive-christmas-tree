import { gestureConfig } from "../config/gestureConfig";
import {
  classifyGesture,
  GestureStabilizer,
  type Gesture,
  type Landmark,
} from "./classifier";
import { createDetector, type Detector } from "./vision";
import { warmHandAssets, type HandAssets } from "./assetLoader";
import { writeHandDiagnostics } from "./diagnostics";

type WorkerReply =
  | { type: "ready"; delegate: string }
  | { type: "result"; landmarks: Landmark[]; timestamp: number }
  | { type: "error"; message: string };

/** start() requests camera permission; construction alone never opens the camera. */
export class HandTracker {
  private generation = 0;
  private starting: Promise<void> | null = null;
  private active = false;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private worker: Worker | null = null;
  private detector: Detector | null = null;
  private detectorDelegate: "GPU" | "CPU" = "CPU";
  private cancelWorkerInit: (() => void) | null = null;
  private cancelVideoWait: (() => void) | null = null;
  private frameTimer: ReturnType<typeof setTimeout> | null = null;
  private videoFrame: number | null = null;
  private inferenceTimer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private switching = false;
  private lastFrame = -Infinity;
  private lastVideoTime = -1;
  private pump: "rvfc" | "interval" = "rvfc";
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private bitmapCanvas: HTMLCanvasElement | null = null;
  private bitmapDirect = true;
  private framesSent = 0;
  private framesBack = 0;
  private handsSeen = 0;
  private inferenceMark = 0;
  private inferenceFps = 0;
  private stabilizer = new GestureStabilizer();
  private assetTask: Promise<HandAssets | null> | null = null;
  private readonly pagehide = () => this.stop();

  constructor(
    private readonly onGesture: (gesture: Gesture) => void,
    private readonly onStatus: (status: string) => void,
  ) {}

  async start(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.active) return;
    const generation = ++this.generation;
    const promise = this.begin(generation);
    this.starting = promise;
    try {
      await promise;
    } finally {
      if (generation === this.generation) this.starting = null;
    }
  }

  private current(generation: number): boolean {
    return generation === this.generation;
  }

  private async begin(generation: number): Promise<void> {
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera requires HTTPS or localhost and a supported browser.",
        );
      this.onStatus("Requesting camera permission…");
      window.addEventListener("pagehide", this.pagehide);
      // 模型/wasm 的下载与摄像头授权并行：授权弹窗那几秒正好用来下 8 MB 资源。
      if (!this.assetTask)
        this.assetTask = warmHandAssets().catch((error: unknown) => {
          writeHandDiagnostics({
            lastError: `asset download: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
          return null;
        });
      // Request immediately when started; the browser owns the permission prompt.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: gestureConfig.maxFps, max: gestureConfig.maxFps },
        },
        audio: false,
      });
      if (!this.current(generation)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const video = document.createElement("video");
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("aria-hidden", "true");
      video.className = "hand-camera-source";
      video.srcObject = stream;
      this.video = video;
      // Mobile Safari and several Android browsers stop decoding frames for a
      // display:none or detached <video>. Keep it in the DOM as a 2px,
      // non-interactive element so frames keep arriving. It is inference input
      // only: never previewed, never transmitted.
      document.body.appendChild(video);
      await video.play();
      if (!this.current(generation)) return;
      if (video.readyState < 2) await this.waitForVideo(video);
      if (!this.current(generation)) return;
      this.onStatus("Loading hand tracking…");
      try {
        await this.initWorker(generation);
      } catch {
        if (!this.current(generation)) return;
        this.disposeWorker();
        await this.initMain(generation);
      }
      if (!this.current(generation)) return;
      this.active = true;
      this.scheduleFrame();
    } catch (error) {
      if (!this.current(generation)) return;
      this.stop();
      const message = error instanceof Error ? error.message : String(error);
      this.onStatus(`Camera unavailable: ${message}`);
      throw error;
    }
  }

  private waitForVideo(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        video.removeEventListener("loadeddata", ready);
        video.removeEventListener("error", failed);
        this.cancelVideoWait = null;
        if (error) reject(error);
        else resolve();
      };
      const ready = () => finish();
      const failed = () =>
        finish(new Error("Camera video could not be decoded."));
      const timer = setTimeout(
        () => finish(new Error("Camera video timed out.")),
        15000,
      );
      this.cancelVideoWait = () => finish();
      video.addEventListener("loadeddata", ready, { once: true });
      video.addEventListener("error", failed, { once: true });
    });
  }

  private async initWorker(generation: number): Promise<void> {
    if (
      typeof Worker === "undefined" ||
      typeof createImageBitmap !== "function"
    )
      throw new Error("Worker bitmap inference is unsupported.");
    // 等预下载完成（首次约 8 MB，之后走 IndexedDB 直接命中）。
    const assets = await this.assetTask;
    if (!this.current(generation)) return;
    const payload = assets
      ? {
          loaderUrl: assets.loaderUrl,
          wasmUrl: assets.wasmUrl,
          modelBuffer: assets.modelBuffer,
        }
      : null;
    await new Promise<void>((resolve, reject) => {
      const worker = new Worker(
        new URL("mediapipe/hand.worker.js", window.location.href),
      );
      this.worker = worker;
      let ready = false;
      const timer = setTimeout(
        () => fail(new Error("Worker initialization timed out.")),
        gestureConfig.workerInitTimeoutMs,
      );
      const fail = (error: Error) => {
        clearTimeout(timer);
        this.cancelWorkerInit = null;
        writeHandDiagnostics({ lastError: error.message });
        if (!ready) reject(error);
        else if (this.current(generation)) void this.fallback(generation);
      };
      this.cancelWorkerInit = () => {
        clearTimeout(timer);
        reject(new Error("Tracking stopped."));
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fail(new Error(event.message || "Hand tracking worker failed."));
      };
      worker.onmessageerror = () => fail(new Error("Invalid worker message."));
      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        if (!this.current(generation) || worker !== this.worker) return;
        const reply = event.data;
        if (reply.type === "ready") {
          ready = true;
          clearTimeout(timer);
          this.cancelWorkerInit = null;
          this.onStatus(`Hand tracking ready · worker ${reply.delegate}`);
          writeHandDiagnostics({
            mode: "worker",
            delegate: reply.delegate,
            status: "ready",
            pump: this.pump,
          });
          resolve();
        } else if (reply.type === "error") {
          fail(new Error(reply.message));
        } else {
          this.clearFrameTimer();
          this.busy = false;
          this.framesBack += 1;
          this.handsSeen += reply.landmarks.length ? 1 : 0;
          this.accept(reply.landmarks, reply.timestamp);
        }
      };
      worker.postMessage({ type: "init", baseUrl: window.location.href, assets: payload });
    });
  }

  private async initMain(generation: number, cpuOnly = false): Promise<void> {
    this.onStatus(
      cpuOnly
        ? "Loading CPU tracker…"
        : "Loading main-thread tracker…",
    );
    const assets = await this.assetTask;
    const result = await createDetector(window.location.href, cpuOnly, assets);
    if (!this.current(generation)) {
      result.detector.close();
      return;
    }
    this.detector = result.detector;
    this.detectorDelegate = result.delegate;
    this.onStatus(`Hand tracking ready · main thread ${result.delegate}`);
    writeHandDiagnostics({ mode: "main", delegate: result.delegate, status: "ready" });
  }

  private async fallback(generation: number, cpuOnly = false): Promise<void> {
    if (this.switching || !this.current(generation)) return;
    this.switching = true;
    this.disposeWorker();
    const previous = this.detector;
    this.detector = null;
    try {
      previous?.close();
      await this.initMain(generation, cpuOnly);
    } catch (error) {
      if (this.current(generation)) {
        this.stop();
        this.onStatus(
          `Hand tracking unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      if (this.current(generation)) {
        this.switching = false;
        this.busy = false;
      }
    }
  }

  /** Follow decoded camera frames, independently of the particle render loop. */
  private scheduleFrame(): void {
    if (!this.active || !this.video) return;
    if (
      this.pump === "rvfc" &&
      typeof this.video.requestVideoFrameCallback === "function"
    ) {
      this.videoFrame = this.video.requestVideoFrameCallback(this.tick);
      this.clearWatchdog();
      // A decoder that stops announcing frames (hidden source, throttled tab)
      // must not freeze hand tracking: fall back to a plain timer.
      this.watchdog = setTimeout(() => this.useIntervalPump(), 1500);
    } else this.useIntervalPump();
  }

  private useIntervalPump(): void {
    this.clearWatchdog();
    if (!this.active || this.pump === "interval") return;
    this.pump = "interval";
    if (this.videoFrame !== null) {
      this.video?.cancelVideoFrameCallback(this.videoFrame);
      this.videoFrame = null;
    }
    this.intervalTimer = setInterval(
      () => this.tick(performance.now()),
      Math.round(1000 / gestureConfig.maxFps),
    );
    writeHandDiagnostics({ pump: "interval" });
  }

  private clearWatchdog(): void {
    if (this.watchdog !== null) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  /** Produce an inference bitmap, falling back to a 2D canvas copy of the frame. */
  private async grab(video: HTMLVideoElement): Promise<ImageBitmap | null> {
    if (this.bitmapDirect && typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(video);
      } catch {
        // Safari rejects <video> as a createImageBitmap source on some versions.
        this.bitmapDirect = false;
      }
    }
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const canvas = (this.bitmapCanvas ??= document.createElement("canvas"));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);
    if (typeof createImageBitmap !== "function") return null;
    try {
      return await createImageBitmap(canvas);
    } catch {
      return null;
    }
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.active) return;
    this.clearWatchdog();
    this.videoFrame = null;
    this.inferenceTimer = null;
    this.scheduleFrame();
    const video = this.video;
    if (
      !video ||
      video.readyState < 2 ||
      this.busy ||
      this.switching ||
      timestamp - this.lastFrame < 1000 / gestureConfig.maxFps - 2 ||
      video.currentTime === this.lastVideoTime
    )
      return;
    this.lastFrame = timestamp;
    this.lastVideoTime = video.currentTime;
    this.busy = true;
    const generation = this.generation;
    if (this.worker) {
      const worker = this.worker;
      this.frameTimer = setTimeout(
        () => void this.fallback(generation),
        gestureConfig.frameTimeoutMs,
      );
      void this.grab(video)
        .then((bitmap) => {
          if (!bitmap) {
            this.clearFrameTimer();
            this.busy = false;
            writeHandDiagnostics({ lastError: "frame capture returned no bitmap" });
            return;
          }
          if (!this.current(generation) || worker !== this.worker) {
            bitmap.close();
            return;
          }
          this.framesSent += 1;
          try {
            worker.postMessage({ type: "frame", bitmap, timestamp }, [bitmap]);
          } catch {
            bitmap.close();
            void this.fallback(generation);
          }
        })
        .catch(() => {
          if (this.current(generation)) void this.fallback(generation);
        });
    } else if (this.detector) {
      try {
        this.accept(
          this.detector.detectForVideo(video, timestamp).landmarks[0] ?? [],
          timestamp,
        );
      } catch (error) {
        if (this.detectorDelegate === "GPU")
          void this.fallback(generation, true);
        else {
          this.stop();
          this.onStatus(
            `Hand tracking interrupted: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } finally {
        this.busy = false;
      }
    } else this.busy = false;
  };

  private accept(points: Landmark[], timestamp: number): void {
    // Vote on fresh observations: coordinate EMA adds several frames of lag
    // during a pose change and can manufacture intermediate finger patterns.
    // MediaPipe x/z are width-normalized, y is height-normalized. Restore an
    // isotropic metric before computing distances/angles (worker and fallback).
    const aspect = this.video?.videoWidth && this.video.videoHeight
      ? this.video.videoHeight / this.video.videoWidth : 1;
    const metric = aspect === 1 ? points : points.map(p => ({ ...p, y: p.y * aspect }));
    const gesture = this.stabilizer.update(classifyGesture(metric), timestamp);
    if (timestamp > this.inferenceMark) {
      const delta = timestamp - this.inferenceMark;
      const fps = 1000 / Math.max(delta, 1);
      this.inferenceFps = this.inferenceFps
        ? this.inferenceFps * 0.8 + fps * 0.2
        : fps;
      this.inferenceMark = timestamp;
    }
    writeHandDiagnostics({
      framesSent: this.framesSent,
      framesBack: this.framesBack,
      handsSeen: this.handsSeen,
      inferenceFps: Math.round(this.inferenceFps),
      videoTime: this.video?.currentTime ?? 0,
      readyState: this.video?.readyState ?? 0,
      pump: this.pump,
    });
    if (gesture) this.onGesture(gesture);
  }

  private clearFrameTimer(): void {
    if (this.frameTimer !== null) clearTimeout(this.frameTimer);
    this.frameTimer = null;
  }

  private disposeWorker(): void {
    this.cancelWorkerInit?.();
    this.cancelWorkerInit = null;
    this.clearFrameTimer();
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
  }

  stop(): void {
    ++this.generation;
    this.active = false;
    this.starting = null;
    if (this.videoFrame !== null)
      this.video?.cancelVideoFrameCallback(this.videoFrame);
    this.videoFrame = null;
    if (this.inferenceTimer !== null) clearTimeout(this.inferenceTimer);
    this.inferenceTimer = null;
    this.clearWatchdog();
    if (this.intervalTimer !== null) clearInterval(this.intervalTimer);
    this.intervalTimer = null;
    this.pump = "rvfc";
    this.bitmapDirect = true;
    this.cancelVideoWait?.();
    this.cancelVideoWait = null;
    this.disposeWorker();
    this.detector?.close();
    this.detector = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
    window.removeEventListener("pagehide", this.pagehide);
    this.busy = false;
    this.switching = false;
    this.lastFrame = -Infinity;
    this.lastVideoTime = -1;
    this.stabilizer.reset();
    writeHandDiagnostics({ mode: "idle", status: "stopped", pump: "-" });
  }
}
