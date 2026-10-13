import { R3_CHAMBER_ROOM } from '../../../src/content/rooms/r3Chamber';
import type { Placement, RoomScene, SceneLayer } from '../../../src/presentation/roomScene';
import { Rng } from '../painter/rng';
import { sizeOf, type PackSpec } from '../spec';
import { choose, foregroundTop, push, round2, sceneOf, scatterMotes, surfacesOf, type Layers } from './common';

/**
 * THE DRESSING OF R3, «Cámara del Sello» (docs/GAME-SPEC-2D.md §14.6): the room where the hero is given something and then put to use. A ritual road of worn paving, with a line of light
 * inlaid in it, runs from the way in to the ward: it climbs to the ledge where the card lies on its altar — under a carved wall whose rings burn behind the card — and goes on along the long
 * lane to the portal of stone the ward is set in. Cyan is the hero's (the road, the altar, the card, the circles where to stand); violet is the ward's (the door, its sigil, the glow that spills
 * from it). The scatter is seeded; the landmarks are placed by hand.
 */
const ROOM = R3_CHAMBER_ROOM;
const surfaces = (): ReturnType<typeof surfacesOf> => surfacesOf(ROOM);
const scene = (layers: Layers): RoomScene => sceneOf(ROOM, layers);

/** The centre of the door the ward holds, and where the card lies. */
const DOOR_X = 63.6;
const ALTAR_X = 34.5;
const ALTAR_Y = 4.8;

function ground(pack: PackSpec): RoomScene {
  const rng = new Rng(606);
  const layers: Layers = {};
  const here = (sprite: string, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, 'terrain', { sprite, x: round2(x), y: round2(y), ...o });
  // ---- the ground sinks into the dark under what grows on it
  for (const s of surfaces()) {
    if (s.solid.material !== 'earth') continue;
    const depth = Math.min(5.2, s.solid.rect.y1 - s.solid.rect.y0);
    here('ground_veil', (s.a + s.b) / 2, s.y - depth, { w: round2(s.b - s.a), h: round2(depth) });
  }
  // ---- what grows and lies on the open tops: little, in a room that is kept
  for (const s of surfaces()) {
    for (let x = s.a + rng.range(0.3, 1.2); x < s.b - 0.4; x += rng.range(2.2, 5.2)) {
      // nothing grows on the road to the ward, or on the steps of the altar
      if (s.y === 0 && x > 62 && x < 65) continue;
      const kind = choose(rng, [['fern', 10], ['grass', 34], ['rubble', 16], ['mushrooms', 6], ['crystals', 7], ['none', 18]] as const);
      if (kind === 'none') continue;
      const variant = kind === 'rubble' || kind === 'fern' ? choose(rng, [['a', 1], ['b', 1], ['c', 1]] as const) : choose(rng, [['a', 1], ['b', 1]] as const);
      const name = `${kind}_${kind === 'mushrooms' || kind === 'crystals' || kind === 'grass' ? (variant === 'c' ? 'a' : variant) : variant}`;
      here(name, x, s.y, { scale: round2(rng.range(0.85, 1.2)), flip: rng.chance(0.5) });
    }
  }
  // ---- under the timber of the climb, roots hang down
  const roots = sizeOf(pack, 'roots_a');
  for (const p of ROOM.solids.filter((s) => s.kind === 'oneway')) {
    for (let x = p.rect.x0 + 0.7; x < p.rect.x1 - 0.5; x += rng.range(1.5, 2.6)) {
      const k = round2(rng.range(0.3, 0.6));
      here(rng.chance(0.5) ? 'roots_a' : 'roots_b', x, p.rect.y0 - roots.h * k + 0.04, { scale: k, flip: rng.chance(0.5) });
    }
  }
  // ---- the columns of the chamber and the guardians that watch the ward
  const stand: Array<[string, number, number, boolean]> = [
    ['column_whole_a', 9.4, 1.1, false], ['column_whole_a', 17.8, 1.1, true], ['column_broken_a', 45.4, 1, false], ['column_whole_a', 53.6, 1.1, true],
    ['effigy_a', 57.8, 1.2, false], ['effigy_a', 70.2, 1.2, true], ['column_broken_b', 74.4, 1, false],
  ];
  for (const [sprite, x, k, flip] of stand) push(layers, 'propsBack', { sprite, x, y: 0, scale: k, flip });
  here('crystals_a', 72.2, 0, { scale: 1 });
  here('crystals_b', 11.6, 0, { scale: 0.8 });
  here('rubble_c', 66.2, 0, { scale: 0.9, flip: true });
  return scene(layers);
}

