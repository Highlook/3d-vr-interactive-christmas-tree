#!/usr/bin/env node
/**
 * 零依赖静态服务器：把 release/site 通过局域网发布给手机 / 平板 / 其他电脑。
 *
 *   node serve.mjs                  # HTTP 8080 + 有证书时自动开 HTTPS 8443
 *   node serve.mjs --port 8080 --no-https
 *
 * 摄像头（getUserMedia）只在安全上下文可用：localhost 和 https 算安全，
 * 局域网 http://192.168.x.x 不算。所以手机上要用 HTTPS 地址，并在首次访问时
 * 通过“高级 → 继续访问”接受本机自签证书。
 */
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "site");
const argv = process.argv.slice(2);

function flag(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const has = (name) => argv.includes(name);

const HTTP_PORT = Number(flag("--port", "8080"));
const HTTPS_PORT = Number(flag("--https-port", "8443"));
const PFX_PATH = path.join(here, "certs", "site.pfx");
const PFX_PASS = "christmas-local";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

// 摄像头模型与 WASM 加起来接近 17 MB，手机上首屏是否要等半分钟取决于这层压缩。
const COMPRESSIBLE = new Set([
  ".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt", ".md",
  ".wasm", ".task", ".ttf", ".otf", ".woff",
]);
const gzipCache = new Map();

function gzipped(key, body) {
  const hit = gzipCache.get(key);
  if (hit) return hit;
  const packed = zlib.gzipSync(body, { level: 6 });
  gzipCache.set(key, packed);
  return packed;
}

function handler(req, res) {
  const started = Date.now();
  let rel;
  try {
    rel = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  if (rel.endsWith("/")) rel += "index.html";

  const candidate = path.resolve(root, "." + rel);
  const inside = candidate === root || candidate.startsWith(root + path.sep);
  const exists = inside && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  // 单页应用兜底：未知路径回落到 index.html
  const file = exists ? candidate : path.join(root, "index.html");

  fs.readFile(file, (error, body) => {
    if (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Read error: " + error.message);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    // path.resolve 在 Windows 上给的是反斜杠，先统一成 URL 分隔符再判断目录。
    const urlPath = file.split(path.sep).join("/");
    // 构建产物、字体、WASM 与模型都带内容哈希或版本号，可以长缓存：
    // 手机第二次打开就不用再下 9 MB。
    const immutable =
      (/\/assets\//.test(urlPath) ||
        /\/(mediapipe|models|fonts)\//.test(urlPath)) &&
      ext !== ".html";
    const acceptsGzip = /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
    const pack =
      acceptsGzip && COMPRESSIBLE.has(ext) && body.length > 1024
        ? gzipped(`${file}:${body.length}:${fs.statSync(file).mtimeMs}`, body)
        : null;
    const payload = pack || body;
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "content-length": payload.length,
      ...(pack ? { "content-encoding": "gzip", vary: "accept-encoding" } : {}),
      "cache-control": immutable
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      // MediaPipe 的 WASM 推理不需要跨源隔离，保持默认即可
      "x-content-type-options": "nosniff",
    });
    if (req.method === "HEAD") res.end();
    else res.end(payload);
    if (process.env.DEBUG) {
      console.log(`${req.method} ${req.url} -> ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
}

function lanAddresses() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === "IPv4" && !item.internal) found.push(item.address);
    }
  }
  return [...new Set(found)];
}

const addresses = lanAddresses();
console.log("");
console.log("  圣诞粒子体验 · 本地站点已启动");
console.log("  ------------------------------------------------");
console.log(`  本机:    http://localhost:${HTTP_PORT}`);
for (const ip of addresses) console.log(`  局域网:  http://${ip}:${HTTP_PORT}`);
console.log("");

const httpServer = http.createServer(handler).listen(HTTP_PORT);

let httpsServer = null;
if (!has("--no-https") && fs.existsSync(PFX_PATH)) {
  try {
    httpsServer = https
      .createServer(
        { pfx: fs.readFileSync(PFX_PATH), passphrase: PFX_PASS },
        handler,
      )
      .listen(HTTPS_PORT);
    console.log("  HTTPS（手机摄像头用这个）");
    console.log(`  本机:    https://localhost:${HTTPS_PORT}`);
    for (const ip of addresses) console.log(`  局域网:  https://${ip}:${HTTPS_PORT}`);
    console.log("");
    console.log("  iPhone/iPad 首次打开：显示“此连接非私人连接” → 显示详细信息 → 访问此网站");
    console.log("  Android 首次打开：“您的连接不是私密连接” → 高级 → 继续前往");
    console.log("  接受一次之后，摄像头和手势识别即可正常授权。");
  } catch (error) {
    console.error("HTTPS 启动失败（HTTP 仍然可用）:", error.message);
  }
} else if (!has("--no-https")) {
  console.log("  提示: 未找到 certs/site.pfx，只启动了 HTTP。");
  console.log("        手机浏览器在 http://局域网IP 下会拒绝摄像头。");
  console.log("        运行 make-cert.bat 生成证书后重启本服务即可。");
  console.log("");
}

console.log("  按 Ctrl+C 或直接关闭此窗口即可停止。");
console.log("");

function shutdown() {
  httpServer.close();
  if (httpsServer) httpsServer.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
