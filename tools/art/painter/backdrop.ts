import { surface, readPixels, writePixels, type Surface } from './canvas';
import { clamp01, css, hex, mixRgb, smoothstep, type Rgb } from './color';
import { archRing, column, crown, trunk, vine, wallStub } from './forms';
import { DAY, grade, shade, type Look } from './light';
import { fbm } from './noise';
import { Rng } from './rng';
import { SilhouetteLayer } from './silhouette';
import { wrapX } from './shapes';

/**
 * The three seamless strips of a room's backdrop (docs/ART-PIPELINE-2D.md part M): the FAR one is a whole picture — the sky, a glow, the haze and the skyline of a forest
 * with ruins in it; the MID one is trunks and crowns in the mist, with the sky and the far strip showing through; the NEAR one is a colonnade, darker and closer. They are
 * all periodic across their width, so the copies of a strip meet without a seam.
 */
export interface StripOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
}

/** Light for the layers behind the action: softer than the ground's, so they never fight the hero for contrast. */
const BACK: Look = { ...DAY, key: [0.5, 0.74, 0.9], ambient: [0.24, 0.34, 0.46], rim: 0.55, bump: 0.8, cavity: 0.2 };

const gradient = (ctx: CanvasRenderingContext2D, h: number, stops: ReadonlyArray<readonly [number, string]>): CanvasGradient => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [at, c] of stops) g.addColorStop(at, c);
  return g;
};

/** Mist: soft horizontal bands, periodic in x, as an alpha on a colour — over a surface that already holds the picture. */
function mist(s: Surface, seed: number, y0: number, y1: number, colour: Rgb, strength: number, ppm: number): void {
  const img = readPixels(s);
  const cells = Math.max(2, Math.round(s.w / (ppm * 6)));
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(s.h, Math.ceil(y1)); y++) {
    const k = smoothstep(y0, (y0 + y1) / 2, y) * (1 - smoothstep((y0 + y1) / 2, y1, y));
    for (let x = 0; x < s.w; x++) {
      const n = fbm((x / s.w) * cells, (y / s.h) * 3, seed, { octaves: 4, px: cells, py: 3 });
      const a = clamp01(strength * k * smoothstep(0.3, 0.8, n));
      if (a <= 0) continue;
      const i = (y * s.w + x) * 4;
      for (let c = 0; c < 3; c++) img.data[i + c] = Math.round(img.data[i + c]! + (colour[c]! * 255 - img.data[i + c]!) * a);
      img.data[i + 3] = Math.round(img.data[i + 3]! + (255 - img.data[i + 3]!) * a * 0.6);
    }
  }
  writePixels(s, img);
}

