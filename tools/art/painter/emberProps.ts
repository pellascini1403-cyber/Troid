import type { Rgb } from './color';
import { column } from './forms';
import * as M from './motifs';
import { orbDisc, orbLight, orbRim, orbTree, type Orb, type OrbTreeSpec } from './orbs';
import type { B, Hanging, Recipe } from './zoneProps';
import { wander, type Pt } from './shapes';

/**
 * THE PIECES OF THE FOUR ZONES OF THE SECOND HALF (docs/PROMPT23-LOG.md §7): what stands behind the walk, lies on the ground and hangs in front of the camera in the Dusk Verge, the Orb Grove, the Ember Crater and the Cinder Throne — a tree that carries a sphere, an arch of roots,
 * a column of the ruins that were here, a spire of basalt, a cage of thorn around a dim sphere, a fall of chains. Each is made of the motifs of `motifs.ts` and `orbs.ts`, lit with the light of its zone and coloured with the ramp of its backdrop (`zoneRamps`, `zoneLook`).
 */
const SPHERE: Rgb = [0.93, 0.18, 0.37];
const RIM: Rgb = [1, 0.6, 0.72];
const DYING: Rgb = [0.78, 0.14, 0.14];
const FIRE: Rgb = [1, 0.5, 0.16];

const tone = (b: B, lo: number, hi: number): number => b.t(b.rng.range(lo, hi));

/** A sphere standing in a piece: its body (shaded as a ball), its light with veins cut out of it and its rim. */
function sphere(b: B, o: Orb, glow: Rgb, k: number, toneV: number, claws?: ((ctx: CanvasRenderingContext2D, dx: number) => void) | null): void {
  const box = { x0: o.x - o.r, x1: o.x + o.r, y0: o.y - o.r, y1: o.y + o.r };
  b.add({ draw: orbDisc(o), box }, { round: o.r * 0.9, tone: toneV, spread: 0.04 });
  b.shine({ draw: orbLight(b.rng.fork(`orb${Math.round(o.x)}${Math.round(o.y)}`), o, claws ?? null, o.r > b.m(0.8) ? 4 : 2), box }, glow, k, (o.r / b.ppm) * 0.5);
  b.shine({ draw: orbRim(o), box }, RIM, k * 0.4, (o.r / b.ppm) * 0.1);
}

/** A whole tree of the reference: legs, trunk, branches, its spheres and the claws that hold them. */
function tree(b: B, heightM: number, spec: OrbTreeSpec, glow: Rgb, k: number, tones: readonly [number, number]): void {
  const t = orbTree(b.rng, b.cx, b.foot, b.m(heightM), spec);
  const tv = tone(b, tones[0], tones[1]);
  b.add(t.back, { round: spec.thick * 0.5, tone: tv, spread: 0.08, fade: [0.03, -0.01] });
  for (const o of t.orbs) sphere(b, o, glow, k, tv + 0.1, t.front.draw);
  b.add(t.front, { round: spec.thick * 0.3, tone: tv, spread: 0.06 });
}

/** An arch of two roots that rise from the ground, lean toward each other and meet: a tube along a curve. */
function archOf(b: B, spanM: number, riseM: number, thickM: number, tv: number): void {
  const a: Pt = { x: b.cx - b.m(spanM / 2), y: b.foot };
  const c: Pt = { x: b.cx + b.rng.gauss() * b.m(0.3), y: b.foot - b.m(riseM * 2) };
  const e: Pt = { x: b.cx + b.m(spanM / 2), y: b.foot };
  const path: Pt[] = Array.from({ length: 16 }, (_, i) => {
    const s = i / 15;
    return { x: (1 - s) * (1 - s) * a.x + 2 * (1 - s) * s * c.x + s * s * e.x + b.rng.gauss() * b.m(0.03) * (i % 15 === 0 ? 0 : 1), y: (1 - s) * (1 - s) * a.y + 2 * (1 - s) * s * c.y + s * s * e.y + b.rng.gauss() * b.m(0.03) * (i % 15 === 0 ? 0 : 1) };
  });
  const th = b.m(thickM);
  b.layer.tube(path, (s) => th * (0.8 + 0.5 * Math.abs(s - 0.5) * 2) * (1 - 0.25 * Math.sin(s * Math.PI)), { tone: tv, spread: 0.07, round: 0.9, grain: 1 });
}

