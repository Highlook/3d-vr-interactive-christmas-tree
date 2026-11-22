import { describe, expect, it, vi } from "vitest";
import { HandTracker } from "../src/gestures/HandTracker";
import { gestureConfig } from "../src/config/gestureConfig";
import {
  classifyGesture,
  GestureStabilizer,
  smoothLandmarks,
  type Landmark,
} from "../src/gestures/classifier";

/** Anatomical chains rather than screen-up heuristics. Units are palm lengths. */
function hand(extended: number[], thumb = false): Landmark[] {
  const points: Landmark[] = Array.from({ length: 21 }, () => ({
    x: 0,
    y: 0,
    z: 0,
  }));
  points[0] = { x: 0, y: 0, z: 0 };
  const xs = [-0.6, -0.2, 0.2, 0.6];
  for (let finger = 0; finger < 4; finger++) {
    const m = 5 + finger * 4,
      x = xs[finger];
    points[m] = { x, y: -1, z: 0 };
    if (extended.includes(finger)) {
      points[m + 1] = { x, y: -1.5, z: 0 };
      points[m + 2] = { x, y: -1.9, z: 0 };
      points[m + 3] = { x, y: -2.2, z: 0 };
    } else {
      points[m + 1] = { x, y: -1.45, z: 0 };
      points[m + 2] = { x, y: -1.12, z: 0.18 };
      points[m + 3] = { x, y: -0.8, z: 0.12 };
    }
  }
  points[1] = { x: -0.3, y: -0.1, z: 0 };
  points[2] = { x: -0.65, y: -0.35, z: 0 };
  points[3] = thumb ? { x: -1, y: -0.6, z: 0 } : { x: -0.25, y: -0.3, z: 0.1 };
  points[4] = thumb ? { x: -1.35, y: -0.85, z: 0 } : { x: 0, y: -0.25, z: 0.1 };
  return points;
}

function rotate(
  points: Landmark[],
  radians: number,
  mirror = false,
): Landmark[] {
  return points.map((p) => ({
    x:
      (mirror ? -1 : 1) *
        (p.x * Math.cos(radians) - p.y * Math.sin(radians)) *
        0.1 +
      0.5,
    y: (p.x * Math.sin(radians) + p.y * Math.cos(radians)) * 0.1 + 0.5,
    z: (p.z ?? 0) * 0.1,
  }));
}

/** Shallow OK ring: imperfectly curved index can also pass relaxed PALM. */
function shallowOk(gap = 0.28, depthGap = false): Landmark[] {
  const points = hand([0, 1, 2, 3]);
  const bend = 35 * Math.PI / 180;
  points[7] = { x: points[6].x + .4 * Math.sin(bend), y: points[6].y - .4 * Math.cos(bend), z: 0 };
  points[8] = { x: points[7].x + .3 * Math.sin(bend), y: points[7].y - .3 * Math.cos(bend), z: 0 };
  points[3] = { x: -.8, y: -1.2, z: 0 };
  points[4] = { ...points[8], x: points[8].x + (depthGap ? 0 : gap), z: depthGap ? gap : 0 };
  return points;
}

