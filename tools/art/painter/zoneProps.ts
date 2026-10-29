import { surface, writePixels, type Surface } from './canvas';
import type { Rgb } from './color';
import { trunk, type Draw } from './forms';
import { DAY, shade, type Look } from './light';
import { Rng } from './rng';
import { SilhouetteLayer, type Box } from './silhouette';
import * as M from './motifs';
import { wander } from './shapes';
import { fbm, noise2 } from './noise';
import { EMBER_HANGING, EMBER_RECIPES } from './emberProps';
import { zoneLook, zoneRamps, type ZoneId } from './zones';

/**
 * THE PIECES OF EACH ZONE (docs/PROMPT23-LOG.md §5): what stands behind the walk in the Mines, the Foundry, the Spire, the Mire, the Roots and the Heart — a crystal as tall as a house, a tank on its legs, a bell in its frame, a
 * lantern on a post, a rib that comes out of the ground, a vein — and what hangs in front of the camera. Each one is made of the motifs of `motifs.ts`, lit with the one light of the game and coloured with the same ramp
 * as the zone's backdrop, so that a prop and the strip behind it are of the same stuff. A recipe puts its forms where they stand; the geometry is in the motif, the hue in the zone.
 */
export interface ZonePropOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
  zone: ZoneId;
  kind: string;
}

interface Opts {
  round: number;
  tone: number;
  spread?: number;
  moss?: number;
  fade?: readonly [number, number];
}

/** What a recipe works with: the layer, metres → pixels, the foot of the prop (or its root, for what hangs), and the two things a form does — to be added with a roundness and a tone, and to shine. */
export interface B {
  layer: SilhouetteLayer;
  rng: Rng;
  ppm: number;
  w: number;
  h: number;
  cx: number;
  foot: number;
  m: (metres: number) => number;
  /** A tone, lifted: what stands at the depth of the hero has to show its form against the haze behind it, so it is not as dark as what hangs in front. */
  t: (v: number) => number;
  add: (f: M.Form, o: Opts) => void;
  shine: (f: { draw: Draw; box: Box }, colour: Rgb, intensity: number, haloM: number) => void;
}

export type Recipe = (b: B) => void;

const LIFT = 0.12;

const tone = (b: B, lo: number, hi: number): number => b.t(b.rng.range(lo, hi));

const MINES_BLUE: Rgb = [0.3, 0.62, 1];
const VIOLET: Rgb = [0.7, 0.4, 1];
const MIRE_TEAL: Rgb = [0.3, 0.95, 0.8];
const EMBER: Rgb = [1, 0.5, 0.16];

/** A form made of a bar between two points, for the braces and poles the motifs do not have. */
const barForm = (x0: number, y0: number, x1: number, y1: number, t0: number, t1 = t0): M.Form => ({
  draw: (ctx, dx) => M.bar(ctx, x0 + dx, y0, x1 + dx, y1, t0, t1),
  box: { x0: Math.min(x0, x1) - t0, x1: Math.max(x0, x1) + t0, y0: Math.min(y0, y1) - t0, y1: Math.max(y0, y1) + t0 },
});

