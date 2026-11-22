import * as THREE from "three";

const COUNT = 2400;
const MORPH_SECONDS = 0.8;
const SWITCH_SPREAD = 0.38;
const FADE_IN_SECONDS = 0.35;
const FADE_OUT_SECONDS = 0.5;

const smooth = (value: number): number => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Independent, reusable number cloud. All times are SceneManager seconds.
 * Supply ParticleText.create(count, { ..., center: [0, 0, 0] }) as the target.
 * `position` contains the actual interpolated local coordinates; the shader adds
 * only a continuous sub-pixel drift, whose phase never resets between numbers.
 */
export class ParticleNumbers extends THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  readonly count = COUNT;
  private readonly from = new Float32Array(COUNT * 3);
  private readonly target = new Float32Array(COUNT * 3);
  private readonly offsets = new Float32Array(COUNT * 3);
  private morphStart = 0;
  private morphing = false;
  private fadeStart = 0;
  private fadeFrom = 0;
  private fadeTo = 0;
  private fadeDuration = FADE_IN_SECONDS;
  private disposed = false;

  constructor() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT);
    const sizes = new Float32Array(COUNT);
    const warmth = new Float32Array(COUNT);
    // A deterministic, independent cloud is created just once. Subsequent show
    // calls always start at the current trajectory, including during a fade.
    for (let i = 0; i < COUNT; i++) {
      const fraction = (i + 0.5) / COUNT;
      const angle = i * 2.399963229728653;
      const height = 1 - 2 * fraction;
      const radial = Math.sqrt(Math.max(0, 1 - height * height));
      const depth = 0.35 + 0.65 * ((i * 0.7548776662466927) % 1);
      positions[i * 3] = Math.cos(angle) * radial * depth * 6;
      positions[i * 3 + 1] = height * depth * 3.8;
      positions[i * 3 + 2] = Math.sin(angle) * radial * depth * 2;
      phases[i] = ((i * 0.618033988749895) % 1) * Math.PI * 2;
      sizes[i] = 0.8 + ((i * 0.414213562373095) % 1) * 0.4;
      warmth[i] = (i * 0.732050807568877) % 1;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aWarmth", new THREE.BufferAttribute(warmth, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uPixelRatio: { value: 1 },
        uSize: { value: 5.8 },
        // Diagnostic progress; motion is evaluated in the persistent CPU buffer.
        uMorph: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        attribute float aSize;
        attribute float aWarmth;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uSize;
        varying float vTwinkle;
        varying float vWarmth;
        void main() {
          vec3 drift = vec3(
            sin(uTime * 0.31 + aPhase),
            cos(uTime * 0.27 + aPhase * 1.37),
            sin(uTime * 0.23 + aPhase * 0.83)
          ) * vec3(0.008, 0.008, 0.005);
          vec4 viewPosition = modelViewMatrix * vec4(position + drift, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          // Size is steady; only brightness breathes gently with a fixed phase.
          gl_PointSize = clamp(uSize * aSize * uPixelRatio * 20.0 /
            max(1.0, -viewPosition.z), 1.0 * uPixelRatio, 12.0 * uPixelRatio);
          vTwinkle = 0.92 + 0.08 * sin(uTime * 0.75 + aPhase);
          vWarmth = aWarmth;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vTwinkle;
        varying float vWarmth;
        void main() {
          float radius = length(gl_PointCoord - 0.5) * 2.0;
          if (radius >= 1.0) discard;
          float core = exp(-radius * radius * 42.0);
          float halo = exp(-radius * radius * 7.5) * 0.28;
          float bloom = exp(-radius * radius * 2.6) * 0.085;
          float edge = 1.0 - smoothstep(0.55, 1.0, radius);
          vec3 gold = vec3(1.0, 0.76, 0.38);
          vec3 pearl = vec3(1.0, 0.98, 0.89);
          vec3 color = mix(gold, pearl, 0.4 + 0.6 * vWarmth);
          color = mix(color, pearl, core * 0.7);
          gl_FragColor = vec4(color, (core + halo + bloom) * edge *
            vTwinkle * uOpacity * 0.78);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    super(geometry, material);
    this.name = "particle-numbers";
    this.visible = false;
    this.frustumCulled = false;
    this.from.set(positions);
    this.target.set(positions);
  }

  show(target: Float32Array, time: number): void {
    if (this.disposed) return;
    if (target.length !== this.count * 3 || !target.every(Number.isFinite)) {
      throw new RangeError(`ParticleNumbers requires ${this.count * 3} finite target coordinates`);
    }
    this.checkTime(time);
    // Evaluate before rebasing: even a mid-morph / mid-hide interruption keeps
    // exactly the same rendered position (the shader's tiny drift is unchanged).
    this.update(time);
    const switching = this.visible && this.material.uniforms.uOpacity.value > 0.05 && target.some((v, i) => Math.abs(v - this.target[i]) > 0.0001);
    this.from.set(this.geometry.getAttribute("position").array);
    const phases = this.geometry.getAttribute("aPhase");
    // Assign one bounded arc per particle at the edge, never randomise per frame.
    for (let i = 0; i < this.count; i++) {
      const j = i * 3, phase = phases.getX(i);
      const distance = Math.hypot(target[j]-this.from[j], target[j+1]-this.from[j+1], target[j+2]-this.from[j+2]);
      const amplitude = switching ? SWITCH_SPREAD * Math.min(1, distance / 0.6) : 0;
      this.offsets[j] = Math.cos(phase) * amplitude;
      this.offsets[j+1] = Math.sin(phase) * amplitude * 0.58;
      this.offsets[j+2] = Math.sin(phase * 1.37) * amplitude * 0.5;
    }
    this.target.set(target);
    this.morphStart = time;
    this.morphing = true;
    this.material.uniforms.uMorph.value = 0;
    this.fadeFrom = this.material.uniforms.uOpacity.value;
    this.fadeTo = 1;
    this.fadeStart = time;
    this.fadeDuration = FADE_IN_SECONDS;
    this.visible = true;
  }

  hide(time: number): void {
    if (this.disposed) return;
    this.checkTime(time);
    this.update(time);
    this.fadeFrom = this.material.uniforms.uOpacity.value;
    this.fadeTo = 0;
    this.fadeStart = time;
    this.fadeDuration = FADE_OUT_SECONDS;
    // Morph keeps running during/after the fade, so showing again never scatters.
  }

  update(time: number): void {
    if (this.disposed) return;
    this.checkTime(time);
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = time;
    if (this.morphing) {
      const progress = THREE.MathUtils.clamp((time - this.morphStart) / MORPH_SECONDS, 0, 1);
      const blend = smooth(progress);
      const arc = Math.sin(Math.PI * progress) ** 2;
      const position = this.geometry.getAttribute("position") as THREE.BufferAttribute;
      const coordinates = position.array as Float32Array;
      for (let i = 0; i < coordinates.length; i++) {
        coordinates[i] = progress === 1 ? this.target[i] : this.from[i] + (this.target[i] - this.from[i]) * blend + this.offsets[i] * arc;
      }
      position.needsUpdate = true;
      uniforms.uMorph.value = progress;
      if (progress === 1) this.morphing = false;
    }
    const fade = smooth((time - this.fadeStart) / this.fadeDuration);
    uniforms.uOpacity.value = this.fadeFrom + (this.fadeTo - this.fadeFrom) * fade;
    if (this.fadeTo === 0 && fade === 1) this.visible = false;
  }

  resize(dpr: number): void {
    if (!this.disposed && Number.isFinite(dpr) && dpr > 0) {
      this.material.uniforms.uPixelRatio.value = dpr;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.visible = false;
    this.geometry.dispose();
    this.material.dispose();
    this.removeFromParent();
  }

  private checkTime(time: number): void {
    if (!Number.isFinite(time)) throw new RangeError("ParticleNumbers time must be finite seconds");
  }
}
