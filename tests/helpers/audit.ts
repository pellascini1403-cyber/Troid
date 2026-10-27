import { ABILITIES } from '@/content/abilities';
import { BOSSES, ENEMIES } from '@/content/enemies';
import { PLAYER } from '@/content/player';
import { BOTTLE_DEFINITIONS, CARDS } from '@/content/resources';
import type { Rect } from '@/core/math';
import { abilityFlag, needsOf } from '@/world/worldGraph';
import { pictureOf } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { validateRoom, type RoomIssue } from '@/world/validateRoom';
import { abilitySet, RoomPhysics, START_ABILITIES, type Reach } from './reach';

/**
 * THE AUDIT OF A ROOM (docs/PROMPT21-LOG.md): what every room of the world has to be, asked of the room itself and of the real controller.
 *
 *  - It is SOUND: the validator finds nothing wrong with it (references, floors under what stands on them, entrances that are not in a wall).
 *  - It can be CROSSED: from every entrance, the hero reaches every way out and every thing to pick up or rest at, with the dash and the abilities the room says it asks for (`needs`) — and with nothing more.
 *  - What it asks for is REALLY asked: without any one of the abilities of a claim, there is an entrance from which the target cannot be reached. A claim that is not tight is a gate that is not one.
 *
 * Every door and every breakable wall is taken as gone (`RoomPhysics(room, 'open')`): what they hold is a matter of flags, proved on paper by the world and by the breakables' own tests; this is the question of the TERRAIN.
 */
export const REFS = {
  enemies: ENEMIES,
  bosses: BOSSES,
  player: { halfWidth: PLAYER.body.halfWidth, height: PLAYER.body.height },
  cards: new Set(Object.keys(CARDS)),
  bottles: new Set(Object.keys(BOTTLE_DEFINITIONS)),
  abilities: new Set(ABILITIES.map((a) => a.id)),
  // what a room may wait for that another room hands out: an ability (`ability:<id>`) and the card of the Spirit Bolt
  externalFlags: new Set([...ABILITIES.map((a) => abilityFlag(a.id)), 'taken:card_spirit_bolt']),
} as const;

/** Something the hero has to be able to get to: a way out, or a thing to take or to rest at. */
export interface Target {
  /** `exit:<id>`, `item:<id>` or `boss:<id>`. */
  id: string;
  /** What it asks of the hero beyond the dash. */
  claim: readonly string[];
  /** Where the feet have to be for an item (x, y); the zone to touch for an exit. */
  at?: { x: number; y: number };
  zone?: Rect;
}

export function targetsOf(room: RoomDefinition): Target[] {
  const out: Target[] = [];
  for (const x of room.exits ?? []) if (x.to || x.end) out.push({ id: `exit:${x.id}`, claim: needsOf(room, `exit:${x.id}`), zone: x.rect });
  for (const i of room.interactables ?? []) out.push({ id: `item:${i.id}`, claim: needsOf(room, `item:${i.id}`), at: { x: i.x, y: i.y } });
  for (const b of room.bosses ?? []) out.push({ id: `boss:${b.id}`, claim: needsOf(room, `boss:${b.id}`), at: { x: b.x, y: b.y } });
  return out;
}

const key = (has: ReadonlySet<string>): string => [...has].sort().join(',');

export interface Audit {
  room: string;
  issues: RoomIssue[];
  /** The things the room cannot be crossed to (an entrance that cannot reach a target with what it asks). */
  unreachable: string[];
  /** The claims that are not tight: an ability the target does NOT need. */
  loose: string[];
  /** For each target, the entrances it can be reached from with the dash alone (the room's free parts). */
  free: Record<string, string[]>;
}

/** How high above a floor the head of a hero who jumps reaches (a full jump is 3.1 m; this leaves a margin), beyond the standing body. */
const JUMP_REACH = 2.9;

/**
 * Does a hero standing on the reached places get to this target? A thing to take is reached when they can stand beside it; a way out in a wall, when they can stand in its zone. A way out that is a hole in the floor is reached by WALKING
 * OFF an edge into it (the zone lies under every place to stand), and one in the roof by jumping into it from a place below it with nothing in between: neither is somewhere a hero stands, so the solver's `touches` cannot see them.
 */
