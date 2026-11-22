import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ParticleText } from "../src/three/ParticleText";

// Inspect the shipped font's own cmap: a successful font load alone cannot
// prove that the Chinese messages avoid missing-glyph boxes.
function glyphIndex(font: Buffer, code: number): number {
  let cmap = 0;
  for (let i = 0; i < font.readUInt16BE(4); i++) {
    const table = 12 + i * 16;
    if (font.toString("ascii", table, table + 4) === "cmap") cmap = font.readUInt32BE(table + 8);
  }
  if (!cmap) throw new Error("Font has no character map");
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const table = cmap + font.readUInt32BE(cmap + 4 + i * 8 + 4);
    const format = font.readUInt16BE(table);
    if (format === 12) {
      for (let g = 0; g < font.readUInt32BE(table + 12); g++) {
        const offset = table + 16 + g * 12;
        const first = font.readUInt32BE(offset), last = font.readUInt32BE(offset + 4);
        if (code >= first && code <= last) return font.readUInt32BE(offset + 8) + code - first;
      }
    } else if (format === 4 && code <= 0xffff) {
      const segments = font.readUInt16BE(table + 6) / 2;
      const ends = table + 14, starts = ends + segments * 2 + 2;
      const deltas = starts + segments * 2, ranges = deltas + segments * 2;
      for (let s = 0; s < segments; s++) {
        if (code < font.readUInt16BE(starts + s * 2) || code > font.readUInt16BE(ends + s * 2)) continue;
        const delta = font.readInt16BE(deltas + s * 2), range = font.readUInt16BE(ranges + s * 2);
        if (!range) return (code + delta) & 0xffff;
        const glyph = font.readUInt16BE(ranges + s * 2 + range + (code - font.readUInt16BE(starts + s * 2)) * 2);
        return glyph ? (glyph + delta) & 0xffff : 0;
      }
    }
  }
  return 0;
}

function mockCanvas() {
  const draws: Array<{ glyph: string; font: string }> = [];
  const reads = vi.fn();
  const load = vi.fn(async () => []);
  vi.stubGlobal("document", {
    fonts: { load, ready: Promise.resolve(), check: () => true },
    createElement: () => {
      const canvas = { width: 128, height: 128, getContext: () => ctx };
      let glyph = "";
      const ctx = {
        font: "", textAlign: "", textBaseline: "", fillStyle: "",
        clearRect: () => {}, save: () => {}, restore: () => {}, translate: () => {}, transform: () => {},
        measureText: () => ({ width: 100 }),
        fillText: (text: string) => { glyph = text; draws.push({ glyph, font: ctx.font }); },
        getImageData: () => {
          reads();
          const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
          if (canvas.width === 128) {
            // A missing face falls back identically to monospace. Only KaiTi's
            // 圣 is available; 乐 must continue to the complete bundled font.
            data[3] = (glyph === "圣" && ctx.font.includes('"KaiTi"')) ||
              (/[0-9]/u.test(glyph) && ctx.font.includes('"Great Vibes"')) ? 220 : 100;
          } else {
            // A bounded glyph mask with both edge and interior samples.
            for (let y = 20; y < canvas.height - 20; y++) {
              for (let x = 20; x < canvas.width - 20; x++) data[(y * canvas.width + x) * 4 + 3] = 255;
            }
          }
          return { data };
        },
      };
      return canvas;
    },
  });
  return { draws, reads, load };
}

afterEach(() => vi.unstubAllGlobals());

describe("upright particle inscriptions", () => {
  it("retains licensed legacy font assets covering all message glyphs", () => {
    const path = new URL("../public/fonts/particle-calligraphy/MaShanZheng-Regular.ttf", import.meta.url);
    const font = readFileSync(path);
    expect(font.readUInt32BE(0)).toBe(0x00010000);
    for (const glyph of new Set("圣诞快乐天天开心123")) {
      expect(glyphIndex(font, glyph.codePointAt(0)!), `Missing ${glyph}`).toBeGreaterThan(0);
    }
    const license = readFileSync(new URL("../public/fonts/particle-calligraphy/OFL.txt", import.meta.url), "utf8");
    expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(license).toContain("Copyright 2018 The Ma Shan Zheng Project Authors");
  });

  it("detects unavailable faces per glyph and reuses stable canvas samples", async () => {
    const { draws, reads } = mockCanvas();
    const text = new ParticleText();
    const options = { text: "圣乐", width: 8, particleDensity: 3, center: [1, 2, 3] as [number, number, number] };
    const first = await text.create(2400, options);
    expect(first.length).toBe(7200);
    expect(first.every(Number.isFinite)).toBe(true);
    const rendered = draws.filter((draw) => draw.font.includes("180px"));
    expect(rendered).toEqual([
      { glyph: "圣", font: '600 180px "Noto Sans SC Variable"' },
      { glyph: "乐", font: '600 180px "Noto Sans SC Variable"' },
    ]);
    const count = reads.mock.calls.length;
    const again = await text.create(2400, options);
    expect(again).toEqual(first);
    expect(again).not.toBe(first);
    expect(reads).toHaveBeenCalledTimes(count);
    const shifted = await text.create(2400, { ...options, center: [2, 2, 3] });
    for (let i = 0; i < 2400; i++) expect(shifted[i * 3] - first[i * 3]).toBeCloseTo(1, 5);
    expect(reads).toHaveBeenCalledTimes(count);
    const depths = Array.from(first).filter((_, i) => i % 3 === 2);
    expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(0.08);
    text.dispose();
    await text.create(2400, options);
    expect(reads.mock.calls.length).toBeGreaterThan(count);
  });

  it("uses upright local Noto for all digits", async () => {
    const { draws } = mockCanvas();
    const text = new ParticleText();
    await text.create(2400, { text: "123" });
    const rendered = draws.filter((draw) => draw.font.includes("180px"));
    expect(rendered.map((draw) => draw.glyph)).toEqual(["1", "2", "3"]);
    expect(rendered.every((draw) => draw.font.includes('"Noto Sans SC Variable"'))).toBe(true);
    text.dispose();
  });

  it("rejects invalid dimensions before touching browser font APIs", async () => {
    const text = new ParticleText();
    await expect(text.create(0, { text: "圣诞快乐" })).rejects.toThrow(RangeError);
    await expect(text.create(10, { text: "天天开心", width: NaN })).rejects.toThrow(RangeError);
    await expect(text.create(10, { text: " " })).rejects.toThrow("cannot be empty");
  });
});
