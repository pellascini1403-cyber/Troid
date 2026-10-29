import type { Rgb } from './color';
import { orbDisc, orbLight, orbRim, orbTree, type OrbTreeSpec } from './orbs';
import * as M from './motifs';
import type { Rng } from './rng';
import { wrapX } from './shapes';
import { cloud, colossal, glowDot, look, put, smoke, spread, stoneRamp, type Build, type FarTheme, type NearMidTheme, type Skyline } from './themeKit';

/**
 * THE BACKDROPS OF THE SECOND HALF (docs/PROMPT23-LOG.md §3, §7): four zones after the Heart of the Ink, in the language of the reference image — a sky that goes from violet to crimson, thin crooked trees that stand on their own roots and hold great spheres of red light, the
 * farther the paler and the more violet, a pink mist over the ground, small pale motes. What the zones keep from the first half is the way they are made (lit silhouettes in mist, the farther the paler, the walk lighter than what is behind it so that the hero reads) and what they change is
 * the colour: the cold blue and cyan of the ruins are warm here, and the light that comes from things (the spheres, the lava) is red, pink and orange — a colour the hero, who is cyan, never has.
 *
 *   dusk    the Dusk Verge: the reference itself — the gradient of its sky, the trees with their spheres, sparse and open
 *   grove   the Orb Grove: the same, denser, the spheres in clusters and the sky deeper into crimson
 *   crater  the Ember Crater: the spheres are dying and the light comes from below — the sky is orange over the rim, the ground is charred and cracked, there are ash and embers
 *   throne  the Cinder Throne: the last place — black crimson, colossal broken arches, one great dim sphere low in the sky
 */
export type EmberZoneId = 'dusk' | 'grove' | 'crater' | 'throne';
export const EMBER_ZONE_IDS: readonly EmberZoneId[] = ['dusk', 'grove', 'crater', 'throne'];

/** The sphere's light: the red of the reference (`#ed2e5f`), and its lighter rim (`#ff9ab8`). */
const SPHERE: Rgb = [0.93, 0.18, 0.37];
const RIM: Rgb = [1, 0.6, 0.72];
const DYING: Rgb = [0.78, 0.14, 0.14];

// ------------------------------------------------------------------------------------------------------------------------------------------------ the far strips

interface FarTrees {
  count: number;
  /** The colour of the tree and of its sphere at this distance (the farther, the closer to the haze). */
  fill: string;
  orb: [string, string];
  /** Height of a tree relative to the picture, and how many spheres it holds at most. */
  size: readonly [number, number];
  orbs: number;
  /** Where the foot of the trees is, as a fraction of the height. */
  foot: number;
}

