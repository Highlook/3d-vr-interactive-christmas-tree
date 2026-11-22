import { gestureConfig } from "../config/gestureConfig";

export type Gesture =
  | "ONE"
  | "TWO"
  | "THREE"
  | "OK"
  | "FIST"
  | "PALM"
  | "UNKNOWN";
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

/** Interior joint angle, independent of image rotation and handedness. */
export function jointAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const u = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const v = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  const norm = Math.hypot(...u) * Math.hypot(...v);
  if (norm < 1e-10) return 0;
  return (
    (Math.acos(
      Math.max(-1, Math.min(1, u.reduce((s, x, i) => s + x * v[i], 0) / norm)),
    ) *
      180) /
    Math.PI
  );
}

/** Use joint angles plus whole-chain reach: straight distal joints alone can
 * also occur when a finger folds at the knuckle. No screen-up assumption. */
export function isFingerExtended(points: readonly Landmark[], mcp: number, relaxed = false): boolean {
  const [base, pip, dip, tip] = points.slice(mcp, mcp + 4);
  if (!base || !pip || !dip || !tip || !points[0]) return false;
  const chain = distance(base, pip) + distance(pip, dip) + distance(dip, tip);
  return chain > 1e-6 &&
    jointAngle(base, pip, dip) > (relaxed ? gestureConfig.palmPipAngle : 150) &&
    jointAngle(pip, dip, tip) > (relaxed ? gestureConfig.palmDipAngle : 145) &&
    distance(base, tip) / chain > 0.78 &&
    distance(tip, points[0]) > distance(pip, points[0]) * 1.04;
}

export function isFingerClosed(points: readonly Landmark[], mcp: number): boolean {
  const [base, pip, dip, tip] = points.slice(mcp, mcp + 4);
  if (!base || !pip || !dip || !tip || !points[0]) return false;
  const scale = distance(points[0], points[9]);
  return !isFingerExtended(points, mcp) &&
    distance(tip, points[0]) < distance(pip, points[0]) * 1.12 &&
    (jointAngle(base, pip, dip) < 140 ||
      (distance(tip, base) < scale * 0.55 && jointAngle(pip, dip, tip) < 145));
}

/** Distinguish a validated ring, a near-pinch, and an ordinary open hand.
 * The strict loop remains valid with any other finger pose. A more tolerant
 * path needs raised outer fingers, so a contacted fist cannot use it. */
function classifyPinch(points: readonly Landmark[], scale: number): "OK" | "AMBIGUOUS" | null {
  const [base, pip, dip, tip] = points.slice(5, 9);
  const gap = distance(points[4], tip) / scale;
  const reach = distance(base, tip) / scale;
  const wristReach = distance(tip, points[0]) / scale;
  const opening = distance(pip, points[3]) / scale;
  const strictLoop = gap < gestureConfig.pinchRatio &&
    reach > gestureConfig.okMinReach &&
    wristReach > gestureConfig.okMinWristReach &&
    opening > gestureConfig.okMinOpening && jointAngle(base, pip, dip) < 165;
  if (strictLoop) return "OK";

  const flat = points.map(p => ({ ...p, z: 0 }));
  const raised = [9, 13, 17].filter(i =>
    isFingerExtended(points, i, true) || isFingerExtended(flat, i, true)).length;
  if (raised < 2) return null;
  const projectedScale = distance(flat[0], flat[9]);
  const projectedGap = distance(flat[4], flat[8]);
  const depthGap = Math.abs((points[4].z ?? 0) - (tip.z ?? 0)) / scale;
  // Only use image-plane contact when the palm is not nearly edge-on and
  // the depth discrepancy is bounded; a remote overlapping thumb is not OK.
  const imageContact = projectedScale > scale * 0.55 &&
    projectedGap / projectedScale < gestureConfig.okProjectedPinchRatio &&
    depthGap < gestureConfig.okDepthTolerance;
  const contact = gap < gestureConfig.okRaisedPinchRatio || imageContact;
  const bentIndex = jointAngle(base, pip, dip) < 172 ||
    jointAngle(pip, dip, tip) < 160 ||
    jointAngle(flat[5], flat[6], flat[7]) < 172 ||
    jointAngle(flat[6], flat[7], flat[8]) < 160;
  if (contact && bentIndex && reach > .35 && wristReach > .95 && opening > .25)
    return "OK";
  // A near-pinch that fails ring evidence is uncertain, not a PALM. Both
  // relaxed 3D extension and the 2D depth-noise fallback must respect this.
  if (gap < gestureConfig.palmPinchExclusionRatio || imageContact)
    return "AMBIGUOUS";
  return null;
}

export function isOkSign(points: readonly Landmark[], scale: number): boolean {
  return classifyPinch(points, scale) === "OK";
}

export function isThumbExtended(points: readonly Landmark[]): boolean {
  if (points.length !== 21) return false;
  const scale = distance(points[0], points[9]);
  return (
    scale > 1e-6 &&
    jointAngle(points[1], points[2], points[3]) > 140 &&
    jointAngle(points[2], points[3], points[4]) > 150 &&
    distance(points[4], points[5]) > scale * 0.5 &&
    distance(points[4], points[17]) > distance(points[3], points[17]) * 1.05
  );
}

