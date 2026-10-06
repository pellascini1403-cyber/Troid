import { overlaps, type Rect } from '@/core/math';
import { MAX_INTERACT_LOCK } from '@/interaction/Interactable';
import type { RoomDefinition } from './RoomDefinition';

/**
 * Referential and physical integrity of a room (docs/ARCHITECTURE-2D.md §5.11: `validateContent()` runs at start-up and
 * in tests). A room is data, and data lies in quiet ways: an enemy id that does not exist, a gate that points at a solid
 * that was renamed, an entrance buried in a wall. Each one would otherwise show up as a crash or a soft-lock in the middle
 * of a playthrough; here each is a one-line message naming the room and the thing.
 */
export interface RoomIssue {
  room: string;
  /** Stable machine-readable id of the rule that failed. */
  code: string;
  message: string;
}

export interface RoomRefs {
  /** The enemy definitions spawns may name (their body sizes are needed to check they fit where they are put). */
  enemies: Readonly<Record<string, { body: { halfWidth: number; height: number } }>>;
  /** Flags that something outside the room sets (a pickup in another room): a gate may open with them. */
  externalFlags?: ReadonlySet<string>;
  /** The player's standing body (default 0.35 × 1.7 m). */
  player?: { halfWidth: number; height: number };
  /** The ids of the cards and of the bottles an interactable may hand out (when given, an unknown one is an issue). */
  cards?: ReadonlySet<string>;
  bottles?: ReadonlySet<string>;
}

const SUPPORT_TOLERANCE = 0.05;
/** How far, in metres, the entry a shrine rests at may be from the shrine itself. */
const MAX_CHECKPOINT_DISTANCE = 3;

