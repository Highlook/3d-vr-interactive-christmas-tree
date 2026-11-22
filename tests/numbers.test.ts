import { describe, expect, it, vi } from "vitest";
import { ParticleNumbers } from "../src/three/ParticleNumbers";

describe("persistent independent number cloud", () => {
  it("rebases a mid-flight switch without jumping or rebuilding GPU attributes", () => {
    const numbers = new ParticleNumbers();
    const geometry = numbers.geometry;
    const attributes = { ...geometry.attributes };
    const position = geometry.getAttribute("position");
    const buffer = position.array;
    const first = new Float32Array(numbers.count * 3).fill(2);
    const second = new Float32Array(numbers.count * 3).fill(-3);
    numbers.show(first, 0);
    numbers.update(0.23);
    const snapshot = Array.from(buffer);
    numbers.show(second, 0.23);
    expect(Array.from(buffer)).toEqual(snapshot);
    numbers.update(0.23);
    expect(Array.from(buffer)).toEqual(snapshot);
    numbers.update(1.05);
    expect(buffer).toEqual(second);
    numbers.update(2);
    expect(buffer).toEqual(second);
    expect(numbers.geometry).toBe(geometry);
    for (const [name, attribute] of Object.entries(attributes)) expect(geometry.getAttribute(name)).toBe(attribute);
    expect(position.array).toBe(buffer);
    numbers.dispose();
  });

  it("keeps position and opacity continuous when hide is interrupted and survives resize", () => {
    const numbers = new ParticleNumbers();
    const target = new Float32Array(numbers.count * 3).fill(1);
    numbers.show(target, 0);
    numbers.update(1);
    numbers.hide(1);
    numbers.update(1.2);
    const opacity = numbers.material.uniforms.uOpacity.value;
    const position = numbers.geometry.getAttribute("position");
    const before = Array.from(position.array);
    numbers.show(target, 1.2);
    expect(numbers.material.uniforms.uOpacity.value).toBe(opacity);
    expect(Array.from(position.array)).toEqual(before);
    numbers.resize(1.5);
    expect(numbers.visible).toBe(true);
    expect(numbers.geometry.getAttribute("position")).toBe(position);
    expect(numbers.material.uniforms.uPixelRatio.value).toBe(1.5);
    numbers.update(2);
    expect(numbers.material.uniforms.uOpacity.value).toBe(1);
    numbers.hide(2);
    numbers.update(2.6);
    expect(numbers.visible).toBe(false);
    expect(numbers.material.uniforms.uOpacity.value).toBe(0);
    numbers.dispose();
  });

  it("takes 800ms to form the first digit and settles exactly", () => {
    const n=new ParticleNumbers(), target=new Float32Array(n.count*3).fill(-2);
    const before=n.geometry.getAttribute("position").array.slice();
    n.show(target,0);n.update(.4);
    const position=n.geometry.getAttribute("position").array;
    for(let i=0;i<position.length;i++)expect(position[i]).toBeCloseTo((before[i]+target[i])*.5,5);
    n.update(.55);expect(n.material.uniforms.uMorph.value).toBeLessThan(1);
    n.update(.799);expect(n.material.uniforms.uMorph.value).toBeLessThan(1);
    n.update(.801);expect(position).toEqual(target);n.dispose();
  });
  it("uses larger but bounded switching arcs and remains stable after landing",()=>{
    const n=new ParticleNumbers(), old=new Float32Array(n.count*3).fill(2), target=new Float32Array(n.count*3).fill(-2);
    n.show(old,0);n.update(1);n.show(target,1);n.update(1.4);
    const position=n.geometry.getAttribute("position").array;
    let maximum=0;
    for(const v of position){expect(Number.isFinite(v)).toBe(true);maximum=Math.max(maximum,Math.abs(v));}
    // The former straight path has zero at this midpoint; now the cloud opens gently.
    expect(maximum).toBeGreaterThan(.35);expect(maximum).toBeLessThanOrEqual(.381);
    n.update(1.801);expect(position).toEqual(target);n.update(3);expect(position).toEqual(target);n.dispose();
  });
  it("keeps switching trajectories independent of frame cadence",()=>{
    const a=new ParticleNumbers(),b=new ParticleNumbers(),target=new Float32Array(a.count*3).fill(3);
    a.show(target,0);b.show(target,0);a.update(1);b.update(1);const next=new Float32Array(a.count*3).fill(-2);a.show(next,1);b.show(next,1);a.update(1.1);a.update(1.25);b.update(1.25);
    expect(a.geometry.getAttribute("position").array).toEqual(b.geometry.getAttribute("position").array);a.dispose();b.dispose();
  });

  it("validates target data and releases resources once", () => {
    const numbers = new ParticleNumbers();
    expect(() => numbers.show(new Float32Array(3), 0)).toThrow(RangeError);
    expect(() => numbers.show(new Float32Array(numbers.count * 3).fill(NaN), 0)).toThrow(RangeError);
    const geometry = vi.spyOn(numbers.geometry, "dispose");
    const material = vi.spyOn(numbers.material, "dispose");
    numbers.dispose();
    numbers.dispose();
    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
  });
});
