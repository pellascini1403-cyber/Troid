import { ROOMS, WORLD } from '../../../src/content';
import type { RoomDefinition } from '../../../src/world/RoomDefinition';
import type { Placement, RoomScene } from '../../../src/presentation/roomScene';
import { Rng } from '../painter/rng';
import { sizeOf, type PackSpec } from '../spec';
import { choose, foregroundTop, push, round2, sceneOf, scatterMotes, surfacesOf, type Layers } from './common';

/**
 * THE DRESSING OF THE REST OF THE WORLD (docs/PROMPT21-LOG.md): the sixty rooms past the Sanctum, dressed with the pieces the four first rooms already own — the earth and the stone, the ferns, the crystals, the columns, the
 * arches, the leaves, the shafts of light and the motes. No picture is painted for them: a composer reads the room's DATA (where its ground is open to the air, where its platforms hang, where its shrines, its pickups and its
 * guardian are) and puts the pieces where the data says something can stand or glow, with a different hand for each zone — the roots grow, the mire shines with fungus, the mines are crystal and rubble, the spire is columns and
 * wind, the foundry is rubble and embers, the heart is crystal and violet. The scatter is seeded by the room, so a rebuild changes nothing; and it is the same kind of dressing the rooms of the slice were given by hand, which is
 * why the rooms of the slice are not here: those have a scene of their own.
 *
 * It is a composer, not a painter, and says so: a room dressed by it is dressed ENOUGH to be read as part of the same world (its ground has grass and fern, its air has dust, its shrines and its vessels glow), not as finished as
 * a room somebody composed by hand. That is the honest state of the art for the zones after the Sanctum, and the document says it.
 */

/** The materials of the ground that are soil, in the ruins' and in every zone past them: what the veil darkens and what grows on. */
const EARTHY: ReadonlySet<string> = new Set(['earth', 'mud', 'gravel', 'flagstone', 'slag', 'inksoil']);

/** The zones, by the prefix of the id of their rooms. */
export type ZoneKind = 'ruins' | 'roots' | 'mire' | 'mines' | 'spire' | 'foundry' | 'heart';

export function zoneOf(roomId: string): ZoneKind {
  if (roomId.startsWith('rt_')) return 'roots';
  if (roomId.startsWith('mr_')) return 'mire';
  if (roomId.startsWith('mn_')) return 'mines';
  if (roomId.startsWith('sp_')) return 'spire';
  if (roomId.startsWith('fd_')) return 'foundry';
  if (roomId.startsWith('ih_')) return 'heart';
  return 'ruins';
}

type Kind = 'fern' | 'grass' | 'rubble' | 'mushrooms' | 'crystals' | 'none';
interface Hand {
  /** What grows and lies on an open top, by weight. */
  flora: ReadonlyArray<readonly [Kind, number]>;
  /** The standing pieces behind the action, by weight: a column, a broken one, a stone with runes, an effigy. */
  landmarks: ReadonlyArray<readonly [string, number]>;
  /** One landmark every this many metres of open ground (at least). */
  every: number;
  /** Roots hang under the platforms. */
  roots: boolean;
  /** The arches of the layer behind the walk, every this many metres of the room (0: none). */
  arches: number;
  /** The leaves in front, every this many metres (0: none): the forest does not reach the foundry. */
  leaves: number;
  /** The light of the dust, and the glow under what shines. */
  motes: readonly number[];
  glow: 'glow_cyan' | 'glow_violet';
  /** How often the air has a bank of mist over the ground, per metre of room. */
  mist: number;
}