/** What the chamber adds: the door of the ward, its sigil, the altar, the carved walls, the portal, the road and the circles of light. */
function seal(pack: PackSpec): RoomScene {
  const rng = new Rng(707);
  const layers: Layers = {};
  const road = sizeOf(pack, 'paving_a');
  // ---- the ritual road: worn paving from the way in to the ward, three variants laid in turn, over the ground and its grass
  const slabs = ['paving_a', 'paving_b', 'paving_c'];
  for (let i = 0, x = 2 + road.w / 2; x < 62.2; i++, x += road.w) push(layers, 'terrain', { sprite: slabs[(i + rng.int(0, 2)) % 3]!, x: round2(x), y: 0, flip: rng.chance(0.5) });
  // ---- the altar of the card, on the ledge, under a wall whose rings burn behind it: the moment of the Spirit Bolt
  push(layers, 'propsBack', { sprite: 'relief_b', x: ALTAR_X, y: 2.5, scale: 1.12 });
  push(layers, 'propsBack', { sprite: 'altar_card', x: ALTAR_X, y: ALTAR_Y });
  // ---- carved walls along the way
  push(layers, 'propsBack', { sprite: 'relief_a', x: 13.6, y: 0 });
  push(layers, 'propsBack', { sprite: 'relief_a', x: 47.6, y: 0, flip: true });
  // ---- the portal the ward is set in: two flanks of stone and a lintel over them
  push(layers, 'propsBack', { sprite: 'portal_flank', x: round2(DOOR_X - 2.5), y: 0 });
  push(layers, 'propsBack', { sprite: 'portal_flank', x: round2(DOOR_X + 2.5), y: 0, flip: true });
  push(layers, 'propsBack', { sprite: 'portal_lintel', x: DOOR_X, y: 9.3 });
  // ---- light on the stone: the line that says where to go, and the circles that say where to stand
  const over = (sprite: string, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, 'lightOverlay', { sprite, x: round2(x), y: round2(y), ...o });
  for (const x of [6.4, 12.4, 18.4]) over('rune_path', x, 0.1, { alpha: 0.7 });
  for (const x of [43.2, 49.2, 55.2]) over('rune_path', x, 0.1, { alpha: 0.7, flip: x > 49 });
  over('rune_circle', ALTAR_X, ALTAR_Y + 0.12, { alpha: 0.9, motion: 'pulse' });
  over('rune_circle', 51.4, 0.1, { alpha: 0.75, motion: 'pulse', scale: 1.15 });
  over('rune_circle', 24.6, 2.52, { alpha: 0.5, motion: 'pulse', scale: 0.6 });
  return scene(layers);
}

function back(pack: PackSpec): RoomScene {
  const rng = new Rng(808);
  const layers: Layers = {};
  // the colossal ruins behind the walk, whole (the layer's own coordinates: 0.75 × the world's x where the hero will be)
  const arches: Array<[string, number, boolean]> = [['arch_grand_a', 0.75 * 10, false], ['arch_grand_b', 0.75 * 36, true], ['arch_grand_a', 0.75 * 62, true], ['arch_grand_b', 0.75 * 90, false]];
  for (const [sprite, x, flip] of arches) push(layers, 'backdropNear', { sprite, x: round2(x), y: -0.9, flip, scale: round2(rng.range(0.92, 1.1)) });
  // leaves in front: hung from above the highest view the camera can have
  const leaves = sizeOf(pack, 'fore_leaves_a');
  [6, 24, 44, 62, 72].forEach((ref, i) => {
    const x = round2(1.2 * ref + rng.range(-3, 3));
    const lift = rng.range(0, 0.7);
    const flip = rng.chance(0.5);
    const scale = round2(rng.range(1, 1.4));
    push(layers, 'foreground', { sprite: `fore_leaves_${'abc'[i % 3]}`, x, y: round2(foregroundTop(ROOM) - leaves.h * scale + lift), flip, scale });
  });
  return scene(layers);
}

function light(pack: PackSpec): RoomScene {
  const layers: Layers = {};
  const over = (sprite: string, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, 'lightOverlay', { sprite, x: round2(x), y: round2(y), ...o });
  const glow = sizeOf(pack, 'glow_cyan');
  const centred = (sprite: string, x: number, yMid: number, k: number, o: Partial<Placement> = {}): void => over(sprite, x, yMid - (glow.h * k) / 2, { scale: k, ...o });
  const beam = (sprite: string, layer: SceneLayer, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, layer, { sprite, x: round2(x), y: round2(y), ...o });
  // a thin light from the high windows, cold, over the ledge and over the lane
  beam('beam_a', 'backdropMid', 0.4 * 30, -3, { alpha: 0.3 });
  beam('beam_b', 'backdropMid', 0.4 * 52, -3, { alpha: 0.24, flip: true });
  beam('beam_a', 'backdropMid', 0.4 * 8, -3, { alpha: 0.22, flip: true });
  // mist along the floor, and the violet that spills from the ward onto it
  for (const x of [14, 40, 58]) over('mist_bank', x, -0.2, { alpha: 0.16, scale: 0.7, motion: 'drift' });
  over('mist_bank', DOOR_X, -0.1, { alpha: 0.4, scale: 0.8, motion: 'drift', tint: 0xa56bff });
  over('motes_a', 59, 0.4, { alpha: 0.4, motion: 'drift' });
  // the energy of the seal in the air of the chamber: cyan sparks
  scatterMotes(layers, new Rng(113), ROOM, { every: 22, yBottom: -1.2, alpha: [0.22, 0.34], scale: [0.85, 1.15], tints: [0x9fe2ff, 0xc4f0ff], avoid: [[50, 68]] });
  // the glow of the ward: on the door, high and low, and a halo at the feet of the guardians
  centred('glow_violet', DOOR_X, 2.4, 2.6, { alpha: 0.3, motion: 'pulse' });
  centred('glow_violet', DOOR_X, 6.4, 2.2, { alpha: 0.18, motion: 'pulse' });
  for (const x of [57.8, 70.2]) centred('glow_violet', x, 2.1, 0.8, { alpha: 0.14, motion: 'pulse' });
  // the glow of the altar and of the crystals
  centred('glow_cyan', ALTAR_X, ALTAR_Y + 1.2, 1.5, { alpha: 0.4, motion: 'pulse' });
  centred('glow_cyan', 11.6, 0.5, 0.5, { alpha: 0.34, motion: 'pulse' });
  centred('glow_cyan', 72.2, 0.55, 0.55, { alpha: 0.34, motion: 'pulse' });
  return scene(layers);
}

export const R3_SCENES = { ground, seal, back, light };