describe("classifyGesture", () => {
  it.each([
    [[], false, "FIST"],
    [[0], false, "ONE"],
    [[0, 1], false, "TWO"],
    [[0, 1, 2], false, "THREE"],
    [[0, 1, 2, 3], true, "PALM"],
    [[], true, "UNKNOWN"],
    [[1], false, "UNKNOWN"],
    [[0, 2], false, "UNKNOWN"],
    [[0, 1, 3], false, "UNKNOWN"],
    [[0], true, "UNKNOWN"],
  ] as const)(
    "recognizes exact pattern %j thumb %s as %s",
    (fingers, thumb, expected) => {
      expect(classifyGesture(hand([...fingers], thumb))).toBe(expected);
    },
  );

  it("recognizes rotations and mirrored hands without screen-y assumptions", () => {
    for (const angle of [0.4, 1.5, Math.PI, 4.8]) {
      expect(classifyGesture(rotate(hand([0, 1]), angle))).toBe("TWO");
      expect(
        classifyGesture(rotate(hand([0, 1, 2, 3], true), angle, true)),
      ).toBe("PALM");
      expect(classifyGesture(rotate(hand([]), angle, true))).toBe("FIST");
    }
  });

  it("prioritizes a validated OK loop for every combination of the other fingers", () => {
    for (let mask = 0; mask < 8; mask++) {
      const fingers = [1, 2, 3].filter((_, bit) => mask & (1 << bit));
      const points = hand(fingers);
      points[6] = { x: -0.6, y: -1.6, z: 0 };
      points[7] = { x: -0.95, y: -1.65, z: 0 };
      points[8] = { x: -1.05, y: -1.4, z: 0 };
      points[3] = { x: -0.9, y: -1.0, z: 0 };
      points[4] = { ...points[8] };
      expect(classifyGesture(points)).toBe("OK");
      expect(classifyGesture(rotate(points, 2.3, true))).toBe("OK");
    }
  });

  it("never treats thumb-index contact inside a fist as OK or THREE", () => {
    for (const gap of [0, 0.05, 0.15, 0.24, 0.3]) {
      const points = hand([]);
      points[4] = { ...points[8], x: points[8].x + gap };
      for (const angle of [0, 0.6, 1.7, 3.4]) {
        expect(classifyGesture(rotate(points, angle, true))).toBe("FIST");
      }
    }
  });

  it("accepts naturally bent palms with the thumb resting inward", () => {
    for (const finger of [0, 1, 2, 3]) {
      const points = hand([0, 1, 2, 3]);
      const m = 5 + finger * 4, bend = 40 * Math.PI / 180;
      points[m + 2] = { x: points[m + 1].x + .4 * Math.sin(bend), y: points[m + 1].y - .4 * Math.cos(bend), z: 0 };
      points[m + 3] = { x: points[m + 2].x + .3 * Math.sin(bend), y: points[m + 2].y - .3 * Math.cos(bend), z: 0 };
      expect(classifyGesture(points)).toBe("PALM");
      expect(classifyGesture(rotate(points, 2.4, true))).toBe("PALM");
    }
  });

  it("accepts a compact OK ring without requiring other fingers to extend", () => {
    const points = hand([]);
    points[6] = {x: -.6, y: -1.6, z: 0};
    points[7] = {x: -1, y: -1.65, z: 0};
    points[8] = {x: -1, y: -1.2, z: 0};
    points[3] = {x: -.9, y: -.8, z: 0};
    points[4] = {...points[8]};
    expect(classifyGesture(points)).toBe("OK");
    expect(classifyGesture(rotate(points, 2.1, true))).toBe("OK");
  });

  it("accepts a clear palm silhouette despite isolated inferred depth errors", () => {
    for (const joint of [6, 7, 10, 11, 14, 15, 18, 19]) {
      for (const depth of [-.2, .2]) {
        const points = hand([0, 1, 2, 3]);
        points[joint].z = depth;
        expect(classifyGesture(points)).toBe("PALM");
      }
    }
  });

  it("recognizes shallow OK rings before relaxed palms", () => {
    for (const gap of [.18, .26, .3]) {
      for (const depthGap of [false, true]) {
        for (const angle of [0, .7, 2.3, 4]) {
          const points = rotate(shallowOk(gap, depthGap), angle, true);
          expect(classifyGesture(points)).toBe("OK");
        }
      }
    }
  });

  it("uses projected contact only for bounded thumb/index depth disagreement", () => {
    expect(classifyGesture(shallowOk(.4, true))).toBe("OK");
    expect(classifyGesture(shallowOk(.8, true))).not.toBe("OK");
    expect(classifyGesture(shallowOk(.4, false))).not.toBe("OK");
  });

  it("does not turn an ambiguous near-pinch or straight contact into a palm", () => {
    expect(classifyGesture(shallowOk(.39))).toBe("UNKNOWN");
    const points = hand([0, 1, 2, 3]);
    points[4] = {...points[8]};
    expect(classifyGesture(points)).toBe("UNKNOWN");
  });

  it("does not call a straight index touching the thumb an OK loop", () => {
    const points = hand([0]);
    points[4] = { ...points[8] };
    expect(classifyGesture(points)).not.toBe("OK");
  });

  it("keeps a flat contacted fist distinct under deterministic landmark noise", () => {
    for (let frame = 0; frame < 60; frame++) {
      const points = hand([]).map((p, i) => ({
        x: p.x + .012 * Math.sin(frame * .7 + i),
        y: p.y + .012 * Math.cos(frame * .5 + i),
        z: 0,
      }));
      points[4] = { ...points[8] };
      expect(classifyGesture(rotate(points, frame * .1, frame % 2 === 0))).toBe("FIST");
    }
  });

  it("does not mistake an ambiguous half-bent finger for a closed fist", () => {
    const points = hand([]);
    const bend = (40 * Math.PI) / 180;
    points[7] = {
      x: points[6].x + 0.4 * Math.sin(bend),
      y: points[6].y - 0.4 * Math.cos(bend),
      z: 0,
    };
    points[8] = {
      x: points[7].x + 0.3 * Math.sin(bend),
      y: points[7].y - 0.3 * Math.cos(bend),
      z: 0,
    };
    expect(classifyGesture(points)).toBe("UNKNOWN");
  });

  it("rejects malformed, degenerate and nonfinite data", () => {
    expect(classifyGesture([])).toBe("UNKNOWN");
    expect(classifyGesture(new Array<Landmark>(21))).toBe("UNKNOWN");
    expect(
      classifyGesture(Array.from({ length: 21 }, () => ({ x: 0, y: 0 }))),
    ).toBe("UNKNOWN");
    const points = hand([0]);
    points[8].x = NaN;
    expect(classifyGesture(points)).toBe("UNKNOWN");
  });
});

