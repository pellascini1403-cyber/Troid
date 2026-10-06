import { describe, expect, it } from 'vitest';
import { captureProgress, restoreFromProgress } from '@/gameplay/progress';
import type { GameEvents } from '@/gameplay/events';
import { Seal } from '@/gameplay/Seal';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { strikeOnPlayer } from '../helpers/combat';
import { driver, type Driver } from '../helpers/sim';

/**
 * A seal (docs/PROMPT6-LOG.md S28): a ward of violet ink that holds a door shut and breaks for the Spirit Bolt and for nothing else. It is a
 * neutral `Combatant` that turns the sword (and any other attack it does not accept) away without a scratch, announces it, and — once
 * broken — falls like a guardian does: its flag is set, the gate it held opens and it is never built again. These tests walk a synthetic
 * room with one seal and one door; the real one (R3) is proved in `worldRooms`/`spiritBoltWorld`.
 *
 *   x:  0 ─ 4 start ──────────── 30 ▓ door/seal ─────────── 40 ▒ exit (needs the flag)
 */
const FLAG = 'broken:ward';
const QUICK = { death: { dying: 6, fadeOut: 4, hold: 4, fadeIn: 4, skipAfter: 1 } };
const sealed = (): RoomDefinition => ({
  id: 'sealed',
  regionId: 't',
  name: 'Sealed',
  bounds: rect(-1, -12, 60, 18),
  killY: -20,
  entries: [{ id: 'start', x: 4, y: 0, facing: 1 }],
  solids: [block('wall_l', -2, -12, 0, 18), block('wall_r', 60, -12, 62, 18), ground('g', 0, 60), block('door', 30, 0, 31.2, 9, 'gate')],
  gates: [{ id: 'seal_gate', solid: 'door', openWhen: FLAG }],
  seals: [{ id: 'ward', x: 30, y: 0, accepts: ['spirit_bolt'], flag: FLAG, needs: 'taken:card' }],
  exits: [{ id: 'east', rect: rect(40, 0, 44, 4), requires: FLAG }],
  interactables: [{ id: 'card', kind: 'pickup', verbKey: 'interact.pickUp', x: 10, y: 0, whenClear: 'taken:card', actions: [{ type: 'setFlag', flag: 'taken:card' }] }],
});

function setup(opts: { card?: boolean; x?: number; flags?: string[] } = {}) {
  const room = sealed();
  const d = driver({ room, unlocked: ['dash'], extra: { rooms: { sealed: room }, ...QUICK, ...(opts.flags ? { flags: opts.flags } : {}) } });
  if (opts.card !== false) d.session.loadout.acquire('card_spirit_bolt');
  d.settle();
  if (opts.x !== undefined) d.teleport(opts.x, 0).settle();
  const log: Array<[string, unknown]> = [];
  for (const k of ['seal:rejected', 'combat:hit', 'actor:died', 'gate:changed', 'flag:set', 'projectile:ended', 'entity:spawned', 'entity:despawned'] as const) {
    d.session.bus.on(k, (e) => void log.push([k, e]));
  }
  return { d, s: d.session, room, log };
}
const events = <K extends keyof GameEvents>(log: Array<[string, unknown]>, k: K): Array<GameEvents[K]> => log.filter(([n]) => n === k).map(([, e]) => e as GameEvents[K]);
const seals = (d: Driver): Seal[] => d.session.entities.filter((e): e is Seal => e.kind === 'seal');
const doorShut = (d: Driver): boolean => d.session.collision.get('door')!.enabled;
/** A cast: 6 ticks of preparation, then the bolt flies 16 m/s over up to 12 m (45 ticks): 80 ticks see it through to its end. */
const cast = (d: Driver): void => {
  d.tap('ability');
  d.step(80);
};
const fall = (d: Driver): void => {
  d.p.health.damage(d.p.health.current - 1);
  strikeOnPlayer(d, { damage: 99 });
  d.step(1);
  expect(d.p.health.dead).toBe(true);
  d.until(() => !d.session.death.active, 400);
  d.step(10);
};

