import { surface, readPixels, type Surface } from './canvas';
import { makeField, type Field } from './field';
import type { Layers } from './light';
import { MOSS, STONE } from './masonry';
import type { Rgb } from './color';
import { clamp01, mixRgb, smoothstep } from './color';
import { fbm } from './noise';

/**
 * A layer of silhouettes — columns, trunks, arches, crowns of leaves — painted as shapes with a ROUNDNESS: each object brings its own path, a tone and a profile across
 * its width, so that a flat shape is lit like a cylinder (the light of the game comes from above and ahead). Objects are painted back to front; the result is the
 * layers `shade` needs: an albedo, a height in pixels and a coverage.
 */
export interface ObjectOptions {
  /** How round it is across its width (the height in pixels at its middle): 0 = flat. */
  round: number;
  /** Its value (0..1 on the stone ramp) and how much it varies. */
  tone: number;
  spread: number;
  /** Moss on the upper faces (0..1). */
  moss?: number;
  /** Vertical grooves across its width (a fluted column): how many and how deep (px). */
  flutes?: { count: number; depth: number };
  /** A tone that changes down the object: the value at its top and at its foot, added to `tone`. */
  fade?: readonly [number, number];
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class SilhouetteLayer {
  readonly alpha: Field;
  readonly height: Field;
  readonly tone: Float32Array;
  readonly moss: Float32Array;
  /** Light the shapes give out (three floats per pixel): runes, crystals, the caps of mushrooms. Not shaded. */
  readonly emissive: Float32Array;
  private readonly noiseSeed: number;

  constructor(
    readonly w: number,
    readonly h: number,
    seed: number,
    private readonly periodicX = true,
  ) {
    this.alpha = makeField(w, h);
    this.height = makeField(w, h);
    this.tone = new Float32Array(w * h);
    this.moss = new Float32Array(w * h);
    this.emissive = new Float32Array(w * h * 3);
    this.noiseSeed = seed;
  }

  /**
   * Paints one object. `draw(ctx, dx)` fills its shape in white at an offset of `dx` px (the object is drawn at 0, −w and +w when the layer is periodic, so what leaves
   * one edge enters at the other); `box` is its extent, used to read back only what it covers.
   */
  add(draw: (ctx: CanvasRenderingContext2D, dx: number) => void, box: Box, o: ObjectOptions): void {
    const offsets = this.periodicX ? [0, -this.w, this.w] : [0];
    for (const dx of offsets) {
      const x0 = Math.max(0, Math.floor(box.x0 + dx) - 2);
      const x1 = Math.min(this.w, Math.ceil(box.x1 + dx) + 2);
      const y0 = Math.max(0, Math.floor(box.y0) - 2);
      const y1 = Math.min(this.h, Math.ceil(box.y1) + 2);
      if (x1 <= x0 || y1 <= y0) continue;
      const s: Surface = surface(x1 - x0, y1 - y0);
      s.ctx.fillStyle = '#fff';
      s.ctx.translate(-x0, -y0);
      draw(s.ctx, dx);
      const img = readPixels(s);
      const cx = (box.x0 + box.x1) / 2 + dx;
      const half = Math.max(1, (box.x1 - box.x0) / 2);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const a = img.data[((y - y0) * s.w + (x - x0)) * 4 + 3]! / 255;
          if (a <= 0) continue;
          const i = y * this.w + x;
          const old = this.alpha.d[i]!;
          const t = clamp01((x - cx) / half); // -1 … 1 across the object
          let profile = Math.sqrt(Math.max(0, 1 - t * t));
          if (o.flutes) profile += (Math.cos(Math.acos(Math.max(-1, Math.min(1, t))) * o.flutes.count) - 1) * 0.5 * (o.flutes.depth / Math.max(1, o.round));
          const noise = fbm(x * 0.021, y * 0.021, this.noiseSeed, { octaves: 3 });
          const down = clamp01((y - box.y0) / Math.max(1, box.y1 - box.y0));
          const fade = o.fade ? o.fade[0] + (o.fade[1] - o.fade[0]) * down : 0;
          if (a >= 0.5 || old < a) {
            this.height.d[i] = profile * o.round + (1 - old) * 0;
            this.tone[i] = clamp01(o.tone + fade + (noise - 0.5) * o.spread);
            this.moss[i] = (o.moss ?? 0) * smoothstep(0.5, 0.75, fbm(x * 0.03, y * 0.05, this.noiseSeed + 9, { octaves: 3 })) * (1 - down * 0.4);
          }
          this.alpha.d[i] = a + (1 - a) * old;
        }
      }
    }
  }

  /**
   * Paints light: where `draw` fills, the piece gives out `colour` × `intensity` (added after the shading, so it never goes dark), and a soft halo of `halo` px around it.
   * Whatever it lights must be an object already added (the light has no body of its own).
   */
  glow(draw: (ctx: CanvasRenderingContext2D, dx: number) => void, box: Box, colour: Rgb, intensity: number, halo = 0): void {
    const offsets = this.periodicX ? [0, -this.w, this.w] : [0];
    const pad = Math.ceil(halo * 2) + 2;
    for (const dx of offsets) {
      const x0 = Math.max(0, Math.floor(box.x0 + dx) - pad);
      const x1 = Math.min(this.w, Math.ceil(box.x1 + dx) + pad);
      const y0 = Math.max(0, Math.floor(box.y0) - pad);
      const y1 = Math.min(this.h, Math.ceil(box.y1) + pad);
      if (x1 <= x0 || y1 <= y0) continue;
      const core: Surface = surface(x1 - x0, y1 - y0);
      core.ctx.fillStyle = '#fff';
      core.ctx.translate(-x0, -y0);
      draw(core.ctx, dx);
      const bright = readPixels(core);
      let soft = bright;
      if (halo > 0) {
        const b = surface(x1 - x0, y1 - y0);
        b.ctx.filter = `blur(${halo}px)`;
        b.ctx.drawImage(core.canvas, 0, 0);
        soft = readPixels(b);
      }
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const k = ((y - y0) * core.w + (x - x0)) * 4 + 3;
          const a = bright.data[k]! / 255;
          const hl = soft.data[k]! / 255;
          const i = y * this.w + x;
          const v = intensity * clamp01(a + hl * 0.55);
          this.emissive[i * 3] = this.emissive[i * 3]! + colour[0] * v;
          this.emissive[i * 3 + 1] = this.emissive[i * 3 + 1]! + colour[1] * v;
          this.emissive[i * 3 + 2] = this.emissive[i * 3 + 2]! + colour[2] * v;
          // the halo is light in the air: it shows where there is no object too
          if (halo > 0 && this.alpha.d[i]! < hl * 0.6) this.alpha.d[i] = Math.max(this.alpha.d[i]!, hl * 0.6 * Math.min(1, intensity));
        }
      }
    }
  }

  /** The layers for `shade`: tone → colour on the stone ramp, moss over it. */
  layers(stone: (v: number) => Rgb = STONE, mossRamp: (v: number) => Rgb = MOSS): Layers {
    const albedo = new Float32Array(this.w * this.h * 3);
    for (let i = 0; i < this.w * this.h; i++) {
      let c = stone(this.tone[i]!);
      const m = clamp01(this.moss[i]!);
      if (m > 0.02) c = mixRgb(c, mossRamp(0.5), m * 0.8);
      albedo[i * 3] = c[0];
      albedo[i * 3 + 1] = c[1];
      albedo[i * 3 + 2] = c[2];
    }
    return { w: this.w, h: this.h, albedo, height: this.height, alpha: this.alpha, emissive: this.emissive };
  }
}
