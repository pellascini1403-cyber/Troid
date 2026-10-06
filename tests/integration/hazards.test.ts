import { describe, expect, it } from 'vitest';
import { ROOMS } from '@/content';
import type { GameEvents } from '@/gameplay/events';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { runBot } from '../helpers/bot';
import { R2_SPIKES_JUMP } from '../helpers/journey';
import { driver, type Driver, type MakeOptions } from '../helpers/sim';

/**
 * Hazards (docs/PROMPT6-LOG.md S25), on the REAL room that has them — the strip of spikes on the floor of R2's ditch (x 39.5 … 42,
 * 0.6 m high): they hurt through the combat system, so the damage, the knockback, the stun, the hit-stop, the i-frames and the events
 * are those of any hit; a second touch during the i-frames does nothing and one after them hurts again; they work with death
 * and with the respawn; and a hero who hops them is never touched.
 */
const R2 = ROOMS.r2_hall!;
const STRIP = R2.hazards![0]!.rect;
const FLOOR = -3.2; // the floor of the ditch
const QUICK = { death: { dying: 6, fadeOut: 4, hold: 4, fadeIn: 4, skipAfter: 1 } };

function ditch(extra: MakeOptions['extra'] = {}): Driver {
  const d = driver({ room: R2, entry: 'west', unlocked: ['dash'], extra: { rooms: ROOMS, flags: ['defeated:r2_slime'], ...QUICK, ...extra } });
  d.settle();
  return d;
}
const watch = (d: Driver, types: readonly (keyof GameEvents)[]): string[] => {
  const log: string[] = [];
  for (const t of types) d.session.bus.on(t, ((p: unknown) => void log.push(`${d.session.now} ${t}${p && typeof p === 'object' ? ' ' + JSON.stringify(p) : ''}`)) as never);
  return log;
};
const count = (log: string[], type: string): number => log.filter((l) => l.split(' ')[1] === type).length;
/** Puts the hero on the floor of the ditch at x. */
const standAt = (d: Driver, x: number): Driver => d.teleport(x, FLOOR).settle();
/** Holds the body where it is, motionless, for n ticks: how a hero is kept standing in the zone (i-frames keep running; a teleport would reset them). */
function hold(d: Driver, x: number, n: number): void {
  for (let i = 0; i < n; i++) {
    d.body.x = x;
    d.body.y = FLOOR;
    d.body.vx = 0;
    d.body.vy = 0;
    d.step(1);
  }
}

