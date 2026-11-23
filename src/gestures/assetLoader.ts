import { assetConfig } from "../config/assetConfig";
import { gestureConfig } from "../config/gestureConfig";
import { readAsset, writeAsset } from "./assetStore";
import { resolveAssetSource, sourceOrder, type AssetSource } from "./assetSource";

export const ASSET_PROGRESS_EVENT = "xm-asset-progress";

export interface AssetProgressDetail {
  stage: "wasm" | "model";
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  bytesPerSecond: number;
  cached: boolean;
  source: string;
  done: boolean;
  failed?: boolean;
}

/** 交给 MediaPipe 的本地化资源：wasm 用 blob 地址，模型用二进制 buffer。 */
export interface HandAssets {
  simd: boolean;
  loaderUrl: string;
  wasmUrl: string;
  modelBuffer: Uint8Array;
  sourceLabel: string;
  cached: boolean;
  dispose(): void;
}

const MB = 1024 * 1024;

/** MediaPipe 用的 SIMD 能力探测（老浏览器没有 SIMD，要取 nosimd 版本）。 */
export function simdSupported(): boolean {
  try {
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10,
        1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
      ]),
    );
  } catch {
    return false;
  }
}

function emit(detail: AssetProgressDetail): void {
  try {
    window.dispatchEvent(new CustomEvent(ASSET_PROGRESS_EVENT, { detail }));
  } catch {
    /* 事件只是 UI 提示，失败无所谓 */
  }
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined")
    throw new Error("DecompressionStream unsupported");
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

interface FetchResult {
  bytes: Uint8Array;
  gzipped: boolean;
}

/**
 * 流式下载并回报进度；卡住超过 stallTimeoutMs 会中止，交给下一个线路。
 * 先试 `.gz`（体积约为 1/2），拿到发现不是 gzip（或 404）再下原件。
 */
async function downloadFile(
  url: string,
  onBytes: (loaded: number, total: number) => void,
  fallbackTotal: number,
): Promise<FetchResult> {
  const controller = new AbortController();
  let stall = setTimeout(() => controller.abort(), assetConfig.stallTimeoutMs);
  try {
    const response = await fetch(url, {
      mode: "cors",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const headerLength = Number(response.headers.get("content-length") || 0);
    const total = headerLength > 0 ? headerLength : fallbackTotal;
    if (!response.body) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      onBytes(bytes.length, total || bytes.length);
      return { bytes, gzipped: isGzip(bytes) };
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      clearTimeout(stall);
      stall = setTimeout(() => controller.abort(), assetConfig.stallTimeoutMs);
      chunks.push(value);
      received += value.length;
      onBytes(received, total);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { bytes, gzipped: isGzip(bytes) };
  } finally {
    clearTimeout(stall);
  }
}

async function loadOne(
  base: string,
  relative: string,
  gzTotal: number,
  plainTotal: number,
  onBytes: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  try {
    const gz = await downloadFile(
      base + relative + ".gz",
      onBytes,
      gzTotal,
    );
    return gz.gzipped ? await gunzip(gz.bytes) : gz.bytes;
  } catch {
    // .gz 缺失（例如镜像还没同步）或不支持解压时，退回原件。
    const plain = await downloadFile(base + relative, onBytes, plainTotal);
    return plain.bytes;
  }
}

const cacheKeyFor = (kind: string, simd: boolean) =>
  `${kind}:${simd ? "simd" : "nosimd"}:${gestureConfig.runtimeVersion}:${assetConfig.cacheKey}`;

interface ProgressState {
  stage: "wasm" | "model";
  loaded: number;
  total: number;
  mark: number;
  markBytes: number;
  speed: number;
  source: string;
  cached: boolean;
  lastEmit: number;
}

function report(state: ProgressState, done: boolean, failed = false): void {
  state.loaded = Math.max(state.loaded, 0);
  const percent = Math.min(99, Math.round((state.loaded / Math.max(state.total, 1)) * 100));
  emit({
    stage: state.stage,
    loadedBytes: state.loaded,
    totalBytes: state.total,
    percent: done ? 100 : percent,
    bytesPerSecond: Math.round(state.speed),
    cached: state.cached,
    source: state.source,
    done,
    failed,
  });
}

function makeReporter(state: ProgressState) {
  return () => {
    const now = performance.now();
    const elapsed = now - state.mark;
    if (elapsed > 300) {
      const delta = state.loaded - state.markBytes;
      const instant = (delta * 1000) / elapsed;
      state.speed = state.speed ? state.speed * 0.6 + instant * 0.4 : instant;
      state.mark = now;
      state.markBytes = state.loaded;
    }
    if (now - state.lastEmit > 200) {
      state.lastEmit = now;
      report(state, false);
    }
  };
}

async function buildFromBytes(
  wasmBytes: Uint8Array,
  modelBytes: Uint8Array,
  loaderUrl: string,
  simd: boolean,
  sourceLabel: string,
  cached: boolean,
): Promise<HandAssets> {
  const wasmUrl = URL.createObjectURL(
    new Blob([wasmBytes as BlobPart], { type: "application/wasm" }),
  );
  return {
    simd,
    loaderUrl,
    wasmUrl,
    modelBuffer: modelBytes,
    sourceLabel,
    cached,
    dispose() {
      URL.revokeObjectURL(wasmUrl);
    },
  };
}

async function loadFromSource(
  source: AssetSource,
  simd: boolean,
  progress: ProgressState,
): Promise<HandAssets> {
  const stem = simd ? "vision_wasm_internal" : "vision_wasm_nosimd_internal";
  const wasmKey = cacheKeyFor("wasm", simd);
  const modelKey = cacheKeyFor("model", simd);
  progress.source = source.label;

  const cachedWasm = await readAsset(wasmKey);
  const cachedModel = await readAsset(modelKey);
  progress.total = assetConfig.expectedBytes.wasm + assetConfig.expectedBytes.model;

  if (cachedWasm && cachedModel) {
    progress.cached = true;
    progress.stage = "model";
    progress.loaded = progress.total;
    report(progress, true);
    return buildFromBytes(
      cachedWasm,
      cachedModel,
      source.base + `mediapipe/wasm/${stem}.js`,
      simd,
      source.label,
      true,
    );
  }

  const onBytes = makeReporter(progress);
  progress.stage = "wasm";
  const wasmBytes = await loadOne(
    source.base,
    `mediapipe/wasm/${stem}.wasm`,
    assetConfig.expectedBytes.wasm,
    assetConfig.expectedBytes.wasm,
    (loaded) => {
      progress.loaded = loaded;
      onBytes();
    },
  );
  await writeAsset(wasmKey, wasmBytes);

  progress.stage = "model";
  progress.loaded = assetConfig.expectedBytes.wasm;
  const modelBytes = await loadOne(
    source.base,
    "models/hand_landmarker.task",
    assetConfig.expectedBytes.model,
    assetConfig.expectedBytes.model,
    (loaded) => {
      progress.loaded = assetConfig.expectedBytes.wasm + loaded;
      onBytes();
    },
  );
  await writeAsset(modelKey, modelBytes);

  progress.loaded = progress.total;
  report(progress, true);
  return buildFromBytes(
    wasmBytes,
    modelBytes,
    source.base + `mediapipe/wasm/${stem}.js`,
    simd,
    source.label,
    false,
  );
}

/** 真正开始加载；多线路自动重试。 */
async function load(): Promise<HandAssets> {
  const simd = simdSupported();
  const progress: ProgressState = {
    stage: "wasm",
    loaded: 0,
    total: assetConfig.expectedBytes.wasm + assetConfig.expectedBytes.model,
    mark: performance.now(),
    markBytes: 0,
    speed: 0,
    source: "",
    cached: false,
    lastEmit: 0,
  };
  const primary = await resolveAssetSource();
  const order = sourceOrder(primary);
  let lastError: unknown = null;
  for (const source of order) {
    try {
      return await loadFromSource(source, simd, progress);
    } catch (error) {
      lastError = error;
      progress.loaded = 0;
      progress.speed = 0;
    }
  }
  report(progress, true, true);
  throw lastError instanceof Error
    ? lastError
    : new Error("Hand model download failed");
}

let pending: Promise<HandAssets> | null = null;

/** 页面一挂载就可以预热门（与 WebGL 初始化并行），越早开始越快。 */
export function warmHandAssets(): Promise<HandAssets> {
  if (!pending) {
    pending = load().catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}
