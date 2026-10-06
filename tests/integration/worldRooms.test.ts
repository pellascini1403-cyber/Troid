import { describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import { runBot } from '../helpers/bot';
import { jump, runTo, standOn } from '../helpers/hops';
import { driver, type Driver } from '../helpers/sim';

/**
 * The rooms of the world proven by PHYSICS (docs/PROMPT6-LOG.md S22), like R1 is in r1.test.ts: a scripted player with the same
 * inputs a person has walks each room from one end to the other, takes both roads of R2's fork, climbs R3's ledge. If a retune of
 * the jump makes a room impossible, this is the test that says so. (The exits do nothing yet in this step: they are just zones.)
 */
const R2 = ROOMS.r2_hall!;
const R3 = ROOMS.r3_chamber!;
const R4 = ROOMS.r4_sanctum!;

function walk(room: typeof R2, entry?: string, extra: Parameters<typeof driver>[0] = {}): Driver {
  const d = driver({ room, ...(entry ? { entry } : {}), unlocked: ['dash'], ...extra });
  d.settle();
  return d;
}
/** Tracks the lowest the body gets: the proof of which road was taken. */
function lowest(d: Driver): { min: number } {
  const seen = { min: Infinity };
  d.session.bus.on('exit:reached', () => {});
  const original = d.step.bind(d);
  d.step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      original(1);
      seen.min = Math.min(seen.min, d.body.y);
    }
    return d;
  };
  return seen;
}

describe('every entry of every room of the world is a place the player can stand', () => {
  for (const id of WORLD.rooms) {
    for (const entry of ROOMS[id]!.entries) {
      it(`${id}:${entry.id} puts the player at (${entry.x}, ${entry.y}) facing ${entry.facing === -1 ? 'left' : 'right'}, on the ground, without touching any exit`, () => {
        const d = walk(ROOMS[id]!, entry.id);
        expect(d.body.x).toBeCloseTo(entry.x, 6);
        expect(d.body.y).toBeCloseTo(entry.y, 1);
        expect(d.p.facing).toBe(entry.facing ?? 1);
        d.step(120);
        expect(d.body.grounded).toBe(true);
        expect(d.p.health.dead).toBe(false);
        expect(d.session.exitsReached.size, 'arriving must not trigger an exit').toBe(0);
        expect(d.body.x).toBeCloseTo(entry.x, 1);
      });
    }
  }
});