const RECIPES: Readonly<Record<string, Recipe>> = {
  ...EMBER_RECIPES,
  // ------------------------------------------------------------------------------------------------------------------------------ the Crystal Mines
  'mines:crystals_tall': (b) => {
    const base = M.rockMass(b.rng, b.cx, b.foot, b.m(2.8), b.m(0.7));
    b.add(base, { round: b.m(0.3), tone: tone(b, 0.14, 0.2) });
    for (const [dx, h, w] of [[0, 3.8, 2.4], [0.95, 2.2, 1.5], [-0.9, 1.7, 1.3]] as const) {
      const c = M.crystalCluster(b.rng, b.cx + b.m(dx), b.foot - b.m(0.15), b.m(h), b.m(w));
      b.add(c, { round: b.m(0.16), tone: tone(b, 0.34, 0.46), spread: 0.05 });
      b.shine(c, MINES_BLUE, 0.9, 0.4);
    }
  },
  'mines:timber_prop': (b) => {
    const f = M.timberFrame(b.rng, b.cx, b.foot, b.m(3.2), b.m(4), b.m(0.26), b.rng.chance(0.4));
    b.add(f, { round: b.m(0.12), tone: tone(b, 0.18, 0.24), fade: [0.03, -0.02] });
    // a lantern on the lintel
    const lamp = { draw: (ctx: CanvasRenderingContext2D, dx: number) => { ctx.beginPath(); ctx.arc(b.cx + dx, b.foot - b.m(3.2), b.m(0.12), 0, Math.PI * 2); ctx.fill(); }, box: { x0: b.cx - b.m(0.6), x1: b.cx + b.m(0.6), y0: b.foot - b.m(3.8), y1: b.foot - b.m(2.6) } };
    b.shine(lamp, [0.7, 0.9, 1], 1.2, 0.7);
  },
  'mines:ore_pile': (b) => {
    b.add(M.rockMass(b.rng, b.cx, b.foot, b.m(3), b.m(1)), { round: b.m(0.3), tone: tone(b, 0.16, 0.24) });
    b.add(M.rockMass(b.rng, b.cx - b.m(0.9), b.foot, b.m(1.2), b.m(1.5)), { round: b.m(0.25), tone: tone(b, 0.18, 0.26) });
    const c = M.crystalCluster(b.rng, b.cx + b.m(0.6), b.foot - b.m(0.4), b.m(1.2), b.m(0.9));
    b.add(c, { round: b.m(0.1), tone: b.t(0.4), spread: 0.05 });
    b.shine(c, MINES_BLUE, 0.9, 0.3);
  },
  'mines:stalagmites': (b) => {
    b.add(M.rockMass(b.rng, b.cx, b.foot, b.m(2.4), b.m(0.5)), { round: b.m(0.2), tone: tone(b, 0.12, 0.18) });
    for (const [dx, h, w] of [[-0.7, 2.4, 0.8], [0.1, 3.4, 1], [0.8, 1.7, 0.7]] as const) b.add(M.stalagmite(b.rng, b.cx + b.m(dx), b.foot, b.m(h), b.m(w)), { round: b.m(0.3), tone: tone(b, 0.16, 0.24), fade: [0.05, -0.02] });
  },
  'mines:rock_pillar': (b) => {
    b.add(M.rockMass(b.rng, b.cx, b.foot, b.m(1.9), b.m(5.2)), { round: b.m(0.5), tone: tone(b, 0.15, 0.22), fade: [0.06, -0.03] });
    const c = M.crystalCluster(b.rng, b.cx + b.m(0.35), b.foot - b.m(2.2), b.m(1.5), b.m(1));
    b.add(c, { round: b.m(0.12), tone: b.t(0.4), spread: 0.05 });
    b.shine(c, MINES_BLUE, 0.8, 0.3);
  },

  // ------------------------------------------------------------------------------------------------------------------------------ the Ink Foundry
  'foundry:chimney_stub': (b) => {
    b.add(M.chimney(b.rng, b.cx, b.foot, b.m(4.8), b.m(1.9), b.m(1.25)), { round: b.m(0.5), tone: tone(b, 0.2, 0.28), fade: [0.04, -0.02] });
    b.add(M.rockMass(b.rng, b.cx + b.m(1.2), b.foot, b.m(1.2), b.m(0.4)), { round: b.m(0.12), tone: b.t(0.2) });
  },
  'foundry:tank_drum': (b) => {
    b.add(M.tank(b.rng, b.cx, b.foot, b.m(2.4), b.m(2.7), b.m(1.1)), { round: b.m(0.6), tone: tone(b, 0.2, 0.27), fade: [0.04, -0.02] });
    b.add(M.pipe(b.rng, b.cx + b.m(1.5), b.foot - b.m(2.6), b.foot, b.m(0.18)), { round: b.m(0.12), tone: b.t(0.18) });
    const gauge = { draw: (ctx: CanvasRenderingContext2D, dx: number) => { ctx.beginPath(); ctx.arc(b.cx + dx, b.foot - b.m(2.1), b.m(0.1), 0, Math.PI * 2); ctx.fill(); }, box: { x0: b.cx - b.m(0.6), x1: b.cx + b.m(0.6), y0: b.foot - b.m(2.8), y1: b.foot - b.m(1.4) } };
    b.shine(gauge, EMBER, 1, 0.5);
  },
  'foundry:pipe_stand': (b) => {
    b.add(M.pipe(b.rng, b.cx - b.m(0.5), b.foot - b.m(4), b.foot, b.m(0.28), 1, b.m(1.5)), { round: b.m(0.2), tone: tone(b, 0.2, 0.27) });
    b.add(M.gear(b.rng, b.cx - b.m(0.5), b.foot - b.m(1.7), b.m(0.4), 8), { round: b.m(0.12), tone: b.t(0.24) });
  },
  'foundry:girder_post': (b) => {
    b.add(M.girder(b.rng, b.cx, b.foot, b.foot - b.m(5.4), b.m(1)), { round: b.m(0.3), tone: tone(b, 0.18, 0.25), fade: [0.04, -0.02] });
    b.add(barForm(b.cx - b.m(0.15), b.foot - b.m(1.2), b.cx + b.m(1.3), b.foot - b.m(3.4), b.m(0.14)), { round: b.m(0.06), tone: b.t(0.2) });
    b.add(barForm(b.cx + b.m(1.3), b.foot - b.m(3.4), b.cx + b.m(1.3), b.foot, b.m(0.14)), { round: b.m(0.06), tone: b.t(0.2) });
  },
  'foundry:gear_half': (b) => {
    b.add(M.gear(b.rng, b.cx, b.foot + b.m(0.5), b.m(1.7), 14), { round: b.m(0.3), tone: tone(b, 0.2, 0.27) });
  },
  'foundry:furnace_mouth': (b) => {
    const w = b.m(3);
    const h = b.m(2.7);
    const body: M.Form = {
      draw: (ctx, dx) => {
        ctx.beginPath();
        ctx.moveTo(b.cx + dx - w / 2, b.foot);
        ctx.lineTo(b.cx + dx - w / 2, b.foot - h * 0.8);
        ctx.quadraticCurveTo(b.cx + dx - w / 2, b.foot - h, b.cx + dx - w * 0.3, b.foot - h);
        ctx.lineTo(b.cx + dx + w * 0.3, b.foot - h);
        ctx.quadraticCurveTo(b.cx + dx + w / 2, b.foot - h, b.cx + dx + w / 2, b.foot - h * 0.8);
        ctx.lineTo(b.cx + dx + w / 2, b.foot);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.moveTo(b.cx + dx - w * 0.2, b.foot);
        ctx.lineTo(b.cx + dx - w * 0.2, b.foot - h * 0.38);
        ctx.arc(b.cx + dx, b.foot - h * 0.38, w * 0.2, Math.PI, 0);
        ctx.lineTo(b.cx + dx + w * 0.2, b.foot);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      },
      box: { x0: b.cx - w * 0.6, x1: b.cx + w * 0.6, y0: b.foot - h - 4, y1: b.foot + 3 },
    };
    b.add(body, { round: b.m(0.5), tone: tone(b, 0.17, 0.23), fade: [0.04, -0.02] });
    // the fire that is left in it
    const mouth: M.Form = { draw: (ctx, dx) => { const g = ctx.createRadialGradient(b.cx + dx, b.foot - h * 0.2, 0, b.cx + dx, b.foot - h * 0.2, w * 0.3); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(b.cx + dx - w * 0.3, b.foot - h * 0.55, w * 0.6, h * 0.55); }, box: { x0: b.cx - w * 0.45, x1: b.cx + w * 0.45, y0: b.foot - h * 0.7, y1: b.foot } };
    b.shine(mouth, EMBER, 1.3, 0.8);
  },

  // ------------------------------------------------------------------------------------------------------------------------------ the Bell Spire
  'spire:bell_frame': (b) => {
    const f = M.timberFrame(b.rng, b.cx, b.foot, b.m(3.2), b.m(4.6), b.m(0.34), false);
    b.add(f, { round: b.m(0.16), tone: tone(b, 0.17, 0.23), fade: [0.03, -0.02] });
    b.add(M.bell(b.rng, b.cx, b.foot - b.m(4.3), b.m(0.8)), { round: b.m(0.3), tone: tone(b, 0.24, 0.32), spread: 0.08 });
  },
  'spire:pinnacle_stone': (b) => {
    b.add(M.pinnacle(b.rng, b.cx, b.foot, b.m(5.4), b.m(1)), { round: b.m(0.35), tone: tone(b, 0.2, 0.28), fade: [0.04, -0.02] });
  },
  'spire:broken_arcade': (b) => {
    b.add(M.arcade(b.rng, b.cx - b.m(2.1), b.foot, 2, b.m(2.1), b.m(3.9), b.m(0.5)), { round: b.m(0.22), tone: tone(b, 0.2, 0.27), fade: [0.03, -0.02] });
    b.add(M.rockMass(b.rng, b.cx + b.m(1.6), b.foot, b.m(1.4), b.m(0.5)), { round: b.m(0.15), tone: b.t(0.22) });
  },
  'spire:tower_stub': (b) => {
    const t = M.tower(b.rng, b.cx, b.foot, b.m(5.6), b.m(2.1));
    b.add(t, { round: b.m(0.6), tone: tone(b, 0.2, 0.27), fade: [0.04, -0.02] });
  },
  'spire:banner_pole': (b) => {
    b.add(barForm(b.cx - b.m(0.55), b.foot, b.cx - b.m(0.55), b.foot - b.m(5.2), b.m(0.16)), { round: b.m(0.08), tone: tone(b, 0.18, 0.24) });
    b.add(barForm(b.cx - b.m(0.6), b.foot - b.m(5), b.cx + b.m(0.7), b.foot - b.m(5), b.m(0.1)), { round: b.m(0.05), tone: b.t(0.2) });
    const cloth: M.Form = {
      draw: (ctx, dx) => {
        ctx.beginPath();
        ctx.moveTo(b.cx + dx - b.m(0.5), b.foot - b.m(4.95));
        ctx.lineTo(b.cx + dx + b.m(0.65), b.foot - b.m(4.95));
        ctx.lineTo(b.cx + dx + b.m(0.6), b.foot - b.m(2.4));
        ctx.lineTo(b.cx + dx + b.m(0.07), b.foot - b.m(2.9));
        ctx.lineTo(b.cx + dx - b.m(0.45), b.foot - b.m(2.3));
        ctx.closePath();
        ctx.fill();
      },
      box: { x0: b.cx - b.m(0.7), x1: b.cx + b.m(0.8), y0: b.foot - b.m(5.1), y1: b.foot - b.m(2.2) },
    };
    b.add(cloth, { round: b.m(0.04), tone: tone(b, 0.1, 0.15) });
  },
  'spire:buttress_stub': (b) => {
    b.add(M.buttress(b.rng, b.cx - b.m(1.3), b.foot, b.cx + b.m(1.3), b.foot - b.m(3.2), b.m(0.5)), { round: b.m(0.25), tone: tone(b, 0.2, 0.27), fade: [0.03, -0.02] });
  },

  // ------------------------------------------------------------------------------------------------------------------------------ the Glowmire
  'mire:lantern_post': (b) => {
    const l = M.lanternPost(b.rng, b.cx, b.foot, b.m(4.2), b.m(0.8));
    b.add(l, { round: b.m(0.12), tone: tone(b, 0.12, 0.18), moss: 0.3 });
    b.shine(l.lamp, [0.55, 1, 0.85], 1.4, 0.9);
  },
  'mire:giant_mushroom': (b) => {
    const m = M.mushroom(b.rng, b.cx, b.foot, b.m(3.1), b.m(1.7));
    b.add(m, { round: b.m(0.2), tone: tone(b, 0.1, 0.15), moss: 0.2 });
    b.shine(m.cap, MIRE_TEAL, 0.9, 0.6);
  },
  'mire:stilt_pile': (b) => {
    for (const [dx, h] of [[-1, 3.1], [0.1, 2.2], [1.1, 3.5]] as const) b.add(M.postOf(b.rng, b.cx + b.m(dx), b.foot - b.m(h), b.foot, b.m(0.34)), { round: b.m(0.17), tone: tone(b, 0.12, 0.18), moss: 0.35 });
    b.add(barForm(b.cx - b.m(1), b.foot - b.m(1.6), b.cx + b.m(1.1), b.foot - b.m(1.9), b.m(0.2)), { round: b.m(0.09), tone: b.t(0.15) });
  },
  'mire:dead_tree': (b) => {
    const r = b.m(0.3);
    const t = trunk(b.rng, b.cx, b.foot, b.foot - b.m(5), r, r * 0.4);
    b.layer.add(t.draw, { x0: t.x0, x1: t.x1, y0: b.foot - b.m(5.2), y1: b.foot + 3 }, { round: r * 0.7, tone: tone(b, 0.12, 0.18), spread: 0.08, moss: 0.3 });
    b.add(M.drape(b.rng, b.cx + b.m(0.6), b.foot - b.m(4.2), b.m(2.2), b.m(0.9)), { round: b.m(0.05), tone: b.t(0.1), moss: 0.25 });
  },
  'mire:reed_clump': (b) => {
    b.add(M.reeds(b.rng, b.cx, b.foot, 16, b.m(1.6), b.m(0.28)), { round: 2, tone: tone(b, 0.12, 0.2), spread: 0.04 });
  },
  'mire:spore_pods': (b) => {
    for (const [dx, h, r] of [[-0.35, 0.55, 0.2], [0.1, 0.9, 0.26], [0.5, 0.45, 0.17]] as const) {
      b.add(barForm(b.cx + b.m(dx), b.foot, b.cx + b.m(dx), b.foot - b.m(h), b.m(0.05)), { round: 2, tone: b.t(0.12) });
      const bu = M.bulb(b.rng, b.cx + b.m(dx), b.foot - b.m(h), b.m(r), b.m(r * 1.2));
      b.add(bu, { round: b.m(0.12), tone: b.t(0.12) });
      b.shine(bu.core, MIRE_TEAL, 1.1, 0.4);
    }
  },

  // ------------------------------------------------------------------------------------------------------------------------------ the Sunken Roots
  'roots:root_knot': (b) => {
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const path = wander(b.rng, b.cx + side * b.m(0.2 * i), b.foot, -Math.PI / 2 + side * b.rng.range(0.1, 0.9), b.m(b.rng.range(2, 3.4)), b.m(0.12), 0.28);
      const th = b.m(b.rng.range(0.14, 0.24));
      b.layer.tube(path, (t) => th * (1 - t * 0.75), { tone: tone(b, 0.1, 0.16), spread: 0.06, moss: 0.3, grain: 1 });
    }
  },
  'roots:trunk_stub': (b) => {
    const r = b.m(0.62);
    const t = trunk(b.rng, b.cx, b.foot, b.foot - b.m(3.8), r, r * 0.75);
    b.layer.add(t.draw, { x0: t.x0, x1: t.x1, y0: b.foot - b.m(4.2), y1: b.foot + 3 }, { round: r * 0.8, tone: tone(b, 0.1, 0.16), spread: 0.08, moss: 0.4 });
    b.add(M.rockMass(b.rng, b.cx - b.m(0.9), b.foot, b.m(1.2), b.m(0.4)), { round: b.m(0.1), tone: b.t(0.14), moss: 0.4 });
  },

  // ------------------------------------------------------------------------------------------------------------------------------ the Heart of the Ink
  'heart:rib_arch': (b) => {
    const r = M.rib(b.rng, b.cx, b.foot, b.m(1.6), b.m(3.7), b.m(0.4), 0);
    b.add(r, { round: b.m(0.2), tone: tone(b, 0.16, 0.24), fade: [0.04, -0.02] });
  },
  'heart:crystal_spire': (b) => {
    for (const [dx, h, w] of [[0, 4.3, 2.4], [0.9, 2.4, 1.4], [-0.9, 1.9, 1.3]] as const) {
      const c = M.crystalCluster(b.rng, b.cx + b.m(dx), b.foot - b.m(0.1), b.m(h), b.m(w));
      b.add(c, { round: b.m(0.16), tone: tone(b, 0.3, 0.42), spread: 0.05 });
      b.shine(c, VIOLET, 0.9, 0.4);
    }
  },
  'heart:cyst_pod': (b) => {
    const path = wander(b.rng, b.cx, b.foot, -Math.PI / 2 + b.rng.gauss() * 0.05, b.m(2.2), b.m(0.12), 0.12);
    b.layer.tube(path, (t) => b.m(0.12) * (1 - t * 0.4), { tone: b.t(0.12), spread: 0.05, round: 0.9 });
    const end = path[path.length - 1]!;
    const bu = M.bulb(b.rng, end.x, end.y - b.m(0.4), b.m(0.6), b.m(0.78));
    b.add(bu, { round: b.m(0.3), tone: b.t(0.14) });
    b.shine(bu.core, VIOLET, 1.1, 0.7);
  },
  'heart:vein_column': (b) => {
    const path = wander(b.rng, b.cx, b.foot, -Math.PI / 2, b.m(5.2), b.m(0.14), 0.16);
    const th = b.m(0.18);
    b.layer.tube(path, (t) => th * (1 - t * 0.5), { tone: b.t(0.12), spread: 0.05, round: 0.9 });
    b.shine({ draw: (ctx, dx) => { ctx.lineWidth = th * 0.35; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(path[0]!.x + dx, path[0]!.y); for (const p of path) ctx.lineTo(p.x + dx, p.y); ctx.stroke(); }, box: { x0: b.cx - b.m(1.2), x1: b.cx + b.m(1.2), y0: b.foot - b.m(5.6), y1: b.foot } }, VIOLET, 0.7, 0.3);
  },
  'heart:bone_shards': (b) => {
    for (const [dx, h, w] of [[-0.5, 1.1, 0.35], [0.1, 1.7, 0.45], [0.7, 0.9, 0.3]] as const) b.add(M.stalagmite(b.rng, b.cx + b.m(dx), b.foot, b.m(h), b.m(w)), { round: b.m(0.12), tone: tone(b, 0.26, 0.36), spread: 0.06 });
  },

  // ------------------------------------------------------------------------------------------------------------------------------ the ground of the zones (low things)
  'mines:rubble_blue': (b) => {
    for (let i = 0; i < 7; i++) {
      const x = b.cx + b.m((i / 6 - 0.5) * 1.8) + b.rng.range(-4, 4);
      b.add(M.rockMass(b.rng, x, b.foot, b.m(b.rng.range(0.5, 1)), b.m(b.rng.range(0.25, 0.6))), { round: b.m(0.15), tone: tone(b, 0.18, 0.3), spread: 0.08 });
    }
  },
  'foundry:scrap_pile': (b) => {
    b.add(M.rockMass(b.rng, b.cx, b.foot, b.m(2.2), b.m(0.8)), { round: b.m(0.2), tone: tone(b, 0.16, 0.22) });
    b.add(M.gear(b.rng, b.cx - b.m(0.5), b.foot - b.m(0.5), b.m(0.5), 9), { round: b.m(0.1), tone: b.t(0.24) });
    b.add(barForm(b.cx + b.m(0.2), b.foot - b.m(0.2), b.cx + b.m(1.1), b.foot - b.m(1.1), b.m(0.12)), { round: b.m(0.05), tone: b.t(0.22) });
    b.add(M.girder(b.rng, b.cx + b.m(0.8), b.foot, b.foot - b.m(0.9), b.m(0.3)), { round: b.m(0.08), tone: b.t(0.2) });
  },
  'foundry:slag_mound': (b) => {
    b.add(M.rockMass(b.rng, b.cx, b.foot, b.m(2), b.m(0.7)), { round: b.m(0.3), tone: tone(b, 0.1, 0.16) });
    const seam = { draw: (ctx: CanvasRenderingContext2D, dx: number) => { ctx.lineWidth = b.m(0.05); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(b.cx + dx - b.m(0.7), b.foot - b.m(0.1)); ctx.lineTo(b.cx + dx - b.m(0.2), b.foot - b.m(0.45)); ctx.lineTo(b.cx + dx + b.m(0.3), b.foot - b.m(0.25)); ctx.lineTo(b.cx + dx + b.m(0.75), b.foot - b.m(0.5)); ctx.stroke(); }, box: { x0: b.cx - b.m(1), x1: b.cx + b.m(1), y0: b.foot - b.m(0.8), y1: b.foot } };
    b.shine(seam, EMBER, 0.9, 0.3);
  },
  'spire:stone_blocks': (b) => {
    for (let i = 0; i < 4; i++) {
      const w = b.m(b.rng.range(0.7, 1.2));
      const h = b.m(b.rng.range(0.4, 0.8));
      const x = b.cx + b.m((i - 1.5) * 0.75);
      b.add({ draw: (ctx, dx) => { ctx.save(); ctx.translate(x + dx, b.foot - h / 2); ctx.rotate(b.rng.range(-0.1, 0.1)); ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore(); }, box: { x0: x - w, x1: x + w, y0: b.foot - h * 1.4, y1: b.foot + 2 } }, { round: b.m(0.12), tone: tone(b, 0.2, 0.3), spread: 0.08 });
    }
  },
  'spire:rope_coil': (b) => {
    b.add(M.chain(b.rng, b.cx, b.foot - b.m(0.9), b.m(0.9), b.m(0.1)), { round: 2, tone: b.t(0.18) });
    b.add(M.rockMass(b.rng, b.cx + b.m(0.5), b.foot, b.m(1.1), b.m(0.4)), { round: b.m(0.1), tone: b.t(0.22) });
  },
  'heart:crystals_violet': (b) => {
    for (const [dx, h, w] of [[0, 1.3, 0.9], [0.55, 0.8, 0.6]] as const) {
      const c = M.crystalCluster(b.rng, b.cx + b.m(dx), b.foot - b.m(0.05), b.m(h), b.m(w));
      b.add(c, { round: b.m(0.1), tone: tone(b, 0.3, 0.42), spread: 0.05 });
      b.shine(c, VIOLET, 0.9, 0.3);
    }
  },
};

