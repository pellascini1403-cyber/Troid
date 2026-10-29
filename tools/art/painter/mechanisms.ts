import { surface, writePixels, type Surface } from './canvas';
import type { Rgb } from './color';
import { hex } from './color';
import { DAY, shade } from './light';
import { MOSS, STONE, stone } from './masonry';
import { lit } from './props';
import { Rng } from './rng';
import { SilhouetteLayer } from './silhouette';
import * as M from './motifs';
import { skin, withSkin } from './skins';

/**
 * THE THINGS THE HERO USES AND BREAKS (docs/PROMPT23-LOG.md §5): the wall of split stone the Ground Slam brings down, the lever of a shortcut, and the spikes of a ditch in the places that are not forest. The Prompt 21 rooms asked
 * for the first two of these and no pack painted them, so the blockout drew them: a rectangle and a post. They are made the way the rest of the ruins' pieces are — the same stone generator and the same silhouette lighting —
 * and they are cues first: the cracked wall is the one piece of stone in a room that glows from inside, and the lever is lit while it can still be pulled.
 */
export interface PieceOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
}

/** The wall of split stone: polygons of stone fitted together with cracks across them that give out the light of the energy inside — paler than the stone around it, so that it reads as the part that will break. Periodic both ways. */
export function crackedDoor(o: PieceOptions): Surface {
  const layers = stone({
    w: o.w, h: o.h, ppm: o.ppm, seed: o.seed, style: 'cyclopean', courseM: [0.8, 0.8], blockM: [1, 1], jointM: 0.09,
    moss: 0.1, cracks: 1, stains: 0.4, energy: 1.5, stone: STONE, mossRamp: MOSS, tone: 0.44, toneSpread: 0.12,
  });
  return lit(layers, true);
}

