/**
 * 大体积资源（wasm 运行时 + 手势模型）的分发策略。
 *
 * GitHub Pages 对国内移动网络很慢（实测直连约 27–60 KB/s），首次加载 16.6 MB
 * 要一两分钟。因此这里：
 *  1. 优先走国内 GitHub 镜像（速度通常是 Pages 的 10 倍以上）；
 *  2. 镜像全部不可用时回退到本站（GitHub Pages）；
 *  3. 传输 gzip 版本（wasm 9.1→2.8 MB，模型 7.5→5.5 MB）；
 *  4. 下载后写入 IndexedDB，之后打开直接读本地，不再联网。
 */
export const assetConfig = {
  /** 参与缓存键，改了版本号会让所有客户端重新下载一次。 */
  cacheKey: "v2",
  /** 国内镜像前缀，拼接 `mediapipe/wasm/...` 或 `models/...` 得到完整地址。 */
  mirrorPrefixes: [
    "https://gh-proxy.com/https://raw.githubusercontent.com/Highlook/3d-vr-interactive-christmas-tree/main/public/",
    "https://ghfast.top/https://raw.githubusercontent.com/Highlook/3d-vr-interactive-christmas-tree/main/public/",
    "https://cdn.jsdelivr.net/gh/Highlook/3d-vr-interactive-christmas-tree@main/public/",
  ],
  /** 镜像探测（HEAD 并发赛跑）的超时。 */
  probeTimeoutMs: 3000,
  /** 选中的线路缓存多久（期间直接复用，不再探测）。 */
  sourceCacheTtlMs: 6 * 60 * 60 * 1000,
  /** 单个文件下载卡住多久算失败并换下一路。 */
  stallTimeoutMs: 25000,
  /**
   * 首次加载的参考字节数（gzip 后），仅用于进度条分母；
   * 实际以响应头 Content-Length 为准，缺失时用这里的估算。
   */
  expectedBytes: { wasm: 2_930_000, model: 5_800_000 },
} as const;