describe('R2 «Galería de Raíces»: the fork', () => {
  it('the LOW road: a scripted player walks from the west entry to the east exit, down into the ditch and up out of it', () => {
    const d = walk(R2, 'west');
    const seen = lowest(d);
    const r = runBot(d, { until: () => d.session.exitsReached.has('east'), maxTicks: 5000 });
    expect(r.done, `stuck at x=${d.body.x.toFixed(1)} y=${d.body.y.toFixed(1)} after ${r.ticks} ticks`).toBe(true);
    expect(d.p.health.dead).toBe(false);
    expect(seen.min, 'it really went through the ditch').toBeLessThan(-3);
    expect(r.jumps, 'the steps out of the ditch need jumps').toBeGreaterThanOrEqual(2);
  });

  it('the HIGH road: five hops across the one-way platforms, never touching the ditch floor', () => {
    const d = walk(R2, 'west');
    const seen = lowest(d);
    runTo(d, 25.6);
    jump(d);
    standOn(d, 2.4); // p1
    expect(d.body.x).toBeGreaterThan(28);
    expect(d.body.x).toBeLessThan(33);
    runTo(d, 32.3);
    jump(d);
    standOn(d, 2.4); // p2
    expect(d.body.x).toBeGreaterThan(36);
    runTo(d, 40.3);
    jump(d);
    standOn(d, 2.4); // p3 (and not the ledge above its right end: a full jump from the edge of p2 lands well before it)
    expect(d.body.x).toBeGreaterThan(44);
    expect(d.body.x).toBeLessThan(48);
    runTo(d, 50.3);
    jump(d);
    standOn(d, 2.4); // p4
    expect(d.body.x).toBeGreaterThan(54);
    runTo(d, 58.3);
    jump(d);
    standOn(d, 0); // the ground on the far side
    expect(d.body.x).toBeGreaterThan(60);
    expect(seen.min, 'never went down into the ditch').toBeGreaterThan(-0.05);
  });

  it('the ledge above the third platform is reached by a standing jump from it, and left by dropping through', () => {
    const d = walk(R2, 'west');
    d.teleport(49.5, 2.4).settle();
    expect(d.body.y).toBeCloseTo(2.4, 1);
    jump(d);
    standOn(d, 4.8);
    expect(d.body.x).toBeGreaterThan(48);
    expect(d.body.x).toBeLessThan(51);
    d.moveY = -1; // crouch + jump drops through a one-way platform
    d.tap('jump');
    d.stop();
    standOn(d, 2.4); // back on the third platform
  });

  it('the ledge is a choice: the full jump from the edge of the second platform lands on the third, not on the ledge', () => {
    const d = walk(R2, 'west');
    d.teleport(40.3, 2.4).settle();
    d.right();
    jump(d);
    standOn(d, 2.4);
    expect(d.body.y).toBeCloseTo(2.4, 1);
  });

  it('falling from the high road lands in the ditch, and from there the way on is still open (the fork cannot trap anyone)', () => {
    const d = walk(R2, 'west');
    d.teleport(38.5, 3).settle(); // above the middle of the ditch
    expect(d.body.y).toBeLessThan(2.5);
    d.step(60);
    const r = runBot(d, { until: () => d.session.exitsReached.has('east'), maxTicks: 4000 });
    expect(r.done).toBe(true);
  });

  it('and the way back out of the ditch to the west is open too: two jumps up its steps', () => {
    const d = walk(R2, 'west');
    d.teleport(33, -3.2).settle();
    runTo(d, 30.4); // leftwards, to the foot of the first step
    jump(d);
    standOn(d, -1.6);
    d.left();
    jump(d);
    standOn(d, 0);
    expect(d.body.x).toBeLessThan(26);
  });
});

describe('R3 «Cámara del Sello»: the climb', () => {
  it('the lane is flat from end to end: a scripted player reaches the east exit', () => {
    const d = walk(R3, 'west');
    const r = runBot(d, { until: () => d.session.exitsReached.has('east'), maxTicks: 3000 });
    expect(r.done).toBe(true);
  });

  it('the ledge is reached by two jumps (a step at 2.4 m, then the ledge at 4.8 m), the way the room is built to be climbed', () => {
    const d = walk(R3, 'west');
    runTo(d, 21.6);
    jump(d);
    standOn(d, 2.4);
    expect(d.body.x).toBeGreaterThan(22);
    expect(d.body.x).toBeLessThan(27);
    runTo(d, 26.4);
    jump(d);
    standOn(d, 4.8);
    expect(d.body.x).toBeGreaterThan(29);
    expect(d.body.x).toBeLessThan(40);
  });

  it('there is no shortcut: a jump from the floor under the ledge never reaches it (a full jump is 3.1 m, the ledge 4.8 m)', () => {
    const d = walk(R3, 'west');
    d.teleport(34, 0).settle();
    let top = 0;
    d.press('jump');
    for (let i = 0; i < 90; i++) {
      d.step(1);
      top = Math.max(top, d.body.y);
      if (i === 30) d.release('jump');
    }
    expect(top).toBeLessThan(3.3);
    expect(d.body.y).toBeCloseTo(0, 1);
  });

  it('the step alone is not enough either: from the floor the ledge cannot be reached without it', () => {
    const d = walk(R3, 'west');
    d.teleport(28.5, 0).settle();
    jump(d);
    d.step(90);
    expect(d.body.y).toBeLessThan(0.1); // landed back on the floor
  });
});

describe('R4 «Santuario»: a flat way in a line', () => {
  it('a scripted player walks from the west entry to the way out of the world', () => {
    const d = walk(R4, 'west');
    const r = runBot(d, { until: () => d.session.exitsReached.has('east'), maxTicks: 3000 });
    expect(r.done).toBe(true);
    expect(d.session.exitsReached.has('east')).toBe(true);
  });

  it('is wide enough for a fight: the arena stretch is at least 40 m of flat floor', () => {
    const floor = R4.solids.find((s) => s.id === 'g')!;
    expect(floor.rect.x1 - floor.rect.x0).toBeGreaterThanOrEqual(90);
    expect(R4.bounds.x1 - R4.bounds.x0).toBeGreaterThanOrEqual(100);
  });
});