/** The kinds of piece a zone has, in the order its pack lists them. */
export const zonePropKinds = (zone: ZoneId): string[] => Object.keys(RECIPES).filter((k) => k.startsWith(`${zone}:`)).map((k) => k.slice(zone.length + 1));

/** A prop of a zone, standing on its foot: painted at the density of the ground, lit with the one light of the game, in the colours of the zone's backdrop. */
export function zoneProp(o: ZonePropOptions): Surface {
  const recipe = RECIPES[`${o.zone}:${o.kind}`];
  if (!recipe) throw new Error(`no prop "${o.kind}" in the zone "${o.zone}"`);
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const b: B = {
    layer, rng, ppm, w, h, cx: w / 2, foot: h - 2,
    m: (v) => v * ppm,
    t: (v) => v + LIFT,
    add: (f, opt) => layer.add(f.draw, f.box, { spread: 0.1, ...opt }),
    shine: (f, colour, intensity, haloM) => layer.glow(f.draw, f.box, colour, intensity, haloM * ppm),
  };
  recipe(b);
  const { stone, accent } = zoneRamps(o.zone);
  const s = surface(w, h);
  const look: Look = zoneLook(o.zone) ?? DAY;
  const layers = layer.layers(stone, accent);
  // a grain over everything, so that a flat shape is a surface: fine in the iron, coarse in the rock
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (layers.alpha!.d[i]! < 0.5) continue;
      const k = 0.88 + 0.24 * fbm(x * 0.09, y * 0.09, seed + 3, { octaves: 3 }) + 0.06 * (noise2(x * 0.9, y * 0.9, seed + 4) - 0.5);
      layers.albedo[i * 3] = layers.albedo[i * 3]! * k;
      layers.albedo[i * 3 + 1] = layers.albedo[i * 3 + 1]! * k;
      layers.albedo[i * 3 + 2] = layers.albedo[i * 3 + 2]! * k;
    }
  }
  writePixels(s, shade(layers, look, false));
  return s;
}

