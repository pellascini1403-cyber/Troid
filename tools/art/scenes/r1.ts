import { R1_GATE_ROOM } from '../../../src/content/rooms/r1Gate';
import { exposedEdges, type PlanSolid } from '../../../src/presentation/roomPlan';
import type { Placement, RoomScene, SceneLayer } from '../../../src/presentation/roomScene';
import { SCENE_VERSION } from '../../../src/presentation/roomScene';
import { Rng } from '../painter/rng';
import { sizeOf, type PackSpec } from '../spec';

/**
 * THE DRESSING OF R1, «Puerta de las Ruinas» (docs/GAME-SPEC-2D.md §14.4): which pieces of the packs stand where. A room is a walk — the open way in under the old trees, the
 * chasm with its broken stairs, the crawl under a ruined hall, the court of the guardian and the sealed gate — and the dressing follows it: the light is high and pale at the start,
 * low and cold in the chasm, close and dark in the tunnel, and violet at the gate. The scatter is seeded, so a rebuild changes nothing; the landmarks are placed by hand.
 */
const ROOM = R1_GATE_ROOM;
const solids = ROOM.solids as unknown as PlanSolid[];
const blocks = solids.filter((s) => s.kind !== 'oneway' && !ROOM.gates?.some((g) => g.solid === s.id));
const surfaces = (): Array<{ solid: PlanSolid; a: number; b: number; y: number }> => {
  const out: Array<{ solid: PlanSolid; a: number; b: number; y: number }> = [];
  for (const s of blocks) {
    if (s.id.startsWith('wall_')) continue;
    for (const [a, b] of exposedEdges(s, blocks).top) if (b - a >= 1.1) out.push({ solid: s, a, b, y: s.rect.y1 });
  }
  return out;
};

type Layers = Partial<Record<SceneLayer, Placement[]>>;
const push = (layers: Layers, layer: SceneLayer, p: Placement): void => {
  (layers[layer] ??= []).push(p);
};
const scene = (layers: Layers): RoomScene => ({ sceneVersion: SCENE_VERSION, room: ROOM.id, layers });
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Weighted choice. */
const choose = <T>(rng: Rng, items: ReadonlyArray<readonly [T, number]>): T => {
  const total = items.reduce((n, [, w]) => n + w, 0);
  let r = rng.next() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1]![0];
};

function ground(pack: PackSpec): RoomScene {
  const rng = new Rng(101);
  const layers: Layers = {};
  const here = (sprite: string, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, 'terrain', { sprite, x: round2(x), y: round2(y), ...o });
  // ---- the ground sinks into the dark: a veil along every open stretch of the ground (it is under what grows there)
  for (const s of surfaces()) {
    if (s.solid.material !== 'earth') continue;
    const depth = Math.min(5.2, s.solid.rect.y1 - s.solid.rect.y0);
    here('ground_veil', (s.a + s.b) / 2, s.y - depth, { w: round2(s.b - s.a), h: round2(depth) });
  }
  // ---- what grows and lies on every open top of the ground and the blocks
  for (const s of surfaces()) {
    const isEarth = s.solid.material === 'earth';
    for (let x = s.a + rng.range(0.3, 1.2); x < s.b - 0.4; x += rng.range(1.9, 4.6)) {
      const kind = choose(rng, [['fern', isEarth ? 34 : 18], ['grass', 36], ['rubble', isEarth ? 8 : 16], ['mushrooms', 6], ['crystals', 4], ['none', 12]] as const);
      if (kind === 'none') continue;
      const variant = kind === 'rubble' || kind === 'fern' ? choose(rng, [['a', 1], ['b', 1], ['c', 1]] as const) : choose(rng, [['a', 1], ['b', 1]] as const);
      const name = `${kind}_${kind === 'mushrooms' || kind === 'crystals' || kind === 'grass' ? (variant === 'c' ? 'a' : variant) : variant}`;
      here(name, x, s.y, { scale: round2(rng.range(0.85, 1.25)), flip: rng.chance(0.5) });
    }
  }
  // ---- the way in: a stone that glows by the start, crystals further on, columns that frame the walk
  push(layers, 'propsBack', { sprite: 'rune_stone_a', x: 8.2, y: 0 });
  here('crystals_a', 12.6, 0, { scale: 1.1 });
  push(layers, 'propsBack', { sprite: 'column_broken_a', x: 20.5, y: 0, scale: 1.05 });
  push(layers, 'propsBack', { sprite: 'column_whole_a', x: 29.8, y: 0, scale: 1.05, flip: true });
  // ---- the chasm: its two broken piers and what hangs under the stairs
  push(layers, 'propsBack', { sprite: 'column_broken_b', x: 31.2, y: 0, flip: true });
  push(layers, 'propsBack', { sprite: 'column_broken_a', x: 38.2, y: 0, scale: 0.95 });
  for (const p of ROOM.solids.filter((s) => s.kind === 'oneway')) {
    const roots = sizeOf(pack, 'roots_a');
    for (let x = p.rect.x0 + 0.8; x < p.rect.x1 - 0.5; x += rng.range(1.4, 2.4)) {
      const k = round2(rng.range(0.35, 0.7));
      here(rng.chance(0.5) ? 'roots_a' : 'roots_b', x, p.rect.y0 - roots.h * k + 0.04, { scale: k, flip: rng.chance(0.5) });
    }
    here('grass_a', p.rect.x0 + (p.rect.x1 - p.rect.x0) * rng.range(0.2, 0.8), p.rect.y1, { scale: 0.9 });
  }
  here('crystals_b', 51.2, 5.2, { scale: 0.8 });
  // ---- the crawl: roots hang from the ceiling, a little light grows in the dark
  const roots = sizeOf(pack, 'roots_a');
  for (let x = 64.6; x < 75.6; x += rng.range(0.9, 1.8)) {
    const k = round2(rng.range(0.14, 0.24));
    here(rng.chance(0.5) ? 'roots_a' : 'roots_b', x, 1.2 - roots.h * k + 0.03, { scale: k, flip: rng.chance(0.5) });
  }
  here('mushrooms_a', 66.2, 0, { scale: 0.8 });
  here('mushrooms_b', 71.5, 0, { scale: 0.75 });
  here('rubble_b', 63.4, 0, { scale: 0.9 });
  here('rubble_c', 77.2, 0, { scale: 1 });
  // ---- the court: columns on both sides, the effigies that watch the gate
  push(layers, 'propsBack', { sprite: 'column_whole_a', x: 80.6, y: 0, scale: 1.12 });
  push(layers, 'propsBack', { sprite: 'column_broken_b', x: 97.8, y: 0, scale: 1.1 });
  push(layers, 'propsBack', { sprite: 'effigy_a', x: 101.3, y: 0, scale: 1.2 });
  push(layers, 'propsBack', { sprite: 'effigy_a', x: 108.1, y: 0, scale: 1.2, flip: true });
  here('crystals_a', 99.4, 0, { scale: 0.9 });
  here('crystals_b', 111.6, 0, { scale: 0.8 });
  return scene(layers);
}