const strands = (b: B, n: number, lenM: readonly [number, number], thickM: readonly [number, number], tv: () => number, up = true, spreadM = 1.6): void => {
  for (let i = 0; i < n; i++) {
    const x = b.cx + b.m((i / Math.max(1, n - 1) - 0.5) * spreadM);
    const path = wander(b.rng, x, b.foot, up ? -Math.PI / 2 + b.rng.gauss() * 0.5 : -Math.PI / 2 + (i % 2 === 0 ? -0.9 : 0.9), b.m(b.rng.range(lenM[0], lenM[1])), b.m(0.12), 0.26);
    const th = b.m(b.rng.range(thickM[0], thickM[1]));
    b.layer.tube(path, (t) => th * (1 - t * 0.75), { tone: tv(), spread: 0.05, round: 0.9, grain: 1 });
  }
};

const rubble = (b: B, n: number, wM: readonly [number, number], hM: readonly [number, number], spreadM: number, lo: number, hi: number): void => {
  for (let i = 0; i < n; i++) {
    const x = b.cx + b.m((i / Math.max(1, n - 1) - 0.5) * spreadM) + b.rng.range(-4, 4);
    b.add(M.rockMass(b.rng, x, b.foot, b.m(b.rng.range(wM[0], wM[1])), b.m(b.rng.range(hM[0], hM[1]))), { round: b.m(0.15), tone: tone(b, lo, hi), spread: 0.08 });
  }
};

const seam = (b: B, x0M: number, y0M: number, x1M: number, y1M: number, widthM: number) => ({
  draw: (ctx: CanvasRenderingContext2D, dx: number) => {
    ctx.lineWidth = b.m(widthM);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(b.cx + dx + b.m(x0M), b.foot - b.m(y0M));
    ctx.quadraticCurveTo(b.cx + dx + b.m((x0M + x1M) / 2), b.foot - b.m((y0M + y1M) / 2 + 0.12), b.cx + dx + b.m(x1M), b.foot - b.m(y1M));
    ctx.stroke();
  },
  box: { x0: b.cx + b.m(Math.min(x0M, x1M) - 0.3), x1: b.cx + b.m(Math.max(x0M, x1M) + 0.3), y0: b.foot - b.m(Math.max(y0M, y1M) + 0.4), y1: b.foot - b.m(Math.min(y0M, y1M) - 0.2) },
});

