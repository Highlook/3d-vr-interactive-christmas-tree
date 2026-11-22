export type MorphShape = "TREE" | "TEXT" | "NUMBER" | "SCATTER" | "GATHER";
export class ParticleMorph {
  readonly initial: Float32Array;
  readonly current: Float32Array;
  readonly from: Float32Array;
  readonly target: Float32Array;
  readonly progress: Float32Array;
  started = -100;
  duration = 1.7;
  amount = 1;
  treeFrom = 1;
  treeTarget = 1;
  shape: MorphShape = "TREE";
  constructor(
    initial: Float32Array,
    private seeds: Float32Array,
  ) {
    this.initial = initial.slice();
    this.current = initial.slice();
    this.from = initial.slice();
    this.target = initial.slice();
    this.progress = new Float32Array(initial.length / 3).fill(1);
  }
  getTreeMix() {
    return (
      this.treeFrom + (this.treeTarget - this.treeFrom) * this.ease(this.amount)
    );
  }
  ease(p: number) {
    return p * p * (3 - 2 * p);
  }
  snapshot() {
    if (this.amount >= 1) {
      this.current.set(this.target);
      return this.current;
    }
    if (this.amount <= 0) {
      this.current.set(this.from);
      return this.current;
    }
    const e = this.ease(this.amount),
      arc = Math.sin(Math.PI * e);
    for (let i = 0; i < this.current.length; i += 3) {
      const s = (i / 3) * 4;
      const bend =
        arc *
        Math.min(
          1,
          Math.hypot(
            this.target[i] - this.from[i],
            this.target[i + 1] - this.from[i + 1],
            this.target[i + 2] - this.from[i + 2],
          ) * 0.6,
        );
      this.current[i] =
        this.from[i] +
        (this.target[i] - this.from[i]) * e +
        Math.sin(this.seeds[s] * 6.283) * bend * this.seeds[s + 2] * 2.6;
      this.current[i + 1] =
        this.from[i + 1] +
        (this.target[i + 1] - this.from[i + 1]) * e +
        Math.cos(this.seeds[s + 1] * 6.283) * bend * 1.7;
      this.current[i + 2] =
        this.from[i + 2] +
        (this.target[i + 2] - this.from[i + 2]) * e +
        Math.sin(this.seeds[s + 3] * 6.283) * bend * 3.4;
    }
    return this.current;
  }
  to(
    target: Float32Array,
    time: number,
    duration = 1.7,
    treeMix = 0,
    shape: MorphShape = "TEXT",
  ) {
    if (target.length !== this.target.length)
      throw Error("Morph requires the same particle count");
    const tree = this.getTreeMix();
    this.snapshot();
    this.from.set(this.current);
    this.target.set(target);
    this.started = time;
    this.duration = Math.max(0.1, duration);
    this.amount = 0;
    this.treeFrom = tree;
    this.treeTarget = treeMix;
    this.shape = shape;
  }
  update(time: number) {
    this.amount = Math.min(
      1,
      Math.max(0, (time - this.started) / this.duration),
    );
    this.progress.fill(this.amount);
  }
  scatter() {
    const a = new Float32Array(this.target.length);
    for (let i = 0; i < a.length; i += 3) {
      const s = (i / 3) * 4,
        r = 3 + this.seeds[s] * 7,
        angle = this.seeds[s + 1] * Math.PI * 2;
      a[i] = Math.cos(angle) * r;
      a[i + 1] = (this.seeds[s + 2] - 0.5) * 10 + 0.5;
      a[i + 2] = (this.seeds[s + 3] - 0.5) * 10;
    }
    return a;
  }
  gather() {
    const a = new Float32Array(this.target.length);
    for (let i = 0; i < a.length; i += 3) {
      const s = (i / 3) * 4;
      a[i] = (this.seeds[s] - 0.5) * 0.6;
      a[i + 1] = (this.seeds[s + 1] - 0.5) * 0.8 + 0.4;
      a[i + 2] = (this.seeds[s + 2] - 0.5) * 0.6;
    }
    return a;
  }
}
