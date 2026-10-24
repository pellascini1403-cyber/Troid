import { clamp, type Rect } from '@/core/math';
import type { RoomDefinition } from './RoomDefinition';
import type { WorldDefinition } from './WorldDefinition';
import type { RoomRegistry } from './worldGraph';

/**
 * THE MAP OF THE WORLD (docs/PROMPT19-LOG.md), as pure functions over the data the world already is. There is no second description of the world to keep in step: the rooms, their extents, their solids, their exits
 * (and the room and flag each one leads to and asks for), their shrines, seals and guardians are the ones the game is built from, and what the player has DISCOVERED is what the game already counts and saves — the
 * rooms the hero has been in (`PlayStats.rooms`, `ProgressData.stats.rooms`) — plus the world's flags, which say which ways are open and which guardians have fallen.
 *
 * Two steps. `buildMapLayout` puts the rooms of a world on a plane, once: the first room at the origin and each neighbour against the side its door is on, the doors of the two rooms facing each other. `mapScene` says
 * what of that layout the player has earned: the rooms they have been in, the ways out of those rooms (a way whose other room is unknown ends in a stub), the places of interest of the rooms they know and the point
 * they stand on.
 *
 * Map units are metres of the world, +X to the right and +Y DOWN (the way a screen counts), whatever way the world counts up; each room keeps its own `extent` (the world's metres) so a point of the world can be
 * brought onto the map (`mapPoint`).
 */

export type MapSide = 'west' | 'east' | 'north' | 'south';

/** Metres of empty map between two rooms that face each other: room for the line of their connection and for the mark of a door. */
export const MAP_GAP = 10;
/** How far a way out whose other end is not on the map reaches past the wall (metres). */
export const STUB_LENGTH = 6;

/** A way out of a room, on the border of its box. */
export interface MapDoor {
  /** `room:exit`. */
  id: string;
  room: string;
  exit: string;
  side: MapSide;
  /** The middle of the door, on the border of its room (map units). */
  x: number;
  y: number;
  /** The room it leads to (`null`: out of the world as it stands — the end of the slice). */
  to: string | null;
  /** The world flag that has to be set before the way works. */
  requires: string | null;
  end: boolean;
}

/** What a place of interest is: a shrine to rest at, a ward that only a skill breaks, a guardian's arena. */
export type MapPoiKind = 'rest' | 'seal' | 'boss';

export interface MapPoi {
  /** `room:kind:id`. */
  id: string;
  kind: MapPoiKind;
  room: string;
  x: number;
  y: number;
  /** The arena of a guardian (map units); `null` for the others. */
  area: Rect | null;
  /** The world flag that says it is done: the ward is broken, the guardian has fallen. */
  doneFlag: string | null;
  /** The entry of the room the hero comes back to when they rest here. */
  entry: string | null;
}

/** A door of the room that a flag opens (the stone door of R1). Drawn shut until the flag is set. */
export interface MapGate {
  id: string;
  rect: Rect;
  openWhen: string | null;
}

export interface MapTerrain {
  rect: Rect;
  /** A platform that is jumped through. */
  oneWay: boolean;
}

export interface MapRoom {
  id: string;
  /** Working name (a fallback; the player reads `nameKey`). */
  name: string;
  nameKey: string | null;
  regionId: string;
  /** What of the room the map shows, in the world's metres (+Y up): what the camera may see of it. */
  extent: Rect;
  /** Where that is on the map. */
  rect: Rect;
  terrain: MapTerrain[];
  gates: MapGate[];
  doors: MapDoor[];
  pois: MapPoi[];
}

/** The connection between two doors that face each other. */
export interface MapLink {
  /** The two door ids, in alphabetical order, joined with `~`. */
  id: string;
  a: string;
  b: string;
}

export interface MapLayout {
  world: string;
  start: string;
  /** In the order they were placed (the first is the start). */
  rooms: ReadonlyMap<string, MapRoom>;
  links: readonly MapLink[];
  /** The box of every room together (map units). */
  bounds: Rect;
}

/** An exit this close to a side wall (metres), or closer, is a door in it. */
const SIDE_REACH = 6;
const OPPOSITE: Readonly<Record<MapSide, MapSide>> = { east: 'west', west: 'east', north: 'south', south: 'north' };