function reaches(phys: RoomPhysics, reach: Reach, t: Target): boolean {
  if (t.at) return phys.standsNear(reach, t.at.x, t.at.y, 1.6);
  const z = t.zone;
  if (!z) return false;
  if (phys.touches(reach, z)) return true;
  const half = PLAYER.body.halfWidth;
  for (const i of reach.surfaces) {
    const s = phys.surfaces[i]!;
    const a = Math.max(s.x0 - half, z.x0);
    const b = Math.min(s.x1 + half, z.x1);
    if (b - a < 0.05) continue;
    if (s.y >= z.y1 - 1e-6) {
      // a hole under the surface: the column from the zone up to the floor is empty
      if (!phys.world.overlapsSolid({ x0: a + 0.02, x1: b - 0.02, y0: z.y1, y1: s.y - 0.02 })) return true;
    } else if (s.y + PLAYER.body.height + JUMP_REACH >= z.y0 && z.y0 > s.y + PLAYER.body.height) {
      // an opening above: the column from the head up to the zone is empty, and a jump gets there
      if (!phys.world.overlapsSolid({ x0: a + 0.02, x1: b - 0.02, y0: s.y + PLAYER.body.height + 0.02, y1: z.y0 })) return true;
    }
  }
  return false;
}

export interface AuditOptions {
  /** Flags that other rooms of the zone set (a lever, a boss's defeat): what a gate or a seal of this room may wait for. */
  flags?: Iterable<string>;
  /**
   * Directions the room only goes one way WITHOUT what it hands out: from this entrance the target cannot be reached with the dash alone, because the hero who is at that entrance has the ability already (the pit of the Echo Chamber is crossed to
   * come back, but the hero who comes back has the Double Jump they took on the way). Each one is checked to be true: a one-way that is not one is an error.
   */
  oneWay?: ReadonlyArray<{ from: string; target: string }>;
  /** The abilities the hero has when they come to this room beyond the dash (the air dash after the Warden, and so on): a claim is tight against THEM, not against the dash alone. */
  held?: readonly string[];
}

export function auditRoom(room: RoomDefinition, opts: AuditOptions = {}): Audit {
  const refs = { ...REFS, externalFlags: new Set([...REFS.externalFlags, ...(opts.flags ?? [])]) };
  const issues = validateRoom(room, refs);
  const phys = new RoomPhysics(room, 'open');
  const targets = targetsOf(room);
  const cache = new Map<string, Reach>();
  const reachOf = (entry: string, has: ReadonlySet<string>, dense = false): Reach => {
    const k = `${entry}|${key(has)}|${dense}`;
    let r = cache.get(k);
    if (!r) {
      r = phys.reachFrom(phys.entrySurface(entry), has, undefined, { dense });
      cache.set(k, r);
    }
    return r;
  };
  // what the hero has when they get to this room: the start kit and what the zones before it handed out
  const held = [...START_ABILITIES, ...(opts.held ?? [])];
  const exempt = new Map((opts.oneWay ?? []).map((o) => [`${o.from}|${o.target}`, false]));
  const unreachable: string[] = [];
  const loose: string[] = [];
  const free: Record<string, string[]> = {};
  for (const t of targets) {
    const has = abilitySet(...START_ABILITIES, ...t.claim);
    free[t.id] = [];
    for (const e of room.entries) {
      const dashOnly = reaches(phys, reachOf(e.id, START_ABILITIES), t);
      if (dashOnly) free[t.id]!.push(e.id);
      const k = `${e.id}|${t.id}`;
      if (exempt.has(k)) {
        // a one-way must be one: the dash alone does not get there. Whatever the exemption forgives, it forgives only what it names.
        if (dashOnly) issues.push({ room: room.id, code: 'one-way-false', message: `[${room.id}] ${e.id} → ${t.id} is declared one-way, but the dash alone gets there` });
        exempt.set(k, true);
        continue;
      }
      if (!reaches(phys, reachOf(e.id, has), t)) unreachable.push(`${e.id} → ${t.id} with ${[...has].join('+')}`);
    }
    // a claim is tight when, without any one of its abilities — but with everything else the hero has by now, and with the practised hero's whole bag of tricks — SOME entrance cannot get there
    for (const a of t.claim) {
      const without = abilitySet(...held, ...t.claim.filter((c) => c !== a));
      without.delete(a);
      if (room.entries.every((e) => reaches(phys, reachOf(e.id, without, true), t))) loose.push(`${t.id}: ${a} is not needed`);
    }
  }
  for (const [k, used] of exempt) if (!used) issues.push({ room: room.id, code: 'one-way-unknown', message: `[${room.id}] the one-way ${k.replace('|', ' → ')} names an entrance or a target the room does not have` });
  return { room: room.id, issues, unreachable, loose, free };
}