/** Soft diagonal beams of cold light, periodic in x: light falling through a canopy that is not in the picture. */
function shafts(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, count: number, peak: number): void {
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, w);
    const wid = rng.range(0.025, 0.07) * w;
    const skew = rng.range(0.12, 0.3) * h;
    const reach = rng.range(0.7, 1);
    for (const dx of [-w, 0, w]) {
      const g = ctx.createLinearGradient(0, 0, 0, h * reach);
      g.addColorStop(0, 'rgba(160,230,255,0)');
      g.addColorStop(0.2, `rgba(160,230,255,${peak})`);
      g.addColorStop(1, 'rgba(160,230,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + dx, 0);
      ctx.lineTo(x + wid + dx, 0);
      ctx.lineTo(x + wid * 1.8 + skew + dx, h * reach);
      ctx.lineTo(x + skew + dx, h * reach);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** A skyline of a forest with ruins in it: slim trunks with crowns, round crowns, and broken spires, along a base line, as one filled silhouette. */
function skyline(ctx: CanvasRenderingContext2D, rng: Rng, w: number, baseY: number, amp: number, colour: string, ppm: number, ruins: number): void {
  ctx.fillStyle = colour;
  for (let x = -w * 0.1; x < w * 1.1; x += rng.range(ppm * 1.6, ppm * 4.2)) {
    const hgt = amp * rng.range(0.4, 1);
    const kind = rng.next();
    wrapX(w, (dx) => {
      if (kind < ruins) {
        // a broken spire, or the corner of a wall with a window
        const ww = ppm * rng.range(0.9, 2);
        ctx.beginPath();
        ctx.moveTo(x + dx - ww / 2, baseY);
        ctx.lineTo(x + dx - ww / 2, baseY - hgt * 0.8);
        ctx.lineTo(x + dx - ww * 0.15, baseY - hgt);
        ctx.lineTo(x + dx + ww * 0.2, baseY - hgt * 0.84);
        ctx.lineTo(x + dx + ww / 2, baseY - hgt * 0.93);
        ctx.lineTo(x + dx + ww / 2, baseY);
        ctx.closePath();
        ctx.fill();
      } else if (kind < ruins + 0.35) {
        // a slim trunk with a crown
        const r = ppm * rng.range(0.15, 0.3);
        ctx.fillRect(x + dx - r, baseY - hgt, r * 2, hgt + 1);
        const c = crown(rng, x + dx, baseY - hgt, ppm * rng.range(1.2, 2.4), ppm * rng.range(0.8, 1.4));
        c.draw(ctx, 0);
      } else {
        // a round crown on a short trunk
        const c = crown(rng, x + dx, baseY - hgt * 0.7, ppm * rng.range(1.6, 3), ppm * rng.range(1, 1.8));
        c.draw(ctx, 0);
        ctx.fillRect(x + dx - ppm * 0.12, baseY - hgt * 0.5, ppm * 0.24, hgt * 0.5 + 1);
      }
    });
  }
  ctx.fillRect(0, baseY, w, ctx.canvas.height - baseY);
}

/** The FAR strip: an opaque picture. */
export function farStrip(o: StripOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const s = surface(w, h);
  const ctx = s.ctx;
  ctx.fillStyle = gradient(ctx, h, [[0, '#03070d'], [0.4, '#0a1a2a'], [0.72, '#16384d'], [1, '#1d4057']]);
  ctx.fillRect(0, 0, w, h);
  // a cold light somewhere above the trees
  for (const dx of [-w, 0, w]) {
    const g = ctx.createRadialGradient(w * 0.62 + dx, h * 0.4, 0, w * 0.62 + dx, h * 0.4, h * 0.55);
    g.addColorStop(0, 'rgba(160,238,255,0.4)');
    g.addColorStop(0.3, 'rgba(90,190,230,0.16)');
    g.addColorStop(1, 'rgba(60,150,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  shafts(ctx, rng, w, h, 5, 0.09);
  // the colossal trunks, so far that they are only a paler shade of the mist
  ctx.fillStyle = 'rgba(24,58,78,0.55)';
  for (let i = 0; i < 4; i++) {
    const x = ((i + rng.range(0.2, 0.8)) / 4) * w;
    const r = ppm * rng.range(1.4, 2.4);
    wrapX(w, (dx) => ctx.fillRect(x + dx - r, 0, r * 2, h * 0.9));
  }
  // the skylines, from the farthest (pale) to the nearest (dark), each in its own mist
  const bands: Array<[number, number, string, number]> = [
    [0.62, 0.2, 'rgba(26,62,84,0.92)', 0.3],
    [0.73, 0.17, 'rgba(17,44,62,0.96)', 0.22],
    [0.84, 0.14, 'rgba(9,26,40,1)', 0.1],
  ];
  for (const [base, amp, colour, ruins] of bands) {
    skyline(ctx, rng.fork(`band${base}`), w, h * base, h * amp, colour, ppm, ruins);
    mist(s, seed + Math.round(base * 100), h * (base - 0.07), h * (base + 0.08), [0.22, 0.42, 0.52], 0.5, ppm);
  }
  mist(s, seed + 7, h * 0.55, h, [0.2, 0.42, 0.55], 0.55, ppm);
  // a few motes of light in the dark
  ctx.fillStyle = 'rgba(190,240,255,0.55)';
  for (let i = 0; i < Math.round(w / 55); i++) ctx.fillRect(Math.round(rng.range(0, w)), Math.round(rng.range(0, h * 0.5)), 1, 1);
  return s;
}

/** Shapes → lit pixels on a transparent surface, with the layer's fog. */
function finish(layer: SilhouetteLayer, look: Look, fog: Rgb, fogAmount: number): Surface {
  const img = shade(layer.layers(), look, true);
  grade(img, { fog, fogAmount });
  const s = surface(layer.w, layer.h);
  writePixels(s, img);
  return s;
}

/** The MID strip: trunks and crowns in the mist, transparent between them. Pale trunks far back, dark ones in front, crowns hanging from the top edge. */
export function midStrip(o: StripOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, true);
  // the back row: thinner and paler, lost in the mist
  const back = Math.round(w / (ppm * 6.5));
  for (let i = 0; i < back; i++) {
    const cx = ((i + rng.range(0.1, 0.9)) / back) * w;
    const rBase = ppm * rng.range(0.45, 0.9);
    const t = trunk(rng, cx, h - ppm * 0.3, -ppm, rBase, rBase * rng.range(0.6, 0.85));
    layer.add(t.draw, { x0: t.x0, x1: t.x1, y0: -ppm, y1: h }, { round: rBase * 0.45, tone: rng.range(0.22, 0.3), spread: 0.06, fade: [0.05, 0] });
  }
  // the front row: wide, dark, crooked
  const front = Math.round(w / (ppm * 9));
  for (let i = 0; i < front; i++) {
    const cx = ((i + rng.range(0.2, 0.8)) / front) * w;
    const rBase = ppm * rng.range(0.9, 1.8);
    const t = trunk(rng, cx, h - ppm * 0.4, -ppm, rBase, rBase * rng.range(0.5, 0.75));
    layer.add(t.draw, { x0: t.x0, x1: t.x1, y0: -ppm, y1: h }, { round: rBase * 0.55, tone: rng.range(0.1, 0.17), spread: 0.08, moss: 0.35, fade: [0.04, -0.01] });
  }
  // crowns along the top, hanging into the picture; vines from them
  const crowns = Math.round(w / (ppm * 4.2));
  for (let i = 0; i < crowns; i++) {
    const c = crown(rng, ((i + rng.range(0.1, 0.9)) / crowns) * w, -ppm * 0.25, ppm * rng.range(2.6, 4.4), ppm * rng.range(1.8, 3.2));
    layer.add(c.draw, c.box, { round: ppm * 0.4, tone: rng.range(0.07, 0.12), spread: 0.05, fade: [0.02, -0.02] });
  }
  for (let i = 0; i < Math.round(w / (ppm * 5)); i++) {
    const v = vine(rng, rng.range(0, w), ppm * 1.2, ppm * rng.range(2.5, 7), ppm * 0.06);
    layer.add(v.draw, v.box, { round: 1.5, tone: 0.08, spread: 0.04 });
  }
  const s = finish(layer, BACK, [0.12, 0.3, 0.4], 0.3);
  // the foot of everything is lost in the mist
  mist(s, seed + 3, h * 0.5, h, [0.2, 0.42, 0.55], 0.75, ppm);
  const img = readPixels(s);
  for (let y = Math.floor(h * 0.6); y < h; y++) {
    const k = smoothstep(h * 0.6, h, y) * 0.6;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (img.data[i + 3]! === 0) continue;
      for (let c = 0; c < 3; c++) img.data[i + c] = Math.round(img.data[i + c]! + ((hex('#27546b')[c]! * 255) - img.data[i + c]!) * k);
    }
  }
  writePixels(s, img);
  // shafts of light over it all
  const ctx = s.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  shafts(ctx, rng, w, h, 4, 0.05);
  ctx.restore();
  return s;
}

/** The NEAR strip: a colonnade with arches and stubs of wall, dark, close, mossy and hung with ivy. */
export function nearStrip(o: StripOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, true);
  const n = Math.max(3, Math.round(w / (ppm * 8)));
  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs.push(((i + rng.range(0.25, 0.75)) / n) * w);
  const foot = h - ppm * 0.3;
  xs.forEach((cx, i) => {
    const r = ppm * rng.range(0.5, 0.85);
    const hgt = ppm * rng.range(5, 12.5);
    const state = rng.chance(0.55) ? 'broken' : 'whole';
    const c = column(rng, cx, foot, foot - hgt, r, state);
    layer.add(c.draw, c.box, { round: r * 0.7, tone: rng.range(0.1, 0.17), spread: 0.08, moss: 0.5, fade: [0.03, -0.02], flutes: { count: 7, depth: r * 0.08 } });
    // an arch to the next column, now and then
    const next = xs[(i + 1) % n]! + (i + 1 === n ? w : 0);
    if (state === 'whole' && rng.chance(0.65) && next - cx < ppm * 12) {
      const mid = (cx + next) / 2;
      const span = (next - cx) / 2;
      const top = foot - hgt + r * 0.5;
      layer.add(archRing(mid, top + span * 0.15, span + r * 0.5, span - r * 0.7, 0.08, Math.PI - 0.08), { x0: cx - r, x1: next + r, y0: top - span * 1.1, y1: top + span * 0.4 }, { round: r * 0.55, tone: 0.12, spread: 0.06, moss: 0.4 });
    } else if (rng.chance(0.6)) {
      // otherwise, a stub of wall in the gap
      const ww = Math.min(next - cx - r * 4, ppm * rng.range(3, 6));
      if (ww > ppm) {
        const wall = wallStub(rng, cx + r * 2 + (next - cx - r * 4 - ww) * rng.next(), foot, ww, ppm * rng.range(2, 4.5));
        layer.add(wall.draw, wall.box, { round: ppm * 0.18, tone: rng.range(0.11, 0.16), spread: 0.07, moss: 0.55, fade: [0.03, -0.02] });
      }
    }
    // ivy from the capital, and a root or two over the foot
    if (rng.chance(0.85)) {
      const v = vine(rng, cx + rng.range(-r, r), foot - hgt + r, ppm * rng.range(2, 5), ppm * 0.085);
      layer.add(v.draw, v.box, { round: 2, tone: 0.09, spread: 0.04, moss: 0.4 });
    }
  });
  const s = finish(layer, BACK, [0.1, 0.24, 0.33], 0.12);
  mist(s, seed + 5, h * 0.72, h, [0.2, 0.42, 0.55], 0.6, ppm);
  return s;
}

export { css, mixRgb };
