import { expect } from 'vitest';
import { UPGRADES } from '@/content/upgrades';
import type { GameEvents } from '@/gameplay/events';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { grantedFlags } from '@/world/worldGraph';
import { auditRoom, type AuditOptions } from './audit';
import { driver, type Driver, type MakeOptions } from './sim';

/** The rooms of a zone as a registry, the way the session wants them. */
export const registry = (rooms: readonly RoomDefinition[]): Record<string, RoomDefinition> => Object.fromEntries(rooms.map((r) => [r.id, r]));

/** A session on a registry of rooms, in `room` at `entry`, with the abilities and flags of a hero who has got that far; settled on the floor. */
export function at(rooms: Record<string, RoomDefinition>, room: string, entry: string, abilities: string[] = ['dash'], flags: string[] = [], extra: MakeOptions['extra'] = {}): Driver {
  const d = driver({ room: rooms[room]!, entry, unlocked: abilities, extra: { rooms, upgrades: UPGRADES, flags, ...extra } });
  d.settle();
  return d;
}

/** The events of a kind, as they happen. */
export function log(d: Driver, ...names: Array<keyof GameEvents>): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const n of names) d.session.bus.on(n, (e) => void out.push([n as string, e]));
  return out;
}

/** The centre of the floor of an exit zone. */
export function zoneOf(room: RoomDefinition, exitId: string): { x: number; y: number } {
  const z = room.exits!.find((e) => e.id === exitId)!.rect;
  return { x: (z.x0 + z.x1) / 2, y: z.y0 };
}

/** Puts the hero in an exit and lets the whole transition play; the hero stands in the room the exit leads to. */
export function through(d: Driver, exitId: string, ticks = 160): void {
  const z = zoneOf(d.session.room, exitId);
  d.teleport(z.x, z.y);
  d.step(1);
  expect(d.session.transition.active, `${d.session.room.id}/${exitId} started a transition`).toBe(true);
  d.until(() => !d.session.transition.active, ticks);
  d.settle();
}

/** What the audit finds in every room of a list: nothing. The flags the rooms of the list set are the ones any of them may wait for. */
export function expectSound(rooms: readonly RoomDefinition[], oneWay: Record<string, AuditOptions['oneWay']> = {}, held: readonly string[] = []): void {
  const flags = new Set(rooms.flatMap((r) => grantedFlags(r)));
  for (const room of rooms) {
    const a = auditRoom(room, { flags, oneWay: oneWay[room.id] ?? [], held });
    expect(a.issues.map((i) => i.message), `${room.id}: the validator`).toEqual([]);
    expect(a.unreachable, `${room.id}: what cannot be reached`).toEqual([]);
    expect(a.loose, `${room.id}: claims that are not tight`).toEqual([]);
  }
}

/** The audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one. */
export const SLOW = 300_000;