export const EMBER_RECIPES: Readonly<Record<string, Recipe>> = {
  // ------------------------------------------------------------------------------------------------------------------------------ the Dusk Verge
  'dusk:orb_sapling': (b) => tree(b, 3.6, { orbs: [{ at: 'fork', r: b.m(0.75) }], legs: 3, thick: b.m(0.13) }, SPHERE, 0.8, [0.16, 0.22]),
  'dusk:root_arch': (b) => archOf(b, 3.4, 2.3, 0.2, tone(b, 0.12, 0.18)),
  'dusk:ruin_column': (b) => {
    const c = column(b.rng, b.cx, b.foot, b.foot - b.m(b.rng.range(2.8, 3.8)), b.m(0.5), 'broken');
    b.layer.add(c.draw, c.box, { round: b.m(0.45), tone: tone(b, 0.2, 0.28), spread: 0.1, moss: 0.2 });
    strands(b, 3, [0.7, 1.4], [0.05, 0.09], () => tone(b, 0.08, 0.12), true, 1.4);
  },
  'dusk:bone_roots': (b) => strands(b, 6, [0.5, 1.1], [0.07, 0.12], () => tone(b, 0.1, 0.16), false, 2.2),
  'dusk:stone_heap': (b) => rubble(b, 4, [0.6, 1.2], [0.25, 0.6], 2.2, 0.16, 0.26),
  'dusk:thorn_bush': (b) => strands(b, 9, [0.5, 1.2], [0.03, 0.06], () => tone(b, 0.06, 0.1), true, 1.6),

  // ------------------------------------------------------------------------------------------------------------------------------ the Orb Grove
  'grove:orb_tree_tall': (b) => tree(b, 6, { orbs: [{ at: 'fork', r: b.m(1.2) }, { at: 'mid', r: b.m(0.6) }], legs: 3, thick: b.m(0.17) }, SPHERE, 0.85, [0.14, 0.2]),
  'grove:trunk_arch': (b) => archOf(b, 4.4, 3.1, 0.27, tone(b, 0.1, 0.16)),
  'grove:orb_cluster': (b) => {
    for (const [dx, r, up] of [[-0.9, 0.55, 1.5], [0, 0.85, 2.1], [0.95, 0.5, 1.2]] as const) {
      const x = b.cx + b.m(dx);
      // a stem that leans a little and never leaves the picture: the sphere at its end is whole
      const path = wander(b.rng, x, b.foot, -Math.PI / 2 + b.rng.gauss() * 0.08, b.m(up), b.m(0.1), 0.08);
      const th = b.m(0.08);
      b.layer.tube(path, (t) => th * (1 - t * 0.5), { tone: tone(b, 0.1, 0.16), spread: 0.05, round: 0.9 });
      const end = path[path.length - 1]!;
      const ex = Math.min(Math.max(end.x, b.m(r) + 3), b.w - b.m(r) - 3);
      sphere(b, { x: ex, y: end.y - b.m(r * 0.8), r: b.m(r) }, SPHERE, 0.85, 0.22);
    }
    strands(b, 5, [0.4, 0.9], [0.06, 0.1], () => tone(b, 0.1, 0.16), false, 2.4);
  },
  'grove:sphere_pods': (b) => {
    for (const [dx, r] of [[-0.55, 0.32], [0.1, 0.45], [0.7, 0.28]] as const) sphere(b, { x: b.cx + b.m(dx), y: b.foot - b.m(r * 0.9), r: b.m(r) }, SPHERE, 0.8, 0.22);
    strands(b, 6, [0.4, 0.8], [0.04, 0.07], () => tone(b, 0.08, 0.14), false, 1.8);
  },
  'grove:root_crawl': (b) => strands(b, 7, [0.6, 1.4], [0.08, 0.14], () => tone(b, 0.1, 0.16), false, 3),

  // ------------------------------------------------------------------------------------------------------------------------------ the Ember Crater
  'crater:basalt_spire': (b) => {
    b.add(M.rockMass(b.rng, b.cx, b.foot, b.m(2.8), b.m(0.8)), { round: b.m(0.3), tone: tone(b, 0.12, 0.18) });
    const p = M.pinnacle(b.rng, b.cx, b.foot - b.m(0.3), b.m(4.6), b.m(1.5));
    b.add(p, { round: b.m(0.5), tone: tone(b, 0.14, 0.2), spread: 0.08 });
    b.shine(seam(b, -0.2, 0.4, 0.15, 2.4, 0.05), FIRE, 0.8, 0.25);
  },
  'crater:dead_tree': (b) => tree(b, 5.6, { orbs: [], legs: 3, thick: b.m(0.15) }, DYING, 0.5, [0.08, 0.13]),
  'crater:fumarole': (b) => {
    b.add(M.rockMass(b.rng, b.cx, b.foot, b.m(2.6), b.m(1.3)), { round: b.m(0.4), tone: tone(b, 0.1, 0.16) });
    b.add(M.rockMass(b.rng, b.cx, b.foot - b.m(1), b.m(1.1), b.m(0.6)), { round: b.m(0.2), tone: tone(b, 0.12, 0.18) });
    b.shine({ draw: (ctx, dx) => { ctx.beginPath(); ctx.ellipse(b.cx + dx, b.foot - b.m(1.55), b.m(0.4), b.m(0.12), 0, 0, Math.PI * 2); ctx.fill(); }, box: { x0: b.cx - b.m(0.6), x1: b.cx + b.m(0.6), y0: b.foot - b.m(1.8), y1: b.foot - b.m(1.3) } }, FIRE, 1.2, 0.5);
  },
  'crater:lava_rock': (b) => {
    b.add(M.rockMass(b.rng, b.cx, b.foot, b.m(3), b.m(1.5)), { round: b.m(0.5), tone: tone(b, 0.1, 0.16) });
    for (const [x0, y0, x1, y1] of [[-0.9, 0.2, -0.2, 1.1], [0.1, 0.15, 0.7, 0.9], [-0.3, 0.9, 0.5, 1.2]] as const) b.shine(seam(b, x0, y0, x1, y1, 0.045), FIRE, 0.8, 0.2);
  },
  'crater:ash_heap': (b) => rubble(b, 5, [0.7, 1.5], [0.2, 0.5], 2.6, 0.12, 0.2),
  'crater:obsidian_shards': (b) => {
    for (const [dx, h, w] of [[-0.5, 1.1, 0.3], [0.05, 1.7, 0.4], [0.65, 0.9, 0.28]] as const) {
      const s = M.stalagmite(b.rng, b.cx + b.m(dx), b.foot, b.m(h), b.m(w));
      b.add(s, { round: b.m(0.1), tone: tone(b, 0.06, 0.12), spread: 0.05 });
      b.shine({ draw: (ctx, d) => { ctx.beginPath(); ctx.arc(b.cx + d + b.m(dx), b.foot - b.m(h * 0.96), b.m(0.05), 0, Math.PI * 2); ctx.fill(); }, box: { x0: b.cx + b.m(dx) - 8, x1: b.cx + b.m(dx) + 8, y0: b.foot - b.m(h) - 8, y1: b.foot - b.m(h) + 8 } }, FIRE, 1, 0.12);
    }
  },
  'crater:ember_stones': (b) => {
    rubble(b, 4, [0.5, 1], [0.25, 0.5], 1.8, 0.1, 0.18);
    b.shine(seam(b, -0.5, 0.15, 0.4, 0.2, 0.035), FIRE, 0.7, 0.18);
  },

  // ------------------------------------------------------------------------------------------------------------------------------ the Cinder Throne
  'throne:broken_arch': (b) => {
    const a = M.arcade(b.rng, b.cx - b.m(2.4), b.foot, 1, b.m(4.4), b.m(4.4), b.m(0.8));
    b.add(a, { round: b.m(0.35), tone: tone(b, 0.1, 0.16), spread: 0.08 });
    b.add(M.rockMass(b.rng, b.cx + b.m(2.2), b.foot, b.m(1.4), b.m(0.5)), { round: b.m(0.15), tone: tone(b, 0.12, 0.18) });
  },
  'throne:caged_orb': (b) => {
    const r = b.m(0.8);
    b.add(M.postOf(b.rng, b.cx, b.foot, b.foot - b.m(2.2), b.m(0.14)), { round: b.m(0.07), tone: tone(b, 0.1, 0.14) });
    sphere(b, { x: b.cx, y: b.foot - b.m(3), r }, DYING, 0.7, 0.2);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI + (i / 8) * Math.PI;
      const from: Pt = { x: b.cx + Math.cos(a) * r * 0.95, y: b.foot - b.m(3) + Math.sin(a) * r * 0.95 };
      const path = wander(b.rng, from.x, from.y, a - Math.PI / 2 * Math.sign(Math.cos(a) || 1) * 0.3, b.m(0.9), b.m(0.1), 0.2);
      const th = b.m(0.075);
      b.layer.tube(path, (t) => th * (1 - t * 0.8), { tone: tone(b, 0.06, 0.1), spread: 0.04, round: 0.9 });
    }
  },
  'throne:tower_stub': (b) => b.add(M.tower(b.rng, b.cx, b.foot, b.m(5.6), b.m(1.5)), { round: b.m(0.5), tone: tone(b, 0.1, 0.16), spread: 0.08 }),
  'throne:thorn_pillar': (b) => {
    b.add(M.pinnacle(b.rng, b.cx, b.foot, b.m(5.4), b.m(1.2)), { round: b.m(0.4), tone: tone(b, 0.08, 0.14), spread: 0.08 });
    strands(b, 7, [0.6, 1.4], [0.03, 0.06], () => tone(b, 0.05, 0.09), true, 1.2);
  },
  'throne:rubble_dark': (b) => rubble(b, 5, [0.6, 1.3], [0.2, 0.55], 2.6, 0.1, 0.18),
  'throne:chain_heap': (b) => {
    b.add(M.rockMass(b.rng, b.cx, b.foot, b.m(1.8), b.m(0.5)), { round: b.m(0.12), tone: tone(b, 0.12, 0.18) });
    b.add(M.chain(b.rng, b.cx - b.m(0.3), b.foot - b.m(0.35), b.m(0.9), b.m(0.1), false), { round: 2, tone: b.t(0.18) });
    b.add(M.chain(b.rng, b.cx + b.m(0.5), b.foot - b.m(0.3), b.m(0.7), b.m(0.1), true), { round: 2, tone: b.t(0.16) });
  },
  'throne:bone_pile': (b) => {
    for (const [dx, h, w] of [[-0.4, 0.8, 0.25], [0.1, 1.2, 0.3], [0.55, 0.6, 0.22]] as const) b.add(M.stalagmite(b.rng, b.cx + b.m(dx), b.foot, b.m(h), b.m(w)), { round: b.m(0.1), tone: tone(b, 0.2, 0.3), spread: 0.06 });
  },
};

