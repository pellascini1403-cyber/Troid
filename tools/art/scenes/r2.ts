import { R2_HALL_ROOM } from '../../../src/content/rooms/r2Hall';
import type { Placement, RoomScene, SceneLayer } from '../../../src/presentation/roomScene';
import { Rng } from '../painter/rng';
import { sizeOf, type PackSpec } from '../spec';
import { choose, foregroundTop, push, round2, sceneOf, surfacesOf, type Layers } from './common';

/**
 * THE DRESSING OF R2, «Galería de Raíces» (docs/GAME-SPEC-2D.md §14.5): a hall the forest has taken. The way in is a quiet place under an arch of roots, with the shrine at its heart;
 * the ditch is the dark, close and cold part, lit by the lichen and the crystals on its walls and floor (and by the thorns' tips, the one warm colour); the way on is a long
 * gallery of columns the roots have wound round, with the guardians' effigies at the far end. The scatter is seeded; the landmarks are placed by hand.
 */
const ROOM = R2_HALL_ROOM;
const surfaces = (): ReturnType<typeof surfacesOf> => surfacesOf(ROOM);
const scene = (layers: Layers): RoomScene => sceneOf(ROOM, layers);

function ground(pack: PackSpec): RoomScene {
  const rng = new Rng(303);
  const layers: Layers = {};
  const here = (sprite: string, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, 'terrain', { sprite, x: round2(x), y: round2(y), ...o });
  // ---- the ground sinks into the dark under what grows on it
  for (const s of surfaces()) {
    if (s.solid.material !== 'earth') continue;
    const depth = Math.min(5.2, s.solid.rect.y1 - s.solid.rect.y0);
    here('ground_veil', (s.a + s.b) / 2, s.y - depth, { w: round2(s.b - s.a), h: round2(depth) });
  }
  // ---- what grows and lies on every open top: fewer ferns than the ruins' gate, more fungus and light
  for (const s of surfaces()) {
    const inDitch = s.y < -1;
    for (let x = s.a + rng.range(0.3, 1.2); x < s.b - 0.4; x += rng.range(1.9, 4.6)) {
      const kind = choose(rng, [['fern', inDitch ? 8 : 22], ['grass', inDitch ? 14 : 30], ['rubble', 10], ['mushrooms', inDitch ? 24 : 10], ['crystals', inDitch ? 18 : 5], ['none', 12]] as const);
      if (kind === 'none') continue;
      const variant = kind === 'rubble' || kind === 'fern' ? choose(rng, [['a', 1], ['b', 1], ['c', 1]] as const) : choose(rng, [['a', 1], ['b', 1]] as const);
      const name = `${kind}_${kind === 'mushrooms' || kind === 'crystals' || kind === 'grass' ? (variant === 'c' ? 'a' : variant) : variant}`;
      here(name, x, s.y, { scale: round2(rng.range(0.85, 1.25)), flip: rng.chance(0.5) });
    }
  }
  // ---- the way in: a stone that glows, the guardian's column
  push(layers, 'propsBack', { sprite: 'rune_stone_a', x: 22.4, y: 0 });
  push(layers, 'propsBack', { sprite: 'column_broken_a', x: 3.4, y: 0, scale: 1.05, flip: true });
  here('crystals_a', 15.2, 0, { scale: 1 });
  // ---- under the timber of the high road, roots hang down (the platforms sit over the ditch like a bridge the forest holds up)
  const roots = sizeOf(pack, 'roots_a');
  for (const p of ROOM.solids.filter((s) => s.kind === 'oneway')) {
    for (let x = p.rect.x0 + 0.7; x < p.rect.x1 - 0.5; x += rng.range(1.3, 2.3)) {
      const k = round2(rng.range(0.4, 0.8));
      here(rng.chance(0.5) ? 'roots_a' : 'roots_b', x, p.rect.y0 - roots.h * k + 0.04, { scale: k, flip: rng.chance(0.5) });
    }
    here('grass_a', p.rect.x0 + (p.rect.x1 - p.rect.x0) * rng.range(0.2, 0.8), p.rect.y1, { scale: 0.9 });
  }
  // ---- the ledge of the fourth bottle: a little cluster of light under it, a mushroom beside it
  here('crystals_b', 50.8, 4.8, { scale: 0.7 });
  here('mushrooms_a', 48.5, 4.8, { scale: 0.7 });
  // ---- the ditch: what lives in the dark at its foot
  here('crystals_a', 33.2, -3.2, { scale: 1.1 });
  here('mushrooms_b', 36.4, -3.2, { scale: 0.9 });
  here('crystals_b', 46.5, -3.2, { scale: 1.25 });
  here('mushrooms_a', 52.2, -3.2, { scale: 1 });
  here('rubble_c', 43.6, -3.2, { scale: 0.9 });
  push(layers, 'propsBack', { sprite: 'column_broken_b', x: 32.4, y: -3.2, scale: 0.9, flip: true });
  push(layers, 'propsBack', { sprite: 'column_broken_a', x: 54.6, y: -3.2, scale: 0.85 });
  // ---- the way on: a gallery, and the guardians at its end
  push(layers, 'propsBack', { sprite: 'column_whole_a', x: 71.2, y: 0, scale: 1.1 });
  push(layers, 'propsBack', { sprite: 'effigy_a', x: 83.2, y: 0, scale: 1.15, flip: true });
  here('crystals_b', 85.6, 0, { scale: 0.85 });
  here('mushrooms_b', 63.2, 0, { scale: 0.8 });
  here('rubble_b', 67.8, 0, { scale: 1 });
  return scene(layers);
}

