import { overlaps, type Rect } from '@/core/math';
import type { Destination, RoomDefinition } from './RoomDefinition';
import type { WorldDefinition } from './WorldDefinition';

/**
 * The graph of a world and the proof that it can be finished (docs/PROMPT6-LOG.md S22). Pure functions over DATA: the world
 * lists its rooms, each room lists its exits, each exit names a room and one of its entries. From that this module builds the
 * graph, validates every reference, and plays the world on paper: starting from the first room it follows every exit that the
 * flags collected so far allow, collecting the flags that guardians and pickups hand out, until nothing new opens up. A room
 * that is never reached, a door whose flag nothing sets, a room with no way back are all found here, with the thing named,
 * instead of in the middle of a playthrough.
 */

export type RoomRegistry = Readonly<Record<string, RoomDefinition>>;

/** One way from a room to another: the exit that is touched and the entry the player appears at. */
export interface WorldEdge {
  from: string;
  exit: string;
  to: Destination;
  /** The flag that has to be set before the exit works. */
  requires?: string;
}

/** What a room asks of the player and gives back, as the graph sees it. */
export interface WorldRoom {
  id: string;
  entries: readonly string[];
  exits: readonly string[];
  /** Flags that something in the room waits for: an exit's `requires`, a gate's `openWhen`, an interactable's `whenSet`. */
  requires: readonly string[];
  /** Flags the room can set: a guardian's defeat, a lever, a pickup. */
  grants: readonly string[];
}

export interface WorldGraph {
  id: string;
  start: Destination;
  rooms: ReadonlyMap<string, WorldRoom>;
  edges: readonly WorldEdge[];
}

export interface Progression {
  /** The rooms the player can reach, in the order they open up. */
  order: readonly string[];
  /** Every flag that can end up set. */
  flags: ReadonlySet<string>;
  /** The rooms of the world that are never reached. */
  unreachable: readonly string[];
}

export interface WorldIssue {
  world: string;
  /** Stable machine-readable id of the rule that failed. */
  code: string;
  message: string;
}

export interface WorldRefs {
  /** The player's standing body (default 0.35 × 1.7 m): an entry must not drop it inside a way out. */
  player?: { halfWidth: number; height: number };
}

/** The flags a room can set. */
export function grantedFlags(room: RoomDefinition): string[] {
  const out = new Set<string>();
  for (const s of room.spawns ?? []) if (s.defeatFlag) out.add(s.defeatFlag);
  for (const i of room.interactables ?? []) for (const a of i.actions) if (a.type === 'setFlag') out.add(a.flag);
  return [...out];
}

/** The flags something in a room waits for. */
export function requiredFlags(room: RoomDefinition): string[] {
  const out = new Set<string>();
  for (const x of room.exits ?? []) if (x.requires) out.add(x.requires);
  for (const g of room.gates ?? []) if (g.openWhen) out.add(g.openWhen);
  for (const i of room.interactables ?? []) if (i.whenSet) out.add(i.whenSet);
  return [...out];
}

/** Every flag any room of the world can set: what a gate may open with (the `externalFlags` of `validateRoom`). */
export function worldGrantedFlags(world: WorldDefinition, rooms: RoomRegistry): Set<string> {
  const out = new Set<string>();
  for (const id of world.rooms) {
    const room = rooms[id];
    if (room) for (const f of grantedFlags(room)) out.add(f);
  }
  return out;
}

/** Builds the graph. Lenient on purpose: a room the registry does not have is left out (`validateWorld` is what reports it). */
export function buildWorldGraph(world: WorldDefinition, rooms: RoomRegistry): WorldGraph {
  const nodes = new Map<string, WorldRoom>();
  const edges: WorldEdge[] = [];
  for (const id of world.rooms) {
    const room = rooms[id];
    if (!room || nodes.has(id)) continue;
    nodes.set(id, {
      id,
      entries: room.entries.map((e) => e.id),
      exits: (room.exits ?? []).map((x) => x.id),
      requires: requiredFlags(room),
      grants: grantedFlags(room),
    });
    for (const x of room.exits ?? []) if (x.to) edges.push({ from: id, exit: x.id, to: x.to, ...(x.requires ? { requires: x.requires } : {}) });
  }
  return { id: world.id, start: world.start, rooms: nodes, edges };
}

export function edgesFrom(graph: WorldGraph, roomId: string): WorldEdge[] {
  return graph.edges.filter((e) => e.from === roomId);
}

export function edgesTo(graph: WorldGraph, roomId: string): WorldEdge[] {
  return graph.edges.filter((e) => e.to.room === roomId);
}

/** Where an exit leads (undefined: it does not exist or leads out of the world). */
export function destinationOf(graph: WorldGraph, roomId: string, exitId: string): Destination | undefined {
  return graph.edges.find((e) => e.from === roomId && e.exit === exitId)?.to;
}

/**
 * Plays the world on paper. From the first room: every flag a reachable room can hand out (a guardian that can be beaten, a
 * pickup that can be taken once its own flag condition holds) is collected, and every exit whose `requires` is collected opens
 * its destination. It repeats until nothing changes, so the order of the rooms in the data does not matter.
 */
