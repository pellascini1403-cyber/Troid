import { R4_SANCTUM_ROOM } from '../../../src/content/rooms/r4Sanctum';
import type { Placement, RoomScene, SceneLayer } from '../../../src/presentation/roomScene';
import { Rng } from '../painter/rng';
import { sizeOf, type PackSpec } from '../spec';
import { choose, foregroundTop, push, round2, sceneOf, surfacesOf, type Layers } from './common';

/**
 * THE DRESSING OF R4, «Santuario» (docs/GAME-SPEC-2D.md §14.4): the last room of the slice and the home of its boss. Three stretches in a line, and the scenery tells them apart before the
 * hero has read a thing: the VESTIBULE (0 – 24), the last quiet place — a portal at the way back, the shrine between two columns, cold light, and at its far end the first seep of the
 * Warden's ink under the door; the ARENA (26.5 – 65.5), a hall made to feel bigger than the screen — columns that leave the view, two guardians of stone over the thresholds, a wall behind the
 * Warden's bed with an eye cut into it, banners, a ring of cold light on the floor and nothing violet on that floor but the ink; and the REWARD (67 – 99), calm again — a dais under a column of
 * light with the rune of the Air Dash floating over it and, at the end, the portal that is the way out of the world. The scatter is seeded; the landmarks are placed by hand.
 *
 * Layer coordinates: a piece in the 0.75 layer (`backdropNear`) stands at `0.75 × X` where the camera will be at X; in the 0.4 layer (`backdropMid`), at `0.4 × X`.
 */
const ROOM = R4_SANCTUM_ROOM;
const surfaces = (): ReturnType<typeof surfacesOf> => surfacesOf(ROOM);
const scene = (layers: Layers): RoomScene => sceneOf(ROOM, layers);

/** Where the things the room's data names stand. */
const SHRINE_X = 14;
const DAIS_X = 84;
const WARDEN_X = 58;
const WEST_PORTAL_X = 3.2;
const EAST_PORTAL_X = 96.6;

function ground(pack: PackSpec): RoomScene {
  const rng = new Rng(909);
  const layers: Layers = {};
  const here = (sprite: string, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, 'terrain', { sprite, x: round2(x), y: round2(y), ...o });
  // ---- the ground sinks into the dark under what grows on it
  for (const s of surfaces()) {
    if (s.solid.material !== 'earth') continue;
    const depth = Math.min(5.2, s.solid.rect.y1 - s.solid.rect.y0);
    here('ground_veil', (s.a + s.b) / 2, s.y - depth, { w: round2(s.b - s.a), h: round2(depth) });
  }
  // ---- what grows and lies on the floor: a little in the vestibule and the reward, nothing in the arena (it is a place to fight)
  for (const s of surfaces()) {
    for (let x = s.a + rng.range(0.3, 1.2); x < s.b - 0.4; x += rng.range(2.4, 5.6)) {
      if (x > 25.5 && x < 67.5) continue;
      const kind = choose(rng, [['fern', 12], ['grass', 26], ['rubble', 18], ['mushrooms', 5], ['crystals', 8], ['none', 24]] as const);
      if (kind === 'none') continue;
      const variant = kind === 'rubble' || kind === 'fern' ? choose(rng, [['a', 1], ['b', 1], ['c', 1]] as const) : choose(rng, [['a', 1], ['b', 1]] as const);
      const name = `${kind}_${kind === 'mushrooms' || kind === 'crystals' || kind === 'grass' ? (variant === 'c' ? 'a' : variant) : variant}`;
      here(name, x, s.y, { scale: round2(rng.range(0.85, 1.2)), flip: rng.chance(0.5) });
    }
  }
  // ---- the guardians that watch the threshold, and a stone with runes where the hero comes in
  push(layers, 'propsBack', { sprite: 'effigy_a', x: 22.8, y: 0, scale: 1.15, flip: true });
  push(layers, 'propsBack', { sprite: 'rune_stone_a', x: 7.4, y: 0 });
  // ---- the arena shows what has been fought in it: a broken column and rubble at each door, a heap in the middle of the way in
  push(layers, 'propsBack', { sprite: 'column_broken_a', x: 29.4, y: 0, scale: 1.1 });
  push(layers, 'propsBack', { sprite: 'column_broken_b', x: 63.8, y: 0, scale: 1, flip: true });
  here('rubble_a', 28, 0, { scale: 1.05 });
  here('rubble_b', 31.2, 0, { scale: 0.8, flip: true });
  here('rubble_c', 64.9, 0, { scale: 1, flip: true });
  here('rubble_b', 37.6, 0, { scale: 0.7 });
  push(layers, 'propsBack', { sprite: 'effigy_a', x: 79.6, y: 0, scale: 1.1 });
  push(layers, 'propsBack', { sprite: 'effigy_a', x: 88.4, y: 0, scale: 1.1, flip: true });
  // ---- the lights of the way: crystals at the shrine and in the reward
  here('crystals_a', 11.4, 0, { scale: 1 });
  here('crystals_b', 17.2, 0, { scale: 0.85 });
  here('crystals_a', 79.6 + 2.2, 0, { scale: 0.8 });
  void pack;
  return scene(layers);
}

