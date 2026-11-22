import * as THREE from "three";
import { ParticleNumbers } from "./ParticleNumbers";
import { ParticleRibbon } from "./ParticleRibbon";
import { ParticleSystem } from "./ParticleSystem";
import { ParticleText } from "./ParticleText";
import { StarField } from "./StarField";
import { SnowField } from "./SnowField";
import { TreeTopper } from "./TreeTopper";
import { Planet } from "./Planet";
import { PostProcessing } from "./PostProcessing";
import {
  AnimationStateMachine,
  type AnimationState,
  type InputGesture,
} from "./AnimationStateMachine";
import { chooseParticleCount, CONFIG } from "../config/particleConfig";
export interface SceneStats {
  fps: number;
  particles: number;
  quality: string;
}
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
  readonly renderer: THREE.WebGLRenderer;
  readonly particles: ParticleSystem;
  readonly numbers = new ParticleNumbers();
  readonly machine: AnimationStateMachine;
  private stars: StarField;
  private planet: Planet;
  private snow = new SnowField();
  private topper = new TreeTopper();
  private post: PostProcessing;
  private text = new ParticleText();
  private frame = 0;
  private time = 0;
  private last = 0;
  private fpsTime = 0;
  private samples = 0;
  private slow = 0;
  private dpr = Math.min(devicePixelRatio || 1, CONFIG.maxDpr);
  private disposed = false;
  private observer: ResizeObserver;
  private halos: THREE.Mesh[] = [];
  readonly ParticleTreeGroup = new THREE.Group();
  private ribbon = new ParticleRibbon();
  private drag: { id: number; x: number; y: number; time: number } | null = null;
  private velocity = 0;
  private idleSince = 0;
  private autoSpeed = 0;
  private boundVisibility = () => {
    this.last = 0;
    if (!document.hidden && !this.frame && !this.disposed)
      this.frame = requestAnimationFrame(this.animate);
  };
  private down = (e: PointerEvent) => {
    if (e.button !== 0 || this.drag) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp };
    this.velocity = 0;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };
  private move = (e: PointerEvent) => {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const dx = (e.clientX-this.drag.x)*0.006;
    this.ParticleTreeGroup.rotation.y += dx;
    const dt = Math.max(8,e.timeStamp-this.drag.time)/1000;
    this.velocity = THREE.MathUtils.clamp(dx/dt,-3,3);
    this.drag = { id: e.pointerId, x:e.clientX,y:e.clientY,time:e.timeStamp };
  };
  private up = (e: PointerEvent) => {
    if (this.drag?.id !== e.pointerId) return;
    this.drag = null; this.idleSince = this.time;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) this.renderer.domElement.releasePointerCapture(e.pointerId);
  };
  constructor(
    private host: HTMLElement,
    onState: (s: AnimationState) => void,
    private onStats: (s: SceneStats) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x010101);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "实时 WebGL 金色粒子圣诞树场景",
    );
    this.renderer.domElement.setAttribute("role", "img");
    host.append(this.renderer.domElement);
    this.camera.position.set(0, 1, 21.5);
    this.camera.lookAt(0, 0.85, 0);
    this.particles = new ParticleSystem(chooseParticleCount());
    this.ParticleTreeGroup.scale.setScalar(1.17);
    this.ParticleTreeGroup.name = "ParticleTreeGroup";
    this.ParticleTreeGroup.add(this.particles, this.ribbon, this.topper);
    this.scene.add(this.ParticleTreeGroup, this.numbers);
    this.stars = new StarField(5200);
    this.planet = new Planet();
    this.scene.add(this.stars, this.planet, this.snow);
    this.addHalo(0, 0.6, -0.6, 3.0, 4.4, new THREE.Color("#ffd18a"), 0.14, true);
    this.addHalo(0, -3.65, -0.25, 2.7, 0.65, new THREE.Color("#ffe3ae"), 0.12, true);
    this.post = new PostProcessing(this.renderer, this.scene, this.camera);
    this.machine = new AnimationStateMachine(
      this.particles,
      this.text,
      () => this.time,
      () => this.viewWidth(),
      onState,
      this.numbers,
      {
        count: this.ribbon.count + this.topper.count,
        transitionText: (target, time, duration) => {
          this.ribbon.transitionText(target ? target.subarray(0, this.ribbon.count * 3) : null, time, duration);
          this.topper.transitionText(target ? target.subarray(this.ribbon.count * 3) : null, time, duration);
        },
      },
    );
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    document.addEventListener("visibilitychange", this.boundVisibility);
    const canvas = this.renderer.domElement;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.up);
    canvas.addEventListener("pointercancel", this.up);
    canvas.addEventListener("lostpointercapture", this.up);
    this.frame = requestAnimationFrame(this.animate);
  }
  private addHalo(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    color: THREE.Color,
    strength: number,
    tree: boolean,
  ) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color },
        uStrength: { value: strength },
        uTime: { value: 0 },
      },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec2 vUv;uniform vec3 uColor;uniform float uStrength,uTime;void main(){float r=length((vUv-.5)*2.);float a=exp(-r*r*5.)*(1.-smoothstep(.5,1.,r));gl_FragColor=vec4(uColor*uStrength*(.93+.07*sin(uTime*1.5)),a);}",
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, h * 2), material);
    m.position.set(x, y, z);
    m.userData.tree = tree;
    m.userData.strength = strength;
    this.halos.push(m);
    (tree ? this.ParticleTreeGroup : this.scene).add(m);
  }
  viewWidth() {
    return (
      2 *
      Math.tan(THREE.MathUtils.degToRad(42) / 2) *
      this.camera.position.z *
      this.camera.aspect
    );
  }
  private resize() {
    if (this.disposed) return;
    const width = this.host.clientWidth,
      height = this.host.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.position.z =
      this.camera.aspect < 1 ? 21.5 / this.camera.aspect : 21.5;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(width, height);
    this.particles.resize(this.dpr);
    this.numbers.resize(this.dpr);
    this.numbers.position.set(this.viewWidth() * 0.29, 0.45, 0.65);
    this.ribbon.resize(this.dpr);
    this.topper.resize(this.dpr);
    this.planet.resize(this.dpr);
    this.snow.resize(this.dpr);
    this.post.resize(width, height);

  }
  gesture(g: InputGesture) {
    this.machine.gesture(g);
  }
  private animate = (stamp: number) => {
    this.frame = 0;
    if (this.disposed || document.hidden) return;
    const elapsed = this.last ? (stamp-this.last)/1000 : 1/60;
    const delta = this.last
      ? Math.min((stamp - this.last) / 1000, 0.06)
      : 1 / 60;
    this.last = stamp;
    this.time += delta;
    this.particles.update(this.time);
    this.numbers.update(this.time);
    this.stars.update(this.time, delta);
    this.planet.update(this.time, delta);
    this.snow.update(this.time);
    const group = this.ParticleTreeGroup;
    group.rotation.x = 0; // Only yaw is interactive; vertical drags cannot tilt the tree.
    {
      if (!this.drag) {
        group.rotation.y += this.velocity*delta;
        this.velocity *= Math.exp(-3.6*delta);
      }
      const speed = !this.drag && this.time-this.idleSince>3 ? 0.075 : 0;
      this.autoSpeed = THREE.MathUtils.lerp(this.autoSpeed,speed,1-Math.exp(-2*delta));
      if (!this.drag) group.rotation.y += this.autoSpeed*delta;
      // Keep the local tree base on the stage rather than breathing above it.
      group.position.y = this.planet.position.y + .025 - CONFIG.treeBottom * group.scale.y + Math.sin(this.time*.7)*.012;
    }
    group.updateMatrixWorld(true);
    this.particles.material.uniforms.uTextFrame.value.copy(group.matrixWorld).invert();
    const mix = this.particles.morph.getTreeMix();
    this.ribbon.update(this.time, mix);
    this.topper.update(this.time, mix);
    this.post.setTextMix(mix);
    for (const m of this.halos) {
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      if (m.userData.tree) m.quaternion.copy(group.quaternion).invert().multiply(this.camera.quaternion);
      u.uTime.value = this.time;
      u.uStrength.value = m.userData.strength * (m.userData.tree ? mix : 1);
    }
    this.post.render(delta);
    this.samples++;
    this.fpsTime += elapsed;
    if (this.fpsTime >= 2) {
      const fps = Math.round(this.samples / this.fpsTime);
      this.onStats({
        fps,
        particles: this.particles.count + this.ribbon.count + this.numbers.count + 5200 + this.planet.count + this.snow.count + this.topper.count,
        quality: this.dpr < 1.2 ? "流畅" : "高画质",
      });
      this.slow = fps < 43 ? this.slow + 1 : 0;
      if (this.slow >= 3 && this.dpr > 0.9) {
        this.dpr = Math.max(0.85, this.dpr - 0.25);
        this.post.setQuality(this.dpr / CONFIG.maxDpr);
        this.resize();
        this.slow = 0;
      }
      this.fpsTime = 0;
      this.samples = 0;
    }
    this.frame = requestAnimationFrame(this.animate);
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.boundVisibility);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.down);
    canvas.removeEventListener("pointermove", this.move);
    canvas.removeEventListener("pointerup", this.up);
    canvas.removeEventListener("pointercancel", this.up);
    canvas.removeEventListener("lostpointercapture", this.up);
    this.ribbon.dispose();
    this.topper.dispose();
    this.snow.dispose();
    this.numbers.dispose();
    this.machine.dispose();
    this.text.dispose();
    this.particles.dispose();
    this.stars.dispose();
    this.planet.dispose();
    this.post.dispose();
    for (const m of this.halos) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
