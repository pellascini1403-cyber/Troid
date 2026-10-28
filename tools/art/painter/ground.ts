import { surface, readPixels, type Surface } from './canvas';
import { clamp01, smoothstep, type Rgb } from './color';
import { fbm, noise2 } from './noise';
import { bevel, type Layers } from './light';
import { makeField, type Field } from './field';
import { Rng } from './rng';
import { blade, taper, wander, wrapX, blobPath, roughen, type Pt } from './shapes';
import { stone } from './masonry';
import { skin } from './skins';

/** The coverage of a white-on-transparent mask surface, 0..1. */
export function alphaOf(s: Surface): Field {
  const img = readPixels(s);
  const f = makeField(s.w, s.h);
  for (let i = 0; i < f.d.length; i++) f.d[i] = img.data[i * 4 + 3]! / 255;
  return f;
}

const periodic = (w: number, h: number, cells: number): { cx: number; cy: number } => ({ cx: Math.max(1, Math.round(cells)), cy: Math.max(1, Math.round((cells * h) / w)) });

/** Roots — dark, tangled, thick at the top and thin at the tip — as a white mask that wraps both ways. */
function rootMask(w: number, h: number, ppm: number, seed: number, perM2: number): Surface {
  const s = surface(w, h);
  const rng = new Rng(seed);
  s.ctx.fillStyle = '#fff';
  const n = Math.round(((w * h) / (ppm * ppm)) * perM2);
  for (let i = 0; i < n; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const a = rng.range(0, Math.PI * 2);
    const pts = wander(rng, x, y, a, rng.range(0.5, 1.6) * ppm, ppm * 0.07, 0.35);
    const w0 = rng.range(0.05, 0.13) * ppm;
    for (const dx of [-w, 0, w]) {
      for (const dy of [-h, 0, h]) {
        taper(s.ctx, pts.map((p) => ({ x: p.x + dx, y: p.y + dy })), w0, w0 * 0.15);
      }
    }
  }
  return s;
}

export interface EarthOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
}

/** Soil over rubble: big dark cyclopean stones with grit between them, strata of damp earth and a mat of roots, periodic in both directions. */
export function earth(o: EarthOptions): Layers {
  const { w, h, ppm, seed } = o;
  const S = skin();
  const base = stone({
    w, h, ppm, seed, style: 'cyclopean', courseM: [1.5, 1.5], blockM: [1, 1], jointM: 0.1,
    moss: S.earth.moss, cracks: 0.25, stains: 0.5, energy: S.earth.energy, energyRgb: S.energyRgb, stone: S.stone, mossRamp: S.moss, tone: S.earth.tone, toneSpread: 0.07,
  });
  const strataN = Math.max(1, Math.round(h / (ppm * 0.9)));
  const warp = periodic(w, h, w / (ppm * 1.4));
  const grit = periodic(w, h, w / (ppm * 0.1));
  const roots = alphaOf(rootMask(w, h, ppm, seed + 5, 0.7));
  const rootHeight = bevel(roots, ppm * 0.07, true);
  const { albedo, height } = base;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const wp = fbm((x / w) * warp.cx, (y / h) * warp.cy, seed + 3, { octaves: 2, px: warp.cx, py: warp.cy });
      const strata = Math.sin(2 * Math.PI * (strataN * (y / h) + 0.7 * wp));
      const g = fbm((x / w) * grit.cx, (y / h) * grit.cy, seed + 2, { octaves: 2, px: grit.cx, py: grit.cy });
      // the soil is a little darker in the thin bands, and gritty everywhere
      const k = 1 + 0.12 * strata + 0.18 * (g - 0.5);
      for (let c = 0; c < 3; c++) albedo[i * 3 + c] = albedo[i * 3 + c]! * k;
      height.d[i] = height.d[i]! + (g - 0.5) * 1.6;
      const r = roots.d[i]!;
      if (r > 0.01) {
        const rc = S.stone(0.2 + 0.1 * g);
        for (let c = 0; c < 3; c++) albedo[i * 3 + c] = albedo[i * 3 + c]! + (rc[c]! - albedo[i * 3 + c]!) * r;
        height.d[i] = height.d[i]! + rootHeight.d[i]! * ppm * 0.05;
      }
    }
  }
  return base;
}

export interface CapOptions {
  w: number;
  /** Total height of the frame, px. */
  h: number;
  ppm: number;
  seed: number;
  /** Pixels of the frame above the surface line: where the blades and the moss stand. */
  rise: number;
  /** `turf`: soil with a mat of grass. `stone`: a dressed slab with a chipped lip and moss. */
  style: 'turf' | 'stone';
}

