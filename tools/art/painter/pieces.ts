import { surface, writePixels, type Surface } from './canvas';
import { farStrip, midStrip, nearStrip } from './backdrop';
import { hex } from './color';
import { cap, earth } from './ground';
import { DAY, shade, type Layers } from './light';
import { MOSS, STONE, stone } from './masonry';
import { door, edge, lit, platform } from './props';
import { columnProp, crystals, effigy, ferns, foreLeaves, grass, hangingRoots, mushrooms, rubble, ruinedArch, runeStone } from './flora';
import { beam, glow, mistBank, motes, shaft, veil } from './lights';
import { rootArch, rootCrawl, rootCurtain, rootPillar, shrine, thorns, vial } from './roots';

/**
 * The painter's catalogue: each piece is a function from parameters to a painted surface, deterministic (a seed in, the same pixels out). The build (`tools/art/build.ts`)
 * names the pieces a pack is made of, with their parameters, and cuts each one into the frames a sprite set needs.
 */
export type PieceMaker = (params: Record<string, unknown>) => Promise<Surface>;

const num = (p: Record<string, unknown>, k: string, d: number): number => (typeof p[k] === 'number' ? (p[k] as number) : d);
const str = <T extends string>(p: Record<string, unknown>, k: string, allowed: readonly T[], d: T): T => (typeof p[k] === 'string' && (allowed as readonly string[]).includes(p[k] as string) ? (p[k] as T) : d);

/** Stone as a periodic super-tile of `cols` × `rows` cells of 2 m. */
const stoneGrid: PieceMaker = async (p) => {
  const ppm = num(p, 'ppm', 96);
  const w = Math.round(2 * ppm * num(p, 'cols', 4));
  const h = Math.round(2 * ppm * num(p, 'rows', 2));
  const cyclopean = p['style'] === 'cyclopean';
  const layers = stone({
    w, h, ppm, seed: num(p, 'seed', 1),
    style: cyclopean ? 'cyclopean' : 'courses',
    courseM: cyclopean ? [0.95, 0.95] : [0.5, 1.0], blockM: [0.6, 1.9], jointM: 0.06,
    moss: num(p, 'moss', 0.7), cracks: 0.6, stains: 0.8, energy: num(p, 'energy', 0.6),
    stone: STONE, mossRamp: MOSS, tone: 0.34, toneSpread: 0.09,
  });
  return lit(layers, true);
};

/** Soil as a periodic super-tile. */
const earthGrid: PieceMaker = async (p) => {
  const ppm = num(p, 'ppm', 96);
  return lit(earth({ w: Math.round(2 * ppm * num(p, 'cols', 4)), h: Math.round(2 * ppm * num(p, 'rows', 2)), ppm, seed: num(p, 'seed', 3) }), true);
};

/** The top edge of the ground: turf or a dressed slab, 8 m before it repeats. */
const capStrip: PieceMaker = async (p) => {
  const ppm = num(p, 'ppm', 96);
  const style = str(p, 'style', ['turf', 'stone'] as const, 'turf');
  const rise = Math.round(ppm * (style === 'turf' ? 0.34 : 0.12));
  return lit(cap({ w: Math.round(2 * ppm * num(p, 'cols', 4)), h: Math.round(ppm * (style === 'turf' ? 1.1 : 0.8)), ppm, seed: num(p, 'seed', 5), rise, style }), true);
};

/** The side of a block: `rows` cells of 2 m down, 0.4 m wide, `reach` of it outside the edge. */
const edgeStrip: PieceMaker = async (p) => {
  const ppm = num(p, 'ppm', 96);
  const style = str(p, 'style', ['stone', 'earth'] as const, 'stone');
  return lit(edge({ w: Math.round(ppm * 0.42), h: Math.round(2 * ppm * num(p, 'rows', 2)), ppm, seed: num(p, 'seed', 9), reach: Math.round(ppm * 0.12), style }), true);
};

/** A timber platform: the body repeats along x (8 m before it does), the end is one piece. */
const platformPiece: PieceMaker = async (p) => {
  const ppm = num(p, 'ppm', 96);
  const kind = str(p, 'kind', ['body', 'end'] as const, 'body');
  const rise = Math.round(ppm * 0.1);
  const body = Math.round(ppm * 0.3);
  const w = kind === 'body' ? Math.round(2 * ppm * num(p, 'cols', 4)) : Math.round(ppm * 0.4);
  return lit(platform({ w, h: rise + body + Math.round(ppm * 0.26), ppm, seed: num(p, 'seed', 11), rise, body, kind }), kind === 'body');
};

