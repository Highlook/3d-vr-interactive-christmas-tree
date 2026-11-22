import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimationStateMachine, type InputGesture } from "../src/three/AnimationStateMachine";
import { ParticleMorph } from "../src/three/ParticleMorph";
import type { ParticleSystem } from "../src/three/ParticleSystem";
import type { ParticleText } from "../src/three/ParticleText";

function fixture(withDecorations = false) {
  vi.useFakeTimers();
  const morph = new ParticleMorph(new Float32Array(30), new Float32Array(40));
  const transition = vi.fn((target: Float32Array, time: number, duration: number, treeMix: number) => {
    morph.to(target, time, duration, treeMix);
  });
  const particles = { count: 10, morph, transition, setTextStyle: vi.fn() } as unknown as ParticleSystem;
  const create = vi.fn(async (count: number, _options: unknown) => new Float32Array(count * 3).fill(2));
  const text = { create, style: { color: "#fff", glow: 1, transitionDuration: 1 } } as unknown as ParticleText;
  const numbers = { count: 4, show: vi.fn(), hide: vi.fn() };
  const onState = vi.fn();
  const decorations = { count: 6, transitionText: vi.fn() };
  const machine = new AnimationStateMachine(particles, text, () => Date.now() / 1000, () => 20, onState, numbers, withDecorations ? decorations : undefined);
  return { machine, morph, transition, create, numbers, onState, decorations };
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("independent number effects and gesture timers", () => {
  it("starts decoration text from the same complete word and returns on fist", async () => {
    const { machine, create, decorations, transition } = fixture(true);
    await machine.set('TEXT_CHRISTMAS');
    expect(create).toHaveBeenCalledWith(6, expect.objectContaining({text:'圣诞快乐'}));
    expect(decorations.transitionText).toHaveBeenCalledExactlyOnceWith(expect.any(Float32Array), expect.any(Number), 1);
    expect(decorations.transitionText.mock.calls[0][0]).toHaveLength(18);
    expect(transition.mock.calls[0][0]).toHaveLength(30);
    await machine.set('TREE_RESET');
    expect(decorations.transitionText).toHaveBeenLastCalledWith(null, expect.any(Number), 1.15);
    machine.dispose();
  });
  it("samples the separate number count and leaves the tree target and buffers untouched", async () => {
    const { machine, morph, transition, create, numbers } = fixture();
    const target = morph.target;
    const before = target.slice();
    await machine.set("NUMBER_1");
    await machine.set("NUMBER_2");
    expect(create).toHaveBeenNthCalledWith(1, 4, expect.objectContaining({ text: "1" }));
    expect(create).toHaveBeenNthCalledWith(2, 4, expect.objectContaining({ text: "2" }));
    expect(numbers.show).toHaveBeenCalledTimes(2);
    expect(numbers.show.mock.calls[1][0]).toHaveLength(12);
    expect(transition).not.toHaveBeenCalled();
    expect(morph.target).toBe(target);
    expect(morph.target).toEqual(before);
    expect(numbers.hide).not.toHaveBeenCalled();
    machine.dispose();
  });

  it("returns the main particles to the tree when a number interrupts text", async () => {
    const { machine, morph, transition, numbers } = fixture();
    await machine.set("TEXT_CHRISTMAS");
    transition.mockClear();
    await machine.set("NUMBER_2");
    expect(transition).toHaveBeenCalledExactlyOnceWith(morph.initial, expect.any(Number), 1.15, 1, "TREE");
    expect(numbers.show).toHaveBeenCalledOnce();
    machine.dispose();
  });

  it("starts Christmas exactly 1000ms after THREE even when number sampling is unresolved", async () => {
    const { machine, create, numbers, onState } = fixture();
    let resolveNumber!: (value: Float32Array) => void;
    create.mockImplementationOnce(() => new Promise(resolve => { resolveNumber = resolve; }));
    machine.gesture("THREE");
    await vi.advanceTimersByTimeAsync(999);
    expect(machine.state).toBe("NUMBER_3");
    await vi.advanceTimersByTimeAsync(1);
    expect(machine.state).toBe("TEXT_CHRISTMAS");
    expect(onState.mock.calls.map(([state]) => state)).toEqual(["NUMBER_3", "TEXT_CHRISTMAS"]);
    resolveNumber(new Float32Array(12));
    await Promise.resolve();
    expect(numbers.show).not.toHaveBeenCalled();
    expect(numbers.hide).toHaveBeenCalledOnce();
    machine.dispose();
  });

  it.each(["ONE", "TWO", "FIST", "PALM"] as InputGesture[])("%s cancels the pending THREE message", async gesture => {
    const { machine, onState } = fixture();
    machine.gesture("THREE");
    await vi.advanceTimersByTimeAsync(400);
    machine.gesture(gesture);
    await vi.advanceTimersByTimeAsync(700);
    expect(onState.mock.calls.map(([state]) => state)).not.toContain("TEXT_CHRISTMAS");
    expect(machine.state).toBe(({ ONE: "NUMBER_1", TWO: "NUMBER_2", FIST: "TREE_RESET", PALM: "TEXT_HAPPY" } as const)[gesture as "ONE" | "TWO" | "FIST" | "PALM"]);
    machine.dispose();
  });

  it("does not resample or restart the one-second deadline for a held THREE/OK pose", async () => {
    const { machine, create, numbers, onState } = fixture();
    machine.gesture("THREE");
    await vi.advanceTimersByTimeAsync(600);
    machine.gesture("THREE");
    machine.gesture("OK");
    machine.gesture("UNKNOWN");
    await vi.advanceTimersByTimeAsync(399);
    expect(create).toHaveBeenCalledOnce();
    expect(numbers.show).toHaveBeenCalledOnce();
    expect(onState).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(machine.state).toBe("TEXT_CHRISTMAS");
    machine.dispose();
  });

  it("FIST returns directly in 1.15 seconds and reaches INITIAL at 1.2 seconds", async () => {
    const { machine, morph, transition } = fixture();
    machine.gesture("FIST");
    expect(transition).toHaveBeenCalledExactlyOnceWith(morph.initial, expect.any(Number), 1.15, 1, "TREE");
    await vi.advanceTimersByTimeAsync(1199);
    expect(machine.state).toBe("TREE_RESET");
    await vi.advanceTimersByTimeAsync(1);
    expect(machine.state).toBe("INITIAL");
    expect(transition.mock.calls.every(call => call[3] === 1)).toBe(true);
    machine.dispose();
  });

  it("PALM returns after 6.5 seconds and a new number cancels that return", async () => {
    const { machine } = fixture();
    machine.gesture("PALM");
    await vi.advanceTimersByTimeAsync(6499);
    expect(machine.state).toBe("TEXT_HAPPY");
    await vi.advanceTimersByTimeAsync(1);
    expect(machine.state).toBe("TREE_RESET");
    await vi.advanceTimersByTimeAsync(1200);
    expect(machine.state).toBe("INITIAL");
    await machine.set("TEXT_HAPPY");
    await vi.advanceTimersByTimeAsync(1000);
    await machine.set("NUMBER_1");
    await vi.advanceTimersByTimeAsync(10000);
    expect(machine.state).toBe("NUMBER_1");
    machine.dispose();
  });

  it("disposal cancels THREE and prevents a late independent-number show", async () => {
    const { machine, create, numbers, onState } = fixture();
    let resolveNumber!: (value: Float32Array) => void;
    create.mockImplementationOnce(() => new Promise(resolve => { resolveNumber = resolve; }));
    const pending = machine.set("NUMBER_3");
    machine.dispose();
    resolveNumber(new Float32Array(12));
    await pending;
    await vi.advanceTimersByTimeAsync(2000);
    expect(numbers.show).not.toHaveBeenCalled();
    expect(onState).toHaveBeenCalledOnce();
  });
});