export function validateRoom(room: RoomDefinition, refs: RoomRefs): RoomIssue[] {
  const issues: RoomIssue[] = [];
  const add = (code: string, message: string): void => {
    issues.push({ room: room.id, code, message: `[${room.id}] ${message}` });
  };
  const player = refs.player ?? { halfWidth: 0.35, height: 1.7 };

  const validRect = (r: Rect): boolean => [r.x0, r.y0, r.x1, r.y1].every(Number.isFinite) && r.x0 < r.x1 && r.y0 < r.y1;
  const unique = (what: string, ids: string[]): void => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) add('duplicate-id', `${what} id "${id}" is used twice`);
      seen.add(id);
    }
  };

  if (!validRect(room.bounds)) add('bad-bounds', 'the room bounds are not a valid rectangle');
  if (room.entries.length === 0) add('no-entry', 'the room has no entrance');
  unique('solid', room.solids.map((s) => s.id));
  unique('entry', room.entries.map((e) => e.id));
  unique('spawn', (room.spawns ?? []).map((s) => s.id));
  unique('gate', (room.gates ?? []).map((g) => g.id));
  unique('exit', (room.exits ?? []).map((e) => e.id));
  unique('interactable', (room.interactables ?? []).map((i) => i.id));
  for (const s of room.solids) if (!validRect(s.rect)) add('bad-solid', `solid "${s.id}" is not a valid rectangle`);

  const solids = room.solids.filter((s) => (s.kind ?? 'solid') === 'solid');
  /** Does a body of this size, feet-centred at (x, y), overlap a solid? */
  const buried = (x: number, y: number, halfWidth: number, height: number): boolean => {
    const body: Rect = { x0: x - halfWidth + 1e-6, x1: x + halfWidth - 1e-6, y0: y + 1e-6, y1: y + height - 1e-6 };
    return solids.some((s) => overlaps(body, s.rect));
  };
  /** Is there floor (a solid or a one-way top) right under the feet? */
  const supported = (x: number, y: number, halfWidth: number): boolean =>
    room.solids.some((s) => s.rect.x0 < x + halfWidth - 0.01 && s.rect.x1 > x - halfWidth + 0.01 && Math.abs(s.rect.y1 - y) <= SUPPORT_TOLERANCE);
  const inBounds = (x: number, y: number): boolean => x >= room.bounds.x0 && x <= room.bounds.x1 && y >= room.bounds.y0 && y <= room.bounds.y1;

  for (const e of room.entries) {
    if (!inBounds(e.x, e.y)) add('entry-outside', `entrance "${e.id}" is outside the room bounds`);
    else if (buried(e.x, e.y, player.halfWidth, player.height)) add('entry-buried', `entrance "${e.id}" puts the player inside a wall`);
    else if (!supported(e.x, e.y, player.halfWidth)) add('entry-floating', `entrance "${e.id}" has no floor under the player's feet`);
  }

  const gateFlags = new Set<string>();
  for (const sp of room.spawns ?? []) {
    const def = refs.enemies[sp.enemy];
    if (!def) {
      add('unknown-enemy', `spawn "${sp.id}" places the unknown enemy "${sp.enemy}"`);
      continue;
    }
    if (!inBounds(sp.x, sp.y)) add('spawn-outside', `spawn "${sp.id}" is outside the room bounds`);
    else if (buried(sp.x, sp.y, def.body.halfWidth, def.body.height)) add('spawn-buried', `spawn "${sp.id}" puts "${sp.enemy}" inside a wall`);
    else if (!supported(sp.x, sp.y, def.body.halfWidth)) add('spawn-floating', `spawn "${sp.id}" has no floor under "${sp.enemy}"`);
    if (sp.defeatFlag !== undefined) {
      if (sp.defeatFlag === '') add('empty-flag', `spawn "${sp.id}" has an empty defeat flag`);
      gateFlags.add(sp.defeatFlag);
    }
  }

  const solidIds = new Set(room.solids.map((s) => s.id));
  for (const g of room.gates ?? []) {
    if (!solidIds.has(g.solid)) add('gate-solid', `gate "${g.id}" points at the solid "${g.solid}", which does not exist`);
    if (g.openWhen === '') add('empty-flag', `gate "${g.id}" opens with an empty flag`);
  }

  for (const i of room.interactables ?? []) {
    if (!Number.isFinite(i.x) || !Number.isFinite(i.y) || !inBounds(i.x, i.y)) add('interactable-outside', `interactable "${i.id}" is outside the room bounds`);
    else if (!supported(i.x, i.y, 0.2)) add('interactable-floating', `interactable "${i.id}" has no floor under it`);
    if (i.verbKey === '') add('interactable-verb', `interactable "${i.id}" has no verb key`);
    if (i.reach && !(i.reach.x > 0 && i.reach.y > 0 && Number.isFinite(i.reach.x) && Number.isFinite(i.reach.y))) add('interactable-reach', `interactable "${i.id}" has a reach that is not positive`);
    if (i.lock !== undefined && !(Number.isInteger(i.lock) && i.lock >= 0 && i.lock <= MAX_INTERACT_LOCK)) {
      add('interactable-lock', `interactable "${i.id}" holds the control for ${i.lock} ticks (0 … ${MAX_INTERACT_LOCK})`);
    }
    for (const f of [i.whenSet, i.whenClear]) if (f === '') add('empty-flag', `interactable "${i.id}" has an empty flag`);
    if (i.actions.length === 0) add('interactable-actions', `interactable "${i.id}" does nothing`);
    for (const a of i.actions) {
      if (a.type === 'acquireCard' && refs.cards && !refs.cards.has(a.cardId)) add('unknown-card', `interactable "${i.id}" gives the unknown card "${a.cardId}"`);
      else if (a.type === 'addBottleSlot' && refs.bottles && !refs.bottles.has(a.bottleId)) add('unknown-bottle', `interactable "${i.id}" gives the unknown bottle "${a.bottleId}"`);
      else if (a.type === 'setFlag' || a.type === 'clearFlag') {
        if (a.flag === '') add('empty-flag', `interactable "${i.id}" has an action with an empty flag`);
        else if (a.type === 'setFlag') gateFlags.add(a.flag); // a lever may open a door of the room
      } else if (a.type === 'checkpoint') {
        // a shrine puts the hero back at one of the room's entries: it must exist, and be at the shrine (not across the room)
        const entry = room.entries.find((n) => n.id === a.entry);
        if (!entry) add('checkpoint-entry', `interactable "${i.id}" rests at the entry "${a.entry}", which the room does not have`);
        else if (Math.abs(entry.x - i.x) > MAX_CHECKPOINT_DISTANCE) add('checkpoint-far', `interactable "${i.id}" rests at the entry "${a.entry}", ${Math.abs(entry.x - i.x).toFixed(1)} m away from it (at most ${MAX_CHECKPOINT_DISTANCE})`);
      }
    }
  }

  // a door may open with a flag that something in the room sets: a guardian's defeat, a lever
  for (const g of room.gates ?? []) {
    if (g.openWhen !== '' && !gateFlags.has(g.openWhen) && !refs.externalFlags?.has(g.openWhen)) {
      add('gate-flag', `gate "${g.id}" opens with "${g.openWhen}", which nothing sets (no spawn of the room defeats into it, no lever sets it)`);
    }
  }

  for (const x of room.exits ?? []) {
    if (!validRect(x.rect)) add('bad-exit', `exit "${x.id}" is not a valid rectangle`);
    else if (!overlaps(x.rect, room.bounds)) add('exit-outside', `exit "${x.id}" is outside the room bounds`);
  }

  if (room.killY !== undefined && room.killY >= room.bounds.y1) add('bad-killy', 'killY is above the top of the room');
  return issues;
}