function back(pack: PackSpec): RoomScene {
  const rng = new Rng(202);
  const layers: Layers = {};
  void pack;
  // ---- the colossal ruins behind the walk (layer coordinates: 0.75 × the world's x where the hero will be)
  const arches: Array<[string, number, boolean]> = [['arch_grand_a', 0.75 * 12, false], ['arch_grand_b', 0.75 * 46, true], ['arch_grand_a', 0.75 * 88, true], ['arch_grand_b', 0.75 * 120, false]];
  for (const [sprite, x, flip] of arches) push(layers, 'backdropNear', { sprite, x: round2(x), y: -0.9, flip, scale: round2(rng.range(0.9, 1.1)) });
  // ---- leaves in front: hung from the top of the screen, never lower than the hero's head
  const refs = [4, 18, 33, 47, 60, 73, 88, 101, 112];
  refs.forEach((ref, i) => push(layers, 'foreground', { sprite: `fore_leaves_${'abc'[i % 3]}`, x: round2(1.2 * ref + rng.range(-3, 3)), y: round2(rng.range(6.0, 6.7)), flip: rng.chance(0.5), scale: round2(rng.range(1, 1.5)) }));
  return scene(layers);
}

function light(pack: PackSpec): RoomScene {
  const layers: Layers = {};
  const over = (sprite: string, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, 'lightOverlay', { sprite, x: round2(x), y: round2(y), ...o });
  const glow = sizeOf(pack, 'glow_cyan');
  const centred = (sprite: string, x: number, yMid: number, k: number, o: Partial<Placement> = {}): void => over(sprite, x, yMid - (glow.h * k) / 2, { scale: k, ...o });
  // beams through the trees fall BEHIND the action (in the parallax layers, added to what is there), so they never wash the hero out
  const beam = (sprite: string, layer: SceneLayer, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, layer, { sprite, x: round2(x), y: round2(y), ...o });
  beam('beam_a', 'backdropMid', 0.4 * 6, -3, { alpha: 0.4 });
  beam('beam_b', 'backdropMid', 0.4 * 46, -3, { alpha: 0.34, flip: true });
  beam('beam_a', 'backdropMid', 0.4 * 86, -3, { alpha: 0.34, flip: true });
  beam('beam_b', 'backdropNear', 0.75 * 70, -2, { alpha: 0.16 });
  // the chasm breathes mist; a thin ground mist runs along the way
  over('mist_bank', 34.5, -4.4, { alpha: 0.55, motion: 'drift' });
  over('mist_bank', 34.5, -2.6, { alpha: 0.3, motion: 'drift', flip: true });
  for (const x of [16, 56, 90]) over('mist_bank', x, -0.2, { alpha: 0.16, scale: 0.6, motion: 'drift' });
  // dust in the light by the gate
  over('motes_a', 104, -0.5, { alpha: 0.55, motion: 'drift' });
  // small glows under the crystals and the rune stone, a violet halo at the foot of each effigy
  for (const [x, y, k] of [[8.2, 1.6, 0.8], [12.6, 0.55, 0.55], [51.2, 5.6, 0.5], [66.2, 0.3, 0.4], [99.4, 0.5, 0.5], [111.6, 0.5, 0.45]] as const) centred('glow_cyan', x, y, k, { alpha: 0.4, motion: 'pulse' });
  for (const x of [101.3, 108.1]) centred('glow_violet', x, 2.2, 0.9, { alpha: 0.2, motion: 'pulse' });
  return scene(layers);
}

export const R1_SCENES = { ground, back, light };
