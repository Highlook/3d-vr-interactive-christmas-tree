import { CONFIG } from "../config/particleConfig";
export interface ParticleTextOptions {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  particleDensity?: number;
  glow?: number;
  transitionDuration?: number;
  width?: number;
  center?: [number, number, number];
}

// Upright local Noto: complete Chinese coverage, no script face or synthetic shear.
const FALLBACK = "Noto Sans SC Variable";
const CALLIGRAPHIC_FONTS = [FALLBACK];
const fontSpec = (family: string, size: number) => `600 ${size}px ${JSON.stringify(family)}`;

interface SampledText {
  points: Float32Array;
  width: number;
}

export class ParticleText {
  readonly style = { color: "#ffd596", glow: 1, transitionDuration: 1.75 };
  private cache = new Map<string, SampledText>();
  private faces = new Map<string, string>();
  private generation = 0;

  // FontFaceSet.check alone reports true for unavailable system font names.
  // Comparing actual glyph pixels against the explicit generic fallback also
  // detects fonts installed on the OS which do not cover this particular glyph.
  private glyphSignature(ctx: CanvasRenderingContext2D, glyph: string, font: string): string {
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(glyph, 64, 64);
    const pixels = ctx.getImageData(0, 0, 128, 128).data;
    let hash = 2166136261;
    let ink = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      hash = Math.imul(hash ^ pixels[i], 16777619);
      ink += pixels[i];
    }
    return `${hash}:${ink}`;
  }

  private async resolveFaces(text: string, preferred: string | undefined, generation: number): Promise<string[]> {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 128;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    const result: string[] = [];
    for (const glyph of Array.from(text)) {
      const key = `${preferred ?? "auto"}|${glyph}`;
      let face = this.faces.get(key);
      if (!face) {
        const candidates = [...new Set([
          ...(preferred ? [preferred] : []),
          ...(/[0-9A-Za-z]/u.test(glyph) ? ["Noto Sans SC Variable"] : []),
          ...CALLIGRAPHIC_FONTS,
        ])];
        const generic = this.glyphSignature(ctx, glyph, "400 88px monospace");
        for (const candidate of candidates) {
          const spec = fontSpec(candidate, 88);
          await document.fonts.load(spec, glyph);
          if (document.fonts.check(spec, glyph) &&
              this.glyphSignature(ctx, glyph, `${spec}, monospace`) !== generic) {
            face = candidate;
            break;
          }
        }
        face ??= FALLBACK;
        await document.fonts.load(fontSpec(face, 88), glyph);
        if (generation === this.generation) this.faces.set(key, face);
      }
      result.push(face);
    }
    return result;
  }

  async create(count: number, options: ParticleTextOptions): Promise<Float32Array> {
    const {
      text, fontSize = 180, particleDensity = CONFIG.textParticleSpacing,
      width = 13, center = [0, 0.45, 0],
    } = options;
    if (!text.trim()) throw new Error("Particle text cannot be empty");
    if (!Number.isInteger(count) || count <= 0 || !Number.isFinite(fontSize) || fontSize <= 0 ||
        !Number.isFinite(particleDensity) || particleDensity <= 0 || !Number.isFinite(width) || width <= 0 ||
        !center.every(Number.isFinite)) throw new RangeError("Particle text requires finite positive dimensions and count");
    this.style.color = options.color ?? "#ffd596";
    this.style.glow = options.glow ?? CONFIG.textGlowIntensity;
    this.style.transitionDuration = options.transitionDuration ?? 1.75;
    const generation = this.generation;
    const faces = await this.resolveFaces(text, options.fontFamily, generation);
    await document.fonts.ready;
    const key = JSON.stringify([text, faces, fontSize, particleDensity]);
    let sampled = this.cache.get(key);
    if (!sampled) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas 2D is unavailable");
      const glyphs = Array.from(text);
      const advances = glyphs.map((glyph, i) => {
        ctx.font = fontSpec(faces[i], fontSize);
        return ctx.measureText(glyph).width + fontSize * 0.055;
      });
      // Generous ascender/descender and shear margins avoid clipping flourishes.
      const padding = fontSize * 0.75;
      canvas.width = Math.ceil(advances.reduce((a, b) => a + b, 0) + padding * 2);
      canvas.height = Math.ceil(fontSize * 2.5);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      let cursor = padding;
      glyphs.forEach((glyph, i) => {
        ctx.save();
        ctx.font = fontSpec(faces[i], fontSize);
        ctx.translate(cursor, canvas.height / 2);
        ctx.fillText(glyph, 0, 0);
        ctx.restore();
        cursor += advances[i];
      });
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const points: number[] = [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const alpha = (x: number, y: number) => x < 0 || y < 0 || x >= canvas.width || y >= canvas.height ? 0 :
        image[(y * canvas.width + x) * 4 + 3];
      const step = Math.max(1, Math.round(particleDensity));
      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          if (alpha(x, y) <= 100) continue;
          const contour = Math.min(alpha(x - step, y), alpha(x + step, y),
            alpha(x, y - step), alpha(x, y + step)) <= 100;
          points.push(x, y, contour ? 1 : 0);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
      if (!points.length) throw new Error("Text produced no readable pixels");
      const middleX = (minX + maxX) / 2, middleY = (minY + maxY) / 2;
      for (let j = 0; j < points.length; j += 3) {
        points[j] -= middleX;
        points[j + 1] = middleY - points[j + 1];
      }
      sampled = { points: new Float32Array(points), width: maxX - minX };
      if (generation === this.generation) this.cache.set(key, sampled);
    }
    const scale = width / Math.max(1, sampled.width);
    const output = new Float32Array(count * 3), available = sampled.points.length / 3;
    for (let i = 0; i < count; i++) {
      // Stratification covers the entire inscription, including both ends.
      const k = Math.min(available - 1, Math.floor((i + 0.5) * available / count)) * 3;
      const jitter = scale * Math.min(0.65, particleDensity * 0.15);
      output[i * 3] = sampled.points[k] * scale + center[0] + Math.sin(i * 127.1) * jitter;
      output[i * 3 + 1] = sampled.points[k + 1] * scale + center[1] + Math.cos(i * 91.7) * jitter;
      // Raised pearl outlines and a recessed ink body give strokes a relief.
      output[i * 3 + 2] = center[2] + (sampled.points[k + 2] ? 0.065 : -0.025) + Math.sin(i * 63.7) * 0.025;
    }
    return output;
  }

  dispose(): void {
    this.generation++;
    this.cache.clear();
    this.faces.clear();
  }
}