/** What the roots add: the arches over the hall, the curtains in the dark above, the columns they have wound round, and the ones that crawl on the ground. */
function roots(pack: PackSpec): RoomScene {
  const rng = new Rng(404);
  const layers: Layers = {};
  const arch = sizeOf(pack, 'root_arch_a');
  void arch;
  // ---- arches over the hall, in the layer behind the action (coordinates are 0.75 × the world's x where the hero will be)
  const arches: Array<[string, number, boolean]> = [['root_arch_a', 0.75 * 14, false], ['root_arch_b', 0.75 * 42, true], ['root_arch_a', 0.75 * 70, true], ['root_arch_b', 0.75 * 98, false]];
  for (const [sprite, x, flip] of arches) push(layers, 'backdropNear', { sprite, x: round2(x), y: -0.9, flip, scale: round2(rng.range(0.92, 1.08)) });
  // ---- curtains in the mid layer (0.4 × the world's x), hanging from the dark
  for (const ref of [6, 22, 38, 54, 70, 86, 100]) push(layers, 'backdropMid', { sprite: rng.chance(0.5) ? 'root_curtain_a' : 'root_curtain_b', x: round2(0.4 * ref + rng.range(-1, 1)), y: -0.6, flip: rng.chance(0.5), alpha: round2(rng.range(0.85, 1)) });
  // ---- the columns the roots have taken, at the same depth as the hero
  const pillars: Array<[string, number, boolean]> = [['root_pillar_a', 7.4, false], ['root_pillar_b', 17.4, true], ['root_pillar_a', 66.6, true], ['root_pillar_b', 78.2, false], ['root_pillar_a', 24.6, false]];
  for (const [sprite, x, flip] of pillars) push(layers, 'propsBack', { sprite, x, y: 0, flip, scale: round2(rng.range(0.98, 1.1)) });
  // ---- roots that crawl over the ground: on the way in, at the foot of the ditch (clear of the thorns, at 39.5 … 42) and on the way on
  const crawl: Array<[string, number, number, boolean]> = [
    ['root_crawl_a', 5.6, 0, false], ['root_crawl_b', 19.8, 0, true], ['root_crawl_c', 36.6, -3.2, false], ['root_crawl_a', 47.4, -3.2, true],
    ['root_crawl_b', 62.4, 0, false], ['root_crawl_c', 74.4, 0, true], ['root_crawl_a', 88, 0, false],
  ];
  for (const [sprite, x, y, flip] of crawl) push(layers, 'terrain', { sprite, x, y, flip, scale: round2(rng.range(0.9, 1.1)) });
  // ---- close to the eye: tendrils that hang from the top of the screen, never lower than the hero's head (layer coordinates: 1.2 × the world's x)
  const refs = [2, 12, 22, 33, 44, 55, 66, 77, 88];
  const fore = sizeOf(pack, 'fore_roots_a');
  refs.forEach((ref, i) => {
    const x = round2(1.2 * ref + rng.range(-3, 3));
    const lift = rng.range(0, 0.8);
    const flip = rng.chance(0.5);
    const scale = round2(rng.range(1.15, 1.5));
    // hung from above the highest view the camera can have: the flat top of the picture never shows, and the tips reach down to 0 … 0.8 m below the lowest the camera shows
    push(layers, 'foreground', { sprite: `fore_roots_${'abc'[i % 3]}`, x, y: round2(foregroundTop(ROOM) - fore.h * scale + lift), flip, scale });
  });
  return scene(layers);
}