/** The top edge of a solid: an irregular surface line with grass or moss standing on it, periodic along x, fading out below so it joins the fill. */
export function cap(o: CapOptions): Layers {
  const { w, h, ppm, seed, rise } = o;
  const S = skin();
  const rng = new Rng(seed);
  const mask = surface(w, h);
  const ctx = mask.ctx;
  ctx.fillStyle = '#fff';
  // the surface line
  const cells = Math.max(1, Math.round(w / (ppm * 1.3)));
  const line = (x: number): number => rise + (fbm((x / w) * cells, 0.5, seed + 1, { octaves: 3, px: cells, py: 1 }) - 0.5) * ppm * 0.16 + (noise2(x * 0.35, 3.1, seed + 2) - 0.5) * ppm * 0.03;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 2) ctx.lineTo(x, line(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  const profile = (x: number): number => line(((x % w) + w) % w);
  if (o.style === 'turf') {
    // blades, in clumps
    const clumps = Math.round(w / (ppm * 0.22));
    for (let c = 0; c < clumps; c++) {
      const cx = rng.range(0, w);
      const n = rng.int(3, 7);
      const hh = ppm * rng.range(0.1, 0.34);
      for (let k = 0; k < n; k++) {
        const bx = cx + rng.range(-ppm * 0.07, ppm * 0.07);
        const lean = (rng.next() - 0.5) * hh * 0.9;
        wrapX(w, (dx) => blade(ctx, bx + dx, profile(bx) + 2, hh * rng.range(0.55, 1), lean, ppm * rng.range(0.018, 0.035)));
      }
    }
  }
  // moss lumps and chips along the line
  const lumps = Math.round(w / (ppm * (o.style === 'turf' ? 0.55 : 0.4)));
  for (let k = 0; k < lumps; k++) {
    const x = rng.range(0, w);
    const r = ppm * rng.range(0.05, o.style === 'turf' ? 0.12 : 0.1);
    wrapX(w, (dx) => {
      blobPath(ctx, x + dx, profile(x) + r * 0.2, r * 1.5, r, rng, 5, 0.3);
      ctx.fill();
    });
  }
  const alpha = alphaOf(mask);
  // fade the lower part out so the cap melts into the fill under it
  const fadeFrom = h - ppm * 0.28;
  for (let y = 0; y < h; y++) {
    if (y < fadeFrom) continue;
    const k = 1 - (y - fadeFrom) / (h - fadeFrom);
    for (let x = 0; x < w; x++) alpha.d[y * w + x] = alpha.d[y * w + x]! * k * k;
  }
  const hgt = bevel(alpha, ppm * 0.07, true);
  const height = makeField(w, h);
  const albedo = new Float32Array(w * h * 3);
  const mossN = periodic(w, h, w / (ppm * 0.5));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const depth = Math.max(0, y - profile(x)); // px below the surface line
      const m = fbm((x / w) * mossN.cx, (y / h) * mossN.cy, seed + 7, { octaves: 4, px: mossN.cx, py: mossN.cy });
      const grain = noise2(x * 0.5, y * 0.5, seed + 8);
      let col: Rgb;
      if (o.style === 'turf') {
        // above the line / just under it: grass and moss; deeper: soil
        const grass = 1 - smoothstep(0, ppm * 0.35, depth);
        col = S.moss(clamp01(0.4 + 0.5 * m + 0.2 * grass + 0.15 * (grain - 0.5)));
        const soil = S.stone(clamp01(0.14 + 0.1 * m));
        const k = smoothstep(ppm * 0.12, ppm * 0.4, depth);
        col = [col[0] + (soil[0] - col[0]) * k, col[1] + (soil[1] - col[1]) * k, col[2] + (soil[2] - col[2]) * k];
      } else {
        const lip = 1 - smoothstep(0, ppm * 0.06, depth);
        col = S.stone(clamp01(0.3 + 0.18 * m + 0.14 * lip + 0.1 * (grain - 0.5)));
        const mossy = smoothstep(0.55, 0.8, m) * (1 - smoothstep(0, ppm * 0.22, depth));
        const mc = S.moss(0.4 + 0.5 * m);
        col = [col[0] + (mc[0] - col[0]) * mossy, col[1] + (mc[1] - col[1]) * mossy, col[2] + (mc[2] - col[2]) * mossy];
      }
      albedo[i * 3] = col[0];
      albedo[i * 3 + 1] = col[1];
      albedo[i * 3 + 2] = col[2];
      height.d[i] = hgt.d[i]! * ppm * 0.05 + (grain - 0.5) * 1.4 + (m - 0.5) * 2;
    }
  }
  return { w, h, albedo, height, alpha };
}

export type { Pt };
export { roughen };