describe('a room with a seal', () => {
  it('builds one neutral, unbroken ward at its spot, with its door shut and the way out closed', () => {
    const { d } = setup();
    const [seal] = seals(d);
    expect(seals(d)).toHaveLength(1);
    expect(seal!.team).toBe('neutral');
    expect(seal!.broken).toBe(false);
    expect([seal!.x, seal!.y]).toEqual([30, 0]);
    expect(doorShut(d)).toBe(true);
    expect(d.session.flags.has(FLAG)).toBe(false);
  });

  it('its vulnerable area stands in front of the door it holds: a bolt meets the ward BEFORE the wall', () => {
    const { d } = setup();
    const out: Array<{ rect: { x0: number; x1: number; y0: number; y1: number } }> = [];
    seals(d)[0]!.collectHurtboxes(out as never);
    const area = out[0]!.rect;
    const door = sealed().solids.find((s) => s.id === 'door')!.rect;
    expect(area.x0).toBeLessThan(door.x0 - 1); // it reaches at least a metre out in front of the door
    expect(area.y0).toBe(0);
    expect(area.y1).toBeGreaterThan(3); // high enough for a standing or a crouched cast
  });
});

describe('the sword is turned away', () => {
  it('a swing that reaches it bounces: one `seal:rejected`, no damage, no hit, the ward and its door stay', () => {
    const { d, s, log } = setup({ x: 27.9 });
    d.tap('attack');
    d.step(30);
    const rejected = events(log, 'seal:rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.attackId).toBeTruthy();
    expect(rejected[0]!.shake).toBeGreaterThan(0);
    expect(rejected[0]!.direction, 'the blow was going east').toBe(1);
    expect(events(log, 'combat:hit')).toHaveLength(0);
    expect(events(log, 'actor:died')).toHaveLength(0);
    expect(seals(d)[0]!.broken).toBe(false);
    expect(doorShut(d)).toBe(true);
    expect(s.flags.has(FLAG)).toBe(false);
    expect(d.p.health.current).toBe(d.p.health.max);
    expect(s.hitStopLeft, 'a bounce freezes nothing').toBe(0);
  });

  it('it flashes: the view reads `rejected` at 1 right away and it fades back to 0', () => {
    const { d } = setup({ x: 27.9 });
    d.tap('attack');
    d.step(8);
    const seal = seals(d)[0]!;
    expect(seal.view.rejected).toBeGreaterThan(0);
    d.step(40);
    expect(seal.view.rejected).toBe(0);
  });

  it('every swing of a combo is turned away once (the attack never hits it twice)', () => {
    const { d, log } = setup({ x: 27.9 });
    for (let i = 0; i < 3; i++) {
      d.tap('attack');
      d.step(24);
    }
    const n = events(log, 'seal:rejected').length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(3);
    expect(seals(d)[0]!.broken).toBe(false);
  });

  it('any attack that is not in its list is turned away, whoever the player is: a made-up skill id bounces too', () => {
    const { d, s, log } = setup();
    s.combat.submit({
      ownerId: 'x', team: 'player', rect: { x0: 29, x1: 30, y0: 0.5, y1: 1.5 }, attackId: 'something_else', damage: 99, knockback: { x: 0, y: 0 }, stun: 0, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(),
    });
    d.step(2);
    expect(events(log, 'seal:rejected')).toHaveLength(1);
    expect(seals(d)[0]!.broken).toBe(false);
  });

  it('enemies and hazards never reach it: an enemy hitbox over the ward does nothing at all', () => {
    const { d, s, log } = setup();
    s.combat.submit({
      ownerId: 'e', team: 'enemy', rect: { x0: 29, x1: 31, y0: 0, y1: 3 }, attackId: 'spirit_bolt', damage: 99, knockback: { x: 0, y: 0 }, stun: 0, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(),
    });
    d.step(2);
    expect(events(log, 'seal:rejected')).toHaveLength(0);
    expect(events(log, 'combat:hit')).toHaveLength(0);
    expect(seals(d)[0]!.broken).toBe(false);
  });
});

describe('the Spirit Bolt breaks it', () => {
  it('one bolt: the ward falls (as a guardian does), its flag is set, the door opens, the way out works — and the bolt ends on it', () => {
    const { d, s, log } = setup({ x: 22 });
    const mag = s.magic.current;
    cast(d);
    expect(events(log, 'combat:hit').map((e) => [e.attackId, e.targetTeam, e.killed])).toEqual([['spirit_bolt', 'neutral', true]]);
    expect(events(log, 'actor:died').map((e) => e.team)).toEqual(['neutral']);
    expect(events(log, 'projectile:ended').map((e) => e.reason)).toEqual(['hit']);
    expect(s.flags.has(FLAG)).toBe(true);
    expect(events(log, 'gate:changed')).toEqual([{ roomId: 'sealed', gateId: 'seal_gate', open: true }]);
    expect(doorShut(d)).toBe(false);
    expect(mag - s.magic.current, 'the cast cost its 30 (a sliver of it regenerated while the bolt flew)').toBeGreaterThan(28);
    expect(mag - s.magic.current).toBeLessThanOrEqual(30);
    expect(events(log, 'seal:rejected')).toHaveLength(0);
    // …and the hero walks through to the exit that was shut
    d.teleport(33, 0).settle();
    expect(d.session.exitsReached.has('east')).toBe(false);
    d.teleport(41, 0);
    d.step(2);
    expect(d.session.exitsReached.has('east')).toBe(true);
  });

  it('it dissolves over 30 ticks and then it is gone from the world, once', () => {
    const { d, log } = setup({ x: 22 });
    const seal = seals(d)[0];
    cast(d);
    d.step(60);
    expect(seals(d)).toHaveLength(0);
    expect(events(log, 'entity:despawned').filter((e) => e.entity === seal)).toHaveLength(1);
    expect(seal!.view.opacity).toBe(0);
  });

  it('while it dissolves it cannot be hit again, and it announces its fall only once (a second bolt flies on to the door)', () => {
    const { d, log } = setup({ x: 22 });
    cast(d);
    d.step(2);
    d.session.magic.set(100);
    cast(d);
    expect(events(log, 'actor:died')).toHaveLength(1);
    expect(events(log, 'combat:hit')).toHaveLength(1);
  });

  it('a crouched cast reaches it too (the bolt leaves lower), and so does a cast from the far end of its range', () => {
    const a = setup({ x: 22 });
    a.d.moveY = -1;
    a.d.step(10);
    cast(a.d);
    expect(a.s.flags.has(FLAG)).toBe(true);
    const b = setup({ x: 30 - 1.4 - 0.8 - 11.5 }); // the bolt leaves 0.8 m in front and flies 12 m: its front edge is at the ward's area when it ends
    cast(b.d);
    expect(b.s.flags.has(FLAG)).toBe(true);
  });

  it('too far, it falls short: a cast from beyond its range fizzles and the ward stands', () => {
    const { d, s, log } = setup({ x: 8 });
    cast(d);
    expect(events(log, 'projectile:ended').map((e) => e.reason)).toEqual(['range']);
    expect(seals(d)[0]!.broken).toBe(false);
    expect(s.flags.has(FLAG)).toBe(false);
    expect(doorShut(d)).toBe(true);
  });

  it('with no card there is no bolt: Ability does nothing and the ward cannot be broken (the validator is what proves the card is reachable)', () => {
    const { d, s } = setup({ card: false, x: 22 });
    cast(d);
    expect(s.flags.has(FLAG)).toBe(false);
    expect(seals(d)[0]!.broken).toBe(false);
  });
});

describe('a broken seal stays broken', () => {
  it('through a reload of the room: it is not built again and the door is open', () => {
    const { d, s } = setup({ x: 22 });
    cast(d);
    d.step(40);
    s.loadRoom('sealed');
    d.settle();
    expect(seals(d)).toHaveLength(0);
    expect(doorShut(d)).toBe(false);
  });

  it('through a defeat: the hero comes back and the way is still open', () => {
    const { d, s } = setup({ x: 22 });
    cast(d);
    d.step(40);
    fall(d);
    expect(s.flags.has(FLAG)).toBe(true);
    expect(seals(d)).toHaveLength(0);
    expect(doorShut(d)).toBe(false);
  });

  it('through a defeat BEFORE it breaks: the ward is there again, whole, with the door shut', () => {
    const { d } = setup({ x: 22 });
    fall(d);
    expect(seals(d)).toHaveLength(1);
    expect(seals(d)[0]!.broken).toBe(false);
    expect(doorShut(d)).toBe(true);
  });

  it('through a saved game: the flag is saved, and a game begun from it has no ward and an open door', () => {
    const { d, s, room } = setup({ x: 22 });
    cast(d);
    d.step(40);
    const saved = captureProgress(s);
    expect(saved.flags).toContain(FLAG);
    const r = restoreFromProgress(saved, { sealed: room }, { room: 'sealed', entry: 'start' });
    const b = driver({ room, unlocked: r.unlocked, extra: { rooms: { sealed: room }, flags: r.flags, restore: r.restore } });
    b.settle();
    expect(seals(b)).toHaveLength(0);
    expect(b.session.collision.get('door')!.enabled).toBe(false);
  });
});