describe('touching the spikes', () => {
  it('walking into them costs a point of life, once, and announces it: the hazard, the room, the damage and where', () => {
    const d = ditch();
    const log = watch(d, ['hazard:hit', 'player:hurt', 'combat:hit']);
    standAt(d, 36);
    d.right();
    d.until(() => d.p.health.current < d.p.health.max, 120);
    expect(d.p.health.current).toBe(d.p.health.max - 1);
    expect(count(log, 'hazard:hit')).toBe(1);
    const e = JSON.parse(log.find((l) => l.includes('hazard:hit'))!.replace(/^\d+ hazard:hit /, ''));
    expect(e).toMatchObject({ roomId: 'r2_hall', hazardId: 'spikes_ditch', kind: 'spikes', damage: 1 });
    expect(e.x).toBeGreaterThan(STRIP.x0 - 0.5);
    expect(e.x).toBeLessThan(STRIP.x1 + 0.5);
    expect(count(log, 'player:hurt')).toBe(1);
    expect(log.find((l) => l.includes('combat:hit'))).toContain('"attackId":"hazard_spikes"');
  });

  it('the hit is the usual one: the hero is stunned, thrown UP and out, with the hit-stop and the i-frames that follow every hurt', () => {
    const d = ditch();
    standAt(d, 40.2); // in the near half of the strip: thrown back to the left
    d.step(1);
    expect(d.p.controller.state).toBe('hurt');
    expect(d.body.vy, 'thrown up').toBeGreaterThan(4);
    expect(d.body.vx, 'away from the middle of the strip').toBeLessThan(0);
    expect(d.p.invulnerable).toBe(true);
    expect(d.session.hitStopLeft).toBeGreaterThan(0);
    d.until(() => d.p.controller.state !== 'hurt', 200);
    const far = ditch();
    standAt(far, 41.4); // the far half: thrown to the right
    far.step(1);
    expect(far.body.vx).toBeGreaterThan(0);
  });

  it('a second touch during the i-frames does nothing; the first one after them hurts again (repetition)', () => {
    const d = ditch();
    const log = watch(d, ['hazard:hit']);
    standAt(d, 40.7);
    d.step(1);
    const first = d.session.now;
    hold(d, 40.7, 58); // kept inside the strip while the i-frames run
    expect(d.p.health.current, 'no second hurt during the i-frames').toBe(d.p.health.max - 1);
    expect(count(log, 'hazard:hit')).toBe(1);
    hold(d, 40.7, 20); // the i-frames end (60 ticks after the hurt) and the hero is still there
    expect(count(log, 'hazard:hit')).toBe(2);
    expect(d.p.health.current).toBe(d.p.health.max - 2);
    const second = Number(log[1]!.split(' ')[0]);
    expect(second - first, 'one hit per 60 ticks of i-frames, plus the hit-stop').toBeGreaterThanOrEqual(60);
    expect(second - first).toBeLessThan(80);
  });

  it('godMode (the debug switch) is not hurt by them', () => {
    const d = ditch();
    d.session.godMode = true;
    const log = watch(d, ['hazard:hit', 'player:hurt']);
    hold(d, 40.7, 90);
    expect(log).toEqual([]);
    expect(d.p.health.current).toBe(d.p.health.max);
  });

  it('a hero who hops them is never touched, by any of the ways of the room: the low road with a running jump, the high road above', () => {
    const d = ditch();
    const log = watch(d, ['hazard:hit']);
    runBot(d, { jumpAt: R2_SPIKES_JUMP, until: () => d.body.x > 56, maxTicks: 3000 });
    expect(log).toEqual([]);
    expect(d.body.x).toBeGreaterThan(56);
    expect(d.p.health.current).toBe(d.p.health.max);
  });

  it('the dash\'s own i-frames protect: a dash that leaves the zone within them is not hit; the same spot without a dash is', () => {
    const dashing = ditch();
    const a = watch(dashing, ['hazard:hit']);
    standAt(dashing, 41.7);
    dashing.right();
    dashing.press('dash');
    dashing.step(3);
    dashing.release('dash');
    dashing.step(20);
    expect(count(a, 'hazard:hit')).toBe(0);
    const standing = ditch();
    const b = watch(standing, ['hazard:hit']);
    standAt(standing, 41.7);
    standing.step(3);
    expect(count(b, 'hazard:hit')).toBe(1);
  });
});

describe('the spikes and the safe ground', () => {
  it('the place a hero is put back at after falling out of the world is never inside the zone', () => {
    const d = ditch();
    standAt(d, 36); // a safe spot on the floor of the ditch, left of the strip
    d.step(5);
    d.right();
    d.until(() => d.p.health.current < d.p.health.max, 120); // into the spikes
    d.stop();
    d.session.rescuePlayer();
    const b = d.body;
    expect(b.x + 0.35 <= STRIP.x0 || b.x - 0.35 >= STRIP.x1, `rescued at x = ${b.x.toFixed(2)}, the strip is ${STRIP.x0} … ${STRIP.x1}`).toBe(true);
  });

  it('a pit is still a pit: the hole in R1 still costs a point of life and puts the hero back (the spikes did not change it)', () => {
    const r1 = driver({ room: ROOMS.r1_gate!, unlocked: ['dash'], extra: { rooms: ROOMS } });
    r1.settle();
    r1.teleport(30, 0).settle();
    r1.right();
    r1.until(() => r1.body.y < -2, 200);
    r1.stop();
    r1.step(160);
    expect(r1.p.health.dead).toBe(false);
    expect(r1.body.y).toBeGreaterThanOrEqual(-0.01);
    expect(r1.session.hazards.count, 'R1 has no hazards').toBe(0);
  });
});

