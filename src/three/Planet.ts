import * as THREE from "three";

/** Continuous gold inlay over translucent light, with sparse suspended stardust. */
export class Planet extends THREE.Group {
  readonly count = 3960;
  readonly outer = new THREE.Group();
  private materials: THREE.Material[] = [];
  private particleMaterials: THREE.ShaderMaterial[] = [];
  private disposed = false;
  constructor() {
    super();
    this.name = "celestial-dais";
    this.position.set(0, -4.35, 0);
    // A wider but shallower ellipse fits below the tree without cropping the viewport.
    this.rotation.x = 0.12;
    this.scale.set(1.3, 1, 1.3);
    const line = new THREE.MeshBasicMaterial({ color: 0xffdda0, transparent: true,
      opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.materials.push(line);
    const motif = new THREE.Group(); motif.name = "hexagram-inlay";
    for (const offset of [Math.PI / 2, -Math.PI / 2]) {
      for (let i = 0; i < 3; i++) {
        const a = offset + i * Math.PI * 2 / 3, b = a + Math.PI * 2 / 3;
        const start = new THREE.Vector3(Math.cos(a) * 3.5, 0.025, Math.sin(a) * 3.5);
        const end = new THREE.Vector3(Math.cos(b) * 3.5, 0.025, Math.sin(b) * 3.5);
        const geometry = new THREE.PlaneGeometry(start.distanceTo(end), 0.025);
        const edge = new THREE.Mesh(geometry, line);
        edge.rotation.set(-Math.PI / 2, 0, -Math.atan2(end.z - start.z, end.x - start.x));
        edge.position.copy(start.add(end).multiplyScalar(0.5));
        motif.add(edge);
      }
    }
    this.add(motif);
    this.outer.name = "slow-gold-orbits";
    for (const [radius, width] of [[3.9, 0.025], [4.14, 0.012], [4.55, 0.035]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius - width, radius, 192), line);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
      this.outer.add(ring);
    }
    // A low-opacity illuminated disk gives the linework a stage rather than wireframe look.
    const haze = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv;uniform float uTime;void main(){float r=length(vUv-.5)*2.;float edge=1.-smoothstep(.7,1.,r);float glow=exp(-r*r*2.8)*.055+exp(-pow((r-.87)*18.,2.))*.07;gl_FragColor=vec4(vec3(1.,.66,.24),glow*edge*(.96+.04*sin(uTime*.4)));}`,
      transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.materials.push(haze);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(4.8, 128), haze);
    disk.name = "translucent-stage-light"; disk.rotation.x = -Math.PI / 2; disk.position.y = -0.035;
    this.add(disk);
    const rand = (i: number) => THREE.MathUtils.euclideanModulo(Math.sin(i * 127.1 + 13.7) * 43758.5453, 1);
    const dust: number[] = [], perimeter: number[] = [];
    for (let i = 0; i < this.count; i++) {
      const a = i * 2.399963229728653;
      if (i < 1800) {
        const r = Math.sqrt(rand(i)) * 3.7;
        dust.push(Math.cos(a) * r, 0.04 + rand(i + 1) * 0.12, Math.sin(a) * r);
      } else {
        const r = 3.85 + rand(i) * 0.75;
        perimeter.push(Math.cos(a) * r, 0.025 + rand(i + 1) * 0.13, Math.sin(a) * r);
      }
    }
    motif.add(this.points(dust));
    this.outer.add(this.points(perimeter));
    // Solid radial ticks make the independent slow outer rotation legible.
    for (let i = 0; i < 72; i++) {
      const a = i * Math.PI / 36;
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.014, i % 6 === 0 ? 0.14 : 0.06), line);
      tick.rotation.set(-Math.PI / 2, 0, -a);
      tick.position.set(Math.cos(a) * 4.35, 0.035, Math.sin(a) * 4.35);
      this.outer.add(tick);
    }
    this.add(this.outer);
  }
  private points(coords: number[]): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(coords, 3));
    const seed = new Float32Array(coords.length / 3);
    for (let i = 0; i < seed.length; i++) seed[i] = (i * 0.61803398875) % 1;
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: `attribute float aSeed;uniform float uTime,uPixelRatio;varying float vLight;void main(){vec3 p=position;p.y+=sin(uTime*.6+aSeed*30.)*.025;vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=(1.1+aSeed*1.3)*uPixelRatio*20./max(1.,-v.z);vLight=.12+.24*(.5+.5*sin(uTime*(.4+aSeed)+aSeed*80.));}`,
      fragmentShader: `varying float vLight;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float a=exp(-r*r*4.)*(1.-smoothstep(.6,1.,r));gl_FragColor=vec4(vec3(1.,.77,.38)*1.3,a*vLight);}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.materials.push(material); this.particleMaterials.push(material);
    return new THREE.Points(geometry, material);
  }
  resize(dpr: number): void { for (const m of this.particleMaterials) m.uniforms.uPixelRatio.value = dpr; }
  update(time: number, _delta: number): void {
    for (const m of this.materials) if (m instanceof THREE.ShaderMaterial && m.uniforms.uTime) m.uniforms.uTime.value = time;
    this.outer.rotation.y = time * 0.045;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.traverse(o => { if (o instanceof THREE.Points || o instanceof THREE.Mesh) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
    this.clear(); this.removeFromParent();
  }
}
