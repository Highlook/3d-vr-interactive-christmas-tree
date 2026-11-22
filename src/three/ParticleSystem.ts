import * as THREE from "three";
import { CONFIG } from "../config/particleConfig";
import { createTree } from "./ChristmasTree";
import { ParticleMorph, type MorphShape } from "./ParticleMorph";
const vertex = `
 attribute vec3 aTarget;attribute vec3 aColor;attribute float aSize;attribute vec4 aSeed;
 uniform float uTime,uProgress,uTree,uPixelRatio,uSize,uTextGlow,uTextDensity,uTextSize;uniform vec3 uTextColor;
 uniform mat4 uTextFrame;
 varying vec3 vColor;varying float vLight;varying float vVisible;varying float vTree;
 void main(){float e=uProgress*uProgress*(3.-2.*uProgress);float arc=sin(3.14159265*e)*min(1.,length(aTarget-position)*.6);
 vec3 p=mix(position,aTarget,e);
 p+=vec3(sin(aSeed.x*6.283)*aSeed.z*2.6,cos(aSeed.y*6.283)*1.7,sin(aSeed.w*6.283)*3.4)*arc;
 float drift=.012+uTree*.042;
 p+=vec3(sin(uTime*.6+aSeed.x*60.),cos(uTime*.45+aSeed.y*50.),sin(uTime*.4+aSeed.z*70.))*drift;
 float orbit=uTree*sin(uTime*.18+aSeed.y*6.28)*.065;
 p.xz=mat2(cos(orbit),-sin(orbit),sin(orbit),cos(orbit))*p.xz;
 float escape=pow(max(0.,sin(uTime*.23+aSeed.w*100.)),18.)*step(.965,aSeed.z)*uTree;
 p+=vec3(sin(aSeed.x*10.)*1.1,1.5,cos(aSeed.y*10.)*.8)*escape;
 p=mix((uTextFrame*vec4(p,1.)).xyz,p,uTree);
 vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
 gl_PointSize=clamp(mix(uTextSize,aSize*uSize,uTree)*uPixelRatio*(20./-mv.z),.65,9.*uPixelRatio);
 vColor=mix(mix(uTextColor,vec3(1.,.96,.84),aSeed.w*.6)*uTextGlow,aColor,uTree);
  vVisible=mix(step(aSeed.z,uTextDensity),1.,uTree);vTree=uTree;
 vLight=mix(.62+.38*sin(uTime*(1.2+aSeed.x*3.)+aSeed.y*70.),.86+.14*sin(uTime*(1.2+aSeed.x*3.)+aSeed.y*70.),uTree);
 }`;
const fragment = `precision highp float;varying vec3 vColor;varying float vLight;varying float vVisible;varying float vTree;
 void main(){vec2 q=gl_PointCoord-.5;float r=length(q)*2.;if(r>1.)discard;float core=exp(-r*r*9.);float halo=exp(-r*r*3.)*mix(.18,.40,vTree);gl_FragColor=vec4(vColor*(core+halo)*vLight,(1.-smoothstep(.65,1.,r))*.9*vVisible); }`;
export class ParticleSystem extends THREE.Points<
  THREE.BufferGeometry,
  THREE.ShaderMaterial
> {
  readonly morph: ParticleMorph;
  readonly count: number;
  readonly seeds: Float32Array;
  readonly colors: Float32Array;
  readonly sizes: Float32Array;
  constructor(count: number) {
    const d = createTree(count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(d.positions.slice(), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      "aTarget",
      new THREE.BufferAttribute(d.positions.slice(), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute("aColor", new THREE.BufferAttribute(d.colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(d.sizes, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(d.seeds, 4));
    const material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
        uTextFrame: { value: new THREE.Matrix4() },
        uProgress: { value: 1 },
        uTree: { value: 1 },
        uPixelRatio: { value: 1 },
        uSize: { value: 1.65 },
        uTextGlow: { value: CONFIG.textGlowIntensity },
        uTextDensity: { value: CONFIG.textParticleDensity },
        uTextSize: { value: CONFIG.textParticleSize },
        uTextColor: { value: new THREE.Color("#ffd596") },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    super(geometry, material);
    this.count = count;
    this.seeds = d.seeds;
    this.colors = d.colors;
    this.sizes = d.sizes;
    this.morph = new ParticleMorph(d.positions, d.seeds);
    this.frustumCulled = false;
  }
  transition(
    target: Float32Array,
    time: number,
    duration = 1.7,
    tree = 0,
    shape: MorphShape = "TEXT",
  ) {
    this.morph.to(target, time, duration, tree, shape);
    (this.geometry.attributes.position.array as Float32Array).set(
      this.morph.from,
    );
    (this.geometry.attributes.aTarget.array as Float32Array).set(target);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aTarget.needsUpdate = true;
  }
  update(time: number) {
    this.morph.update(time);
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uProgress.value = this.morph.amount;
    this.material.uniforms.uTree.value = this.morph.getTreeMix();
  }
  setTextStyle(style: { color: string; glow: number }) {
    this.material.uniforms.uTextColor.value.set(style.color);
    this.material.uniforms.uTextGlow.value = style.glow;
  }
  resize(dpr: number) {
    this.material.uniforms.uPixelRatio.value = dpr;
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
