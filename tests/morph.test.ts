import { describe, it, expect, vi, afterEach } from "vitest";
import { ParticleMorph } from "../src/three/ParticleMorph";
import { createTree } from "../src/three/ChristmasTree";
import { AnimationStateMachine } from "../src/three/AnimationStateMachine";
import type { ParticleSystem } from "../src/three/ParticleSystem";
import type { ParticleText } from "../src/three/ParticleText";
describe("GPU morph backing data", () => {
  const initial = new Float32Array([0, 1, 0, 2, 3, 4]),
    seeds = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  it("starts with the complete tree instead of an initial blast", () => {
    const m = new ParticleMorph(initial, seeds);
    m.update(0.01);
    expect(m.amount).toBe(1);
    expect(m.snapshot()).toEqual(initial);
  });
  it("uses the same buffers and reaches exact destinations", () => {
    const m = new ParticleMorph(initial, seeds);
    const ref = m.target;
    const target = new Float32Array([5, 4, 3, -2, -1, 0]);
    m.to(target, 10, 2);
    m.update(12);
    expect(m.target).toBe(ref);
    expect(m.snapshot()).toEqual(target);
    expect(m.initial).toEqual(initial);
  });
  it("captures the in-flight trajectory on interruption", () => {
    const m = new ParticleMorph(initial, seeds);
    m.to(new Float32Array([6, 7, 8, 1, 0, -1]), 0, 2);
    m.update(0.7);
    const before = m.snapshot().slice();
    m.to(initial, 0.7, 1);
    expect(m.from).toEqual(before);
    m.update(0.7);
    expect(m.snapshot()).toEqual(before);
  });
  it("does not disturb stationary particles during number transitions", () => {
    const m = new ParticleMorph(initial, seeds);
    m.to(initial, 0, 2);
    m.update(1);
    expect(m.snapshot()).toEqual(initial);
  });
  it("produces finite scatter and gather coordinates", () => {
    const m = new ParticleMorph(initial, seeds);
    expect([...m.scatter(), ...m.gather()].every(Number.isFinite)).toBe(true);
    expect(() => m.to(new Float32Array(3), 0)).toThrow("same particle count");
  });
  it("creates 26000 actual spatial particles and per-particle properties", () => {
    const d = createTree(26000);
    expect(d.positions.length).toBe(78000);
    expect(d.seeds.length).toBe(104000);
    expect(d.colors.length).toBe(78000);
    expect(d.sizes.length).toBe(26000);
    expect(d.positions.every(Number.isFinite)).toBe(true);
    const z = d.positions.filter((_, i) => i % 3 === 2);
    expect(Math.max(...z) - Math.min(...z)).toBeGreaterThan(4);
  });
});
describe("state transition cancellation", () => {
  afterEach(() => vi.useRealTimers());
  it("cancels the question auto-return when a new gesture arrives", async () => {
    vi.useFakeTimers();
    const initial = new Float32Array(30);
    const morph = new ParticleMorph(initial, new Float32Array(40));
    const transition = vi.fn();
    const p = {
      count: 10,
      morph,
      transition,
      setTextStyle: vi.fn(),
    } as unknown as ParticleSystem;
    const text = {
      create: vi.fn(async (count: number) => new Float32Array(count * 3)),
      style: { color: "#fff", glow: 1, transitionDuration: 1 },
    } as unknown as ParticleText;
    const s = new AnimationStateMachine(
      p,
      text,
      () => 0,
      () => 20,
      () => {},
    );
    const first = s.set("TEXT_HAPPY");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(650);
    const second = s.set("NUMBER_2");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(350);
    await second;
    await vi.advanceTimersByTimeAsync(10000);
    await first;
    expect(s.state).toBe("NUMBER_2");
    s.dispose();
  });
  it("ignores late text sampling after disposal", async () => {
    let done!: (a: Float32Array) => void;
    const transition = vi.fn();
    const morph = new ParticleMorph(new Float32Array(30), new Float32Array(40));
    const p = { count: 10, morph, transition } as unknown as ParticleSystem;
    const text = {
      create: () =>
        new Promise<Float32Array>((resolve) => {
          done = resolve;
        }),
    } as unknown as ParticleText;
    const s = new AnimationStateMachine(
      p,
      text,
      () => 0,
      () => 20,
      () => {},
    );
    const pending = s.set("TEXT_CHRISTMAS");
    s.dispose();
    done(new Float32Array(30));
    await pending;
    expect(transition).not.toHaveBeenCalled();
  });
});