/** The room as letters, with what is placed on it: `e` entrances, `X` ways out, `!` things to take, `S` shrines, `~` seals, `B` bosses, and the first letter of each enemy (lower case), over the solids, platforms and spikes. For reading and for tests. */
export function dumpRoom(room: RoomDefinition): string {
  const g = room.camera?.bounds ?? room.bounds;
  const marks: Array<{ x: number; y: number; ch: string }> = [];
  for (const e of room.entries) marks.push({ x: e.x, y: e.y, ch: 'e' });
  for (const i of room.interactables ?? []) marks.push({ x: i.x, y: i.y, ch: i.kind === 'rest' ? 'S' : i.kind === 'pickup' ? '!' : 'L' });
  for (const s of room.seals ?? []) marks.push({ x: s.x, y: s.y, ch: '~' });
  for (const b of room.bosses ?? []) marks.push({ x: b.x, y: b.y, ch: 'B' });
  for (const s of room.spawns ?? []) marks.push({ x: s.x, y: s.y, ch: s.enemy.replace(/^[a-z]+_/, '')[0] ?? 'm' });
  const pic = pictureOf(room, marks);
  for (const x of room.exits ?? []) {
    // the zone of a way out, on the picture: its middle row marked with `X` where nothing else is
    const row = Math.round(g.y1 - (x.rect.y0 + 0.5)) - 1;
    for (let c = Math.floor(x.rect.x0 - g.x0 + 1e-6); c < Math.ceil(x.rect.x1 - g.x0 - 1e-6); c++) {
      const line = pic[row];
      if (line !== undefined && line[c] === '.') pic[row] = line.slice(0, c) + 'X' + line.slice(c + 1);
    }
  }
  return pic.join('\n');
}

// ------------------------------------------------------------------------------------------------------------------------------- arriving safely

interface Engage {
  /** How far across (m) the creature takes notice, with a metre to spare for the stretch it wanders. */
  range: number;
  /** How far above or below (m) it still does. */
  height: number;
  /** A bat wakes only for someone BELOW it. */
  below?: boolean;
}

/** From how far, and how high, a creature takes notice of someone (the numbers its brain reads), or `null` for one that does not take notice (it is a hazard of its own spot). */
function engageOf(archetype: string, params: Record<string, number>): Engage | null {
  const patrol = 1; // a metre of margin: the creature wanders a little around its post
  switch (archetype) {
    case 'crawler':
    case 'toad':
    case 'guard':
    case 'roller':
    case 'weaver':
      return { range: (params['detectRange'] ?? 0) + patrol, height: params['detectHeight'] ?? 0 };
    case 'spitter':
      return { range: (params['detectRange'] ?? 0) + patrol, height: params['detectHeight'] ?? 0 };
    case 'shade':
    case 'piston':
      return { range: params['detectRange'] ?? 0, height: params['detectHeight'] ?? 0 };
    case 'toller':
      return { range: params['range'] ?? 0, height: params['height'] ?? 0 };
    case 'wisp':
      return { range: params['chaseRange'] ?? 0, height: params['chaseHeight'] ?? 0 };
    case 'spore':
      return { range: params['triggerRange'] ?? 0, height: params['triggerHeight'] ?? 0 };
    case 'leech':
      return { range: (params['ambushRange'] ?? 0) + 1, height: params['ambushHeight'] ?? 0 };
    case 'bat':
      return { range: params['wakeRange'] ?? 0, height: params['wakeHeight'] ?? 0, below: true };
    default:
      return null;
  }
}

/**
 * Who would notice the hero the moment they ARRIVE: an entrance (where a door puts them, where a shrine brings them back after a defeat) must not be somewhere a creature already sees. A hero who comes through a door and is struck before they can read the room
 * has been cheated of the telegraph every blow of the game is built around. Returns one line for each entrance and creature that fail.
 */
export function unsafeArrivals(room: RoomDefinition): string[] {
  const out: string[] = [];
  for (const sp of room.spawns ?? []) {
    const def = ENEMIES[sp.enemy];
    if (!def) continue;
    const params = (def.ai as unknown as { params?: Record<string, number> }).params ?? {};
    const e = engageOf(def.ai.archetype, params);
    if (!e) continue;
    // a keeper behind which a door stands (it opens when the keeper falls) is dead before anyone arrives on the other side
    const gate = sp.defeatFlag ? (room.gates ?? []).find((g) => g.openWhen === sp.defeatFlag) : undefined;
    const door = gate ? room.solids.find((s) => s.id === gate.solid) : undefined;
    for (const en of room.entries) {
      if (door && (sp.x - door.rect.x0) * (en.x - door.rect.x0) < 0) continue;
      const dx = Math.abs(en.x - sp.x);
      const dy = en.y - sp.y;
      const sees = e.below ? dy <= 0.5 && -dy <= e.height : Math.abs(dy) <= e.height;
      if (dx <= e.range && sees) out.push(`${en.id} is ${dx.toFixed(1)} m from ${sp.id} (${sp.enemy}), which takes notice from ${e.range.toFixed(1)} m`);
    }
  }
  return out;
}