export function analyzeProgression(graph: WorldGraph, rooms: RoomRegistry, startFlags: Iterable<string> = []): Progression {
  const flags = new Set(startFlags);
  const reached = new Set<string>();
  const order: string[] = [];
  let changed = true;
  const open = (id: string): void => {
    if (reached.has(id) || !graph.rooms.has(id)) return;
    reached.add(id);
    order.push(id);
    changed = true;
  };
  open(graph.start.room);
  while (changed) {
    changed = false;
    for (const id of [...reached]) {
      const room = rooms[id];
      if (!room) continue;
      for (const s of room.spawns ?? []) {
        if (s.defeatFlag && !flags.has(s.defeatFlag)) {
          flags.add(s.defeatFlag);
          changed = true;
        }
      }
      for (const i of room.interactables ?? []) {
        if (i.whenSet !== undefined && !flags.has(i.whenSet)) continue;
        for (const a of i.actions) {
          if (a.type === 'setFlag' && !flags.has(a.flag)) {
            flags.add(a.flag);
            changed = true;
          }
        }
      }
    }
    for (const e of graph.edges) if (reached.has(e.from) && (!e.requires || flags.has(e.requires))) open(e.to.room);
  }
  return { order, flags, unreachable: [...graph.rooms.keys()].filter((id) => !reached.has(id)) };
}

/** The rooms to cross to go from one room to another with every flag collected: the shortest way, both ends included (empty: no way). */
export function routeBetween(graph: WorldGraph, from: string, to: string, flags: ReadonlySet<string>): string[] {
  if (!graph.rooms.has(from) || !graph.rooms.has(to)) return [];
  const previous = new Map<string, string>();
  const queue = [from];
  const seen = new Set([from]);
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!;
    if (at === to) break;
    for (const e of edgesFrom(graph, at)) {
      if ((e.requires && !flags.has(e.requires)) || seen.has(e.to.room) || !graph.rooms.has(e.to.room)) continue;
      seen.add(e.to.room);
      previous.set(e.to.room, at);
      queue.push(e.to.room);
    }
  }
  if (!seen.has(to)) return [];
  const route = [to];
  while (route[0] !== from) route.unshift(previous.get(route[0]!)!);
  return route;
}

/** Everything that can be wrong with a world: dangling references, entries buried in a way out, rooms that cannot be reached or left. */
export function validateWorld(world: WorldDefinition, rooms: RoomRegistry, refs: WorldRefs = {}): WorldIssue[] {
  const issues: WorldIssue[] = [];
  const add = (code: string, message: string): void => {
    issues.push({ world: world.id, code, message: `[${world.id}] ${message}` });
  };
  const player = refs.player ?? { halfWidth: 0.35, height: 1.7 };

  if (world.rooms.length === 0) add('world-empty', 'the world has no rooms');
  const listed = new Set<string>();
  for (const id of world.rooms) {
    if (listed.has(id)) add('world-room-duplicate', `room "${id}" is listed twice`);
    listed.add(id);
    if (!rooms[id]) add('world-room-unknown', `room "${id}" is not in the registry`);
  }

  const startRoom = rooms[world.start.room];
  if (!listed.has(world.start.room) || !startRoom) add('start-room', `the world starts in "${world.start.room}", which is not one of its rooms`);
  else if (!startRoom.entries.some((e) => e.id === world.start.entry)) add('start-entry', `the world starts at "${world.start.room}:${world.start.entry}", an entry the room does not have`);

  const bodyAt = (x: number, y: number): Rect => ({ x0: x - player.halfWidth + 1e-6, x1: x + player.halfWidth - 1e-6, y0: y + 1e-6, y1: y + player.height - 1e-6 });
  for (const id of listed) {
    const room = rooms[id];
    if (!room) continue;
    for (const x of room.exits ?? []) {
      const where = `${id}/${x.id}`;
      if (x.to && x.end) add('exit-both', `exit "${where}" leads somewhere and is also the end of the world`);
      else if (!x.to && !x.end) add('exit-no-destination', `exit "${where}" leads nowhere (it needs a destination, or to be the end of the world)`);
      if (x.requires === '') add('empty-flag', `exit "${where}" requires an empty flag`);
      if (!x.to) continue;
      const target = rooms[x.to.room];
      if (!listed.has(x.to.room) || !target) add('exit-room', `exit "${where}" leads to "${x.to.room}", which is not a room of the world`);
      else if (!target.entries.some((e) => e.id === x.to!.entry)) add('exit-entry', `exit "${where}" leads to "${x.to.room}:${x.to.entry}", an entry that room does not have`);
    }
    // arriving must not put the player inside a way out: it would be thrown straight back (a loop between two rooms)
    for (const e of room.entries) {
      const body = bodyAt(e.x, e.y);
      for (const x of room.exits ?? []) {
        if ((x.to || x.end) && overlaps(body, x.rect)) add('entry-in-exit', `entry "${id}:${e.id}" puts the player inside the exit "${x.id}"`);
      }
    }
  }

  // play the world on paper: every room reachable, every flag that something waits for obtainable, a way back from everywhere
  if (startRoom && listed.has(world.start.room)) {
    const graph = buildWorldGraph(world, rooms);
    const progress = analyzeProgression(graph, rooms);
    for (const id of progress.unreachable) add('room-unreachable', `room "${id}" cannot be reached from the start`);
    for (const id of progress.order) {
      const room = rooms[id]!;
      for (const f of requiredFlags(room)) {
        if (!progress.flags.has(f)) add('flag-ungranted', `"${id}" waits for the flag "${f}", which nothing the player can reach sets`);
      }
      if (id !== world.start.room && routeBetween(graph, id, world.start.room, progress.flags).length === 0) {
        add('room-trapped', `room "${id}" has no way back to the start`);
      }
    }
  }
  return issues;
}
