import { surface, readPixels, type Surface } from './canvas';
import { makeField, type Field } from './field';
import type { Layers } from './light';
import { MOSS, STONE } from './masonry';
import type { Rgb } from './color';
import { clamp01, mixRgb, smoothstep } from './color';
import { fbm } from './noise';
import type { Pt } from './shapes';

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

/** What a tube is made of: how dark it is, how much it varies, what grows on it. */
export interface TubeOptions {
  tone: number;
  spread: number;
  moss?: number;
  /** A tone that changes along the tube: the value at its start and at its end, added to `tone`. */
  fade?: readonly [number, number];
  /** How much of a full cylinder the cross-section rises (1 = round, 0.5 = flat-backed). */
  round?: number;
  /** Bark: how deep the furrows that run along the tube cut, in pixels. */
  grain?: number;
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
   * Paints a TUBE along a path — a root, a vine, a thorn: every point of the path stamps a disc of its own radius, and the height across the tube is that of a cylinder, so a strand
   * that runs in ANY direction is lit as a round thing (`add` rounds a shape by its bounding box, which is right for a column and wrong for a root that curves). Where two tubes
   * cross, the later one is in front. `radius(t)` is the radius in pixels at `t` ∈ [0, 1] along the path.
   */
  tube(path: ReadonlyArray<Pt>, radius: (t: number) => number, o: TubeOptions): void {
    if (path.length < 2) return;
    const lens = [0];
    for (let i = 1; i < path.length; i++) lens.push(lens[i - 1]! + Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y));
    const total = lens[lens.length - 1]!;
    if (total <= 0) return;
    let rMax = 0;
    for (let k = 0; k <= 12; k++) rMax = Math.max(rMax, radius(k / 12));
    const pad = Math.ceil(rMax) + 3;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of path) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    const bx0 = Math.max(0, Math.floor(x0 - pad));
    const by0 = Math.max(0, Math.floor(y0 - pad));
    const bx1 = Math.min(this.w, Math.ceil(x1 + pad));
    const by1 = Math.min(this.h, Math.ceil(y1 + pad));
    const bw = bx1 - bx0;
    const bh = by1 - by0;
    if (bw <= 0 || bh <= 0) return;
    const lh = new Float32Array(bw * bh);
    const la = new Float32Array(bw * bh);
    const lt = new Float32Array(bw * bh);
    const lp = new Float32Array(bw * bh);
    const lup = new Float32Array(bw * bh);
    const round = o.round ?? 0.92;
    let seg = 0;
    const step = 0.45;
    for (let s = 0; s <= total; s += step) {
      while (seg < lens.length - 2 && lens[seg + 1]! < s) seg++;
      const a = path[seg]!;
      const b = path[seg + 1]!;
      const span = Math.max(1e-6, lens[seg + 1]! - lens[seg]!);
      const u = Math.min(1, Math.max(0, (s - lens[seg]!) / span));
      const cx = a.x + (b.x - a.x) * u;
      const cy = a.y + (b.y - a.y) * u;
      const dl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const tx = (b.x - a.x) / dl;
      const ty = (b.y - a.y) / dl;
      const t = s / total;
      const r = Math.max(0.55, radius(t));
      const ya = Math.max(by0, Math.floor(cy - r - 1));
      const yb = Math.min(by1 - 1, Math.ceil(cy + r + 1));
      const xa = Math.max(bx0, Math.floor(cx - r - 1));
      const xb = Math.min(bx1 - 1, Math.ceil(cx + r + 1));
      for (let py = ya; py <= yb; py++) {
        for (let px = xa; px <= xb; px++) {
          const ddx = px + 0.5 - cx;
          const ddy = py + 0.5 - cy;
          const d = Math.hypot(ddx, ddy);
          if (d > r + 0.7) continue;
          const cov = clamp01(r + 0.5 - d);
          const k = Math.sqrt(Math.max(0, 1 - (d / r) * (d / r)));
          const hv = round * r * k;
          const i = (py - by0) * bw + (px - bx0);
          if (cov > la[i]!) la[i] = cov;
          if (hv >= lh[i]!) {
            lh[i] = hv;
            lt[i] = t;
            // where across the tube (−1 … 1) and how much its surface faces up (0 … 1)
            lp[i] = Math.max(-1, Math.min(1, (ddx * -ty + ddy * tx) / r));
            lup[i] = clamp01(-ddy / r);
          }
        }
      }
    }
    for (let y = by0; y < by1; y++) {
      for (let x = bx0; x < bx1; x++) {
        const li = (y - by0) * bw + (x - bx0);
        const a = la[li]!;
        if (a <= 0) continue;
        const i = y * this.w + x;
        const old = this.alpha.d[i]!;
        if (a >= 0.5 || old < a) {
          const t = lt[li]!;
          const noise = fbm(x * 0.021, y * 0.021, this.noiseSeed, { octaves: 3 });
          const furrow = o.grain ? (Math.cos(lp[li]! * Math.PI * 3.2 + noise * 5) - 1) * 0.5 * o.grain * lh[li]! * 0.18 : 0;
          this.height.d[i] = Math.max(0, lh[li]! + furrow);
          const fade = o.fade ? o.fade[0] + (o.fade[1] - o.fade[0]) * t : 0;
          this.tone[i] = clamp01(o.tone + fade + (noise - 0.5) * o.spread);
          const mossNoise = smoothstep(0.45, 0.7, fbm(x * 0.03, y * 0.05, this.noiseSeed + 9, { octaves: 3 }));
          this.moss[i] = (o.moss ?? 0) * mossNoise * (0.25 + 0.75 * lup[li]!);
        }
        this.alpha.d[i] = a + (1 - a) * old;
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
