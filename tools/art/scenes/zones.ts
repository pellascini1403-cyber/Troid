import { ROOMS, WORLD } from '../../../src/content';
import type { RoomDefinition } from '../../../src/world/RoomDefinition';
import type { Placement, RoomScene, SceneLayer } from '../../../src/presentation/roomScene';
import { Rng } from '../painter/rng';
import type { ZoneId } from '../painter/zones';
import { choose, foregroundTop, round2, sceneOf, scatterMotes, type Layers } from './common';
import { contextOf, inArena, isClear, zoneOf, type Ctx } from './world';

/**
 * THE SET OF EACH ZONE PAST THE RUINS (docs/PROMPT23-LOG.md §5): which pieces stand behind the walk, lie on the ground, hang in front of the camera and light the air in each zone, and the COMPOSER that puts them
 * in a room from its data. The old composer scattered the same six pieces — a column, a broken one, a stone with runes — in every zone, a few to a room, wherever a seed fell; this one walks the open ground of the
 * room the way a level designer would: a landmark every so many metres with a different one from the last two, a pair that frames a shrine, the arena's doors marked, and a low thing at the foot of some of them.
 * It reads only the room's data, so a rebuild changes nothing, and `plan` is a pure function of the room: the packs that share a zone (the roots' pieces are in two) are each given the placements that are theirs.
 */
export interface KitPiece {
  /** What it is: the painter's kind (`painter/zoneProps.ts`) and its sprites in its pack (`<kind>_a`, `<kind>_b`). */
  kind: string;
  /** The sprites of the pack that hold it; the zone's own are `<kind>_a` and `<kind>_b`. */
  sprites?: readonly string[];
  /** The pack that holds the sprites (default: the zone's own `zone-<zone>`). */
  pack?: string;
  /** Size in metres of one piece, and how often it is picked. */
  w: number;
  h: number;
  weight: number;
}

export interface Kit {
  /** What stands behind the walk. */
  landmarks: readonly KitPiece[];
  /** What lies on the ground. */
  ground: readonly KitPiece[];
  /** What hangs in front of the camera. */
  hanging: readonly KitPiece[];
  /** The two pieces that frame a shrine; the one that marks the doors of an arena. */
  frame: readonly string[];
  arena: string;
  /** Metres of open ground between one landmark and the next, on average; and between two hangings, in metres of the room. */
  every: number;
  hangEvery: number;
  /** The colour of the zone's light (0..1): beams, mist, motes and glows. */
  light: readonly [number, number, number];
}

const lm = (kind: string, w: number, h: number, weight: number): KitPiece => ({ kind, w, h, weight });
const roots = (kind: string, ids: readonly string[], w: number, h: number, weight: number): KitPiece => ({ kind, sprites: ids, pack: 'ruins-roots', w, h, weight });