/** What the sanctum adds: the hall itself — columns, guardians, the wall with an eye, banners, the portals, the dais, the ink and the paving. */
function sanctum(_pack: PackSpec): RoomScene {
  const rng = new Rng(1010);
  const layers: Layers = {};
  const hall = (layer: SceneLayer, sprite: string, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, layer, { sprite, x: round2(x), y: round2(y), ...o });
  // ---- the floor: three stretches, three paving
  const strip = (sprite: string, from: number, to: number): void => {
    for (let x = from + 2; x <= to - 1.5; x += 4) hall('terrain', sprite, x, 0, { flip: rng.chance(0.5) });
    hall('terrain', sprite, to - 2, 0, { flip: rng.chance(0.5) });
  };
  strip('paving_dashes', 2, 24.9);
  strip('paving_ticks', 26.5, 65.4);
  strip('paving_double', 67.1, 99);
  // ---- the ring of cold light on the floor of the arena
  hall('lightOverlay', 'ring_arena', 46, -0.18, { alpha: 0.6, motion: 'pulse' });
  // ---- the dais of the reward, and the ink of the Warden: seeping out under its door, and pooled at its bed
  hall('propsBack', 'dais_reward', DAIS_X, 0);
  for (const [sprite, x, k] of [['ink_pool_a', 22.4, 0.9], ['ink_pool_b', 24, 0.7], ['ink_pool_c', 56, 1], ['ink_pool_a', 60.2, 1.1], ['ink_pool_b', 62.6, 0.7], ['ink_pool_c', 34.2, 0.6]] as const) {
    hall('terrain', sprite, x, 0, { scale: k, flip: rng.chance(0.5) });
  }
  // ---- the hall, in the layer behind the action (back to front). Its own coordinates: the layer moves 0.75 of what the camera does, so a piece at `x` stands at `x + 0.25 × camera` in the world —
  // at the shrine (camera ≈ 15) it is 4 m further on, in the arena (camera ≈ 46) 11.5 m. The pieces are spaced in the layer's own metres so that none hides another, and the places the eye must find are left free:
  // behind the shrine and the dais (nothing dark where the light is), and in the middle of the arena (the wall with the eye, and the Warden in front of it).
  hall('backdropNear', 'eye_wall', 44.5, -0.9, { alpha: 0.88 });
  hall('backdropNear', 'colossus_a', 23.6, -0.9, { alpha: 0.85 });
  hall('backdropNear', 'colossus_b', 52.8, -0.9, { alpha: 0.85, flip: true });
  hall('backdropNear', 'portal_grand', 2.2, -0.9, { alpha: 0.92 });
  hall('backdropNear', 'portal_grand', 75.65, -0.9, { alpha: 0.92, flip: true });
  for (const [sprite, x, flip] of [['column_grand_a', 7.4, false], ['column_grand_b', 16, true], ['column_grand_b', 29.2, false], ['column_grand_a', 60.5, true], ['column_grand_b', 66.5, false]] as const) {
    hall('backdropNear', sprite, x, -0.9, { flip, alpha: 0.92 });
  }
  for (const [sprite, x, y] of [['banner_a', 19.2, 2.7], ['banner_b', 32.6, 2.9], ['banner_a', 57.5, 2.6], ['banner_b', 69.8, 2.8], ['banner_a', 11.6, 3.3]] as const) {
    hall('backdropNear', sprite, x, y, { alpha: 0.92 });
  }
  return scene(layers);
}