const extentOf = (room: RoomDefinition): Rect => room.camera?.bounds ?? room.bounds;
const widthOf = (r: Rect): number => r.x1 - r.x0;
const heightOf = (r: Rect): number => r.y1 - r.y0;
const centreOf = (r: Rect): { x: number; y: number } => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
const overlaps = (a: Rect, b: Rect, gap = 0): boolean => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;

/** The part of a rectangle that lies inside another (`null`: none of it). */
function clip(r: Rect, to: Rect): Rect | null {
  const x0 = Math.max(r.x0, to.x0);
  const y0 = Math.max(r.y0, to.y0);
  const x1 = Math.min(r.x1, to.x1);
  const y1 = Math.min(r.y1, to.y1);
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

/**
 * Which wall of the room a way out is in. The doors of a metroidvania are in its side walls, so an exit that reaches to within a few metres of one is in it — even where it stands on the floor, which is the
 * lowest line of the box too; one that is far from both (a shaft: in the middle of the roof or the floor) is in whichever of those is nearer.
 */
export function sideOfExit(exit: Rect, extent: Rect): MapSide {
  const east = Math.max(0, extent.x1 - exit.x1);
  const west = Math.max(0, exit.x0 - extent.x0);
  if (Math.min(east, west) <= Math.min(SIDE_REACH, widthOf(extent) * 0.2)) return east <= west ? 'east' : 'west';
  return Math.max(0, extent.y1 - exit.y1) <= Math.max(0, exit.y0 - extent.y0) ? 'north' : 'south';
}

/** A point of a room, in the world's metres, brought onto the map: inside its box whatever the point (a hero who has fallen into a pit stands on the floor of the map). */
export function mapPoint(room: Pick<MapRoom, 'extent' | 'rect'>, x: number, y: number): { x: number; y: number } {
  const e = room.extent;
  return { x: room.rect.x0 + clamp(x - e.x0, 0, widthOf(e)), y: room.rect.y0 + clamp(e.y1 - y, 0, heightOf(e)) };
}

/** A rectangle of a room, in the world's metres, brought onto the map (the caller clips it first). */
function mapRect(room: Pick<MapRoom, 'extent' | 'rect'>, r: Rect): Rect {
  const e = room.extent;
  return { x0: room.rect.x0 + (r.x0 - e.x0), x1: room.rect.x0 + (r.x1 - e.x0), y0: room.rect.y0 + (e.y1 - r.y1), y1: room.rect.y0 + (e.y1 - r.y0) };
}

/** Where a way out is on the wall of its room: along the wall, where the exit is. */
function doorPoint(room: Pick<MapRoom, 'extent' | 'rect'>, exit: Rect, side: MapSide): { x: number; y: number } {
  const p = mapPoint(room, centreOf(exit).x, centreOf(exit).y);
  switch (side) {
    case 'east':
      return { x: room.rect.x1, y: p.y };
    case 'west':
      return { x: room.rect.x0, y: p.y };
    case 'north':
      return { x: p.x, y: room.rect.y0 };
    default:
      return { x: p.x, y: room.rect.y1 };
  }
}

/** How far along its wall the door that comes back (the neighbour's own way out to this room) is, so that the two meet: from the top of the box for an east/west wall, from the left for a north/south one. */
function alongWall(neighbour: RoomDefinition, back: string, side: MapSide): number {
  const e = extentOf(neighbour);
  const exits = neighbour.exits ?? [];
  const door = exits.find((x) => x.to?.room === back && sideOfExit(x.rect, e) === side) ?? exits.find((x) => x.to?.room === back);
  if (door) {
    const c = centreOf(door.rect);
    return side === 'east' || side === 'west' ? clamp(e.y1 - c.y, 0, heightOf(e)) : clamp(c.x - e.x0, 0, widthOf(e));
  }
  return side === 'east' || side === 'west' ? heightOf(e) / 2 : widthOf(e) / 2;
}

/** Puts the box of a room against the side of another, the two doors in line; slides it along the wall (away from what is already there) until it is clear. */
function placeBeside(a: Rect, side: MapSide, door: { x: number; y: number }, b: { w: number; h: number; along: number }, taken: readonly Rect[]): Rect {
  const horizontal = side === 'east' || side === 'west';
  const at = (shift: number): Rect => {
    if (horizontal) {
      const x0 = side === 'east' ? a.x1 + MAP_GAP : a.x0 - MAP_GAP - b.w;
      const y0 = door.y - b.along + shift;
      return { x0, y0, x1: x0 + b.w, y1: y0 + b.h };
    }
    const y0 = side === 'south' ? a.y1 + MAP_GAP : a.y0 - MAP_GAP - b.h;
    const x0 = door.x - b.along + shift;
    return { x0, y0, x1: x0 + b.w, y1: y0 + b.h };
  };
  const step = (horizontal ? b.h : b.w) + MAP_GAP;
  for (let k = 0; k < 40; k++) {
    const shift = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * step;
    const candidate = at(shift);
    if (!taken.some((t) => overlaps(candidate, t, MAP_GAP / 2))) return candidate;
  }
  return at(0);
}

/**
 * Puts the world on a plane. The first room is at the origin; from there, in the order the doors are met, each room that a door leads to is set against the wall that door is in, with the door that leads back
 * level with it (so a corridor that is one room long is one line long, whatever the rooms); a room that would land on another slides along the wall until it is clear. A room no door reaches goes below the rest,
 * in a row. The same world always gives the same layout.
 */
export function buildMapLayout(world: WorldDefinition, registry: RoomRegistry): MapLayout {
  const defs = world.rooms.flatMap((id) => (registry[id] ? [registry[id] as RoomDefinition] : []));
  const byId = new Map(defs.map((r) => [r.id, r]));
  const boxes = new Map<string, Rect>();
  const order: string[] = [];
  const taken: Rect[] = [];

  const put = (id: string, rect: Rect): void => {
    boxes.set(id, rect);
    taken.push(rect);
    order.push(id);
  };
  const sizeOf = (r: RoomDefinition): { w: number; h: number } => ({ w: widthOf(extentOf(r)), h: heightOf(extentOf(r)) });

  const startId = byId.has(world.start.room) ? world.start.room : (defs[0]?.id ?? '');
  const first = byId.get(startId);
  if (first) {
    const s = sizeOf(first);
    put(startId, { x0: 0, y0: 0, x1: s.w, y1: s.h });
  }
  const queue = first ? [startId] : [];
  const grow = (): void => {
    while (queue.length > 0) {
      const aId = queue.shift() as string;
      const a = byId.get(aId) as RoomDefinition;
      const aBox = boxes.get(aId) as Rect;
      const aExtent = extentOf(a);
      for (const exit of a.exits ?? []) {
        const bId = exit.to?.room;
        const b = bId ? byId.get(bId) : undefined;
        if (!b || !bId || boxes.has(bId)) continue;
        const side = sideOfExit(exit.rect, aExtent);
        const door = doorPoint({ extent: aExtent, rect: aBox }, exit.rect, side);
        const s = sizeOf(b);
        put(bId, placeBeside(aBox, side, door, { ...s, along: alongWall(b, aId, OPPOSITE[side]) }, taken));
        queue.push(bId);
      }
    }
  };
  grow();
  // the rooms no door reaches: a row below everything else
  for (const r of defs) {
    if (boxes.has(r.id)) continue;
    const below = taken.length > 0 ? Math.max(...taken.map((t) => t.y1)) + MAP_GAP * 3 : 0;
    const s = sizeOf(r);
    put(r.id, { x0: 0, y0: below, x1: s.w, y1: below + s.h });
    queue.push(r.id);
    grow();
  }

  const rooms = new Map<string, MapRoom>();
  for (const id of order) {
    const def = byId.get(id) as RoomDefinition;
    const extent = extentOf(def);
    const place = { extent, rect: boxes.get(id) as Rect };
    const gateSolids = new Set((def.gates ?? []).map((g) => g.solid));
    const terrain: MapTerrain[] = [];
    for (const s of def.solids) {
      if (gateSolids.has(s.id)) continue;
      const c = clip(s.rect, extent);
      if (c) terrain.push({ rect: mapRect(place, c), oneWay: s.kind === 'oneway' });
    }
    const gates: MapGate[] = [];
    for (const g of def.gates ?? []) {
      const solid = def.solids.find((s) => s.id === g.solid);
      const c = solid ? clip(solid.rect, extent) : null;
      if (c) gates.push({ id: g.id, rect: mapRect(place, c), openWhen: g.openWhen ?? null });
    }
    const doors: MapDoor[] = (def.exits ?? []).map((x) => {
      const side = sideOfExit(x.rect, extent);
      const p = doorPoint(place, x.rect, side);
      const to = x.to && byId.has(x.to.room) ? x.to.room : null;
      return { id: `${id}:${x.id}`, room: id, exit: x.id, side, x: p.x, y: p.y, to, requires: x.requires ?? null, end: x.end === true };
    });
    const pois: MapPoi[] = [];
    for (const i of def.interactables ?? []) {
      const rest = i.kind === 'rest' ? i.actions.find((a) => a.type === 'checkpoint') : undefined;
      if (!rest || rest.type !== 'checkpoint') continue;
      const p = mapPoint(place, i.x, i.y);
      pois.push({ id: `${id}:rest:${i.id}`, kind: 'rest', room: id, x: p.x, y: p.y, area: null, doneFlag: null, entry: rest.entry });
    }
    for (const s of def.seals ?? []) {
      if (s.style === 'crack') continue; // split stone is a secret of the room, not a ward the map marks
      const p = mapPoint(place, s.x, s.y);
      pois.push({ id: `${id}:seal:${s.id}`, kind: 'seal', room: id, x: p.x, y: p.y, area: null, doneFlag: s.flag, entry: null });
    }
    for (const b of def.bosses ?? []) {
      const arena = clip(b.arena, extent);
      const area = arena ? mapRect(place, arena) : null;
      const p = area ? { x: (area.x0 + area.x1) / 2, y: (area.y0 + area.y1) / 2 } : mapPoint(place, b.x, b.y);
      pois.push({ id: `${id}:boss:${b.id}`, kind: 'boss', room: id, x: p.x, y: p.y, area, doneFlag: b.defeatFlag, entry: null });
    }
    rooms.set(id, { id, name: def.name, nameKey: def.nameKey ?? null, regionId: def.regionId, extent, rect: place.rect, terrain, gates, doors, pois });
  }

  // the connections: the two doors that lead to each other (a door whose room does not lead back is linked to nothing: it is a stub on the map)
  const links = new Map<string, MapLink>();
  for (const room of rooms.values()) {
    for (const door of room.doors) {
      const other = door.to ? rooms.get(door.to) : undefined;
      const back = other?.doors.find((d) => d.to === room.id);
      if (!back) continue;
      const [a, b] = door.id < back.id ? [door.id, back.id] : [back.id, door.id];
      links.set(`${a}~${b}`, { id: `${a}~${b}`, a, b });
    }
  }

  const boxList = [...rooms.values()].map((r) => r.rect);
  const bounds: Rect =
    boxList.length > 0
      ? { x0: Math.min(...boxList.map((r) => r.x0)), y0: Math.min(...boxList.map((r) => r.y0)), x1: Math.max(...boxList.map((r) => r.x1)), y1: Math.max(...boxList.map((r) => r.y1)) }
      : { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { world: world.id, start: startId, rooms, links: [...links.values()], bounds };
}

// ------------------------------------------------------------------------------------------------------ what the player has earned

/** What the map needs to know of the game right now. */
export interface MapInput {
  /** The rooms the hero has been in. */
  visited: readonly string[];
  /** Is a world flag set? */
  flag(name: string): boolean;
  /** The room the hero is in and where in it (the world's metres); `null` where it is not known. */
  room: string;
  hero: { x: number; y: number } | null;
  /** The shrine the hero comes back to after a defeat. */
  checkpoint: { room: string; entry: string } | null;
}

export type DoorState = 'open' | 'locked';

export interface SceneDoor extends MapDoor {
  state: DoorState;
  /** The room it leads to is on the map. */
  known: boolean;
}

export interface SceneGate extends MapGate {
  open: boolean;
}

export interface ScenePoi extends MapPoi {
  /** The ward is broken, the guardian has fallen. */
  done: boolean;
  /** The shrine the hero comes back to. */
  active: boolean;
}

export interface SceneRoom extends Omit<MapRoom, 'doors' | 'pois' | 'gates'> {
  doors: SceneDoor[];
  gates: SceneGate[];
  pois: ScenePoi[];
  current: boolean;
}

export interface SceneLink {
  id: string;
  /** The two ends (map units). */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Either door of it still asks for a flag that is not set. */
  locked: boolean;
}

export interface MapScene {
  rooms: SceneRoom[];
  links: SceneLink[];
  /** The zones with something discovered in them, each with the box of what is. */
  regions: Array<{ id: string; rect: Rect }>;
  current: string | null;
  hero: { room: string; x: number; y: number } | null;
  /** The box of everything to draw (rooms, the stubs of their doors, the hero); `null`: there is nothing to draw. */
  bounds: Rect | null;
  /** The rooms of the world the hero has been in, out of the rooms the world has. */
  discovered: number;
  total: number;
}

export const EMPTY_SCENE: Readonly<MapScene> = Object.freeze({ rooms: [], links: [], regions: [], current: null, hero: null, bounds: null, discovered: 0, total: 0 });

/**
 * What of the layout the player has earned: a room appears when the hero has been in it (the one they stand in always does); a way out appears with its room, shut while the flag it asks for is not set, and ends in
 * a stub where its other room is not on the map; the connection between two rooms appears when both are; a place of interest appears with its room and takes its state from the flags.
 */
export function mapScene(layout: MapLayout, input: MapInput): MapScene {
  const seen = new Set(input.visited);
  if (layout.rooms.has(input.room)) seen.add(input.room);
  const shown = [...layout.rooms.values()].filter((r) => seen.has(r.id));
  if (shown.length === 0) return { ...EMPTY_SCENE, total: layout.rooms.size };
  const onMap = new Set(shown.map((r) => r.id));
  const doorOf = new Map<string, MapDoor>();
  const rooms: SceneRoom[] = shown.map((r) => {
    for (const d of r.doors) doorOf.set(d.id, d);
    return {
      ...r,
      current: r.id === input.room,
      gates: r.gates.map((g) => ({ ...g, open: g.openWhen !== null && input.flag(g.openWhen) })),
      doors: r.doors.map((d) => ({ ...d, state: d.requires !== null && !input.flag(d.requires) ? 'locked' : 'open', known: d.to !== null && onMap.has(d.to) })),
      pois: r.pois.map((p) => ({ ...p, done: p.doneFlag !== null && input.flag(p.doneFlag), active: p.kind === 'rest' && input.checkpoint !== null && input.checkpoint.room === r.id && input.checkpoint.entry === p.entry })),
    };
  });

  const locked = (id: string): boolean => {
    const d = doorOf.get(id);
    return d !== undefined && d.requires !== null && !input.flag(d.requires);
  };
  const links: SceneLink[] = [];
  for (const l of layout.links) {
    const a = doorOf.get(l.a);
    const b = doorOf.get(l.b);
    if (!a || !b || !onMap.has(a.room) || !onMap.has(b.room)) continue;
    links.push({ id: l.id, ax: a.x, ay: a.y, bx: b.x, by: b.y, locked: locked(l.a) || locked(l.b) });
  }

  const here = layout.rooms.get(input.room);
  const hero = here && input.hero ? { room: here.id, ...mapPoint(here, input.hero.x, input.hero.y) } : null;

  const regions = new Map<string, Rect>();
  let box: Rect | null = null;
  const grow = (r: Rect): void => {
    box = box ? { x0: Math.min(box.x0, r.x0), y0: Math.min(box.y0, r.y0), x1: Math.max(box.x1, r.x1), y1: Math.max(box.y1, r.y1) } : { ...r };
  };
  for (const r of rooms) {
    const prior = regions.get(r.regionId);
    regions.set(r.regionId, prior ? { x0: Math.min(prior.x0, r.rect.x0), y0: Math.min(prior.y0, r.rect.y0), x1: Math.max(prior.x1, r.rect.x1), y1: Math.max(prior.y1, r.rect.y1) } : { ...r.rect });
    grow(r.rect);
    for (const d of r.doors) {
      if (d.known) continue;
      // a way that leads nowhere known reaches out of the wall as a stub
      const out = d.side === 'east' ? { x: d.x + STUB_LENGTH, y: d.y } : d.side === 'west' ? { x: d.x - STUB_LENGTH, y: d.y } : d.side === 'north' ? { x: d.x, y: d.y - STUB_LENGTH } : { x: d.x, y: d.y + STUB_LENGTH };
      grow({ x0: Math.min(d.x, out.x), y0: Math.min(d.y, out.y), x1: Math.max(d.x, out.x), y1: Math.max(d.y, out.y) });
    }
  }
  return {
    rooms,
    links,
    regions: [...regions].map(([id, rect]) => ({ id, rect })),
    current: here?.id ?? null,
    hero,
    bounds: box,
    discovered: shown.length,
    total: layout.rooms.size,
  };
}
