import { ParticleSystem } from "./ParticleSystem";
import { ParticleText } from "./ParticleText";
export type AnimationState = "INITIAL" | "NUMBER_1" | "NUMBER_2" | "NUMBER_3" | "TEXT_CHRISTMAS" | "TREE_RESET" | "TEXT_HAPPY" | "SCATTER";
export type InputGesture = "ONE" | "TWO" | "THREE" | "OK" | "FIST" | "PALM" | "UNKNOWN";
export interface NumberEffects {
  count: number;
  show(target: Float32Array, time: number): void;
  hide(time: number): void;
}
export interface DecorationEffects {
 count: number;
 transitionText(target: Float32Array | null, time: number, duration: number): void;
}
export class AnimationStateMachine {
  state: AnimationState = "INITIAL";
  private token = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dead = false;
  constructor(
    private particles: ParticleSystem,
    private text: ParticleText,
    private now: () => number,
    private width: () => number,
    private onState: (s: AnimationState) => void,
    private numbers?: NumberEffects,
    private decorations?: DecorationEffects,
  ) {}
  private cancel() {
    this.token++;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private later(ms: number, id: number, next: AnimationState) {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (id === this.token && !this.dead) void this.set(next);
    }, ms);
  }
  gesture(g: InputGesture) {
    const map: Partial<Record<InputGesture, AnimationState>> = {
      ONE: "NUMBER_1", TWO: "NUMBER_2", THREE: "NUMBER_3", OK: "NUMBER_3",
      FIST: "TREE_RESET", PALM: "TEXT_HAPPY",
    };
    if (map[g]) void this.set(map[g]!);
  }
  async set(next: AnimationState) {
    if (this.dead || next === this.state) return;
    this.cancel();
    const id = this.token;
    this.state = next;
    this.onState(next);
    const p = this.particles, time = () => this.now();
    const number = next.startsWith("NUMBER");
    if (!number) this.numbers?.hide(time());
    if (next === "INITIAL" || next === "TREE_RESET") {
      // A single continuous return: no scatter stage or timer that can undo a new gesture.
      p.transition(p.morph.initial, time(), 1.15, 1, "TREE");
      this.decorations?.transitionText(null, time(), 1.15);
      if (next === "TREE_RESET") this.later(1200, id, "INITIAL");
      return;
    }
    if (next === "SCATTER") {
      p.transition(p.morph.scatter(), time(), 1.2, 0, "SCATTER");
      return;
    }
    // Start the one-second delay at recognition, independently of font loading/render FPS.
    if (next === "NUMBER_3") this.later(1000, id, "TEXT_CHRISTMAS");
    try {
      if (number) {
        if (p.morph.treeTarget !== 1)
          p.transition(p.morph.initial, time(), 1.15, 1, "TREE");
        this.decorations?.transitionText(null, time(), 1.15);
        if (!this.numbers) return;
        const target = await this.text.create(this.numbers.count, {
          text: next.slice(-1), width: 1.4, center: [0, 0, 0], particleDensity: 3,
        });
        if (id !== this.token || this.dead) return;
        this.numbers.show(target, time());
        return;
      }
      const options = {
        text: next === "TEXT_CHRISTMAS" ? "圣诞快乐" : "天天开心",
        width: Math.min(13, this.width() * 0.86), center: [0, 0.3, 0] as [number, number, number],
      };
      const [target, decorationTarget] = await Promise.all([
        this.text.create(p.count, options),
        this.decorations ? this.text.create(this.decorations.count, options) : Promise.resolve(null),
      ]);
      if (id !== this.token || this.dead) return;
      p.setTextStyle(this.text.style);
      p.transition(target, time(), this.text.style.transitionDuration, 0, "TEXT");
      this.decorations?.transitionText(decorationTarget, time(), this.text.style.transitionDuration);
      if (next === "TEXT_HAPPY") this.later(6500, id, "TREE_RESET");
    } catch (e) {
      if (id !== this.token || this.dead) return;
      this.cancel();
      this.numbers?.hide(time());
      this.state = "INITIAL";
      this.onState("INITIAL");
      p.transition(p.morph.initial, time(), 1.15, 1, "TREE");
      this.decorations?.transitionText(null, time(), 1.15);
      console.error("Particle text:", e);
    }
  }
  dispose() { this.dead = true; this.cancel(); }
}