const HANDS: Readonly<Record<ZoneKind, Hand>> = {
  ruins: { flora: [['fern', 30], ['grass', 34], ['rubble', 12], ['mushrooms', 6], ['crystals', 4], ['none', 14]], landmarks: [['column_whole_a', 3], ['column_broken_a', 3], ['column_broken_b', 2], ['rune_stone_a', 2], ['effigy_a', 1]], every: 15, roots: true, arches: 34, leaves: 14, motes: [0xd8f0ff, 0xbfe6ff], glow: 'glow_cyan', mist: 1 / 60 },
  roots: { flora: [['fern', 40], ['grass', 20], ['rubble', 6], ['mushrooms', 14], ['crystals', 4], ['none', 16]], landmarks: [['column_broken_a', 3], ['column_broken_b', 3], ['rune_stone_a', 2]], every: 22, roots: true, arches: 38, leaves: 12, motes: [0xa8f0d8, 0x9fe6ff], glow: 'glow_cyan', mist: 1 / 45 },
  mire: { flora: [['fern', 22], ['grass', 14], ['rubble', 4], ['mushrooms', 40], ['crystals', 8], ['none', 12]], landmarks: [['rune_stone_a', 3], ['column_broken_b', 3], ['column_broken_a', 2]], every: 20, roots: true, arches: 40, leaves: 11, motes: [0xa8f0d8, 0xc8ffe6], glow: 'glow_cyan', mist: 1 / 24 },
  // from here on the ground is the zone's own: the scatter of ferns and moss is for the forest, and the zone's pieces (`packs/zones.ts`) are what grows, lies and stands on it
  mines: { flora: [['rubble', 20], ['crystals', 40], ['none', 40]], landmarks: [['column_broken_a', 3], ['column_broken_b', 3], ['rune_stone_a', 1]], every: 24, roots: false, arches: 44, leaves: 0, motes: [0xbfe6ff, 0x9fd8ff], glow: 'glow_cyan', mist: 1 / 40 },
  spire: { flora: [['none', 100]], landmarks: [['column_whole_a', 4], ['column_broken_a', 2], ['effigy_a', 2]], every: 13, roots: false, arches: 30, leaves: 0, motes: [0xffe6c0, 0xffd8a0], glow: 'glow_cyan', mist: 1 / 70 },
  foundry: { flora: [['none', 100]], landmarks: [['column_broken_a', 3], ['column_broken_b', 3], ['column_whole_a', 1]], every: 18, roots: false, arches: 46, leaves: 0, motes: [0xffc9a0, 0xffb080], glow: 'glow_violet', mist: 1 / 50 },
  heart: { flora: [['none', 100]], landmarks: [['effigy_a', 4], ['rune_stone_a', 3], ['column_whole_a', 2]], every: 16, roots: false, arches: 36, leaves: 0, motes: [0xc9a8ff, 0xb08cff], glow: 'glow_violet', mist: 1 / 36 },
};

/** A room as the composers read it: its own data, nothing else. */
export interface Ctx {
  room: RoomDefinition;
  zone: ZoneKind;
  hand: Hand;
  /** The extent of the camera: where the hero can be seen. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** The open tops of the ground inside it (the roof of the room, which is not ground the hero sees, is left out). */
  tops: ReturnType<typeof surfacesOf>;
  /** The height of the floor most of the room stands on. */
  floor: number;
  /** The span of a guardian's arena, if it has one: nothing grows where it is fought. */
  arena: { x0: number; x1: number } | null;
  /** Where the room asks to be left clear: the ways in and out, the shrines, the pickups and the levers. */
  clear: ReadonlyArray<readonly [number, number]>;
}

