import { useEffect, useState } from "react";
import { handDiagnostics, type HandDiagnostics } from "../gestures/diagnostics";

/** Opt-in on-screen readout (?diag=1) so remote phones can report runtime state. */
export default function Diagnostics() {
  const [snapshot, setSnapshot] = useState<HandDiagnostics>({ ...handDiagnostics });
  // 面板只服务于排障，默认展开；点右上角即可收起，不遮挡画面。
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => setSnapshot({ ...handDiagnostics }), 500);
    return () => clearInterval(timer);
  }, []);
  const support = {
    ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, ""),
    secure: String(window.isSecureContext),
    media: String(Boolean(navigator.mediaDevices?.getUserMedia)),
    rvfc: String(typeof HTMLVideoElement.prototype.requestVideoFrameCallback === "function"),
    bitmap: String(typeof createImageBitmap === "function"),
    offscreen: String(typeof OffscreenCanvas === "function"),
  };
  const rows: [string, string][] = [
    ["mode", snapshot.mode],
    ["delegate", snapshot.delegate],
    ["pump", snapshot.pump],
    ["status", snapshot.status],
    ["frames", `${snapshot.framesSent} → ${snapshot.framesBack}`],
    ["hands", String(snapshot.handsSeen)],
    ["fps", String(snapshot.inferenceFps)],
    ["video", `${snapshot.readyState} · t=${snapshot.videoTime.toFixed(1)}`],
    ["error", snapshot.lastError || "-"],
    ["secure", support.secure],
    ["media", support.media],
    ["rvfc", support.rvfc],
    ["bitmap", support.bitmap],
    ["offscreen", support.offscreen],
  ];
  return (
    <div className={open ? "diag" : "diag is-collapsed"} role="status">
      <div className="diag-head">
        <b>DIAGNOSTICS</b>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "收起诊断面板" : "展开诊断面板"}
          title={open ? "收起" : "展开"}
        >
          {open ? "×" : "···"}
        </button>
      </div>
      {open && (
        <>
          <ul>
            {rows.map(([key, value]) => (
              <li key={key}>
                <i>{key}</i>
                <span>{value}</span>
              </li>
            ))}
          </ul>
          <p>{support.ua}</p>
        </>
      )}
    </div>
  );
}