export const KITS: Readonly<Record<ZoneId, Kit>> = {
  roots: {
    landmarks: [roots('root_pillar', ['root_pillar_a', 'root_pillar_b'], 2.4, 6.6, 3), lm('root_knot', 3.4, 3.6, 3), lm('trunk_stub', 3.2, 4.4, 2)],
    ground: [roots('root_crawl', ['root_crawl_a', 'root_crawl_b', 'root_crawl_c'], 3.4, 1.1, 3)],
    hanging: [roots('fore_roots', ['fore_roots_a', 'fore_roots_b', 'fore_roots_c'], 5, 4, 3), lm('tendrils', 4, 3.8, 2)],
    frame: ['root_pillar', 'trunk_stub'], arena: 'trunk_stub', every: 12, hangEvery: 14, light: [0.55, 1, 0.78],
  },
  mire: {
    landmarks: [lm('lantern_post', 2.4, 4.6, 3), lm('giant_mushroom', 4, 4, 3), lm('stilt_pile', 3.4, 3.8, 2), lm('dead_tree', 3.4, 5.4, 3)],
    ground: [lm('reed_clump', 1.8, 1.8, 3), lm('spore_pods', 1.6, 1.4, 2)],
    hanging: [lm('moss_curtain', 5, 3.4, 3)],
    frame: ['lantern_post', 'giant_mushroom'], arena: 'dead_tree', every: 11, hangEvery: 15, light: [0.55, 1, 0.9],
  },
  mines: {
    landmarks: [lm('crystals_tall', 3.2, 4.2, 3), lm('timber_prop', 3.8, 4.4, 3), lm('ore_pile', 3.2, 1.8, 2), lm('stalagmites', 2.6, 3.6, 2), lm('rock_pillar', 2.2, 5.4, 2)],
    ground: [lm('rubble_blue', 2.4, 0.9, 3)],
    hanging: [lm('stalactites', 5, 3.8, 3)],
    frame: ['crystals_tall', 'timber_prop'], arena: 'rock_pillar', every: 13, hangEvery: 16, light: [0.5, 0.72, 1],
  },
  spire: {
    landmarks: [lm('bell_frame', 3.6, 4.8, 3), lm('pinnacle_stone', 2, 5.6, 3), lm('broken_arcade', 5, 4.2, 2), lm('tower_stub', 3, 5.8, 2), lm('banner_pole', 2.2, 5.6, 3), lm('buttress_stub', 3.4, 3.6, 1)],
    ground: [lm('stone_blocks', 3.6, 1.2, 3), lm('rope_coil', 2, 1.4, 2)],
    hanging: [lm('banners', 4, 3.6, 3)],
    frame: ['banner_pole', 'pinnacle_stone'], arena: 'tower_stub', every: 12, hangEvery: 18, light: [1, 0.82, 0.55],
  },
  foundry: {
    landmarks: [lm('chimney_stub', 3.2, 5.2, 2), lm('tank_drum', 3.2, 4.2, 2), lm('pipe_stand', 3.2, 4.6, 3), lm('girder_post', 3.4, 5.6, 3), lm('gear_half', 3.6, 1.8, 2), lm('furnace_mouth', 3.6, 2.8, 2)],
    ground: [lm('scrap_pile', 3, 1.6, 3), lm('slag_mound', 2.4, 1, 2)],
    hanging: [lm('chains', 4, 3.8, 3)],
    frame: ['pipe_stand', 'furnace_mouth'], arena: 'girder_post', every: 13, hangEvery: 14, light: [1, 0.58, 0.3],
  },
  heart: {
    landmarks: [lm('rib_arch', 4, 4.4, 3), lm('crystal_spire', 3.2, 4.8, 3), lm('cyst_pod', 2, 3.4, 2), lm('vein_column', 2, 5.6, 2)],
    ground: [lm('bone_shards', 2, 2, 3), lm('crystals_violet', 2, 1.6, 2)],
    hanging: [lm('veins', 4, 3.8, 3)],
    frame: ['cyst_pod', 'crystal_spire'], arena: 'rib_arch', every: 12, hangEvery: 15, light: [0.78, 0.55, 1],
  },
};

/** The pack that holds a piece of a zone's kit, and its sprites. */
export const packOf = (zone: ZoneId, p: KitPiece): string => p.pack ?? `zone-${zone}`;
export const spritesOf = (p: KitPiece): readonly string[] => p.sprites ?? [`${p.kind}_a`, `${p.kind}_b`];

/** A placement and where it goes: the pack that holds its sprite, and the layer. */
export interface Put extends Placement {
  pack: string;
  layer: SceneLayer;
}

export interface ZonePlan {
  puts: Put[];
}

const byKind = (kit: Kit, kind: string): KitPiece => [...kit.landmarks, ...kit.ground, ...kit.hanging].find((p) => p.kind === kind)!;

/** The open ground of a room, left to right: the long stretches where something can stand. */
const stretches = (c: Ctx): Ctx['tops'] => c.tops.filter((s) => s.b - s.a >= 2.4).sort((a, b) => a.a - b.a || a.y - b.y);

/** Where the floor is under x, if there is open ground there. */
const floorAt = (c: Ctx, x: number): number | null => {
  const s = c.tops.find((t) => t.a + 0.2 <= x && t.b - 0.2 >= x);
  return s ? s.y : null;
};

