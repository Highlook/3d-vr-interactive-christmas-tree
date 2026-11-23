import { assetConfig } from "../config/assetConfig";

export interface AssetSource {
  /** 资源根地址，后面直接拼 `mediapipe/wasm/xxx`、`models/xxx`。 */
  base: string;
  label: string;
  mirror: boolean;
}

const SOURCE_KEY = "xm-asset-source";

/** 本站资源根地址：兼容 GitHub Pages 子路径部署。 */
export function localAssetBase(): string {
  return new URL(".", window.location.href).href;
}

function readStored(): AssetSource | null {
  try {
    const raw = window.localStorage.getItem(SOURCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { base?: string; label?: string; at?: number };
    if (!parsed.base || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > assetConfig.sourceCacheTtlMs) return null;
    return {
      base: parsed.base,
      label: parsed.label || parsed.base,
      mirror: parsed.base !== localAssetBase(),
    };
  } catch {
    return null;
  }
}

function store(source: AssetSource): void {
  try {
    window.localStorage.setItem(
      SOURCE_KEY,
      JSON.stringify({ base: source.base, label: source.label, at: Date.now() }),
    );
  } catch {
    /* 隐私模式下写不了，忽略 */
  }
}

function candidates(): AssetSource[] {
  const local: AssetSource = { base: localAssetBase(), label: "本站", mirror: false };
  return [
    ...assetConfig.mirrorPrefixes.map((base, index) => ({
      base,
      label: `镜像 ${index + 1}`,
      mirror: true,
    })),
    local,
  ];
}

/** 探测单个线路是否可用：HEAD 成功即认为可用（405 之类也证明网络可达）。 */
function probe(source: AssetSource, timeoutMs: number): Promise<AssetSource> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("probe timeout"));
    }, timeoutMs);
    fetch(source.base + "mediapipe/wasm/vision_wasm_internal.js", {
      method: "HEAD",
      mode: "cors",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(() => {
        clearTimeout(timer);
        resolve(source);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * 选出资源线路：并发探测，最快响应的镜像优先；全部失败则回退本站。
 * `?assets=local` 可强制走本站（排查用）。
 */
export async function resolveAssetSource(): Promise<AssetSource> {
  const forced = new URLSearchParams(window.location.search).get("assets");
  if (forced === "local")
    return { base: localAssetBase(), label: "本站", mirror: false };

  const stored = readStored();
  if (stored) return stored;

  const mirrors = candidates().filter((item) => item.mirror);
  try {
    const winner = await Promise.any(
      mirrors.map((item) => probe(item, assetConfig.probeTimeoutMs)),
    );
    store(winner);
    return winner;
  } catch {
    const local: AssetSource = { base: localAssetBase(), label: "本站", mirror: false };
    return local;
  }
}

/** 下载失败时依次尝试的完整线路列表（已选线路排最前）。 */
export function sourceOrder(primary: AssetSource): AssetSource[] {
  const all = candidates();
  return [primary, ...all.filter((item) => item.base !== primary.base)];
}