/** Faded trees with their spheres, far away: the shape of the near ones, flat and pale. */
function farTrees(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, ppm: number, o: FarTrees): void {
  for (let i = 0; i < o.count; i++) {
    const x = ((i + rng.range(0.25, 0.75)) / o.count) * w;
    const th = h * rng.range(o.size[0], o.size[1]);
    const r = Math.min(th * 0.2, ppm * rng.range(2, 3.4));
    const spec: OrbTreeSpec = { orbs: [{ at: 'fork', r }, ...(o.orbs > 1 && rng.chance(0.6) ? [{ at: 'mid' as const, r: r * 0.6 }] : []), ...(o.orbs > 2 && rng.chance(0.5) ? [{ at: 'base' as const, r: r * 0.85 }] : [])], legs: rng.int(2, 3), thick: ppm * rng.range(0.28, 0.45) };
    const t = orbTree(rng, x, h * o.foot, th, spec);
    ctx.fillStyle = o.fill;
    wrapX(w, (dx) => {
      t.back.draw(ctx, dx);
      for (const orb of t.orbs) {
        const g = ctx.createRadialGradient(orb.x + dx, orb.y, 0, orb.x + dx, orb.y, orb.r);
        g.addColorStop(0, o.orb[0]);
        g.addColorStop(0.85, o.orb[1]);
        g.addColorStop(1, o.fill);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(orb.x + dx, orb.y, orb.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = o.fill;
      t.front.draw(ctx, dx);
    });
  }
}

/** A small tree for the skylines: only the dark of it (a band is one colour). */
const skylineTree = (height: readonly [number, number], thick: number): Skyline['motif'] => (rng, x, base, hgt, ppm) => {
  const t = orbTree(rng, x, base, hgt * rng.range(height[0], height[1]), { orbs: [], legs: rng.int(2, 3), thick: ppm * thick });
  return [t.back];
};

const ridge = (rng: Rng, x: number, base: number, hgt: number, ppm: number): M.Form[] => [M.rockMass(rng, x, base, ppm * rng.range(4, 9), hgt * rng.range(0.25, 0.7))];

const FAR: Readonly<Record<EmberZoneId, FarTheme>> = {
  dusk: {
    sky: [[0, '#2a2146'], [0.3, '#43375d'], [0.5, '#684b70'], [0.68, '#904d67'], [0.84, '#b6455f'], [1, '#c9607a']],
    lights: [{ x: 0.5, y: 0.84, r: 0.8, stops: [[0, 'rgba(255,130,160,0.34)'], [0.4, 'rgba(210,80,120,0.14)'], [1, 'rgba(170,50,110,0)']] }],
    beams: { count: 3, peak: 0.035, rgb: '255,170,200' },
    giants: (ctx, rng, w, h, ppm) => farTrees(ctx, rng, w, h, ppm, { count: 4, fill: 'rgba(92,48,96,0.42)', orb: ['rgba(120,48,96,0.55)', 'rgba(96,40,86,0.5)'], size: [0.5, 0.78], orbs: 2, foot: 0.88 }),
    bands: [
      { base: 0.72, amp: 0.2, colour: 'rgba(124,56,104,0.86)', mist: [0.78, 0.36, 0.52], mistStrength: 0.55, gap: [3, 7], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.5) ? skylineTree([0.5, 0.9], 0.32)(rng, x, b, hgt, ppm, 0) : ridge(rng, x, b, hgt, ppm)) },
      { base: 0.82, amp: 0.16, colour: 'rgba(98,42,84,0.93)', mist: [0.78, 0.36, 0.52], mistStrength: 0.5, gap: [3.4, 8], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.4) ? skylineTree([0.5, 0.8], 0.34)(rng, x, b, hgt, ppm, 0) : ridge(rng, x, b, hgt, ppm)) },
      { base: 0.91, amp: 0.1, colour: 'rgba(64,26,56,1)', mist: [0.78, 0.36, 0.52], mistStrength: 0.4, gap: [3.6, 9], motif: ridge },
    ],
    extra: (ctx, rng, w, h, ppm) => {
      for (let i = 0; i < Math.round(w / (ppm * 6)); i++) glowDot(ctx, w, rng.range(0, w), rng.range(h * 0.45, h * 0.88), ppm * rng.range(0.15, 0.4), '255,170,200', rng.range(0.18, 0.4));
    },
    haze: { colour: [0.78, 0.34, 0.5], strength: 0.58 },
    motes: 'rgba(255,215,230,0.65)',
  },
  grove: {
    sky: [[0, '#1f1838'], [0.28, '#352347'], [0.5, '#5a2a55'], [0.68, '#8a2f5c'], [0.84, '#b53a5a'], [1, '#c24c66']],
    lights: [
      { x: 0.35, y: 0.76, r: 0.7, stops: [[0, 'rgba(255,110,150,0.34)'], [0.35, 'rgba(210,70,110,0.15)'], [1, 'rgba(170,50,110,0)']] },
      { x: 0.82, y: 0.6, r: 0.4, stops: [[0, 'rgba(255,120,170,0.2)'], [1, 'rgba(170,50,110,0)']] },
    ],
    beams: { count: 4, peak: 0.04, rgb: '255,150,190' },
    giants: (ctx, rng, w, h, ppm) => farTrees(ctx, rng, w, h, ppm, { count: 6, fill: 'rgba(82,38,86,0.46)', orb: ['rgba(130,44,92,0.6)', 'rgba(100,36,82,0.5)'], size: [0.55, 0.88], orbs: 3, foot: 0.88 }),
    bands: [
      { base: 0.7, amp: 0.24, colour: 'rgba(112,46,98,0.88)', mist: [0.74, 0.3, 0.5], mistStrength: 0.55, gap: [2.4, 5.5], motif: (rng, x, b, hgt, ppm) => skylineTree([0.55, 1], 0.34)(rng, x, b, hgt, ppm, 0) },
      { base: 0.8, amp: 0.2, colour: 'rgba(84,34,76,0.94)', mist: [0.74, 0.3, 0.5], mistStrength: 0.5, gap: [2.6, 6], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.65) ? skylineTree([0.5, 0.9], 0.36)(rng, x, b, hgt, ppm, 0) : ridge(rng, x, b, hgt, ppm)) },
      { base: 0.9, amp: 0.12, colour: 'rgba(52,20,48,1)', mist: [0.74, 0.3, 0.5], mistStrength: 0.4, gap: [3, 7], motif: ridge },
    ],
    extra: (ctx, rng, w, h, ppm) => {
      for (let i = 0; i < Math.round(w / (ppm * 4)); i++) glowDot(ctx, w, rng.range(0, w), rng.range(h * 0.4, h * 0.86), ppm * rng.range(0.18, 0.5), '255,150,190', rng.range(0.2, 0.45));
    },
    haze: { colour: [0.74, 0.28, 0.46], strength: 0.6 },
    motes: 'rgba(255,205,225,0.65)',
  },
  crater: {
    sky: [[0, '#140c1d'], [0.3, '#2a1226'], [0.5, '#4e1624'], [0.7, '#8a2a1e'], [0.86, '#c4501c'], [1, '#e07a2c']],
    lights: [
      { x: 0.5, y: 0.96, r: 0.9, stops: [[0, 'rgba(255,160,60,0.5)'], [0.35, 'rgba(240,100,40,0.2)'], [1, 'rgba(200,60,30,0)']] },
      { x: 0.1, y: 0.82, r: 0.35, stops: [[0, 'rgba(255,140,60,0.22)'], [1, 'rgba(200,60,30,0)']] },
    ],
    beams: { count: 3, peak: 0.04, rgb: '255,170,90' },
    giants: (ctx, rng, w, h, ppm) => {
      // the ash that hangs over the crater: long dark clouds, and the peaks of its far rim
      for (let i = 0; i < 6; i++) cloud(ctx, rng, w, rng.range(0, w), h * rng.range(0.1, 0.5), ppm * rng.range(10, 22), ppm * rng.range(0.5, 1.1), `rgba(${40 + rng.int(0, 20)},${14 + rng.int(0, 10)},${24 + rng.int(0, 10)},${rng.range(0.28, 0.5)})`);
      colossal(ctx, rng, w, h, 3, 'rgba(48,16,26,0.5)', [ppm * 0.9, ppm * 1.6]);
      for (let i = 0; i < 3; i++) smoke(ctx, rng, w, rng.range(0, w), h * rng.range(0.6, 0.8), h * 0.45, ppm * 2, '70,30,26', 0.2);
    },
    bands: [
      { base: 0.7, amp: 0.3, colour: 'rgba(70,24,30,0.92)', mist: [0.8, 0.36, 0.2], mistStrength: 0.5, gap: [2.6, 6], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.7) ? [M.rockMass(rng, x, b, ppm * rng.range(3, 7), hgt)] : [M.pinnacle(rng, x, b, hgt, ppm * rng.range(0.9, 1.6))]) },
      { base: 0.8, amp: 0.24, colour: 'rgba(44,14,22,0.96)', mist: [0.8, 0.36, 0.2], mistStrength: 0.45, gap: [2.6, 6], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.55) ? [M.rockMass(rng, x, b, ppm * rng.range(3, 6), hgt * 0.85)] : skylineTree([0.5, 0.9], 0.3)(rng, x, b, hgt, ppm, 0)) },
      { base: 0.9, amp: 0.16, colour: 'rgba(20,6,12,1)', mist: [0.8, 0.36, 0.2], mistStrength: 0.4, gap: [3, 7], motif: ridge },
    ],
    extra: (ctx, rng, w, h, ppm) => {
      // the lava that runs in the rim far off: thin hot lines low in the dark, and the glow of the pools they feed
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const x = rng.range(0, w);
        const y = h * rng.range(0.74, 0.93);
        const len = ppm * rng.range(2, 8);
        wrapX(w, (dx) => {
          ctx.strokeStyle = `rgba(255,${130 + rng.int(0, 50)},60,${rng.range(0.3, 0.6)})`;
          ctx.lineWidth = Math.max(1, ppm * 0.06);
          ctx.beginPath();
          ctx.moveTo(x + dx, y);
          ctx.quadraticCurveTo(x + dx + len * 0.5, y - ppm * rng.range(0.1, 0.4), x + dx + len, y + ppm * rng.range(-0.1, 0.2));
          ctx.stroke();
        });
        glowDot(ctx, w, x + len * 0.5, y, ppm * rng.range(0.8, 1.8), '255,140,60', rng.range(0.25, 0.5));
      }
    },
    haze: { colour: [0.82, 0.36, 0.2], strength: 0.55 },
    motes: 'rgba(255,200,130,0.65)',
  },
  throne: {
    sky: [[0, '#0b0612'], [0.3, '#1c0d24'], [0.55, '#3a0f2c'], [0.76, '#6a1230'], [1, '#8f1a38']],
    lights: [{ x: 0.55, y: 0.46, r: 0.62, stops: [[0, 'rgba(230,60,90,0.4)'], [0.3, 'rgba(190,40,80,0.17)'], [1, 'rgba(140,30,80,0)']] }],
    beams: { count: 2, peak: 0.03, rgb: '255,110,140' },
    giants: (ctx, rng, w, h, ppm) => {
      // the great dim sphere low in the sky: the thing the others are small copies of
      for (const dx of [-w, 0, w]) {
        const cx = w * 0.55 + dx;
        const cy = h * 0.42;
        const r = h * 0.3;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(210,56,86,0.62)');
        g.addColorStop(0.7, 'rgba(150,34,76,0.5)');
        g.addColorStop(0.93, 'rgba(110,26,70,0.4)');
        g.addColorStop(1, 'rgba(90,20,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(30,6,24,0.42)';
        ctx.lineWidth = Math.max(1, ppm * 0.07);
        for (let k = 0; k < 6; k++) {
          const a = rng.range(0, Math.PI * 2);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
          ctx.quadraticCurveTo(cx + Math.cos(a + 0.4) * r * 0.6, cy + Math.sin(a + 0.3) * r * 0.6, cx + Math.cos(a + 0.2) * r * rng.range(0.15, 0.45), cy + Math.sin(a + 0.1) * r * rng.range(0.15, 0.45));
          ctx.stroke();
        }
      }
      for (let i = 0; i < 4; i++) cloud(ctx, rng, w, rng.range(0, w), h * rng.range(0.15, 0.6), ppm * rng.range(10, 22), ppm * rng.range(0.4, 0.9), `rgba(${30 + rng.int(0, 16)},${8 + rng.int(0, 8)},${24 + rng.int(0, 8)},${rng.range(0.3, 0.5)})`);
    },
    bands: [
      { base: 0.7, amp: 0.34, colour: 'rgba(60,18,44,0.9)', mist: [0.62, 0.2, 0.34], mistStrength: 0.5, gap: [3, 8], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.5) ? [M.tower(rng, x, b, hgt, ppm * rng.range(1.4, 2.4))] : [M.arcade(rng, x, b, rng.int(2, 3), ppm * rng.range(3.5, 5.5), hgt * 0.7, ppm * 0.7)]) },
      { base: 0.8, amp: 0.28, colour: 'rgba(36,10,30,0.95)', mist: [0.62, 0.2, 0.34], mistStrength: 0.45, gap: [3, 8], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.5) ? [M.tower(rng, x, b, hgt, ppm * rng.range(1.6, 2.8))] : [M.buttress(rng, x, b, x + ppm * rng.range(4, 7), b - hgt * 0.8, ppm * 0.8)]) },
      { base: 0.9, amp: 0.2, colour: 'rgba(14,4,14,1)', mist: [0.62, 0.2, 0.34], mistStrength: 0.4, gap: [3.5, 9], motif: (rng, x, b, hgt, ppm) => [M.tower(rng, x, b, hgt, ppm * rng.range(2, 3.4))] },
    ],
    haze: { colour: [0.6, 0.18, 0.32], strength: 0.55 },
    motes: 'rgba(255,170,190,0.55)',
  },
};