/** The colossal ruins in the layers behind the walk, and the leaves in front where the forest has got in (the vestibule and the reward; never the arena). */
function back(pack: PackSpec): RoomScene {
  const rng = new Rng(1111);
  const layers: Layers = {};
  for (const [sprite, x, flip] of [['arch_grand_a', 0.75 * 12, false], ['arch_grand_b', 0.75 * 80, true]] as const) push(layers, 'backdropNear', { sprite, x: round2(x), y: -0.9, flip, scale: round2(rng.range(1.15, 1.3)) });
  const leaves = sizeOf(pack, 'fore_leaves_a');
  [3, 14, 72, 82, 94].forEach((ref, i) => {
    const x = round2(1.2 * ref + rng.range(-3, 3));
    const lift = rng.range(0, 0.7);
    const flip = rng.chance(0.5);
    const scale = round2(rng.range(1, 1.35));
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
  // ---- the vestibule: a thin light from above over the shrine, the glow of the shrine and of the portal's line
  beam('beam_a', 'backdropMid', 0.4 * 12, -3, { alpha: 0.3 });
  centred('glow_cyan', SHRINE_X, 1.6, 1.5, { alpha: 0.36, motion: 'pulse' });
  centred('glow_cyan', WEST_PORTAL_X, 4.6, 1, { alpha: 0.26, motion: 'pulse' });
  over('mist_bank', 12, -0.2, { alpha: 0.2, scale: 0.8, motion: 'drift' });
  // ---- the seep of the Warden's ink under its door: a violet that begins here and grows
  over('mist_bank', 24.2, -0.1, { alpha: 0.34, scale: 0.7, motion: 'drift', tint: 0xa56bff });
  centred('glow_violet', 24.6, 0.9, 0.9, { alpha: 0.22, motion: 'pulse' });
  // ---- the arena: pale light from the broken vault, mist on the floor, the ring of cold light, and a violet that glows low at the Warden's bed — dim, so that its telegraphs are what shouts
  beam('beam_a', 'backdropMid', 0.4 * 36, -3, { alpha: 0.22 });
  beam('beam_b', 'backdropMid', 0.4 * 50, -3, { alpha: 0.2, flip: true });
  beam('beam_a', 'backdropMid', 0.4 * 62, -3, { alpha: 0.18 });
  for (const [x, a] of [[32, 0.2], [46, 0.26], [60, 0.26]] as const) over('mist_bank', x, -0.2, { alpha: a, scale: 0.9, motion: 'drift' });
  centred('glow_violet', WARDEN_X, 1.5, 1.6, { alpha: 0.14, motion: 'pulse' });
  over('motes_a', 46, 0.4, { alpha: 0.4, motion: 'drift' });
  // ---- the reward: a column of light on the dais, its glow, and at the end the way out
  over('beam_a', DAIS_X, -0.2, { alpha: 0.4, scale: 0.7 });
  centred('glow_cyan', DAIS_X, 1.3, 1.8, { alpha: 0.4, motion: 'pulse' });
  centred('glow_cyan', EAST_PORTAL_X, 3.6, 2.2, { alpha: 0.4, motion: 'pulse' });
  over('mist_bank', 90, -0.2, { alpha: 0.24, scale: 0.8, motion: 'drift' });
  over('motes_a', 80, 0.4, { alpha: 0.36, motion: 'drift' });
  return scene(layers);
}

export const R4_SCENES = { ground, sanctum, back, light };