export function plan(room: RoomDefinition): ZonePlan {
  const zone = zoneOf(room.id) as ZoneId;
  const kit = KITS[zone];
  const c = contextOf(room);
  const rng = new Rng(`${room.id}:zone`);
  const puts: Put[] = [];
  const taken: Array<[number, number]> = [];
  const free = (x0: number, x1: number): boolean => !taken.some(([a, b]) => x1 > a - 0.6 && x0 < b + 0.6);
  const put = (p: KitPiece, layer: SceneLayer, x: number, y: number, o: Partial<Placement> = {}): void => {
    const sprites = spritesOf(p);
    puts.push({ pack: packOf(zone, p), layer, sprite: sprites[Math.floor(rng.next() * sprites.length) % sprites.length]!, x: round2(x), y: round2(y), ...o });
  };

  // ---- what stands behind the walk: along each stretch of open ground, a piece every so many metres, never the same as the last two, and never where the hero comes in, something is to be taken or a guardian is fought
  const recent: string[] = [];
  let count = 0;
  for (const s of stretches(c)) {
    if (s.b - s.a < 5) continue;
    let x = s.a + rng.range(1.8, 4.5);
    while (x < s.b - 2 && count < 9) {
      const p = choose(rng, kit.landmarks.map((k) => [k, recent.includes(k.kind) ? k.weight * 0.12 : k.weight] as const));
      const scale = round2(rng.range(0.92, 1.12));
      const half = (p.w * scale) / 2;
      const cx = Math.min(Math.max(x, s.a + half + 0.3), s.b - half - 0.3);
      if (isClear(c, cx, half) && !inArena(c, cx) && free(cx - half, cx + half) && cx - half >= s.a - 0.1 && cx + half <= s.b + 0.1) {
        put(p, 'propsBack', cx, s.y, { scale, flip: rng.chance(0.5) });
        taken.push([cx - half, cx + half]);
        recent.push(p.kind);
        if (recent.length > 2) recent.shift();
        count++;
        // a low thing at its foot, now and then
        if (rng.chance(0.4)) {
          const g = choose(rng, kit.ground.map((k) => [k, k.weight] as const));
          const gx = cx + (rng.chance(0.5) ? 1 : -1) * (half + g.w * 0.3);
          if (floorAt(c, gx) === s.y && isClear(c, gx, g.w / 2) && !inArena(c, gx)) put(g, 'terrain', gx, s.y, { scale: round2(rng.range(0.85, 1.15)), flip: rng.chance(0.5) });
        }
      }
      x = cx + half + kit.every * rng.range(0.55, 1.35);
    }
  }

  // ---- what lies on the open ground: low things, scattered, never where the way in or something to take is
  for (const s of c.tops) {
    for (let x = s.a + rng.range(0.6, 1.8); x < s.b - 0.6; x += rng.range(2.8, 6.5)) {
      if (!isClear(c, x) || inArena(c, x) || rng.chance(0.45)) continue;
      const g = choose(rng, kit.ground.map((k) => [k, k.weight] as const));
      put(g, 'terrain', x, s.y, { scale: round2(rng.range(0.85, 1.2)), flip: rng.chance(0.5) });
    }
  }

  // ---- a shrine is a place: the zone's pair of pieces on either side of it
  for (const i of room.interactables ?? []) {
    if (i.kind !== 'rest') continue;
    for (const side of [-1, 1]) {
      const x = i.x + side * 3.6;
      const y = floorAt(c, x);
      const p = byKind(kit, kit.frame[side === -1 ? 0 : 1] ?? kit.frame[0]!);
      if (y !== null && y === floorAt(c, i.x) && !inArena(c, x) && free(x - p.w / 2, x + p.w / 2)) {
        put(p, 'propsBack', x, y, { scale: 1, flip: side === 1 });
        taken.push([x - p.w / 2, x + p.w / 2]);
      }
    }
  }

  // ---- the arena shows what has been fought in it: the zone's big piece at each door, a low thing at its foot
  if (c.arena) {
    const big = byKind(kit, kit.arena);
    for (const [x, flip] of [[c.arena.x0 + 1.6, false], [c.arena.x1 - 1.6, true]] as const) {
      const y = floorAt(c, x);
      if (y === null) continue;
      put(big, 'propsBack', x, y, { scale: 1.12, flip });
      const g = choose(rng, kit.ground.map((k) => [k, k.weight] as const));
      put(g, 'terrain', x + (flip ? -1 : 1) * 1.8, y, { scale: 1.05, flip });
    }
  }

  // ---- what hangs in front of the camera: one every so many metres of the room, from above the highest view the camera can have, so the flat top of the picture never shows
  const width = c.x1 - c.x0;
  const n = Math.max(2, Math.round(width / kit.hangEvery));
  for (let i = 0; i < n; i++) {
    const p = choose(rng, kit.hanging.map((k) => [k, k.weight] as const));
    const scale = round2(rng.range(1, 1.45));
    const ref = c.x0 + ((i + 0.5) / n) * width;
    put(p, 'foreground', 1.2 * ref + rng.range(-3, 3), foregroundTop(room) - p.h * scale + rng.range(0, 0.7), { scale, flip: rng.chance(0.5) });
  }
  return { puts };
}