export const EMBER_FAR = FAR;

// ------------------------------------------------------------------------------------------------------------------------------------------------ the middle and near strips

interface Planting {
  /** Metres of strip per tree (the strip is `w`px wide). */
  every: number;
  /** Height of a tree, in metres, and its spheres: how many (at most), how big (metres of radius). */
  height: readonly [number, number];
  orbs: readonly [number, number];
  orbR: readonly [number, number];
  legs: readonly [number, number];
  thick: readonly [number, number];
  tone: readonly [number, number];
  glow: Rgb;
  intensity: number;
  /** How likely a tree is to carry a sphere at its foot and one on its trunk besides the one in its fork. */
  chance: number;
}

/** One tree with its spheres, planted in a layer: the legs and trunk, the spheres between them and the claws, the light of each sphere with its rim. */
function plant(b: Build, x: number, o: Planting): void {
  const r = b.ppm * b.rng.range(o.orbR[0], o.orbR[1]);
  const nOrbs = b.rng.int(o.orbs[0], o.orbs[1] + 1);
  const spec: OrbTreeSpec = {
    orbs: [{ at: 'fork', r }, ...(nOrbs > 1 ? [{ at: 'mid' as const, r: r * b.rng.range(0.5, 0.75) }] : []), ...(nOrbs > 2 && b.rng.chance(o.chance) ? [{ at: 'base' as const, r: r * b.rng.range(0.7, 1) }] : [])],
    legs: b.rng.int(o.legs[0], o.legs[1] + 1),
    thick: b.ppm * b.rng.range(o.thick[0], o.thick[1]),
  };
  const t = orbTree(b.rng, x, b.foot, b.ppm * b.rng.range(o.height[0], o.height[1]), spec);
  const tone = b.rng.range(o.tone[0], o.tone[1]);
  put(b, t.back, { round: spec.thick * 0.5, tone, spread: 0.08, fade: [0.03, -0.01] });
  for (const orb of t.orbs) b.layer.add(orbDisc(orb), { x0: orb.x - orb.r, x1: orb.x + orb.r, y0: orb.y - orb.r, y1: orb.y + orb.r }, { round: orb.r * 0.9, tone: tone + 0.1, spread: 0.04 });
  put(b, t.front, { round: spec.thick * 0.3, tone, spread: 0.06 });
  for (const orb of t.orbs) {
    const box = { x0: orb.x - orb.r, x1: orb.x + orb.r, y0: orb.y - orb.r, y1: orb.y + orb.r };
    b.layer.glow(orbLight(b.rng.fork(`orb${Math.round(orb.x)}`), orb, t.front.draw, orb.r > b.ppm * 1.6 ? 5 : 3), box, o.glow, o.intensity, orb.r * 0.5);
    b.layer.glow(orbRim(orb), box, RIM, o.intensity * 0.4, orb.r * 0.1);
  }
}

