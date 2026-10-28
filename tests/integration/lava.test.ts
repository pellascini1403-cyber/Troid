import { describe, expect, it } from 'vitest';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import type { GameEvents } from '@/gameplay/events';
import { LAVA_LET_GO } from '@/gameplay/HazardSystem';
import { driver, type Driver, type MakeOptions } from '../helpers/sim';

/**
 * LAVA (docs/PROMPT23-LOG.md §6), through the real session. It is a hazard like the spikes — it hurts through combat, so the damage, the knockback, the stun, the hit-stop, the i-frames and the events are those of any hit — with one thing more: it burns ONCE and lets go.
 * The hero who touches it plays out the hurt and is put back on the last ground that was safe (the rule that already rescues one who falls out of the world), so a mistake costs a point of life and a short walk, never a loop of burns and never
 * a place to be stuck in. What is tested here is that: once, and back; not twice; a platform that is not ground to come back to; a defeat that is the defeat flow's; and what does not change (the god mode, a room's other hazards).
 *
 * The room is a laboratory of the real thing, drawn in letters: a ledge on each side, 16 m of lava between them (a metre deep, over a basin of stone) with three stepping stones in it, and a plank over the last 6 m.
 */
const QUICK = { death: { dying: 6, fadeOut: 4, hold: 4, fadeIn: 4, skipAfter: 1 } };

function lab() {
  const c = new RoomCanvas('lava_lab', 40, 16).walls().ground(1, 12, 6).ground(28, 39, 6).pit(12, 28);
  c.rock(12, 0, 28, 1).lava(12, 28, 1); // the basin and the lava over it
  c.rock(15, 1, 18, 4).rock(20, 1, 23, 4).rock(24, 1, 26, 4); // three stepping stones, 2 m over the lava
  c.plat(26, 28, 5); // a plank to the east ledge (not ground to come back to)
  c.mark('a', 4, 6).mark('b', 34, 6).mark('s', 16, 4).mark('t', 21, 4);
  return mapRoom(
    { id: 'lava_lab', regionId: 'lab', name: 'Lava lab', nameKey: 'room.lava_lab.name', art: { backdrop: 'ruins', seed: 1 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      exits: [m.exitSide('west', 'west', 'a', { room: 'lava_lab', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'lava_lab', entry: 'west' })],
    }),
  );
}
const LAB = lab();
const POOLS = LAB.hazards!.map((h) => h.rect);

function make(extra: MakeOptions['extra'] = {}): Driver {
  const d = driver({ room: LAB, entry: 'west', unlocked: ['dash'], extra: { rooms: { lava_lab: LAB }, ...QUICK, ...extra } });
  d.settle();
  return d;
}
const watch = (d: Driver, types: readonly (keyof GameEvents)[]): string[] => {
  const log: string[] = [];
  for (const t of types) d.session.bus.on(t, ((p: unknown) => void log.push(`${d.session.now} ${t}${p && typeof p === 'object' ? ' ' + JSON.stringify(p) : ''}`)) as never);
  return log;
};
const count = (log: string[], type: string): number => log.filter((l) => l.split(' ')[1] === type).length;
/** Stands the hero on the ground at (x, y) for a few ticks, so the session notes it as ground that is safe. */
const stand = (d: Driver, x: number, y: number): Driver => {
  d.teleport(x, y).settle();
  d.step(6);
  return d;
};

describe('the room: a lake a metre deep, drawn in letters, over stone', () => {
  it('is the lava between the stones — four pools of the kind lava, a metre deep, standing on the basin — and the ledges and the stones are safe', () => {
    expect(LAB.hazards!.map((h) => [h.kind, h.rect.x0, h.rect.x1, h.rect.y0, h.rect.y1])).toEqual([
      ['lava', 12, 15, 1, 2],
      ['lava', 18, 20, 1, 2],
      ['lava', 23, 24, 1, 2],
      ['lava', 26, 28, 1, 2],
    ]);
  });
});

describe('touching the lava', () => {
  it('costs a point of life, once, and announces it: the hazard, the room, the kind, the damage and where', () => {
    const d = make();
    const log = watch(d, ['hazard:hit', 'player:hurt', 'combat:hit']);
    stand(d, 5, 6); // the west ledge: the last safe ground
    d.teleport(13.5, 1.05);
    d.step(2);
    expect(d.p.health.current).toBe(d.p.health.max - 1);
    expect(count(log, 'hazard:hit')).toBe(1);
    const e = JSON.parse(log.find((l) => l.includes('hazard:hit'))!.replace(/^\d+ hazard:hit /, ''));
    expect(e).toMatchObject({ roomId: 'lava_lab', hazardId: 'lava_12_1', kind: 'lava', damage: 1 });
    expect(POOLS.some((p) => e.x > p.x0 - 0.5 && e.x < p.x1 + 0.5), 'where it was: in a pool').toBe(true);
    expect(count(log, 'player:hurt')).toBe(1);
    expect(log.find((l) => l.includes('combat:hit'))).toContain('"attackId":"hazard_lava"');
  });

  it('the hit is the usual one — stunned, thrown up, hit-stop, i-frames — and then the hero is let go: back on the ledge they last stood on, out of the lava, after the hit-stop and the throw-back', () => {
    const d = make();
    stand(d, 5, 6);
    d.teleport(19, 1.05);
    d.step(1);
    expect(d.p.controller.state).toBe('hurt');
    expect(d.p.invulnerable).toBe(true);
    expect(d.session.hitStopLeft).toBeGreaterThan(0);
    expect(d.body.y).toBeLessThan(2); // still in it: the hurt plays out first
    const burnt = d.session.now;
    d.until(() => d.body.y > 5, 120);
    expect(d.body.x, 'back where the hero last stood on safe ground').toBeCloseTo(5, 0);
    expect(d.body.y).toBeCloseTo(6, 1);
    expect(d.session.now - burnt, 'the hit-stop does not count: LAVA_LET_GO ticks of the throw-back, the first of them the tick of the burn').toBeLessThanOrEqual(LAVA_LET_GO + 2);
    expect(d.session.now - burnt).toBeGreaterThanOrEqual(LAVA_LET_GO - 1);
    expect(d.p.health.dead).toBe(false);
  });

  it('burns once: however long the hero would have stood in it, one hit, one point of life, and no second burn after being put back', () => {
    const d = make();
    const log = watch(d, ['hazard:hit']);
    stand(d, 5, 6);
    d.teleport(19, 1.05);
    d.step(200);
    expect(count(log, 'hazard:hit')).toBe(1);
    expect(d.p.health.current).toBe(d.p.health.max - 1);
    expect(d.body.y).toBeGreaterThan(5);
  });
});