// ------------------------------------------------------------------------------------------------------------------------------ what hangs in front of the camera

export type Hanging = (b: B) => void;

/** The dark of the foreground: nearly black, lit only on the edge that faces the light. */
const DARK = (b: B): number => b.rng.range(0.04, 0.08);

const HANGING: Readonly<Record<string, Hanging>> = {
  ...EMBER_HANGING,
  'mire:moss_curtain': (b) => {
    for (let i = 0; i < 5; i++) b.add(M.drape(b.rng, b.cx + b.m((i - 2) * 0.9) + b.rng.range(-6, 6), -b.m(0.3), b.m(b.rng.range(1.8, 3.4)), b.m(b.rng.range(0.7, 1.3))), { round: 2, tone: DARK(b), moss: 0.15 });
  },
  'mines:stalactites': (b) => {
    for (const [dx, len, w] of [[-1.3, 2.4, 0.7], [-0.4, 3.4, 0.9], [0.5, 2.1, 0.6], [1.3, 2.9, 0.8]] as const) b.add(M.stalactite(b.rng, b.cx + b.m(dx), -b.m(0.2), b.m(len), b.m(w)), { round: b.m(0.16), tone: DARK(b) });
  },
  'spire:banners': (b) => {
    for (const [dx, len] of [[-1, 2.8], [0.1, 3.3], [1.1, 2.5]] as const) {
      b.add(barForm(b.cx + b.m(dx), -b.m(0.2), b.cx + b.m(dx), b.m(0.15), b.m(0.12)), { round: 2, tone: DARK(b) });
      b.add({ draw: (ctx, d) => { ctx.beginPath(); ctx.moveTo(b.cx + d + b.m(dx - 0.35), b.m(0.1)); ctx.lineTo(b.cx + d + b.m(dx + 0.35), b.m(0.1)); ctx.lineTo(b.cx + d + b.m(dx + 0.32), b.m(len)); ctx.lineTo(b.cx + d + b.m(dx), b.m(len - 0.35)); ctx.lineTo(b.cx + d + b.m(dx - 0.32), b.m(len)); ctx.closePath(); ctx.fill(); }, box: { x0: b.cx + b.m(dx - 0.5), x1: b.cx + b.m(dx + 0.5), y0: 0, y1: b.m(len + 0.1) } }, { round: 2, tone: DARK(b) });
    }
  },
  'foundry:chains': (b) => {
    for (const [dx, len, hook] of [[-1.2, 2.6, true], [-0.1, 3.4, false], [1.1, 2.2, true]] as const) b.add(M.chain(b.rng, b.cx + b.m(dx), -b.m(0.3), b.m(len), b.m(0.17), hook), { round: 3, tone: DARK(b) });
    b.add(barForm(b.cx - b.m(1.8), b.m(0.08), b.cx + b.m(1.8), b.m(0.08), b.m(0.22)), { round: 3, tone: DARK(b) });
  },
  'heart:veins': (b) => {
    for (let i = 0; i < 4; i++) {
      const path = wander(b.rng, b.cx + b.m((i - 1.5) * 0.9), -b.m(0.3), Math.PI / 2 + b.rng.gauss() * 0.2, b.m(b.rng.range(2.2, 3.6)), b.m(0.14), 0.2);
      const th = b.m(b.rng.range(0.1, 0.18));
      b.layer.tube(path, (t) => th * (1 - t * 0.6), { tone: DARK(b), spread: 0.03, round: 0.9 });
    }
  },
  'roots:tendrils': (b) => {
    for (let i = 0; i < 4; i++) {
      const path = wander(b.rng, b.cx + b.m((i - 1.5) * 1), -b.m(0.3), Math.PI / 2 + b.rng.gauss() * 0.25, b.m(b.rng.range(2, 3.6)), b.m(0.14), 0.22);
      const th = b.m(b.rng.range(0.12, 0.22));
      b.layer.tube(path, (t) => th * (1 - t * 0.7), { tone: DARK(b), spread: 0.03, round: 0.9, grain: 1 });
    }
  },
};

export const zoneHangingKinds = (zone: ZoneId): string[] => Object.keys(HANGING).filter((k) => k.startsWith(`${zone}:`)).map((k) => k.slice(zone.length + 1));

/** A silhouette that hangs from the top of the picture, for the layer in front of the action. */
export function zoneHanging(o: ZonePropOptions): Surface {
  const recipe = HANGING[`${o.zone}:${o.kind}`];
  if (!recipe) throw new Error(`no hanging piece "${o.kind}" in the zone "${o.zone}"`);
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const b: B = {
    layer, rng, ppm, w, h, cx: w / 2, foot: 0,
    m: (v) => v * ppm,
    t: (v) => v,
    add: (f, opt) => layer.add(f.draw, f.box, { spread: 0.03, ...opt }),
    shine: () => undefined,
  };
  recipe(b);
  const { stone, accent } = zoneRamps(o.zone);
  const s = surface(w, h);
  writePixels(s, shade(layer.layers(stone, accent), zoneLook(o.zone) ?? DAY, false));
  return s;
}
