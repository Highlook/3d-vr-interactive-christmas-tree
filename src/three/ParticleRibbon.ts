import * as THREE from "three";
import { DecorationMorph, decorationDeclarations } from "./DecorationMorph";
import { CONFIG } from "../config/particleConfig";

/** Three populations of independent points; all motion is evaluated on the GPU. */
export class ParticleRibbon extends THREE.Group {
  readonly count: number;
  private morphs: DecorationMorph[] = [];
  private readonly pointLayers: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];

  constructor(count = 12000) {
    super();
    this.count = Math.max(0, Math.floor(count));
    const populations = [Math.floor(this.count * 0.25), Math.floor(this.count * 0.5)];
    populations.push(this.count - populations[0] - populations[1]);
    const widths = [0.1, 0.52, 0.84];
    const thicknesses = [0.025, 0.09, 0.25];
    const strengths = [1.0, 0.60, 0.26];
    for (let layer = 0; layer < 3; layer++) {
      const total = populations[layer];
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(total * 3);
      const paths = new Float32Array(total * 4);
      const seeds = new Float32Array(total * 4);
      for (let i = 0; i < total; i++) {
        paths.set([
          (i + Math.random()) / Math.max(1, total),
          (Math.random() + Math.random() - 1) * widths[layer],
          (Math.random() + Math.random() - 1) * thicknesses[layer],
          Math.random() * Math.PI * 2,
        ], i * 4);
        seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aPath", new THREE.BufferAttribute(paths, 4));
      geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
      const morph = new DecorationMorph(total, geometry);
      this.morphs.push(morph);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          ...morph.uniforms,
          uTime: { value: 0 },
          uTreeMix: { value: 1 },
          uPixelRatio: { value: 1 },
          uLayer: { value: layer },
          uStrength: { value: strengths[layer] },
          uBottom: { value: CONFIG.treeBottom },
          uHeight: { value: CONFIG.treeHeight },
          uRadius: { value: CONFIG.treeRadius },
        },
        vertexShader: /* glsl */ `
          ${decorationDeclarations}
          attribute vec4 aPath;
          attribute vec4 aSeed;
          uniform float uTime, uTreeMix, uPixelRatio, uLayer, uStrength;
          uniform float uBottom, uHeight, uRadius;
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            // Each point travels along the helix at its own speed. Endpoint fades
            // conceal wrapping without ever uploading positions from JavaScript.
            float travel = fract(aPath.x + uTime * (0.010 + aSeed.x * 0.004));
            float t = 0.025 + travel * 0.95;
            float theta = t * 23.2478 + 0.55;
            float flutter = sin(uTime * (0.32 + aSeed.y * 0.28) + aPath.w);
            float width = aPath.y * (0.58 + 0.42 * (1.0 - t));
            float thickness = aPath.z + flutter * (0.006 + uLayer * 0.015);
            // Across-band displacement includes vertical and azimuthal components;
            // radial displacement adds true thickness to the silver point cloud.
            theta -= width * 0.38;
            // Envelope includes the across-band height and all flutter excursions.
            // Even the inner edge of the dust population stays outside the crown.
            float dustLift = uLayer > 1.5 ? sin(uTime * 0.24 + aPath.w) * 0.10 : 0.0;
            // 1.08 encloses branch tips and spiral foliage; the clearance also
            // covers inward thickness, radial dust flutter and tree shader drift.
            float radius = 1.08 * uRadius * pow(max(0.0, 1.0 - t - (width + dustLift) / uHeight), 0.94)
              + 0.52 + thickness;
            vec3 p = vec3(cos(theta) * radius,
              uBottom + t * uHeight + width,
              sin(theta) * radius);
            if (uLayer > 1.5) {
              p.y += dustLift;
              p.xz += vec2(sin(aPath.w + uTime * 0.17), cos(aPath.w + uTime * 0.21)) * 0.055;
            }
            p = decorationPosition(p);
            vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * viewPosition;
            float pulse = 0.78 + 0.22 * sin(uTime * (0.5 + aSeed.z * 0.5) + aPath.w);
            float ends = smoothstep(0.0, 0.045, travel) * (1.0 - smoothstep(0.95, 1.0, travel));
            // Modest back-side attenuation retains readable front/back overlap.
            vec3 normal = normalize(normalMatrix * vec3(cos(theta), 0.0, sin(theta)));
            float facing = 0.58 + 0.42 * smoothstep(-0.5, 0.65, normal.z);
            float treeWeight = mix(uFromTree,uToTree,uDecorationProgress);
            vAlpha = uStrength * pulse * mix(0.38, ends * facing, treeWeight);
            vColor = mix(vec3(1.04, 1.12, 1.24), vec3(1.24, 1.23, 1.17), aSeed.w * 0.6);
            float size = (1.45 + aSeed.z * 1.25) * (uLayer < 0.5 ? 1.12 : 1.0);
            gl_PointSize = clamp(size * uPixelRatio * 20.0 / max(1.0, -viewPosition.z), 0.6, 4.0 * uPixelRatio);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            float radius = length(gl_PointCoord - 0.5) * 2.0;
            if (radius > 1.0) discard;
            float core = exp(-radius * radius * 7.0);
            float halo = exp(-radius * radius * 2.8) * 0.11;
            float edge = 1.0 - smoothstep(0.65, 1.0, radius);
            gl_FragColor = vec4(vColor * (core + halo), vAlpha * edge);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const points = new THREE.Points(geometry, material);
      points.name = ["ribbon-pearl-core", "ribbon-silver-width", "ribbon-floating-dust"][layer];
      points.frustumCulled = false;
      this.pointLayers.push(points);
      this.add(points);
    }
    this.name = "particle-ribbon";
  }

  transitionText(target: Float32Array | null, time: number, duration: number): void {
    let offset = 0;
    for (const morph of this.morphs) {
      morph.transition(target ? target.subarray(offset * 3, (offset + morph.count) * 3) : null, time, duration);
      offset += morph.count;
    }
  }
  update(time: number, treeMix = 1): void {
    this.visible = true;
    this.updateMatrixWorld(true);
    for (const morph of this.morphs) morph.update(time, this.matrixWorld);
    for (const layer of this.pointLayers) {
      layer.material.uniforms.uTime.value = time;
      layer.material.uniforms.uTreeMix.value = treeMix;
    }
  }

  resize(dpr: number): void {
    for (const layer of this.pointLayers) layer.material.uniforms.uPixelRatio.value = dpr;
  }

  dispose(): void {
    for (const layer of this.pointLayers) {
      layer.geometry.dispose();
      layer.material.dispose();
    }
    this.clear();
    this.removeFromParent();
  }
}