/** Thin trunks with no sphere: the bare crooked trees between the ones that carry them. */
function bare(b: Build, x: number, o: { height: readonly [number, number]; thick: readonly [number, number]; tone: readonly [number, number] }): void {
  const th = b.ppm * b.rng.range(o.thick[0], o.thick[1]);
  const t = orbTree(b.rng, x, b.foot, b.ppm * b.rng.range(o.height[0], o.height[1]), { orbs: [], legs: b.rng.int(2, 4), thick: th });
  put(b, t.back, { round: th * 0.5, tone: b.rng.range(o.tone[0], o.tone[1]), spread: 0.08, fade: [0.03, -0.01] });
}

/** Roots and branches that hang from the top: dark, thin, in clumps. */
const hanging = (b: Build, n: number, len: readonly [number, number], tone: number): void => {
  for (const x of spread(b.rng, b.w, n)) put(b, M.drape(b.rng, x, -b.ppm * 0.4, b.ppm * b.rng.range(len[0], len[1]), b.ppm * b.rng.range(1, 2.2)), { round: b.ppm * 0.14, tone, moss: 0 });
};

const DUSK_STONE = stoneRamp([[0.02, 0.01, 0.03], [0.08, 0.04, 0.09], [0.17, 0.09, 0.18], [0.36, 0.2, 0.34], [0.74, 0.44, 0.58]]);
const DUSK_ACCENT = (v: number): Rgb => [0.1 + 0.7 * v, 0.03 + 0.15 * v, 0.1 + 0.3 * v];
const CRATER_STONE = stoneRamp([[0.02, 0.008, 0.012], [0.08, 0.03, 0.04], [0.17, 0.07, 0.08], [0.36, 0.15, 0.13], [0.74, 0.36, 0.26]]);
const CRATER_ACCENT = (v: number): Rgb => [0.15 + 0.85 * v, 0.04 + 0.4 * v, 0.02 + 0.12 * v];
const THRONE_STONE = stoneRamp([[0.012, 0.006, 0.014], [0.05, 0.02, 0.05], [0.12, 0.05, 0.1], [0.26, 0.1, 0.2], [0.6, 0.26, 0.4]]);