describe('the spikes and death', () => {
  it('on the last point of life they kill: the usual defeat, and the hero comes back at the checkpoint, alive, out of the zone', () => {
    const d = ditch();
    const shrine = R2.interactables![0]!;
    d.teleport(shrine.x, 0).settle();
    d.step(2);
    d.tap('interact'); // the checkpoint of R2
    d.step(14);
    const log = watch(d, ['hazard:hit', 'player:died', 'death:started', 'death:respawned']);
    d.p.health.damage(d.p.health.current - 1);
    standAt(d, 40.7);
    d.step(2);
    expect(d.p.health.dead).toBe(true);
    expect(count(log, 'player:died')).toBe(1);
    expect(count(log, 'death:started')).toBe(1);
    d.until(() => !d.session.death.active, 400);
    d.step(10);
    expect(d.p.health.dead).toBe(false);
    expect(d.p.health.current).toBe(d.p.health.max);
    expect(d.session.room.id).toBe('r2_hall');
    expect(d.body.x).toBeCloseTo(12.8, 6);
    expect(count(log, 'hazard:hit'), 'and nothing hurt a hero who was down').toBe(1);
  });

  it('a hero who is down (the whole defeat flow) is not hurt again, even lying in the zone', () => {
    const d = ditch({ death: { dying: 120, fadeOut: 30, hold: 30, fadeIn: 30, skipAfter: 30 } });
    const log = watch(d, ['hazard:hit']);
    d.p.health.damage(d.p.health.current - 1);
    standAt(d, 40.7);
    d.step(2);
    expect(d.p.health.dead).toBe(true);
    hold(d, 40.7, 100);
    expect(count(log, 'hazard:hit')).toBe(1);
  });

  it('a respawn INSIDE a lethal zone (a content error) is survivable by the engine: the defeat starts over, every time, and nothing leaks', () => {
    const room: RoomDefinition = {
      id: 'trap', regionId: 't', name: 'trap', bounds: rect(-1, -12, 40, 18), killY: -20,
      entries: [{ id: 'start', x: 10, y: 0 }],
      solids: [block('wl', -2, -12, 0, 18), block('wr', 39, -12, 41, 18), ground('g', 0, 39)],
      hazards: [{ id: 'killer', kind: 'spikes', rect: rect(8, 0, 12, 1), damage: 99 }],
    };
    const d = driver({ room, extra: QUICK });
    d.settle();
    const listeners = d.session.bus.listenerCount();
    const log = watch(d, ['death:respawned']);
    d.step(600);
    expect(count(log, 'death:respawned'), 'it kept coming back and being struck down').toBeGreaterThan(5);
    expect(d.session.bus.listenerCount()).toBe(listeners + 1);
    expect(d.session.scheduler.pending).toBeLessThan(4);
    expect(d.session.entities).toHaveLength(0);
  });

  it('a death in the middle of a room transition by the spikes cancels it (the hero is not carried to the next room dead)', () => {
    const d = ditch();
    d.session.transition.begin('r2_hall', 'east', { room: 'r3_chamber', entry: 'west' });
    d.p.health.damage(d.p.health.current - 1);
    standAt(d, 40.7);
    d.step(2);
    expect(d.p.health.dead).toBe(true);
    expect(d.session.transition.active).toBe(false);
    d.until(() => !d.session.death.active, 400);
    d.step(10);
    expect(d.session.room.id).not.toBe('r3_chamber');
    expect(d.p.health.dead).toBe(false);
  });
});

describe('the hazards of a room come and go with the room', () => {
  it('R2 has the strip, no other room of the world has any, and a transition or a defeat rebuilds it without leaving anything', () => {
    const d = ditch();
    expect(d.session.hazards.count).toBe(1);
    const listeners = d.session.bus.listenerCount();
    for (const id of ['r1_gate', 'r3_chamber', 'r4_sanctum']) expect(ROOMS[id]!.hazards ?? []).toEqual([]);
    for (let i = 0; i < 5; i++) {
      d.session.loadRoom('r3_chamber', 'west');
      expect(d.session.hazards.count).toBe(0);
      d.session.loadRoom('r2_hall', 'west');
      expect(d.session.hazards.count).toBe(1);
    }
    expect(d.session.bus.listenerCount()).toBe(listeners);
    expect(d.session.entities.every((e) => e.kind !== 'hazard')).toBe(true);
  });

  it('is deterministic: the same walk into the spikes gives the same story, tick for tick', () => {
    const play = (): string[] => {
      const d = ditch();
      const log = watch(d, ['hazard:hit', 'player:hurt']);
      standAt(d, 36);
      d.right();
      d.step(200);
      log.push(`end ${d.session.now} ${d.body.x.toFixed(9)} ${d.body.y.toFixed(9)} ${d.p.health.current} ${d.session.rng.state}`);
      return log;
    };
    const a = play();
    expect(a.length).toBeGreaterThan(2);
    expect(play()).toEqual(a);
  });
});
