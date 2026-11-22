import * as THREE from 'three';

/** Persistent, interruptible target buffers shared by ornament shaders. */
export class DecorationMorph {
  readonly from: THREE.BufferAttribute;
  readonly to: THREE.BufferAttribute;
  readonly uniforms = {
    uDecorationFrame: { value: new THREE.Matrix4() },
    uDecorationProgress: { value: 1 },
    uFromTree: { value: 1 }, uToTree: { value: 1 },
  };
  private start = 0;
  private duration = 1;
  constructor(readonly count: number, geometry: THREE.BufferGeometry) {
    this.from = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    this.to = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    geometry.setAttribute('aDecorationFrom', this.from);
    geometry.setAttribute('aDecorationTo', this.to);
  }
  transition(target: Float32Array | null, time: number, duration: number) {
    this.update(time);
    const q = this.uniforms.uDecorationProgress.value;
    const weight = THREE.MathUtils.lerp(this.uniforms.uFromTree.value, this.uniforms.uToTree.value, q);
    const a = this.from.array as Float32Array, b = this.to.array as Float32Array;
    for (let i = 0; i < a.length; i++) {
      a[i] = THREE.MathUtils.lerp(a[i], b[i], q);
      b[i] = target ? target[i] : 0;
    }
    this.from.needsUpdate = this.to.needsUpdate = true;
    this.uniforms.uFromTree.value = weight;
    this.uniforms.uToTree.value = target ? 0 : 1;
    this.start = time;
    this.duration = Math.max(.01, duration);
    this.uniforms.uDecorationProgress.value = 0;
  }
  update(time: number, world?: THREE.Matrix4) {
    const t = THREE.MathUtils.clamp((time - this.start) / this.duration, 0, 1);
    this.uniforms.uDecorationProgress.value = t * t * (3 - 2 * t);
    if (world) this.uniforms.uDecorationFrame.value.copy(world).invert();
  }
}
export const decorationDeclarations = `
attribute vec3 aDecorationFrom, aDecorationTo;
uniform mat4 uDecorationFrame;
uniform float uDecorationProgress, uFromTree, uToTree;
vec3 decorationPosition(vec3 tree) {
 float w = mix(uFromTree,uToTree,uDecorationProgress);
 vec3 contribution = mix(aDecorationFrom,aDecorationTo,uDecorationProgress);
 return tree*w + (uDecorationFrame*vec4(contribution,1.-w)).xyz;
}`;
