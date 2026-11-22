import * as THREE from "three";
import { CONFIG } from "../config/particleConfig";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/** Linear scene rendering, restrained bloom, then display color conversion. */
export class PostProcessing {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly outputPass: OutputPass;
  private readonly renderer: THREE.WebGLRenderer;
  private width: number;
  private height: number;
  private quality = 1;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    this.width = Math.max(1, size.x);
    this.height = Math.max(1, size.y);
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.65,
      0.45,
      0.88,
    );
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
    this.resize(this.width, this.height);
  }

  setTextMix(mix: number) {
    this.bloomPass.strength = THREE.MathUtils.lerp(CONFIG.textBloomStrength, 0.95, mix);
  }

  render(delta: number): void {
    this.composer.render(
      Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0,
    );
  }

  resize(width: number, height: number): void {
    this.width = Number.isFinite(width) ? Math.max(1, Math.floor(width)) : 1;
    this.height = Number.isFinite(height) ? Math.max(1, Math.floor(height)) : 1;
    this.composer.setPixelRatio(this.renderer.getPixelRatio() * this.quality);
    this.composer.setSize(this.width, this.height);
  }

  setQuality(scale: number): void {
    this.quality = Number.isFinite(scale)
      ? THREE.MathUtils.clamp(scale, 0.35, 1.5)
      : 1;
    this.resize(this.width, this.height);
  }

  dispose(): void {
    this.renderPass.dispose();
    this.bloomPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
  }
}