describe('the ground to come back to', () => {
  it('a stepping stone is ground: the hero who stood on one and is burnt next to it comes back to IT, not to the ledge they started from', () => {
    const d = make();
    stand(d, 16.5, 4); // the first stone
    expect(d.body.x).toBeCloseTo(16.5, 1);
    d.teleport(19, 1.05); // between the stones, in the lava
    d.until(() => d.body.y > 3.5, 120);
    expect(d.body.x, 'on the stone').toBeGreaterThan(15.5);
    expect(d.body.x).toBeLessThan(17.5);
    expect(d.body.y).toBeCloseTo(4, 1);
  });

  it('a hero who comes back is never put inside the lava: the place is clear of every pool, with the body they have', () => {
    const d = make();
    stand(d, 21.5, 4); // the second stone
    d.teleport(19.4, 1.05);
    d.until(() => d.body.y > 3.5, 120);
    const b = d.body;
    expect(d.session.hazards.touches({ x0: b.x - 0.35, x1: b.x + 0.35, y0: b.y, y1: b.y + 1.7 })).toBe(false);
    expect(b.x).toBeGreaterThan(20);
    expect(b.x).toBeLessThan(23);
  });

  it('a plank is not ground to come back to (it is the world\'s one-way floor: the rescue is to solid ground), and the very first thing the room does is to put nobody in the lava', () => {
    const d = make();
    stand(d, 5, 6);
    d.teleport(27, 5); // on the plank over the lava
    d.step(8);
    d.teleport(27.5, 1.05); // and into it
    d.until(() => d.body.y > 5, 160);
    expect(d.body.x, 'on the west ledge, the last solid ground').toBeCloseTo(5, 0);
  });
});

describe('lava and death', () => {
  it('on the last point of life it kills: the usual defeat, the hero is NOT carried anywhere, and comes back at the checkpoint alive', () => {
    const d = make();
    const log = watch(d, ['hazard:hit', 'player:died', 'death:started', 'death:respawned']);
    stand(d, 5, 6);
    d.p.health.damage(d.p.health.current - 1);
    d.teleport(19, 1.05);
    d.step(2);
    expect(d.p.health.dead).toBe(true);
    expect(count(log, 'player:died')).toBe(1);
    d.step(LAVA_LET_GO + 8);
    expect(d.body.x, 'a hero who is down is the defeat flow\'s: not carried by the lava\'s rescue').toBeGreaterThan(17);
    d.until(() => !d.session.death.active, 400);
    d.step(10);
    expect(d.p.health.dead).toBe(false);
    expect(d.p.health.current).toBe(d.p.health.max);
    expect(d.body.x).toBeCloseTo(4.5, 1);
    expect(count(log, 'hazard:hit'), 'and nothing burnt a hero who was down').toBe(1);
  });
});

describe('what the lava does not change', () => {
  it('godMode (the debug switch) is not burnt, and is not carried either', () => {
    const d = make();
    d.session.godMode = true;
    const log = watch(d, ['hazard:hit', 'player:hurt']);
    stand(d, 5, 6);
    d.teleport(19, 1.05);
    d.step(90);
    expect(log).toEqual([]);
    expect(d.p.health.current).toBe(d.p.health.max);
    expect(d.body.y, 'it stays where it is (on the basin, in the lava)').toBeLessThan(2);
  });

  it('a room with no lava has none of this: a hazard of spikes still hurts and keeps the hero where they are (it is not a rescue)', () => {
    const c = new RoomCanvas('spk_lab', 20, 10).walls().ground(1, 19, 2).spikes(8, 12, 2).mark('a', 3, 2);
    const room = mapRoom({ id: 'spk_lab', regionId: 'lab', name: 's', nameKey: 'room.spk_lab.name', art: { backdrop: 'ruins', seed: 1 }, rows: c.rows() }, (m) => ({ entries: [m.entry('west', 'a', 1)] }));
    const d = driver({ room, entry: 'west', unlocked: ['dash'], extra: { rooms: { spk_lab: room }, ...QUICK } });
    d.settle();
    d.teleport(10, 2.0).settle();
    d.step(30);
    expect(d.p.health.current).toBeLessThan(d.p.health.max);
    expect(Math.abs(d.body.x - 10), 'the spikes throw the hero out of them; they do not carry them back to where they were').toBeLessThan(4);
  });
});