const MID: Readonly<Record<EmberZoneId, NearMidTheme>> = {
  dusk: {
    look: look([1, 0.62, 0.72], [0.34, 0.2, 0.32], [1, 0.7, 0.8]),
    stone: DUSK_STONE,
    accent: DUSK_ACCENT,
    fog: [0.46, 0.2, 0.34], fogAmount: 0.42, foot: '#7b2d45', footAmount: 0.6, mist: [0.78, 0.36, 0.52],
    build: (b) => {
      // a few trees with their spheres, far enough to be pale, and between them the bare ones
      const n = Math.round(b.w / (b.ppm * 15));
      for (const x of spread(b.rng, b.w, n, 0.5)) plant(b, x, { every: 15, height: [11, 17], orbs: [1, 2], orbR: [1.3, 2.1], legs: [2, 3], thick: [0.22, 0.34], tone: [0.2, 0.28], glow: SPHERE, intensity: 0.6, chance: 0.5 });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 8)), 0.8)) bare(b, x, { height: [7, 13], thick: [0.18, 0.28], tone: [0.2, 0.3] });
    },
  },
  grove: {
    look: look([1, 0.56, 0.7], [0.3, 0.17, 0.3], [1, 0.66, 0.78]),
    stone: DUSK_STONE,
    accent: DUSK_ACCENT,
    fog: [0.42, 0.17, 0.32], fogAmount: 0.4, foot: '#6e2646', footAmount: 0.62, mist: [0.74, 0.3, 0.5],
    build: (b) => {
      // the grove: trees close together, carrying clusters
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 9)), 0.5)) plant(b, x, { every: 10, height: [12, 19], orbs: [2, 3], orbR: [1.1, 2], legs: [2, 4], thick: [0.22, 0.36], tone: [0.18, 0.26], glow: SPHERE, intensity: 0.62, chance: 0.6 });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 6.5)), 0.8)) bare(b, x, { height: [8, 15], thick: [0.2, 0.3], tone: [0.18, 0.28] });
      hanging(b, Math.round(b.w / (b.ppm * 8)), [3, 8], 0.12);
    },
  },
  crater: {
    look: look([1, 0.5, 0.3], [0.32, 0.14, 0.12], [1, 0.62, 0.34]),
    stone: CRATER_STONE,
    accent: CRATER_ACCENT,
    fog: [0.5, 0.2, 0.12], fogAmount: 0.4, foot: '#7a2a16', footAmount: 0.62, mist: [0.8, 0.36, 0.2],
    build: (b) => {
      // basalt in the back, a few trees that are dying (a dull sphere, or none) and the glow of the lava on the faces that look at it
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 10)), 0.5)) {
        const f = M.rockMass(b.rng, x, b.foot, b.ppm * b.rng.range(3, 7), b.ppm * b.rng.range(7, 16));
        put(b, f, { round: b.ppm * 0.9, tone: b.rng.range(0.14, 0.22), spread: 0.1, fade: [0.04, -0.02] });
      }
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 15)), 0.6)) plant(b, x, { every: 15, height: [9, 14], orbs: [0, 1], orbR: [0.9, 1.4], legs: [2, 3], thick: [0.2, 0.3], tone: [0.12, 0.2], glow: DYING, intensity: 0.45, chance: 0.3 });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 7)), 0.8)) bare(b, x, { height: [6, 12], thick: [0.18, 0.28], tone: [0.1, 0.18] });
    },
  },
  throne: {
    look: look([1, 0.4, 0.55], [0.26, 0.1, 0.2], [1, 0.52, 0.66]),
    stone: THRONE_STONE,
    accent: DUSK_ACCENT,
    fog: [0.34, 0.1, 0.22], fogAmount: 0.4, foot: '#5a1630', footAmount: 0.6, mist: [0.62, 0.2, 0.34],
    build: (b) => {
      // broken arcades and towers, black against the red, and cages of thorn that hold a sphere
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 12)), 0.5)) put(b, M.tower(b.rng, x, b.foot, b.ppm * b.rng.range(10, 20), b.ppm * b.rng.range(1.4, 2.4)), { round: b.ppm * 0.6, tone: b.rng.range(0.1, 0.16), spread: 0.08, fade: [0.04, -0.02] });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 18)), 0.6)) put(b, M.arcade(b.rng, x - b.ppm * 5, b.foot, 3, b.ppm * 4.4, b.ppm * b.rng.range(7, 10), b.ppm * 0.8), { round: b.ppm * 0.5, tone: b.rng.range(0.12, 0.18), spread: 0.08 });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 17)), 0.6)) plant(b, x, { every: 17, height: [8, 12], orbs: [1, 1], orbR: [1.2, 1.8], legs: [3, 4], thick: [0.2, 0.3], tone: [0.12, 0.18], glow: DYING, intensity: 0.6, chance: 0 });
    },
  },
};