/** The door of a gate, by part. */
const doorPiece: PieceMaker = async (p) => {
  const ppm = num(p, 'ppm', 96);
  const part = str(p, 'part', ['body', 'top', 'bottom'] as const, 'body');
  const seal = p['seal'] === 'ink' ? hex('#9a6bff') : hex('#8f5cff');
  const w = Math.round(1.5 * ppm);
  const h = Math.round(ppm * (part === 'body' ? 3 : part === 'top' ? 1.0 : 0.55));
  const base = stone({
    w, h, ppm, seed: num(p, 'seed', 13) + (part === 'body' ? 0 : part === 'top' ? 5 : 9), style: 'courses',
    courseM: [0.7, 1.4], blockM: [1.5, 1.5], jointM: 0.07, moss: 0.35, cracks: 0.3, stains: 0.9, energy: 0,
    stone: STONE, mossRamp: MOSS, tone: 0.3, toneSpread: 0.07,
  });
  return lit(door({ w, h, ppm, seed: num(p, 'seed', 13), part, glow: [seal[0] * 0.9, seal[1] * 0.9, seal[2] * 0.9] }, base), part === 'body');
};

const strip = (make: typeof farStrip, defaults: { w: number; h: number; ppm: number }): PieceMaker => async (p) => make({ w: num(p, 'w', defaults.w), h: num(p, 'h', defaults.h), ppm: num(p, 'ppm', defaults.ppm), seed: num(p, 'seed', 21) });

/** A prop: its size in metres and a seed; the painter makes the picture at the pack's density. */
const prop = (make: (o: { w: number; h: number; ppm: number; seed: number }) => Surface, wM: number, hM: number): PieceMaker => async (p) => {
  const ppm = num(p, 'ppm', 96);
  return make({ w: Math.round(num(p, 'wM', wM) * ppm), h: Math.round(num(p, 'hM', hM) * ppm), ppm, seed: num(p, 'seed', 31) });
};
const light = (make: (o: { w: number; h: number; seed: number; tint?: readonly [number, number, number] }) => Surface, w: number, h: number): PieceMaker => async (p) => {
  const t = p['tint'];
  const tint = Array.isArray(t) && t.length === 3 ? (t as [number, number, number]) : undefined;
  return make({ w: num(p, 'w', w), h: num(p, 'h', h), seed: num(p, 'seed', 41), ...(tint ? { tint } : {}) });
};

export const PIECES: Record<string, PieceMaker> = {
  ferns: prop(ferns, 1.6, 1.3),
  grass: prop(grass, 1.0, 0.55),
  rubble: prop(rubble, 2.0, 0.9),
  crystals: prop(crystals, 1.1, 1.3),
  mushrooms: prop(mushrooms, 1.0, 0.6),
  runeStone: prop(runeStone, 1.3, 3.2),
  hangingRoots: prop(hangingRoots, 1.6, 2.2),
  effigy: prop(effigy, 1.6, 3.6),
  ruinedArch: prop(ruinedArch, 12, 9),
  foreLeaves: prop(foreLeaves, 5, 3.4),
  rootArch: prop(rootArch, 14, 10),
  rootCurtain: prop(rootCurtain, 4, 9),
  rootCurtainFore: prop((o) => rootCurtain({ ...o, dark: true }), 5, 4),
  rootPillar: prop(rootPillar, 2.4, 6.6),
  rootCrawl: prop(rootCrawl, 3.4, 1.1),
  /** The thorns of the ditch: `cols` cells of half a metre, a periodic strip. */
  thorns: async (p) => {
    const ppm = num(p, 'ppm', 96);
    const cols = num(p, 'cols', 4);
    return thorns({ w: Math.round(ppm * 0.5 * cols), h: Math.round(ppm * 0.75), ppm, seed: num(p, 'seed', 31), cols });
  },
  /** The shrine: two cells of 3.3 × 3.7 m (resting, lit). */
  shrine: async (p) => {
    const ppm = num(p, 'ppm', 96);
    return shrine({ w: Math.round(ppm * 3.3) * 2, h: Math.round(ppm * 3.7), ppm, seed: num(p, 'seed', 31) });
  },
  vial: prop(vial, 0.7, 1.2),
  columnWhole: prop((o) => columnProp({ ...o, state: 'whole', heightM: 4.6 }), 1.6, 5.2),
  columnBroken: prop((o) => columnProp({ ...o, state: 'broken', heightM: 3.1 }), 1.6, 3.7),
  lightShaft: light(shaft, 192, 640),
  lightBeam: light(beam, 256, 512),
  lightGlow: light(glow, 256, 256),
  lightMist: light(mistBank, 1024, 192),
  lightMotes: light(motes, 512, 384),
  groundVeil: light(veil, 16, 256),
  stoneGrid,
  earthGrid,
  capStrip,
  edgeStrip,
  platformPiece,
  doorPiece,
  farStrip: strip(farStrip, { w: 1200, h: 340, ppm: 20 }),
  midStrip: strip(midStrip, { w: 1536, h: 448, ppm: 25.6 }),
  nearStrip: strip(nearStrip, { w: 1536, h: 691, ppm: 38.4 }),
};

export type { Layers };
export { DAY, shade, writePixels, surface };