describe("GestureStabilizer", () => {
  it.each([20, 30, 60])("confirms in 120–220ms at %i camera FPS and emits one held edge", (fps) => {
    const stable = new GestureStabilizer();
    const emissions: number[] = [];
    for (let frame = 0; frame < fps * 2; frame++) {
      const timestamp = frame * 1000 / fps;
      if (stable.update("ONE", timestamp)) emissions.push(timestamp);
    }
    expect(emissions).toHaveLength(1);
    expect(emissions[0]).toBeGreaterThanOrEqual(120);
    expect(emissions[0]).toBeLessThanOrEqual(220);
  });

  it("absorbs one wrong vote without restarting confirmation", () => {
    const stable = new GestureStabilizer();
    expect(stable.update("THREE", 0)).toBeNull();
    stable.update("THREE", 40);
    stable.update("TWO", 80);
    stable.update("THREE", 120);
    expect(stable.update("THREE", 160)).toBe("THREE");
  });

  it("requires stronger OK votes without lengthening a clean OK hold", () => {
    const noisy = new GestureStabilizer(160, 0);
    for (const [g, t] of [["OK", 0], ["OK", 40], ["FIST", 80], ["OK", 120], ["OK", 160]] as const)
      expect(noisy.update(g, t)).toBeNull();
    const clean = new GestureStabilizer(160, 0);
    for (const t of [0, 40, 80, 120]) expect(clean.update("OK", t)).toBeNull();
    expect(clean.update("OK", 160)).toBe("OK");
  });

  it("rejects alternating poses and uncertain tracking", () => {
    const stable = new GestureStabilizer();
    for (let frame = 0; frame < 30; frame++)
      expect(stable.update(frame % 2 ? "FIST" : "PALM", frame * 40)).toBeNull();
    const strict = new GestureStabilizer(160, 0, 0.9, 3);
    strict.update("ONE", 0);
    strict.update("ONE", 40);
    strict.update("UNKNOWN", 80);
    strict.update("ONE", 120);
    expect(strict.update("ONE", 160)).toBeNull();
  });

  it("requires independent frames, rejects long gaps and invalid timestamps", () => {
    const stable = new GestureStabilizer();
    stable.update("ONE", 0);
    expect(stable.update("ONE", 0)).toBeNull();
    expect(stable.update("ONE", NaN)).toBeNull();
    expect(stable.update("ONE", 1000)).toBeNull();
    expect(stable.update("ONE", 1160)).toBeNull();
    expect(stable.update("ONE", 1200)).toBe("ONE");
  });

  it("enforces cooldown while accumulating the next stable pose", () => {
    const stable = new GestureStabilizer(160, 300);
    for (const t of [0, 40, 80, 120]) stable.update("ONE", t);
    expect(stable.update("ONE", 160)).toBe("ONE");
    for (const t of [200, 240, 280, 320, 360, 400, 440])
      expect(stable.update("TWO", t)).toBeNull();
    expect(stable.update("TWO", 480)).toBe("TWO");
  });

  it("ignores transient loss but rearms after a confirmed release", () => {
    const stable = new GestureStabilizer(160, 0);
    for (const t of [0, 40, 80, 120]) stable.update("FIST", t);
    expect(stable.update("FIST", 160)).toBe("FIST");
    stable.update("UNKNOWN", 200);
    expect(stable.update("FIST", 240)).toBeNull();
    for (const t of [280, 320, 360, 400, 440]) stable.update("UNKNOWN", t);
    for (const t of [480, 520, 560, 600]) expect(stable.update("FIST", t)).toBeNull();
    expect(stable.update("FIST", 640)).toBe("FIST");
  });

  it("resets timing explicitly and when the timestamp clock restarts", () => {
    const stable = new GestureStabilizer();
    for (const start of [1000, 2000]) {
      stable.reset();
      for (const offset of [0, 40, 80, 120]) stable.update("ONE", start + offset);
      expect(stable.update("ONE", start + 160)).toBe("ONE");
    }
    expect(stable.update("TWO", 0)).toBeNull();
    for (const t of [40, 80, 120]) stable.update("TWO", t);
    expect(stable.update("TWO", 160)).toBe("TWO");
  });
});

