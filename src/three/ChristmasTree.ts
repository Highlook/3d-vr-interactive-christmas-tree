import { Color } from "three";
import { CONFIG } from "../config/particleConfig";

export interface TreeData {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  seeds: Float32Array;
}

/** Gold foliage only. The independently animated silver ribbon lives in ParticleRibbon. */
export function createTree(count: number): TreeData {
  const positions = new Float32Array(count * 3),
    colors = new Float32Array(count * 3),
    sizes = new Float32Array(count),
    seeds = new Float32Array(count * 4);
  const palette = ["#e5b86e", "#f6d89c", "#fff0cd", "#c99750", "#fffaf0"].map(
    (color) => new Color(color),
  );
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    // Stratified height avoids empty slices, while a substantial interior population
    // keeps parallax and orbit views volumetric instead of drawing a cone outline.
    const u = (i + Math.random()) / count;
    const t = 1 - Math.pow(1 - u, 0.52);
    const spiral = i % 6 === 0;
    const angle = spiral
      ? t * Math.PI * 10 + (Math.floor(i / 6) % 3) * Math.PI * 2 / 3 + (Math.random() - 0.5) * 0.09
      : i * goldenAngle + (Math.random() - 0.5) * 0.65;
    const shell = spiral || Math.random() < 0.64;
    const depth = spiral ? 1.015 + Math.random() * 0.025 : shell
      ? 0.78 + Math.random() * 0.22
      : Math.sqrt(Math.random()) * 0.84;
    // Eleven volumetric branch skirts; recessed shadow bands separate golden rims.
    const tier = (t * 11) % 1;
    const skirt = 0.74 + 0.26 * Math.pow(1 - tier, 0.5);
    const branch = skirt * (1 + 0.025 * Math.sin(angle * 7 + t * 6));
    const radius = CONFIG.treeRadius * Math.pow(1 - t, 0.94) * depth * branch;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = CONFIG.treeBottom + t * CONFIG.treeHeight +
      (Math.random() - 0.5) * 0.055;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    const roll = Math.random();
    const color = palette[roll < 0.19 ? 4 : roll < 0.42 ? 2 : roll < 0.73 ? 1 : roll < 0.95 ? 0 : 3];
    const brightness = (spiral ? 1.28 : shell ? 0.80 + 0.42 * Math.pow(1 - tier, 3) : 0.96) + Math.random() * 0.32;
    colors[i * 3] = color.r * brightness;
    colors[i * 3 + 1] = color.g * brightness;
    colors[i * 3 + 2] = color.b * brightness;
    sizes[i] = 0.65 + Math.random() * 0.62 + Math.pow(Math.random(), 16) * 1.2;
    for (let j = 0; j < 4; j++) seeds[i * 4 + j] = Math.random();
  }
  return { positions, colors, sizes, seeds };
}
