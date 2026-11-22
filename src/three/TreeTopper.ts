import * as THREE from 'three';
import { DecorationMorph, decorationDeclarations } from './DecorationMorph';

/** Volumetric, faceted particle star: every point also belongs to the text pool. */
export class TreeTopper extends THREE.Group {
  readonly count = 1200;
  private readonly glow: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly morph: DecorationMorph;
  constructor() {
    super();
    this.name = 'tree-topper';
    this.position.y = 4.7;
    const positions = new Float32Array(this.count * 3);
    const seeds = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      const edge = i % 10, fraction = (i * .61803398875) % 1;
      const angle = Math.PI / 2 + edge * Math.PI / 5;
      const next = angle + Math.PI / 5;
      const a = edge % 2 === 0 ? .43 : .19, b = edge % 2 === 0 ? .19 : .43;
      const radial = .18 + .82 * Math.sqrt((i * .754877666) % 1);
      positions.set([
        (Math.cos(angle) * a * (1-fraction) + Math.cos(next) * b * fraction) * radial,
        (Math.sin(angle) * a * (1-fraction) + Math.sin(next) * b * fraction) * radial,
        (i % 2 ? 1 : -1) * (.035 + .185 * (1-radial)),
      ], i * 3);
      seeds.set([(i * .381966) % 1, (i * .56984) % 1, i === 0 ? 1 : 0], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    this.morph = new DecorationMorph(this.count, geometry);
    const material = new THREE.ShaderMaterial({
      uniforms: { ...this.morph.uniforms, uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `
        ${decorationDeclarations}
        attribute vec3 aSeed;
        uniform float uTime, uPixelRatio;
        varying float vLight, vHalo;
        void main() {
          float treeWeight = mix(uFromTree,uToTree,uDecorationProgress);
          vHalo = aSeed.z * treeWeight;
          vec3 p = position;
          float orbit = uTime*.16;
          p.xz = mat2(cos(orbit),-sin(orbit),sin(orbit),cos(orbit))*p.xz;
          p = decorationPosition(p);
          vec4 viewPosition = modelViewMatrix*vec4(p,1.);
          gl_Position = projectionMatrix*viewPosition;
          gl_PointSize = clamp(mix(2.2+aSeed.x*1.6,76.,vHalo)*uPixelRatio*20./max(1.,-viewPosition.z),1.,150.*uPixelRatio);
          vLight = mix(.38+.16*sin(uTime*(.5+aSeed.x)+aSeed.y*30.),.24,vHalo);
        }`,
      fragmentShader: /* glsl */ `
        varying float vLight,vHalo;
        void main() {
          float r = length(gl_PointCoord-.5)*2.;
          if(r>1.) discard;
          float light = mix(exp(-r*r*7.)+exp(-r*r*3.)*.16,exp(-r*r*5.5)*.45,vHalo);
          gl_FragColor = vec4(vec3(1.5,1.30,.86)*light,vLight*(1.-smoothstep(.65,1.,r)));
        }`,
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    });
    this.glow = new THREE.Points(geometry, material);
    this.glow.name = 'topper-volume-particles';
    this.glow.frustumCulled = false;
    this.add(this.glow);
  }
  transitionText(target: Float32Array | null, time: number, duration: number) {
    this.morph.transition(target, time, duration);
  }
  update(time: number, _mix = 1) {
    this.visible = true;
    this.updateMatrixWorld(true);
    this.morph.update(time, this.matrixWorld);
    this.glow.material.uniforms.uTime.value = time;
  }
  resize(dpr: number) { this.glow.material.uniforms.uPixelRatio.value = dpr; }
  dispose() {
    this.glow.geometry.dispose();
    this.glow.material.dispose();
    this.clear();
    this.removeFromParent();
  }
}
