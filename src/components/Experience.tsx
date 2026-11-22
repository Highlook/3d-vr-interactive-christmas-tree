import { useEffect, useRef, useState } from "react";
import { SceneManager, type SceneStats } from "../three/SceneManager";
import type {
  AnimationState,
  InputGesture,
} from "../three/AnimationStateMachine";
import { HandTracker } from "../gestures/HandTracker";
import Diagnostics from "./Diagnostics";
const labels: Record<AnimationState, string> = {
  INITIAL: "圣诞树 · TREE",
  NUMBER_1: "数字 1 · ONE",
  NUMBER_2: "数字 2 · TWO",
  NUMBER_3: "数字 3 · THREE",
  TEXT_CHRISTMAS: "圣诞快乐",
  TREE_RESET: "星尘归位 · GATHERING",
  TEXT_HAPPY: "天天开心",
  SCATTER: "星尘 · STARDUST",
};
const gestures: Record<string, string> = {
  ONE: "一根手指",
  TWO: "两根手指",
  THREE: "三根手指",
  OK: "OK 手势",
  FIST: "握拳",
  PALM: "张开手掌",
  UNKNOWN: "等待手势",
};
export default function Experience() {
  const diag = new URLSearchParams(window.location.search).has("diag");
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<SceneManager>();
  const [state, setState] = useState<AnimationState>("INITIAL"),
    [camera, setCamera] = useState("未连接"),
    [gesture, setGesture] = useState("等待手势");
  const [connected, setConnected] = useState(false),
    [help, setHelp] = useState(false),
    [error, setError] = useState("");
  const [stats, setStats] = useState<SceneStats>({
    fps: 0,
    particles: 0,
    quality: "高画质",
  });
  useEffect(() => {
    try {
      scene.current = new SceneManager(host.current!, setState, setStats);
      // Development-only inspection for spatial and resource regression tests.
      if (import.meta.env.DEV) Object.assign(window, { __christmasScene: scene.current });
    } catch (e) {
      setError(
        "WebGL 启动失败，请启用浏览器硬件加速后刷新。" +
          (e instanceof Error ? e.message : ""),
      );
    }
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const map: Record<string, InputGesture> = {
        "1": "ONE",
        "2": "TWO",
        "3": "THREE",
        o: "OK",
        O: "OK",
        f: "FIST",
        F: "FIST",
        " ": "PALM",
      };
      if (map[e.key]) {
        e.preventDefault();
        scene.current?.gesture(map[e.key]);
        setGesture(gestures[map[e.key]] + " · 键盘");
      } else if (e.key.toLowerCase() === "t")
        void scene.current?.machine.set("TEXT_CHRISTMAS");
      else if (e.key.toLowerCase() === "r")
        void scene.current?.machine.set("TREE_RESET");
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      scene.current?.dispose();
      scene.current = undefined;
    };
  }, []);
  useEffect(() => {
    let disposed = false, active = true, requestId = 0;
    const hand = new HandTracker(
      (g) => {
        if (disposed || !active) return;
        setGesture(gestures[g] || g);
        scene.current?.gesture(g);
      },
      (status) => {
        if (disposed || !active) return;
        if (status.includes("ready"))
          setCamera(status.replace("Hand tracking ready · ", "") + " · 本地识别");
        else if (/unavailable|interrupted/i.test(status)) {
          setCamera("识别已停止");
          setConnected(false);
        } else setCamera(status.includes("permission") ? "等待摄像头权限" : "正在加载识别模型");
      },
    );
    const start = async () => {
      const request = ++requestId;
      setConnected(false);
      setCamera("等待摄像头权限");
      try {
        await hand.start();
        if (!disposed && active && request === requestId) setConnected(true);
      } catch (e) {
        if (disposed || !active || request !== requestId) return;
        setConnected(false);
        setCamera("摄像头不可用");
        setError((e instanceof Error ? e.message : String(e)) +
          " · 仍可使用键盘体验。可在浏览器站点设置中允许摄像头后刷新。");
      }
    };
    const hide = () => {
      active = false;
      ++requestId;
      hand.stop();
      setConnected(false);
      setCamera("已暂停");
    };
    const show = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      active = true;
      void start();
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    // Let StrictMode's synchronous mount/cleanup probe finish before asking once.
    queueMicrotask(() => { if (!disposed && active) void start(); });
    return () => {
      disposed = true;
      ++requestId;
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      hand.stop();
    };
  }, []);
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError("浏览器暂不支持全屏，请使用 F11。");
    }
  };
  return (
    <main className="experience" data-mode={state}>
      <div ref={host} className="webgl-scene" />
      <div className="vignette" aria-hidden="true" />
      <header className="hero">
        <div className="edition">
          <span /> A LITTLE WONDER <span />
        </div>
        <h1>Merry Christmas</h1>
        <p>MAY YOUR DAYS BE MERRY AND BRIGHT</p>
      </header>
      <div className="corner-mark">
        CHRISTMAS <span> / </span> INTERACTIVE ART
      </div>
      <button
        className="fullscreen"
        onClick={fullscreen}
        aria-label="切换全屏"
        title="全屏"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        >
          <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />
        </svg>
      </button>
      <section className="experience-controls">
        <div className="invitation">A little magic, in your hands.</div>
        <button className="text-trigger" onClick={() => void scene.current?.machine.set("TEXT_CHRISTMAS")}>圣诞快乐 · T</button>
        <p className="privacy">
          {connected
            ? "手势已开启 · 画面仅在本机处理"
            : camera === "摄像头不可用" ? "摄像头未开启 · 可使用键盘体验" : "正在自动连接摄像头"}
          <span> · </span>
          <button onClick={() => setHelp(!help)} aria-expanded={help}>
            键盘体验
          </button>
        </p>
      </section>
      <aside className="status" aria-label="体验状态">
        <div className="status-heading">
          <i className={connected ? "led connected" : "led"} />
          <span>{connected ? "HAND TRACKING" : "KEYBOARD READY"}</span>
        </div>
        <dl>
          <div>
            <dt>CAMERA</dt>
            <dd>{camera}</dd>
          </div>
          <div>
            <dt>GESTURE</dt>
            <dd>{gesture}</dd>
          </div>
          <div>
            <dt>PARTICLES</dt>
            <dd data-testid="mode">{labels[state]}</dd>
          </div>
        </dl>
        <div className="performance">
          {stats.particles ? stats.particles.toLocaleString() : "—"} POINTS{" "}
          <span>·</span> {stats.fps || "—"} FPS <span>·</span> {stats.quality}
        </div>
      </aside>
      <div className="bottom-note">
        SHAPE THE LIGHT. <span>FEEL THE WONDER.</span>
      </div>
      {help && (
        <aside className="keyboard-guide">
          <button
            className="close"
            onClick={() => setHelp(false)}
            aria-label="关闭快捷键说明"
          >
            ×
          </button>
          <h2>YOUR HANDS, YOUR MAGIC</h2>
          <p>
            1 / 2 / 3 <span>数字粒子</span>
          </p>
          <p>
            O / 3 <span>数字 3 → 1 秒后圣诞快乐</span>
          </p>
          <p>
            T <span>圣诞快乐</span>
          </p>
          <p>
            SPACE <span>天天开心</span>
          </p>
          <p>
            F / R <span>星尘重聚成树</span>
          </p>
          <small>拖动旋转 · 手势：1、2、3 / OK、五指、握拳</small>
        </aside>
      )}
      {diag && <Diagnostics />}
      {error && (
        <div className="notice" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="关闭提示">
            ×
          </button>
        </div>
      )}
    </main>
  );
}