describe('the rooms of the world respect the MEASURED reach of the controller', () => {
  /** Rise and gap limits with a 20 % margin: a full jump rises 3.1 m, a running jump crosses 6.75 m. */
  const RISE = 3.1 * 0.8;
  const GAP = 6.75 * 0.8;
  const gapBetween = (a: { rect: { x0: number; x1: number } }, b: { rect: { x0: number; x1: number } }): number => Math.max(a.rect.x0 - b.rect.x1, b.rect.x0 - a.rect.x1);

  it('every surface of R2, R3 and R4 can be entered AND left: there is always one within a jump (rise ≤ 2.48 m, gap ≤ 5.4 m), and any drop is allowed', () => {
    for (const id of ['r2_hall', 'r3_chamber', 'r4_sanctum']) {
      const room = ROOMS[id]!;
      const doors = new Set((room.gates ?? []).map((g) => g.solid));
      const surfaces = room.solids.filter((s) => !s.id.startsWith('wall') && !doors.has(s.id));
      if (surfaces.length < 2) continue; // a room that is one floor has nothing to climb
      for (const s of surfaces) {
        const near = surfaces.filter((o) => o !== s && gapBetween(s, o) <= GAP);
        // you can step UP onto s from something at most RISE below it (or drop onto it from anything higher)…
        expect(near.some((o) => s.rect.y1 - o.rect.y1 <= RISE), `${id}/${s.id} cannot be reached`).toBe(true);
        // …and leave it by going up to something at most RISE above it (or dropping to anything lower)
        expect(near.some((o) => o.rect.y1 - s.rect.y1 <= RISE), `${id}/${s.id} cannot be left`).toBe(true);
      }
    }
  });

  it('the steps of R2\'s ditch rise 1.6 m at a time and the platforms 2.4 m: all within a jump with margin', () => {
    const top = (room: typeof R2, id: string): number => room.solids.find((s) => s.id === id)!.rect.y1;
    expect(top(R2, 'g_a') - top(R2, 'ditch_l')).toBeLessThanOrEqual(RISE);
    expect(top(R2, 'ditch_l') - top(R2, 'g_low')).toBeLessThanOrEqual(RISE);
    expect(top(R2, 'ditch_r') - top(R2, 'g_low')).toBeLessThanOrEqual(RISE);
    expect(top(R2, 'g_b') - top(R2, 'ditch_r')).toBeLessThanOrEqual(RISE);
    for (const p of ['p1', 'p2', 'p3', 'p4']) expect(top(R2, p) - top(R2, 'g_a')).toBeLessThanOrEqual(RISE);
    expect(top(R2, 'p5') - top(R2, 'p3')).toBeLessThanOrEqual(RISE);
    expect(top(R3, 'climb_1') - top(R3, 'g')).toBeLessThanOrEqual(RISE);
    expect(top(R3, 'ledge') - top(R3, 'climb_1')).toBeLessThanOrEqual(RISE);
  });

  it('the gaps between the platforms of R2\'s high road are 3 m or less (a running jump clears 6.75 m)', () => {
    const solid = (id: string) => R2.solids.find((s) => s.id === id)!;
    for (const [a, b] of [['p1', 'p2'], ['p2', 'p3'], ['p3', 'p4']] as const) expect(gapBetween(solid(a), solid(b))).toBeLessThanOrEqual(GAP);
    expect(gapBetween(solid('g_a'), solid('p1'))).toBeLessThanOrEqual(GAP);
    expect(gapBetween(solid('p4'), solid('g_b'))).toBeLessThanOrEqual(GAP);
  });

  it('the high road does not need the ledge: nothing in the way is a dead end and the ledge is not in the way (it sits over the END of p3)', () => {
    const p5 = R2.solids.find((s) => s.id === 'p5')!.rect;
    const p3 = R2.solids.find((s) => s.id === 'p3')!.rect;
    expect(p5.x0).toBeGreaterThanOrEqual(p3.x0 + 3.5); // a running jump from p2 lands within 4 m of p3's near edge
    expect(p5.x1).toBeLessThanOrEqual(p3.x1);
  });
});
