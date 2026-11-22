import { describe, expect, it, vi, afterEach } from "vitest";
import * as THREE from "three";
import { CONFIG } from "../src/config/particleConfig";
import { createTree } from "../src/three/ChristmasTree";
import { ParticleRibbon } from "../src/three/ParticleRibbon";
import { TreeTopper } from "../src/three/TreeTopper";

afterEach(() => vi.restoreAllMocks());

describe("tree visual geometry", () => {
  it("keeps finite spatial tree data, larger points and bright gold-white colors", () => {
    let seed = 123;
    vi.spyOn(Math, "random").mockImplementation(() => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 4294967296;
    });
    const tree = createTree(4000);
    expect(tree.positions.every(Number.isFinite)).toBe(true);
    expect(tree.sizes.every((size) => size >= 0.65 && size <= 2.47)).toBe(true);
    expect(tree.sizes.reduce((sum, size) => sum + size, 0) / 4000).toBeGreaterThan(0.95);
    let luminous = 0;
    for (let i = 0; i < 4000; i++) if (tree.colors[i * 3] > 1) luminous++;
    expect(luminous).toBeGreaterThan(2000);
  });

  it("renders the ribbon exclusively as independent points, preserving its count and text participation", () => {
    const ribbon = new ParticleRibbon(101);
    expect(ribbon.children.every((child) => child instanceof THREE.Points)).toBe(true);
    const layers = ribbon.children as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>[];
    expect(layers.reduce((n, layer) => n + layer.geometry.getAttribute("position").count, 0)).toBe(101);
    ribbon.update(12, 0.4);
    ribbon.resize(1.7);
    for (const layer of layers) {
      expect(layer.material.uniforms.uToTree.value).toBe(1);
      expect(layer.material.uniforms.uPixelRatio.value).toBe(1.7);
      expect(layer.material.depthWrite).toBe(false);
    }
    ribbon.update(13, 0);
    expect(ribbon.visible).toBe(true);
    ribbon.dispose();
    expect(ribbon.children).toHaveLength(0);
  });

  it("keeps widened dust outside the animated tree envelope even at worst inward excursions", () => {
    // Analytic worst-case bounds matching the shader: azimuthal dust displacement
    // is sqrt(2)*.055, radial thickness .25+.036 and tree drift .054 per axis.
    const minClearance = 0.52 - 0.25 - 0.036 - Math.SQRT2 * 0.055;
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000;
      const ribbonInner = 1.08 * CONFIG.treeRadius * Math.pow(1 - t, 0.94) + minClearance;
      const driftedT = Math.max(0, t - (0.054 + 0.0275) / CONFIG.treeHeight);
      const treeOuter = 1.04 * 1.035 * CONFIG.treeRadius * Math.pow(1 - driftedT, 0.94) + Math.SQRT2 * 0.054;
      expect(ribbonInner).toBeGreaterThan(treeOuter);
    }
  });
});

describe("volumetric topper",()=>{
 it("has real XYZ thickness and all star points can form words",()=>{
  const star=new TreeTopper(),p=star.children[0] as THREE.Points<THREE.BufferGeometry,THREE.ShaderMaterial>;
  p.geometry.computeBoundingBox();const box=p.geometry.boundingBox!;
  expect(box.max.z-box.min.z).toBeGreaterThan(.3);expect(p.geometry.getAttribute("position").count).toBe(1200);
  star.transitionText(new Float32Array(star.count*3).fill(2),0,1);star.update(2,0);
  expect(star.visible).toBe(true);expect(p.material.uniforms.uToTree.value).toBe(0);expect(p.material.uniforms.uDecorationProgress.value).toBe(1);
  expect(p.geometry.getAttribute("aDecorationTo").getX(0)).toBe(2);star.dispose();
 });
 it("updates GPU time and DPR and disposes the point geometry",()=>{
  const star=new TreeTopper(),p=star.children[0] as THREE.Points<THREE.BufferGeometry,THREE.ShaderMaterial>;
  const g=vi.spyOn(p.geometry,"dispose"),m=vi.spyOn(p.material,"dispose");star.update(10,0);star.resize(1.7);
  expect(p.material.uniforms.uTime.value).toBe(10);expect(p.material.uniforms.uPixelRatio.value).toBe(1.7);
  expect(star.visible).toBe(true);star.dispose();expect(g).toHaveBeenCalledOnce();expect(m).toHaveBeenCalledOnce();
 });
});