/** Exact finger patterns, not a count: thumb-up is never mistaken for ONE. */
export function classifyGesture(points: readonly Landmark[]): Gesture {
  if (
    points.length !== 21 ||
    Array.from(points).some(
      (p) =>
        !p ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        (p.z !== undefined && !Number.isFinite(p.z)),
    )
  )
    return "UNKNOWN";
  const scale = distance(points[0], points[9]);
  if (scale < 1e-6) return "UNKNOWN";
  const [index, middle, ring] = [5, 9, 13].map((i) =>
    isFingerExtended(points, i),
  );
  const [indexClosed, middleClosed, ringClosed, pinkyClosed] = [
    5, 9, 13, 17,
  ].map((i) => isFingerClosed(points, i));
  const thumb = isThumbExtended(points);
  const thumbClosed =
    !thumb &&
    (jointAngle(points[1], points[2], points[3]) < 140 ||
      jointAngle(points[2], points[3], points[4]) < 140 ||
      distance(points[4], points[5]) < scale * 0.8);
  // Validate the OK shape before applying its priority. A genuine loop keeps
  // priority with any remaining finger pose; a compact fist cannot pass it.
  const pinch = classifyPinch(points, scale);
  if (pinch === "OK") return "OK";
  if (!thumb && indexClosed && middleClosed && ringClosed && pinkyClosed)
    return "FIST";
  if (pinch === "AMBIGUOUS") return "UNKNOWN";
  // Four clearly extended fingers suffice for a palm; requiring the thumb to
  // splay at one exact angle rejects natural palms, especially in perspective.
  const fingers = [5, 9, 13, 17];
  if (fingers.every(i => isFingerExtended(points, i, true))) return "PALM";
  // When the four-finger silhouette is clear, a single noisy inferred depth
  // joint must not veto a palm. Keep the same chain/reach checks in the image.
  const silhouette = points.map(p => ({ ...p, z: 0 }));
  if (fingers.every(i => isFingerExtended(silhouette, i, true))) return "PALM";
  if (thumbClosed && index && middleClosed && ringClosed && pinkyClosed)
    return "ONE";
  if (thumbClosed && index && middle && ringClosed && pinkyClosed) return "TWO";
  if (thumbClosed && index && middle && ring && pinkyClosed) return "THREE";
  return "UNKNOWN";
}

/** Time-window votes suppress isolated misclassifications without restarting a hold. */
export class GestureStabilizer {
  private samples: { gesture: Gesture; timestamp: number }[] = [];
  private lastEmitted: Gesture | null = null;
  private lastEmission = -Infinity;
  private lastTimestamp = -Infinity;

  constructor(
    private confirmMs: number = gestureConfig.gestureConfirmMs,
    private cooldownMs: number = gestureConfig.gestureCooldownMs,
    private confidenceThreshold: number = gestureConfig.gestureConfidenceThreshold,
    private stableFrames: number = gestureConfig.gestureStableFrames,
  ) {}

  reset(): void {
    this.samples = [];
    this.lastEmitted = null;
    this.lastEmission = -Infinity;
    this.lastTimestamp = -Infinity;
  }

  update(gesture: Gesture, timestamp: number): Gesture | null {
    if (!Number.isFinite(timestamp)) return null;
    if (timestamp < this.lastTimestamp) this.reset();
    // Repeated video frames cannot count as independent confirmation evidence.
    if (timestamp === this.lastTimestamp) return null;
    // A stalled detector cannot turn two widely separated observations into a hold.
    if (timestamp - this.lastTimestamp > this.confirmMs) this.samples = [];
    this.lastTimestamp = timestamp;
    this.samples.push({ gesture, timestamp });
    // Keep one sample at/before the window boundary to measure elapsed hold time.
    while (
      this.samples.length > 1 &&
      this.samples[1].timestamp <= timestamp - this.confirmMs
    ) this.samples.shift();

    if (gesture === this.lastEmitted) return null;
    const votes = this.samples.filter((sample) => sample.gesture === gesture);
    if (
      votes.length < this.stableFrames ||
      votes.length / this.samples.length < (gesture === "OK" ? Math.max(0.85, this.confidenceThreshold) : this.confidenceThreshold) ||
      timestamp - votes[0].timestamp < this.confirmMs ||
      timestamp - this.lastEmission < this.cooldownMs
    ) return null;
    // A confirmed release rearms an edge; a single missing frame never does.
    if (gesture === "UNKNOWN") {
      this.lastEmitted = null;
      return null;
    }
    this.lastEmitted = gesture;
    this.lastEmission = timestamp;
    return gesture;
  }
}

export function smoothLandmarks(
  previous: readonly Landmark[] | null,
  next: readonly Landmark[],
  alpha: number = gestureConfig.smoothingAlpha,
): Landmark[] {
  if (!previous || previous.length !== next.length)
    return next.map((p) => ({ ...p }));
  const weight = Math.max(0, Math.min(1, alpha));
  return next.map((p, i) => ({
    x: previous[i].x + weight * (p.x - previous[i].x),
    y: previous[i].y + weight * (p.y - previous[i].y),
    z: (previous[i].z ?? 0) + weight * ((p.z ?? 0) - (previous[i].z ?? 0)),
  }));
}