function back(_pack: PackSpec): RoomScene {
  const layers: Layers = {};
  // one ruined arch survives at the far end of the gallery, above the way out (the foreground of this room is the roots', not leaves)
  push(layers, 'backdropNear', { sprite: 'arch_grand_b', x: round2(0.75 * 88), y: -0.9, flip: true, scale: 1 });
  return scene(layers);
}

function light(pack: PackSpec): RoomScene {
  const layers: Layers = {};
  const over = (sprite: string, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, 'lightOverlay', { sprite, x: round2(x), y: round2(y), ...o });
  const glow = sizeOf(pack, 'glow_cyan');
  const centred = (sprite: string, x: number, yMid: number, k: number, o: Partial<Placement> = {}): void => over(sprite, x, yMid - (glow.h * k) / 2, { scale: k, ...o });
  const beam = (sprite: string, layer: SceneLayer, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, layer, { sprite, x: round2(x), y: round2(y), ...o });
  // the light that gets in is thin: a beam at the way in and one at the end of the gallery, none over the ditch
  beam('beam_a', 'backdropMid', 0.4 * 14, -3, { alpha: 0.3 });
  beam('beam_b', 'backdropMid', 0.4 * 80, -3, { alpha: 0.26, flip: true });
  // the ditch breathes: mist along its floor and over its lip, dust in the cold
  over('mist_bank', 43, -5.6, { alpha: 0.6, motion: 'drift' });
  over('mist_bank', 43, -3.4, { alpha: 0.38, motion: 'drift', flip: true });
  over('mist_bank', 33, -3.9, { alpha: 0.26, scale: 0.7, motion: 'drift' });
  over('mist_bank', 53, -3.9, { alpha: 0.26, scale: 0.7, motion: 'drift', flip: true });
  for (const x of [20, 72]) over('mist_bank', x, -0.2, { alpha: 0.14, scale: 0.6, motion: 'drift' });
  over('motes_a', 44, -2.6, { alpha: 0.5, motion: 'drift' });
  // the lichen on the walls of the ditch and the glow of its crystals and fungus
  for (const [x, y, k] of [[26.6, -0.6, 0.5], [27.4, -2.2, 0.42], [29.2, -2.9, 0.38], [57.2, -2.5, 0.45], [58.6, -1.1, 0.5], [59.4, -2.8, 0.36], [33.2, -2.3, 0.62], [36.4, -2.9, 0.42], [46.5, -2.2, 0.72], [52.2, -2.8, 0.45]] as const) {
    centred('glow_cyan', x, y, k, { alpha: 0.42, motion: 'pulse' });
  }
  // under the shrine and the ledge of the bottle, the way in, the guardians
  centred('glow_cyan', 12, 1.4, 1.1, { alpha: 0.34, motion: 'pulse' });
  centred('glow_cyan', 15.2, 0.55, 0.55, { alpha: 0.36, motion: 'pulse' });
  centred('glow_cyan', 50.8, 5.3, 0.5, { alpha: 0.36, motion: 'pulse' });
  centred('glow_cyan', 85.6, 0.5, 0.5, { alpha: 0.36, motion: 'pulse' });
  for (const x of [83.2]) centred('glow_violet', x, 2.1, 0.8, { alpha: 0.14, motion: 'pulse' });
  return scene(layers);
}

export const R2_SCENES = { ground, roots, back, light };