/** The lever of a shortcut, two frames side by side: the lever at rest — a stone pedestal, a slot and a handle with a knob — and the same lit (the knob and a lamp on the pedestal burn): lit while it can still be pulled. */
export function lever(o: PieceOptions): Surface {
  const { w, h, ppm, seed } = o;
  const fw = w / 2;
  const out = surface(w, h);
  const foot = h - 2;
  const cx = fw / 2;
  const layer = new SilhouetteLayer(fw, h, seed, false);
  // the pedestal: a block wider at its foot, a plate on it and the slot the handle moves in
  const pw = ppm * 0.72;
  const ph = ppm * 0.46;
  layer.add(
    (ctx, dx) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx - pw * 0.55, foot);
      ctx.lineTo(cx + dx - pw * 0.4, foot - ph);
      ctx.lineTo(cx + dx + pw * 0.4, foot - ph);
      ctx.lineTo(cx + dx + pw * 0.55, foot);
      ctx.closePath();
      ctx.fill();
    },
    { x0: cx - pw, x1: cx + pw, y0: foot - ph - 2, y1: foot + 2 },
    { round: ppm * 0.18, tone: 0.34, spread: 0.1 },
  );
  layer.add((ctx, dx) => ctx.fillRect(cx + dx - pw * 0.52, foot - ph - ppm * 0.07, pw * 1.04, ppm * 0.09), { x0: cx - pw, x1: cx + pw, y0: foot - ph - ppm * 0.1, y1: foot - ph + 4 }, { round: ppm * 0.05, tone: 0.42, spread: 0.06 });
  // the handle, leaning, with its knob
  const hx = cx + ppm * 0.02;
  const hy = foot - ph - ppm * 0.04;
  const tipX = hx - ppm * 0.34;
  const tipY = hy - ppm * 0.62;
  layer.add((ctx, dx) => M.bar(ctx, hx + dx, hy, tipX + dx, tipY, ppm * 0.075, ppm * 0.06), { x0: tipX - ppm * 0.2, x1: hx + ppm * 0.2, y0: tipY - ppm * 0.2, y1: hy + 2 }, { round: ppm * 0.04, tone: 0.4, spread: 0.05 });
  layer.add(
    (ctx, dx) => {
      ctx.beginPath();
      ctx.arc(tipX + dx, tipY, ppm * 0.1, 0, Math.PI * 2);
      ctx.fill();
    },
    { x0: tipX - ppm * 0.2, x1: tipX + ppm * 0.2, y0: tipY - ppm * 0.2, y1: tipY + ppm * 0.2 },
    { round: ppm * 0.09, tone: 0.5, spread: 0.03 },
  );
  // a stud or two on the plate
  for (const s of [-0.3, 0.3]) layer.add((ctx, dx) => { ctx.beginPath(); ctx.arc(cx + dx + pw * s, foot - ph * 0.45, ppm * 0.035, 0, Math.PI * 2); ctx.fill(); }, { x0: cx + pw * s - 6, x1: cx + pw * s + 6, y0: foot - ph * 0.45 - 6, y1: foot - ph * 0.45 + 6 }, { round: ppm * 0.03, tone: 0.5, spread: 0.02 });
  const base = shade(layer.layers(STONE, MOSS), DAY, false);
  const a = surface(fw, h);
  writePixels(a, base);
  out.ctx.drawImage(a.canvas, 0, 0);
  // the lit frame: only the light — the knob, a lamp on the pedestal and the halo of both — over the rest
  const b = surface(fw, h);
  const cyan: Rgb = hex('#6ff0ff');
  const glowAt = (x: number, y: number, r: number, k: number): void => {
    const g = b.ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${Math.round(cyan[0] * 255)},${Math.round(cyan[1] * 255)},${Math.round(cyan[2] * 255)},${k})`);
    g.addColorStop(0.35, `rgba(${Math.round(cyan[0] * 255)},${Math.round(cyan[1] * 255)},${Math.round(cyan[2] * 255)},${k * 0.4})`);
    g.addColorStop(1, 'rgba(111,240,255,0)');
    b.ctx.fillStyle = g;
    b.ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  glowAt(tipX, tipY, ppm * 0.55, 0.85);
  glowAt(cx + pw * 0.28, foot - ph * 0.5, ppm * 0.3, 0.8);
  b.ctx.fillStyle = 'rgba(235,255,255,0.95)';
  b.ctx.beginPath();
  b.ctx.arc(tipX, tipY, ppm * 0.075, 0, Math.PI * 2);
  b.ctx.fill();
  b.ctx.beginPath();
  b.ctx.arc(cx + pw * 0.28, foot - ph * 0.5, ppm * 0.035, 0, Math.PI * 2);
  b.ctx.fill();
  out.ctx.drawImage(b.canvas, fw, 0);
  return out;
}

/** What a ditch of spikes is made of where it is not the forest: shards of crystal, iron, bone of the ink. */
export type SpikeKind = 'crystal' | 'iron' | 'ink' | 'obsidian' | 'bramble';

const SPIKE: Readonly<Record<SpikeKind, { tone: readonly [number, number]; tip: Rgb; ramp: 'rock' | 'iron' | 'ink' | 'basalt' | 'cinder'; count: readonly [number, number]; lean: number }>> = {
  crystal: { tone: [0.5, 0.66], tip: [0.55, 0.85, 1], ramp: 'rock', count: [3, 4], lean: 0.22 },
  iron: { tone: [0.36, 0.5], tip: [1, 0.55, 0.2], ramp: 'iron', count: [4, 5], lean: 0.08 },
  ink: { tone: [0.38, 0.52], tip: [0.82, 0.5, 1], ramp: 'ink', count: [4, 6], lean: 0.18 },
  // the crater's own: shards of black glass with a hot point at the tip
  obsidian: { tone: [0.3, 0.46], tip: [1, 0.5, 0.15], ramp: 'basalt', count: [4, 6], lean: 0.1 },
  // the verge's and the grove's: brambles of the red-violet wood, leaning, with a rose point at the tip
  bramble: { tone: [0.3, 0.46], tip: [1, 0.45, 0.62], ramp: 'cinder', count: [5, 7], lean: 0.22 },
};

/** A strip of spikes: cells of half a metre side by side, periodic along x (cut into one frame per cell), each spike a sharp shard with a point of light at its tip. */
export function spikeStrip(o: PieceOptions & { kind: SpikeKind }): Surface {
  const { w, h, ppm, seed } = o;
  const t = SPIKE[o.kind];
  const rng = new Rng(seed);
  return withSkin(t.ramp, () => {
    const layer = new SilhouetteLayer(w, h, seed, true);
    const foot = h - 1;
    const n = Math.round((w / ppm) * rng.range(t.count[0], t.count[1]) * 2);
    const spikes = Array.from({ length: n }, () => ({ x: rng.range(0, w), hgt: ppm * rng.range(0.34, 0.72), wid: ppm * rng.range(0.07, 0.15), lean: rng.gauss() * t.lean * ppm * 0.3, tone: rng.range(t.tone[0], t.tone[1]) }));
    for (const s of spikes.sort((a, b) => a.hgt - b.hgt)) {
      const draw = (ctx: CanvasRenderingContext2D, dx: number): void => {
        ctx.beginPath();
        ctx.moveTo(s.x + dx - s.wid / 2, foot + 1);
        ctx.lineTo(s.x + dx - s.wid * 0.3 + s.lean * 0.3, foot - s.hgt * 0.6);
        ctx.lineTo(s.x + dx + s.lean, foot - s.hgt);
        ctx.lineTo(s.x + dx + s.wid * 0.3 + s.lean * 0.3, foot - s.hgt * 0.6);
        ctx.lineTo(s.x + dx + s.wid / 2, foot + 1);
        ctx.closePath();
        ctx.fill();
      };
      layer.add(draw, { x0: s.x - s.wid - Math.abs(s.lean), x1: s.x + s.wid + Math.abs(s.lean), y0: foot - s.hgt - 2, y1: foot + 2 }, { round: s.wid * 0.45, tone: s.tone, spread: 0.06 });
      // the point of light at its tip
      layer.glow((ctx, dx) => { ctx.beginPath(); ctx.arc(s.x + dx + s.lean, foot - s.hgt + s.wid * 0.3, Math.max(1.6, s.wid * 0.3), 0, Math.PI * 2); ctx.fill(); }, { x0: s.x + s.lean - 8, x1: s.x + s.lean + 8, y0: foot - s.hgt - 6, y1: foot - s.hgt + 14 }, t.tip, 1.3, ppm * 0.09);
    }
    const s = surface(w, h);
    writePixels(s, shade(layer.layers(skin().stone, skin().moss), skin().look, true));
    return s;
  });
}
