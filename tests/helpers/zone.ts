import { expect } from 'vitest';
import { UPGRADES } from '@/content/upgrades';
import type { GameEvents } from '@/gameplay/events';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { grantedFlags } from '@/world/worldGraph';
import { auditRoom, unsafeArrivals, type AuditOptions } from './audit';
import { driver, type Driver, type MakeOptions } from './sim';

/** The rooms of a zone as a registry, the way the session wants them. */
export const registry = (rooms: readonly RoomDefinition[]): Record<string, RoomDefinition> => Object.fromEntries(rooms.map((r) => [r.id, r]));

/** The room with nobody in it and no way out of it: for replaying a hop through the real session, where an enemy that bites in the middle of a climb — or a door the hero brushes on the way — is not what is being asked. */
export const bare = (room: RoomDefinition): RoomDefinition => ({ ...room, spawns: [], bosses: [], exits: [] });

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
    expect(unsafeArrivals(room), `${room.id}: an entrance where a creature already sees the hero`).toEqual([]);
  }
}

/** The audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one. */
export const SLOW = 300_000;

/** A blow of the hero's that lands on the enemy of this definition nearest to `x` and kills it. */
export function killEnemy(d: Driver, defId: string, nearX: number): void {
  const e = d.session.entities
    .filter((n) => n.kind === 'enemy' && (n as unknown as { def: { id: string } }).def.id === defId)
    .sort((a, b) => Math.abs((a as unknown as { body: { x: number } }).body.x - nearX) - Math.abs((b as unknown as { body: { x: number } }).body.x - nearX))[0] as unknown as { body: { x: number; y: number } } | undefined;
  expect(e, `a ${defId} near x = ${nearX}`).toBeDefined();
  const b = e!.body;
  d.session.combat.submit({
    ownerId: 'test', team: 'player', attackId: 'slash_1', damage: 99,
    rect: { x0: b.x - 1.2, x1: b.x + 1.2, y0: b.y - 0.2, y1: b.y + 2.5 },
    knockback: { x: 0, y: 0 }, stun: 0, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(),
  });
  d.step(2);
}

export interface ArenaSpec {
  /** The room of the arena, and the entrances on either side of it. */
  room: string;
  west: string;
  east: string;
  /** The flags: the one the fall sets for good and the one the fight raises. */
  defeated: string;
  fight: string;
  /** The x where the feet are just OUTSIDE the arena, and just inside it. */
  outside: number;
  inside: number;
  /** The vessel (or whatever) that the fall hands out, if it hands anything out: where to stand and the flag taking it sets. */
  reward?: { x: number; y: number; flag: string };
  /** The way on: the exit and the room it leads to. */
  onward: { exit: string; room: string; entry: string };
}

/**
 * What every arena of the world does, asked of the real one: the guardian sleeps with the doors open, arriving by either entrance does not wake it, the feet crossing the line do and shut both doors; when it falls the flag is set for good, the doors open,
 * the reward is there to take and the way on works; a room built afterwards has no guardian.
 */
export function describeArena(rooms: Record<string, RoomDefinition>, spec: ArenaSpec, BossClass: abstract new (...a: never[]) => unknown, test: { describe: typeof import('vitest').describe; it: typeof import('vitest').it }): void {
  const { describe, it } = test;
  type D = ReturnType<typeof at>;
  const boss = (d: D): { state: string; health: { current: number }; receiveHit(h: unknown): unknown; body: { x: number; y: number } } => d.session.entities.find((e) => e instanceof BossClass) as never;
  const doors = (d: D): boolean[] => ['door_w', 'door_e'].map((id) => d.session.collision.get(id)!.enabled);
  describe(`the arena of ${spec.room}`, () => {
    it('the guardian waits dormant with both doors open; arriving by either entrance does not wake it; the feet crossing the line do, and shut both doors', () => {
      for (const entry of [spec.west, spec.east]) {
        const d = at(rooms, spec.room, entry);
        d.step(120);
        expect(boss(d).state, entry).toBe('dormant');
        expect(doors(d)).toEqual([false, false]);
      }
      const d = at(rooms, spec.room, spec.west);
      d.teleport(spec.outside, 2);
      d.settle();
      d.step(3);
      expect(boss(d).state).toBe('dormant');
      d.teleport(spec.inside, 2);
      d.settle();
      d.until(() => boss(d).state !== 'dormant', 30);
      expect(d.session.flags.has(spec.fight)).toBe(true);
      expect(doors(d)).toEqual([true, true]);
    });

    it('when it falls the flag is set for good, the doors open, the reward is there to take and the way on works; a room built afterwards has no guardian', () => {
      const d = at(rooms, spec.room, spec.west);
      d.session.godMode = true;
      d.teleport(spec.inside, 2);
      d.settle();
      d.until(() => boss(d).state !== 'dormant', 30);
      const b = boss(d);
      expect(d.session.interaction.current).toBeNull();
      b.receiveHit({ attackId: 'test', attackerId: 'test', damage: 1e6, direction: 1, knockbackX: 0, knockbackY: 0, stun: 0, hitStop: 0, shake: 0, x: b.body.x, y: b.body.y + 1, part: 'core' });
      d.until(() => d.session.flags.has(spec.defeated), 900);
      expect(d.session.flags.has(spec.fight)).toBe(false);
      d.step(2);
      expect(doors(d)).toEqual([false, false]);
      if (spec.reward) {
        d.teleport(spec.reward.x, spec.reward.y);
        d.settle();
        d.tap('interact');
        d.step(20);
        expect(d.session.flags.has(spec.reward.flag)).toBe(true);
      }
      const way = rooms[spec.room]!.exits!.find((x) => x.id === spec.onward.exit)!;
      expect(way.to, 'the way on').toEqual({ room: spec.onward.room, entry: spec.onward.entry });
      expect(way.requires, 'it works once the guardian has fallen').toBe(spec.defeated);
      if (rooms[spec.onward.room]) {
        through(d, spec.onward.exit);
        expect(d.session.room.id).toBe(spec.onward.room);
      }
      const later = at(rooms, spec.room, spec.west, ['dash'], [spec.defeated, ...(spec.reward ? [spec.reward.flag] : [])]);
      expect(later.session.entities.some((e) => e instanceof BossClass)).toBe(false);
    });
  });
}