const NEAR: Readonly<Record<EmberZoneId, NearMidTheme>> = {
  dusk: {
    ...MID.dusk,
    fog: [0.3, 0.12, 0.24], fogAmount: 0.12, mist: [0.78, 0.36, 0.52],
    build: (b) => {
      // the foreground: the near crooked trunks, dark, with a sphere now and then, and what hangs from the top of the world
      for (const x of spread(b.rng, b.w, Math.max(2, Math.round(b.w / (b.ppm * 26))), 0.5)) plant(b, x, { every: 26, height: [14, 22], orbs: [1, 2], orbR: [1.3, 2.1], legs: [3, 4], thick: [0.34, 0.5], tone: [0.07, 0.11], glow: SPHERE, intensity: 0.45, chance: 0.4 });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 9)), 0.8)) bare(b, x, { height: [9, 16], thick: [0.26, 0.4], tone: [0.06, 0.1] });
      hanging(b, Math.round(b.w / (b.ppm * 7)), [3, 9], 0.06);
    },
  },
  grove: {
    ...MID.grove,
    fog: [0.26, 0.1, 0.22], fogAmount: 0.12,
    build: (b) => {
      for (const x of spread(b.rng, b.w, Math.max(2, Math.round(b.w / (b.ppm * 19))), 0.5)) plant(b, x, { every: 19, height: [15, 24], orbs: [2, 3], orbR: [1.3, 2.1], legs: [3, 4], thick: [0.34, 0.5], tone: [0.07, 0.11], glow: SPHERE, intensity: 0.46, chance: 0.6 });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 8)), 0.8)) bare(b, x, { height: [9, 17], thick: [0.28, 0.42], tone: [0.06, 0.1] });
      hanging(b, Math.round(b.w / (b.ppm * 5.5)), [4, 11], 0.05);
    },
  },
  crater: {
    ...MID.crater,
    fog: [0.3, 0.1, 0.08], fogAmount: 0.12,
    build: (b) => {
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 9)), 0.6)) put(b, M.rockMass(b.rng, x, b.foot, b.ppm * b.rng.range(2.5, 5), b.ppm * b.rng.range(5, 12)), { round: b.ppm * 0.7, tone: b.rng.range(0.06, 0.11), spread: 0.1, fade: [0.03, -0.02] });
      for (const x of spread(b.rng, b.w, Math.max(2, Math.round(b.w / (b.ppm * 22))), 0.5)) plant(b, x, { every: 22, height: [11, 17], orbs: [0, 1], orbR: [1.1, 1.7], legs: [3, 4], thick: [0.3, 0.44], tone: [0.05, 0.09], glow: DYING, intensity: 0.4, chance: 0.3 });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 7)), 0.8)) bare(b, x, { height: [7, 13], thick: [0.24, 0.36], tone: [0.05, 0.09] });
    },
  },
  throne: {
    ...MID.throne,
    fog: [0.24, 0.07, 0.16], fogAmount: 0.12,
    build: (b) => {
      for (const x of spread(b.rng, b.w, Math.max(2, Math.round(b.w / (b.ppm * 11))), 0.5)) put(b, M.tower(b.rng, x, b.foot, b.ppm * b.rng.range(14, 24), b.ppm * b.rng.range(1.8, 3)), { round: b.ppm * 0.7, tone: b.rng.range(0.05, 0.09), spread: 0.08, fade: [0.03, -0.02] });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 9)), 0.8)) bare(b, x, { height: [8, 15], thick: [0.26, 0.38], tone: [0.05, 0.09] });
      hanging(b, Math.round(b.w / (b.ppm * 6)), [4, 10], 0.05);
    },
  },
};

export const EMBER_MID = MID;
export const EMBER_NEAR = NEAR;