it("delivers raw landmark transitions in the confirmation budget without EMA lag", () => {
  const emitted = vi.fn();
  const tracker = new HandTracker(emitted, vi.fn());
  // Exercise the same acceptance path used by worker and main-thread inference.
  const accept = (tracker as unknown as {
    accept(points: Landmark[], timestamp: number): void;
  }).accept.bind(tracker);
  for (let t = 0; t <= 200; t += 40) accept(hand([]), t);
  for (let t = 240; t <= 440; t += 40) accept(hand([0, 1, 2, 3], true), t);
  expect(emitted.mock.calls).toEqual([["FIST"], ["PALM"]]);
  expect(gestureConfig.gestureConfirmMs).toBeGreaterThanOrEqual(120);
  expect(gestureConfig.gestureConfirmMs).toBeLessThanOrEqual(220);
});

it("schedules inference on video frames, drops duplicates/busy frames and cancels on stop", () => {
  const request = vi.fn().mockReturnValue(7);
  const cancel = vi.fn();
  const video = {
    readyState: 2,
    currentTime: 0,
    requestVideoFrameCallback: request,
    cancelVideoFrameCallback: cancel,
    pause: vi.fn(),
    remove: vi.fn(),
    srcObject: null,
  };
  const detect = vi.fn().mockReturnValue({ landmarks: [] });
  const close = vi.fn();
  const tracker = new HandTracker(vi.fn(), vi.fn());
  const internals = tracker as unknown as {
    active: boolean;
    busy: boolean;
    video: typeof video;
    detector: { detectForVideo: typeof detect; close: typeof close };
    scheduleFrame(): void;
    tick(timestamp: number): void;
  };
  internals.active = true;
  internals.video = video;
  internals.detector = { detectForVideo: detect, close };
  internals.scheduleFrame();
  expect(request).toHaveBeenCalledOnce();
  internals.tick(0);
  internals.tick(34); // Same decoded frame must not be inferred twice.
  expect(detect).toHaveBeenCalledTimes(1);
  video.currentTime = 0.07;
  internals.tick(70);
  expect(detect).toHaveBeenCalledTimes(2);
  internals.busy = true;
  video.currentTime = 0.104;
  internals.tick(104);
  expect(detect).toHaveBeenCalledTimes(2);
  vi.stubGlobal("window", { removeEventListener: vi.fn() });
  try {
    tracker.stop();
    expect(cancel).toHaveBeenCalledWith(7);
    expect(close).toHaveBeenCalledOnce();
    const scheduled = request.mock.calls.length;
    internals.tick(138);
    expect(request).toHaveBeenCalledTimes(scheduled);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("smooths landmarks without mutating input", () => {
  const first = [{ x: 0, y: 0, z: 0 }];
  const second = [{ x: 1, y: 2, z: 3 }];
  expect(smoothLandmarks(first, second, 0.5)).toEqual([
    { x: 0.5, y: 1, z: 1.5 },
  ]);
  expect(first[0].x).toBe(0);
  expect(second[0].x).toBe(1);
});

it("corrects camera aspect ratio in the actual tracker acceptance path", () => {
  let distortedCases = 0;
  for (const [width, height] of [[640, 480], [1280, 720], [480, 640]]) {
    const emitted = vi.fn();
    const tracker = new HandTracker(emitted, vi.fn());
    const internals = tracker as unknown as { video: {videoWidth: number; videoHeight: number}; accept(points: Landmark[], timestamp: number): void };
    internals.video = { videoWidth: width, videoHeight: height };
    const bent = hand([0, 1, 2, 3]);
    const bend = 40 * Math.PI / 180;
    bent[7] = {x: bent[6].x + .4 * Math.sin(bend), y: bent[6].y - .4 * Math.cos(bend), z: 0};
    bent[8] = {x: bent[7].x + .3 * Math.sin(bend), y: bent[7].y - .3 * Math.cos(bend), z: 0};
    const metric = rotate(bent, .7);
    const encoded = metric.map(p => ({...p, y: p.y * width / height}));
    if (classifyGesture(encoded) !== "PALM") distortedCases++;
    for (let t = 0; t <= 200; t += 40) internals.accept(encoded, t);
    expect(emitted.mock.calls).toEqual([["PALM"]]);
  }
  // This fixture must fail without correction, rather than just exercising it.
  expect(distortedCases).toBeGreaterThan(0);
});

it("does not emit a number while a contacted fist is held, then quickly detects a relaxed palm", () => {
  const emitted = vi.fn();
  const tracker = new HandTracker(emitted, vi.fn());
  const accept = (tracker as unknown as {accept(points: Landmark[], timestamp: number): void}).accept.bind(tracker);
  const fist = hand([]);
  fist[4] = {...fist[8]};
  for (let t = 0; t <= 1000; t += 40) accept(fist, t);
  for (let t = 1040; t <= 1280; t += 40) accept(hand([0, 1, 2, 3]), t);
  expect(emitted.mock.calls).toEqual([["FIST"], ["PALM"]]);
});

it("emits OK once for a held shallow ring, then PALM only after opening the hand", () => {
  const emitted = vi.fn();
  const tracker = new HandTracker(emitted, vi.fn());
  const accept = (tracker as unknown as {accept(points: Landmark[], timestamp: number): void}).accept.bind(tracker);
  for (let t = 0; t <= 1000; t += 40) accept(shallowOk(.28, true), t);
  expect(emitted.mock.calls).toEqual([["OK"]]);
  for (let t = 1040; t <= 1280; t += 40) accept(hand([0, 1, 2, 3], true), t);
  expect(emitted.mock.calls).toEqual([["OK"], ["PALM"]]);
});
