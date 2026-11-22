import * as THREE from "three";

/** A distant, spatial star shell; point size and brightness both fall with depth. */
export class StarField extends THREE.Group {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;

  constructor(count = 3000) {
    super();
    const total = Math.max(0, Math.floor(count));
    this.name = "independent-star-shell";
    const positions = new Float32Array(total * 3);
    const seeds = new Float32Array(total * 3);
    const twinkles = new Float32Array(total * 4);
    for (let i = 0; i < total; i++) {
      const theta = Math.random() * Math.PI * 2;
      const y = Math.random() * 2 - 1;
      const radius = 42 + Math.random() * 62;
      const ring = Math.sqrt(1 - y * y);
      positions.set(
        [
          Math.cos(theta) * ring * radius,
          y * radius,
          -Math.abs(Math.sin(theta) * ring * radius) - 15,
        ],
        i * 3,
      );
      seeds.set([Math.random(), Math.random(), Math.random()], i * 3);
      // Independent phase, angular frequency, minimum and maximum luminance.
      const minimum = 0.12 + Math.random() * 0.23;
      twinkles.set([
        Math.random() * Math.PI * 2,
        0.16 + Math.random() * 0.36,
        minimum,
        minimum + 0.22 + Math.random() * 0.32,
      ], i * 4);
    }
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    this.geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    this.geometry.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkles, 4));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: {
          value:
            typeof window === "undefined"
              ? 1
              : Math.min(window.devicePixelRatio || 1, 2),
        },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        attribute vec4 aTwinkle;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vBrightness;
        varying float vWarmth;
        varying float vRare;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          float depth = max(1.0, -viewPosition.z);
          float wave = 0.5 + 0.5 * sin(uTime * aTwinkle.y + aTwinkle.x);
          float pulse = mix(aTwinkle.z, aTwinkle.w, wave * wave * (3.0 - 2.0 * wave));
          vBrightness = (0.30 + 0.50 * aSeed.z * aSeed.z) * pulse * clamp(65.0 / depth, 0.4, 1.0);
          vWarmth = aSeed.y;
          vRare = step(.975, aSeed.z);
          float flare = pow(max(0., sin(uTime * (.19 + aSeed.x*.13) + aTwinkle.x)), 18.0) * vRare;
          vBrightness *= 1.25 + flare * 1.1;
          gl_PointSize = clamp((0.9 + 2.1 * aSeed.z + vRare*3.5) * 65.0 / depth, 0.8, 6.0) * uPixelRatio;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vBrightness;
        varying float vWarmth;
        varying float vRare;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          if (r > 1.0) discard;
          float glow = exp(-r * r * 4.8) * (1.0 - smoothstep(0.3, 1.0, r));
          vec2 q = abs(gl_PointCoord-.5)*2.;
          float rays = (exp(-q.x*35.) + exp(-q.y*35.))*exp(-r*r*3.)*.22*vRare;
          glow += rays*(1.-smoothstep(.7,1.,r));
          vec3 color = mix(vec3(.68,.79,1.), vec3(1.0, 0.89, 0.64), vWarmth);
          gl_FragColor = vec4(color, glow * vBrightness);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.add(this.points);
  }

  update(time: number, _delta: number): void {
    this.material.uniforms.uTime.value = time;
    this.rotation.y = Math.sin(time * 0.015) * 0.012;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.remove(this.points);
    this.removeFromParent();
  }
}