/** The scene of a pack for a room: the placements of the plan that are the pack's. */
export function sceneFor(room: RoomDefinition, packId: string): RoomScene {
  const layers: Layers = {};
  for (const p of plan(room).puts) {
    if (p.pack !== packId) continue;
    const { pack: _pack, layer, ...placement } = p;
    (layers[layer] ??= []).push(placement);
  }
  return sceneOf(room, layers);
}

/** The glow pieces are 4 m across (128 px at 32 px/m). */
const GLOW_M = 4;

/** The light of a zone: beams in the dark behind the walk, mist over the ground, dust in the air and a glow under whatever shines — in the colour of the zone. */
export function lightOf(room: RoomDefinition): RoomScene {
  const c = contextOf(room);
  const rng = new Rng(`${room.id}:light`);
  const layers: Layers = {};
  const put = (layer: SceneLayer, p: Placement): void => void (layers[layer] ??= []).push(p);
  const width = c.x1 - c.x0;
  const beams = Math.max(1, Math.round(width / 40));
  for (let i = 0; i < beams; i++) put('backdropMid', { sprite: i % 2 === 0 ? 'beam_a' : 'beam_b', x: round2(0.4 * (c.x0 + ((i + 0.5) / beams) * width)), y: round2(0.4 * c.floor - 3), alpha: round2(rng.range(0.26, 0.38)), flip: i % 2 === 1 });
  for (const s of c.tops.filter((t) => t.b - t.a >= 8 && t.y <= c.floor + 0.01)) {
    const n = Math.max(1, Math.floor((s.b - s.a) / 40));
    for (let i = 0; i < n; i++) put('lightOverlay', { sprite: 'mist_bank', x: round2(s.a + ((i + 0.5) / n) * (s.b - s.a)), y: round2(s.y - 0.2), alpha: round2(rng.range(0.12, 0.2)), scale: 0.6, motion: 'drift', flip: rng.chance(0.5) });
  }
  scatterMotes(layers, new Rng(`${room.id}:motes`), { id: room.id, solids: room.solids, camera: { bounds: { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 } } }, { every: 21, yBottom: round2(c.floor - 1.5), alpha: [0.2, 0.34], scale: [0.85, 1.2], tints: [0xffffff], ...(c.arena ? { avoid: [[c.arena.x0, c.arena.x1]] as const } : {}) });
  // `scatterMotes` names the ruins' piece: in a zone it is the zone's own
  for (const p of layers.lightOverlay ?? []) if (p.sprite === 'motes_a') p.sprite = 'motes_zone';
  const centred = (sprite: string, x: number, yMid: number, k: number, o: Partial<Placement> = {}): void => put('lightOverlay', { sprite, x: round2(x), y: round2(yMid - (GLOW_M * k) / 2), scale: k, ...o });
  for (const i of room.interactables ?? []) {
    if (i.kind === 'rest') centred('glow_rest', i.x, i.y + 1.1, 1.1, { alpha: 0.34, motion: 'pulse' });
    else if (i.kind === 'pickup') centred('glow_zone', i.x, i.y + 0.7, 0.7, { alpha: 0.4, motion: 'pulse' });
    else if (i.kind === 'activate') centred('glow_rest', i.x, i.y + 0.7, 0.4, { alpha: 0.32, motion: 'pulse' });
  }
  for (const b of room.bosses ?? []) centred('glow_boss', b.x, b.y + 1.6, 1.4, { alpha: 0.16, motion: 'pulse' });
  return sceneOf(room, layers);
}

/** The rooms of a zone, in the order of the world. */
export const roomsOfZone = (zone: ZoneId): string[] => WORLD.rooms.filter((id) => zoneOf(id) === zone);

/** The scene of a zone's own pack for a room: its pieces and its light, in one file. */
export function zoneSceneOf(room: RoomDefinition, packId: string): RoomScene {
  const a = sceneFor(room, packId);
  const b = lightOf(room);
  const layers: Layers = { ...a.layers };
  for (const [layer, list] of Object.entries(b.layers)) layers[layer as SceneLayer] = [...(layers[layer as SceneLayer] ?? []), ...(list ?? [])];
  return sceneOf(room, layers);
}

/** A scene per room of a zone, for one of its packs. */
export const zoneScenes = (zone: ZoneId, make: (room: RoomDefinition) => RoomScene): Record<string, () => RoomScene> => Object.fromEntries(roomsOfZone(zone).map((id) => [id, () => make(ROOMS[id]!)]));