export function contextOf(room: RoomDefinition): Ctx {
  const cam = room.camera?.bounds ?? room.bounds;
  const tops = surfacesOf(room).filter((s) => s.y < cam.y1 - 1.2 && s.b > cam.x0 && s.a < cam.x1 && s.y >= cam.y0 - 0.01);
  // the floor most of the room stands on: the height of the longest stretch of open ground
  const byHeight = new Map<number, number>();
  for (const s of tops) byHeight.set(s.y, (byHeight.get(s.y) ?? 0) + (s.b - s.a));
  const floor = [...byHeight.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 2;
  const boss = room.bosses?.[0];
  const clear: Array<readonly [number, number]> = [];
  for (const e of room.entries) clear.push([e.x - 1.6, e.x + 1.6]);
  for (const i of room.interactables ?? []) clear.push([i.x - 1.4, i.x + 1.4]);
  for (const x of room.exits ?? []) clear.push([x.rect.x0 - 0.8, x.rect.x1 + 0.8]);
  return { room, zone: zoneOf(room.id), hand: HANDS[zoneOf(room.id)], x0: cam.x0, x1: cam.x1, y0: cam.y0, y1: cam.y1, tops, floor, arena: boss ? { x0: boss.arena.x0, x1: boss.arena.x1 } : null, clear };
}

export const isClear = (c: Ctx, x: number, margin = 0): boolean => !c.clear.some(([a, b]) => x >= a - margin && x <= b + margin);
export const inArena = (c: Ctx, x: number): boolean => c.arena !== null && x >= c.arena.x0 && x <= c.arena.x1;

/** The ground: the veil under the earth, what grows on the open tops, the platforms with their roots, and the landmarks that stand behind the walk. */
export function groundScene(room: RoomDefinition): (pack: PackSpec) => RoomScene {
  return (pack) => {
    const c = contextOf(room);
    const rng = new Rng(`${room.id}:ground`);
    const layers: Layers = {};
    const here = (sprite: string, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, 'terrain', { sprite, x: round2(x), y: round2(y), ...o });
    // ---- the ground sinks into the dark: a veil along every open stretch of earth (it is under what grows there)
    for (const s of c.tops) {
      if (!EARTHY.has(s.solid.material ?? 'stone')) continue;
      const depth = Math.min(5.2, s.solid.rect.y1 - s.solid.rect.y0);
      here('ground_veil', (s.a + s.b) / 2, s.y - depth, { w: round2(s.b - s.a), h: round2(depth) });
    }
    // ---- what grows and lies on every open top: the zone's hand, never where the hero comes in or something is to be taken, and never where a guardian is fought
    for (const s of c.tops) {
      const isEarth = EARTHY.has(s.solid.material ?? 'stone');
      for (let x = s.a + rng.range(0.3, 1.2); x < s.b - 0.4; x += rng.range(1.9, 4.6)) {
        if (!isClear(c, x) || inArena(c, x)) continue;
        const kind = choose(rng, c.hand.flora.map(([k, w]) => [k, k === 'fern' && !isEarth ? w / 2 : w] as const));
        if (kind === 'none') continue;
        const variant = kind === 'rubble' || kind === 'fern' ? choose(rng, [['a', 1], ['b', 1], ['c', 1]] as const) : choose(rng, [['a', 1], ['b', 1]] as const);
        here(`${kind}_${variant}`, x, s.y, { scale: round2(rng.range(0.85, 1.25)), flip: rng.chance(0.5) });
      }
    }
    // ---- the platforms: roots hang from them where the zone is damp, and the top of one of them has a tuft
    const roots = sizeOf(pack, 'roots_a');
    for (const p of room.solids.filter((s) => s.kind === 'oneway' && s.rect.y1 < c.y1 - 1.5 && s.rect.x1 > c.x0 && s.rect.x0 < c.x1)) {
      if (c.hand.roots) {
        for (let x = p.rect.x0 + 0.8; x < p.rect.x1 - 0.5; x += rng.range(1.4, 2.6)) {
          const k = round2(rng.range(0.3, 0.6));
          here(rng.chance(0.5) ? 'roots_a' : 'roots_b', x, p.rect.y0 - roots.h * k + 0.04, { scale: k, flip: rng.chance(0.5) });
        }
      }
      if (p.rect.x1 - p.rect.x0 >= 3 && isClear(c, (p.rect.x0 + p.rect.x1) / 2) && c.hand.flora.some(([k]) => k === 'grass')) here('grass_a', p.rect.x0 + (p.rect.x1 - p.rect.x0) * rng.range(0.2, 0.8), p.rect.y1, { scale: 0.9 });
    }
    // ---- the landmarks behind the walk: along the long stretches of open ground, one every so many metres, with the ways in and the shrines left clear
    const long = c.tops.filter((s) => s.b - s.a >= 6);
    const reach = long.reduce((n, s) => n + (s.b - s.a), 0);
    const count = c.zone === 'ruins' ? Math.min(7, Math.floor(reach / c.hand.every)) : 0;
    for (let i = 0; i < count; i++) {
      const s = long[Math.floor(((i + 0.5) / count) * long.length) % long.length]!;
      const x = s.a + (s.b - s.a) * rng.range(0.15, 0.85);
      if (!isClear(c, x, 1.2) || inArena(c, x)) continue;
      push(layers, 'propsBack', { sprite: choose(rng, c.hand.landmarks), x: round2(x), y: s.y, scale: round2(rng.range(0.95, 1.15)), flip: rng.chance(0.5) });
    }
    // ---- the arena shows what has been fought in it: a broken column at each door, with rubble at its foot
    if (c.arena && c.zone === 'ruins') {
      for (const [x, flip] of [[c.arena.x0 + 1.4, false], [c.arena.x1 - 1.4, true]] as const) {
        const s = c.tops.find((t) => t.a <= x && t.b >= x);
        if (!s) continue;
        push(layers, 'propsBack', { sprite: rng.chance(0.5) ? 'column_broken_a' : 'column_broken_b', x: round2(x), y: s.y, scale: 1.1, flip });
        here('rubble_a', x + (flip ? -1.6 : 1.6), s.y, { scale: 1.05, flip });
      }
    }
    return sceneOf(room, layers);
  };
}

/** The colossal ruins in the layer behind the walk, and the leaves in front where the zone has any. */
export function backScene(room: RoomDefinition): (pack: PackSpec) => RoomScene {
  return (pack) => {
    const c = contextOf(room);
    const rng = new Rng(`${room.id}:back`);
    const layers: Layers = {};
    const width = c.x1 - c.x0;
    // ---- the arches: layer coordinates are 0.75 × the world's x where the hero will be, and the base is 0.9 m under the floor of the room as it is seen from the middle of the camera's range
    if (c.hand.arches > 0) {
      const n = Math.max(1, Math.round(width / c.hand.arches));
      for (let i = 0; i < n; i++) {
        const x = c.x0 + ((i + 0.5) / n) * width + rng.range(-3, 3);
        push(layers, 'backdropNear', { sprite: rng.chance(0.5) ? 'arch_grand_a' : 'arch_grand_b', x: round2(0.75 * x), y: round2(0.75 * c.floor - 0.9), flip: rng.chance(0.5), scale: round2(rng.range(0.9, 1.1)) });
      }
    }
    // ---- the leaves in front: hung from above the highest view the camera can have, so the flat top of the picture never shows
    if (c.hand.leaves > 0) {
      const leaves = sizeOf(pack, 'fore_leaves_a');
      const n = Math.max(2, Math.round(width / c.hand.leaves));
      for (let i = 0; i < n; i++) {
        const ref = c.x0 + ((i + 0.5) / n) * width;
        const scale = round2(rng.range(1, 1.5));
        push(layers, 'foreground', { sprite: `fore_leaves_${'abc'[i % 3]}`, x: round2(1.2 * ref + rng.range(-3, 3)), y: round2(foregroundTop(room) - leaves.h * scale + rng.range(0, 0.7)), flip: rng.chance(0.5), scale });
      }
    }
    return sceneOf(room, layers);
  };
}

/** The light: beams through the dark behind the walk, mist over the ground, dust in the air, and a glow under whatever shines — the shrines, the things to take, the lever, the guardian's bed. */
export function lightScene(room: RoomDefinition): (pack: PackSpec) => RoomScene {
  return (pack) => {
    const c = contextOf(room);
    const rng = new Rng(`${room.id}:light`);
    const layers: Layers = {};
    const over = (sprite: string, x: number, y: number, o: Partial<Placement> = {}): void => push(layers, 'lightOverlay', { sprite, x: round2(x), y: round2(y), ...o });
    const glow = sizeOf(pack, 'glow_cyan');
    const centred = (sprite: string, x: number, yMid: number, k: number, o: Partial<Placement> = {}): void => over(sprite, x, yMid - (glow.h * k) / 2, { scale: k, ...o });
    const width = c.x1 - c.x0;
    // ---- beams through the dark behind the walk (the layers at 0.4 and 0.75 of the world: placed where the camera will be)
    const beams = Math.max(1, Math.round(width / 40));
    for (let i = 0; i < beams; i++) {
      const x = c.x0 + ((i + 0.5) / beams) * width;
      push(layers, 'backdropMid', { sprite: i % 2 === 0 ? 'beam_a' : 'beam_b', x: round2(0.4 * x), y: round2(0.4 * c.floor - 3), alpha: round2(rng.range(0.26, 0.38)), flip: i % 2 === 1 });
    }
    // ---- mist along the floor: a bank here and there, thin
    const long = c.tops.filter((s) => s.b - s.a >= 8 && s.y <= c.floor + 0.01);
    for (const s of long) {
      const n = Math.max(1, Math.floor((s.b - s.a) * c.hand.mist));
      for (let i = 0; i < n; i++) over('mist_bank', s.a + ((i + 0.5) / n) * (s.b - s.a), s.y - 0.2, { alpha: round2(rng.range(0.12, 0.2)), scale: 0.6, motion: 'drift', flip: rng.chance(0.5) });
    }
    // ---- dust in the air, everywhere but where a guardian is fought (its warnings are what must shout there)
    scatterMotes(layers, new Rng(`${room.id}:motes`), { id: room.id, solids: room.solids, camera: { bounds: { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 } } }, {
      every: 21,
      yBottom: round2(c.floor - 1.5),
      alpha: [0.2, 0.34],
      scale: [0.85, 1.2],
      tints: c.hand.motes,
      ...(c.arena ? { avoid: [[c.arena.x0, c.arena.x1]] as const } : {}),
    });
    // ---- a glow under what shines: the shrine rests in cyan, a vessel or a relic on its pedestal glows in the hand of the zone, a lever has a small one, and the guardian's bed a dim violet
    for (const i of room.interactables ?? []) {
      if (i.kind === 'rest') centred('glow_cyan', i.x, i.y + 1.1, 1.1, { alpha: 0.34, motion: 'pulse' });
      else if (i.kind === 'pickup') centred(c.hand.glow, i.x, i.y + 0.7, 0.7, { alpha: 0.4, motion: 'pulse' });
      else if (i.kind === 'activate') centred('glow_cyan', i.x, i.y + 0.7, 0.4, { alpha: 0.32, motion: 'pulse' });
    }
    for (const b of room.bosses ?? []) centred('glow_violet', b.x, b.y + 1.6, 1.4, { alpha: 0.16, motion: 'pulse' });
    return sceneOf(room, layers);
  };
}

/** The rooms past the Sanctum, in the order of the world (the four of the slice have a scene of their own). */
export const DRESSED_BY_COMPOSER: readonly string[] = WORLD.rooms.filter((id) => !['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum'].includes(id));

type Compose = (pack: PackSpec) => RoomScene;
const forAll = (make: (room: RoomDefinition) => Compose, only?: (id: string) => boolean): Record<string, Compose> => Object.fromEntries(DRESSED_BY_COMPOSER.filter((id) => !only || only(id)).map((id) => [id, make(ROOMS[id]!)]));

/**
 * The scenes the packs of the ruins get for the rest of the world. The ground and the light are shared by every zone (the ferns, the rubble, the motes); the BACK of the ruins — the colossal arches and the leaves in front
 * — is the Ruins' own: the zones past them have a backdrop and a set of pieces of their own (`packs/zones.ts`).
 */
export const WORLD_SCENES = { ground: forAll(groundScene), back: forAll(backScene, (id) => zoneOf(id) === 'ruins'), light: forAll(lightScene, (id) => zoneOf(id) === 'ruins') };