const DARK = (b: B): number => b.rng.range(0.04, 0.08);

export const EMBER_HANGING: Readonly<Record<string, Hanging>> = {
  'dusk:root_curtain': (b) => {
    for (let i = 0; i < 5; i++) b.add(M.drape(b.rng, b.cx + b.m((i - 2) * 0.9) + b.rng.range(-6, 6), -b.m(0.3), b.m(b.rng.range(1.8, 3.6)), b.m(b.rng.range(0.6, 1.2))), { round: 2, tone: DARK(b) });
  },
  'dusk:orb_vines': (b) => {
    for (let i = 0; i < 3; i++) {
      const path = wander(b.rng, b.cx + b.m((i - 1) * 1.1), -b.m(0.3), Math.PI / 2 + b.rng.gauss() * 0.15, b.m(b.rng.range(2, 3.2)), b.m(0.12), 0.14);
      const th = b.m(0.05);
      b.layer.tube(path, (t) => th * (1 - t * 0.4), { tone: DARK(b), spread: 0.03, round: 0.9 });
      const end = path[path.length - 1]!;
      const r = b.m(b.rng.range(0.16, 0.26));
      const o = { x: end.x, y: end.y + r * 0.7, r };
      b.layer.add(orbDisc(o), { x0: o.x - r, x1: o.x + r, y0: o.y - r, y1: o.y + r }, { round: r * 0.9, tone: 0.18, spread: 0.03 });
      b.layer.glow(orbLight(b.rng.fork(`v${i}`), o, null, 2), { x0: o.x - r, x1: o.x + r, y0: o.y - r, y1: o.y + r }, SPHERE, 0.75, r * 0.5);
    }
  },
  'grove:root_curtain': (b) => {
    for (let i = 0; i < 6; i++) b.add(M.drape(b.rng, b.cx + b.m((i - 2.5) * 0.8) + b.rng.range(-6, 6), -b.m(0.3), b.m(b.rng.range(2, 4)), b.m(b.rng.range(0.6, 1.2))), { round: 2, tone: DARK(b) });
  },
  'grove:orb_drops': (b) => {
    for (let i = 0; i < 4; i++) {
      const path = wander(b.rng, b.cx + b.m((i - 1.5) * 0.9), -b.m(0.3), Math.PI / 2 + b.rng.gauss() * 0.15, b.m(b.rng.range(1.6, 3)), b.m(0.12), 0.14);
      const th = b.m(0.045);
      b.layer.tube(path, (t) => th * (1 - t * 0.4), { tone: DARK(b), spread: 0.03, round: 0.9 });
      const end = path[path.length - 1]!;
      const r = b.m(b.rng.range(0.12, 0.22));
      const o = { x: end.x, y: end.y + r * 0.7, r };
      b.layer.add(orbDisc(o), { x0: o.x - r, x1: o.x + r, y0: o.y - r, y1: o.y + r }, { round: r * 0.9, tone: 0.18, spread: 0.03 });
      b.layer.glow(orbLight(b.rng.fork(`d${i}`), o, null, 2), { x0: o.x - r, x1: o.x + r, y0: o.y - r, y1: o.y + r }, SPHERE, 0.75, r * 0.5);
    }
  },
  'crater:char_roots': (b) => {
    for (let i = 0; i < 4; i++) {
      const path = wander(b.rng, b.cx + b.m((i - 1.5) * 1), -b.m(0.3), Math.PI / 2 + b.rng.gauss() * 0.3, b.m(b.rng.range(1.8, 3.4)), b.m(0.14), 0.25);
      const th = b.m(b.rng.range(0.08, 0.16));
      b.layer.tube(path, (t) => th * (1 - t * 0.7), { tone: DARK(b), spread: 0.03, round: 0.9, grain: 1 });
    }
  },
  'crater:basalt_teeth': (b) => {
    for (const [dx, len, w] of [[-1.3, 2.2, 0.7], [-0.4, 3.2, 0.9], [0.5, 1.9, 0.6], [1.3, 2.7, 0.8]] as const) b.add(M.stalactite(b.rng, b.cx + b.m(dx), -b.m(0.2), b.m(len), b.m(w)), { round: b.m(0.16), tone: DARK(b) });
  },
  'throne:chains': (b) => {
    for (const [dx, len, hook] of [[-1.2, 2.6, true], [-0.1, 3.4, false], [1.1, 2.2, true]] as const) b.add(M.chain(b.rng, b.cx + b.m(dx), -b.m(0.3), b.m(len), b.m(0.17), hook), { round: 3, tone: DARK(b) });
  },
  'throne:thorn_drapes': (b) => {
    for (let i = 0; i < 5; i++) {
      const path = wander(b.rng, b.cx + b.m((i - 2) * 0.8), -b.m(0.3), Math.PI / 2 + b.rng.gauss() * 0.3, b.m(b.rng.range(1.8, 3.6)), b.m(0.12), 0.3);
      const th = b.m(b.rng.range(0.05, 0.09));
      b.layer.tube(path, (t) => th * (1 - t * 0.8), { tone: DARK(b), spread: 0.03, round: 0.9 });
    }
  },
};
