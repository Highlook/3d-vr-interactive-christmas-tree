export const PALETTE = [
  "#d5a569",
  "#f5d6a0",
  "#fff3da",
  "#b97537",
  "#fff7e8",
] as const;
export function chooseParticleCount() {
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 26000 : cores >= 4 ? 20000 : 15000;
}
export const CONFIG = {
  textParticleSpacing: 4,
  textParticleDensity: 0.34,
  textParticleSize: 3.6,
  textGlowIntensity: 2.0,
  textBloomStrength: 0.72,
  duration: 1.7,
  minParticles: 15000,
  maxParticles: 26000,
  maxDpr: 1.7,
  treeBottom: -3.8,
  treeHeight: 8.4,
  treeRadius: 2.75,
};
