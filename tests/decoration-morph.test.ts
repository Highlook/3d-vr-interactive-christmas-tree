import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DecorationMorph } from '../src/three/DecorationMorph';
import { ParticleRibbon } from '../src/three/ParticleRibbon';
import { TreeTopper } from '../src/three/TreeTopper';

describe('ornaments join the text rather than disappearing', () => {
  it('rebases weighted text contributions continuously when interrupted', () => {
    const g = new THREE.BufferGeometry(), m = new DecorationMorph(1,g);
    const original = m.to.array;
    m.transition(new Float32Array([4,6,8]), 0, 2);
    m.update(1);
    m.transition(new Float32Array([10,12,14]), 1, 2);
    expect(m.uniforms.uFromTree.value).toBeCloseTo(.5);
    expect(Array.from(m.from.array)).toEqual([2,3,4]);
    expect(m.to.array).toBe(original);
    m.update(3);
    expect(m.uniforms.uDecorationProgress.value).toBe(1);
    m.transition(null,3,1);
    expect(Array.from(m.from.array)).toEqual([10,12,14]);
    m.update(4);
    expect(m.uniforms.uToTree.value).toBe(1);
    g.dispose();
  });
  it('keeps ribbon and star points visible in text with world aligned targets', () => {
    const group = new THREE.Group(), ribbon = new ParticleRibbon(24), topper = new TreeTopper();
    group.add(ribbon,topper); group.scale.setScalar(1.06); group.rotation.y=1.2; group.updateMatrixWorld(true);
    ribbon.transitionText(new Float32Array(24*3).fill(.5),0,1);
    topper.transitionText(new Float32Array(topper.count*3).fill(.5),0,1);
    ribbon.update(1,0); topper.update(1,0);
    expect(ribbon.visible && topper.visible).toBe(true);
    for (const object of [...ribbon.children,...topper.children]) {
      const points = object as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
      expect(points.material.uniforms.uToTree.value).toBe(0);
      expect(points.geometry.getAttribute('aDecorationTo').count).toBe(points.geometry.getAttribute('position').count);
      expect(points.material.vertexShader).toContain('decorationPosition(p)');
      const identity = points.material.uniforms.uDecorationFrame.value.clone().multiply(object.parent!.matrixWorld);
      expect(identity.elements.every((v: number,i: number)=>Math.abs(v-(i%5===0?1:0))<1e-6)).toBe(true);
    }
    ribbon.dispose(); topper.dispose();
  });
});
