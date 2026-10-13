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
import { cardSpirit, lintel, paving, pedestal, pilaster, relief, runeCircle, runePath, sealSigil } from './seal';
import { airRune, arenaRing, banner, colossalColumn, colossus, dais, eyeWall, inkPool, portalGrand, sanctumPaving, sanctumShrine } from './sanctum';

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

/** The door of a ward (the material `seal`): a column 1.2 m wide of dark stone cut by two seams of violet ink with a column of runes between them, and the diamond of the ward over the top. */
const sealDoorPiece: PieceMaker = async (p) => {
  const ppm = num(p, 'ppm', 96);
  const part = str(p, 'part', ['body', 'top', 'bottom'] as const, 'body');
  const w = Math.round(num(p, 'wM', 1.2) * ppm);
  const h = Math.round(ppm * (part === 'body' ? 3 : part === 'top' ? 1.4 : 0.7));
  const seed = num(p, 'seed', 19) + (part === 'body' ? 0 : part === 'top' ? 5 : 9);
  const base = stone({
    w, h, ppm, seed, style: 'courses', courseM: [0.6, 1.2], blockM: [1.2, 1.2], jointM: 0.07, moss: 0.2, cracks: 0.3, stains: 0.9, energy: 0,
    stone: STONE, mossRamp: MOSS, tone: 0.26, toneSpread: 0.06,
  });
  const violet = hex('#a56bff');
  return lit(door({ w, h, ppm, seed: num(p, 'seed', 19), part, style: 'ward', glow: [violet[0] * 1.0, violet[1] * 1.0, violet[2] * 1.0] }, base), part === 'body');
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
  sealDoor: sealDoorPiece,
  /** The sigil of the ward: two cells of 3.2 × 3.2 m (hanging, flashing). */
  sealSigil: async (p) => {
    const ppm = num(p, 'ppm', 96);
    return sealSigil({ w: Math.round(ppm * 3.2) * 2, h: Math.round(ppm * 3.2), ppm, seed: num(p, 'seed', 3) });
  },
  cardSpirit: prop(cardSpirit, 0.7, 1.1),
  pedestal: prop(pedestal, 1.7, 1.3),
  relief: async (p) => {
    const ppm = num(p, 'ppm', 96);
    return relief({ w: Math.round(ppm * 3.2), h: Math.round(ppm * 5), ppm, seed: num(p, 'seed', 5), variant: num(p, 'variant', 0) });
  },
  pilaster: prop(pilaster, 1.2, 9.6),
  lintel: prop(lintel, 7.2, 1.5),
  /** The ritual road: `cols` metres of paving, 0.3 m tall, periodic along its length. */
  paving: async (p) => {
    const ppm = num(p, 'ppm', 96);
    const cols = num(p, 'cols', 4);
    return paving({ w: Math.round(ppm * cols), h: Math.round(ppm * 0.3), ppm, seed: num(p, 'seed', 9), cols });
  },
  runeCircle: prop(runeCircle, 3, 1),
  runePath: prop(runePath, 6, 0.3),
  /** The hall of the sanctum (R4): the columns taller than the view, the guardians of stone, the wall with an eye in it, the shrine of the last rest, the rune of the Air Dash, the dais, the ink, the banners, the portal, the floor. */
  colossalColumn: async (p) => {
    const ppm = num(p, 'ppm', 96);
    return colossalColumn({ w: Math.round(num(p, 'wM', 2.6) * ppm), h: Math.round(num(p, 'hM', 12) * ppm), ppm, seed: num(p, 'seed', 3), variant: num(p, 'variant', 0) });
  },
  colossus: async (p) => {
    const ppm = num(p, 'ppm', 32);
    return colossus({ w: Math.round(num(p, 'wM', 5) * ppm), h: Math.round(num(p, 'hM', 15) * ppm), ppm, seed: num(p, 'seed', 3), variant: num(p, 'variant', 0) });
  },
  eyeWall: prop(eyeWall, 10, 13),
  /** The shrine of the last rest: two cells of 3.9 × 5.1 m (resting, lit). */
  sanctumShrine: async (p) => {
    const ppm = num(p, 'ppm', 96);
    return sanctumShrine({ w: Math.round(ppm * 3.9) * 2, h: Math.round(ppm * 5.1), ppm, seed: num(p, 'seed', 31) });
  },
  airRune: prop(airRune, 1.9, 1.3),
  arenaRing: prop(arenaRing, 22, 1.1),
  dais: prop(dais, 2.6, 0.8),
  inkPool: prop(inkPool, 3.2, 0.8),
  banner: async (p) => {
    const ppm = num(p, 'ppm', 40);
    return banner({ w: Math.round(num(p, 'wM', 2.4) * ppm), h: Math.round(num(p, 'hM', 8) * ppm), ppm, seed: num(p, 'seed', 3), variant: num(p, 'variant', 0) });
  },
  portalGrand: prop(portalGrand, 7.4, 13),
  /** The floor of the hall: `cols` metres of dark slabs, 0.3 m tall, periodic along its length. */
  sanctumPaving: async (p) => {
    const ppm = num(p, 'ppm', 96);
    const cols = num(p, 'cols', 4);
    return sanctumPaving({ w: Math.round(ppm * cols), h: Math.round(ppm * 0.3), ppm, seed: num(p, 'seed', 9), cols, style: str(p, 'style', ['dashes', 'ticks', 'double'] as const, 'dashes') });
  },
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
