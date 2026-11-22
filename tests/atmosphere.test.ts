import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { Planet } from '../src/three/Planet';
import { SnowField } from '../src/three/SnowField';
import { StarField } from '../src/three/StarField';

describe('celestial atmosphere',()=>{
 it('has a complete six-edge inner motif and rotating outer rings with stable resources',()=>{
  const stage=new Planet();
  const motif=stage.getObjectByName("hexagram-inlay")!;
   const inner=motif.children.find(c=>c instanceof THREE.Points) as THREE.Points;
  const positions=inner.geometry.getAttribute('position');
  const snapshot=positions.array.slice();
  expect(positions.count).toBe(1800);
  let total=0;stage.traverse(o=>{if(o instanceof THREE.Points)total+=o.geometry.getAttribute('position').count;});
  expect(total).toBe(stage.count);
  const initial=inner.rotation.clone();stage.update(40,1/60);
  expect(stage.outer.rotation.y).toBeCloseTo(1.8);
  expect(inner.rotation.equals(initial)).toBe(true);
  expect(positions.array).toEqual(snapshot);
     expect(motif.children.filter(c=>c instanceof THREE.Mesh)).toHaveLength(6);
   expect(stage.getObjectByName("crescent-front-apron")).toBeUndefined();
   expect(stage.outer.children.filter(c=>c instanceof THREE.Mesh && c.geometry instanceof THREE.RingGeometry)).toHaveLength(3);
   expect(stage.scale.x).toBe(1.3);
stage.dispose();expect(stage.children).toHaveLength(0);
 });
 it('updates snow only through a shader uniform, without replacing particle buffers',()=>{
  const snow=new SnowField();const p=snow.geometry.getAttribute('position');const before=p.array.slice();
  snow.update(120);expect(snow.material.uniforms.uTime.value).toBe(120);
  expect(snow.geometry.getAttribute('position')).toBe(p);expect(p.array).toEqual(before);
  expect(p.count).toBe(260);snow.dispose();
 });
 it('assigns independent star phases frequencies and brightness ranges',()=>{
  const stars=new StarField(500);const p=stars.children[0] as THREE.Points;
  const a=p.geometry.getAttribute('aTwinkle');
  expect(new Set(Array.from({length:500},(_,i)=>a.getX(i))).size).toBeGreaterThan(490);
  expect(new Set(Array.from({length:500},(_,i)=>a.getY(i))).size).toBeGreaterThan(490);
  for(let i=0;i<500;i++)expect(a.getW(i)).toBeGreaterThan(a.getZ(i));
  stars.dispose();
 });
});
