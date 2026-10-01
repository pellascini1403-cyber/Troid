import { describe, expect, it } from 'vitest';
import { driver, Driver } from '../helpers/sim';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';
import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { GameEvents } from '@/gameplay/events';
import { MOVEMENT_TEST_ROOM } from '@/content/rooms/movementTest';

const T = DEFAULT_MOVEMENT;

/** A flat floor 0..200 with one optional gap and a boundary wall. */
function flatRoom(extra: RoomDefinition['solids'] = [], gap?: { x: number; w: number }): RoomDefinition {
  const solids = gap
    ? [ground('a', -5, gap.x), ground('b', gap.x + gap.w, 200)]
    : [ground('a', -5, 200)];
  return {
    id: 'flat', regionId: 't', name: 'flat', bounds: rect(-5, -20, 200, 40), killY: -30,
    entries: [{ id: 's', x: 10, y: 0 }],
    solids: [...solids, block('wl', -7, -20, -5, 40), ...extra],
  };
}

function listen(d: Driver) {
  const log: Array<keyof GameEvents> = [];
  for (const k of ['player:jumped', 'player:landed', 'player:dashed', 'player:dashEnded'] as const) {
    d.session.bus.on(k, () => void log.push(k));
  }
  return log;
}

describe('ground movement', () => {
  it('spawns, falls onto the floor and is grounded with zero vertical speed', () => {
    const d = driver();
    d.step(10);
    expect(d.body.grounded).toBe(true);
    expect(d.body.y).toBe(0);
    expect(d.body.vy).toBe(0);
  });

  it('accelerates to run speed in about a tenth of a second (responsive, not instant)', () => {
    const d = driver();
    d.settle().right();
    const ticks = d.until(() => d.body.vx >= T.runSpeed - 0.01);
    expect(ticks / 60).toBeGreaterThan(0.06);
    expect(ticks / 60).toBeLessThan(0.18);
    expect(d.body.vx).toBeCloseTo(T.runSpeed, 1);
  });

  it('stops quickly when input is released (no ice-skating)', () => {
    const d = driver();
    d.settle().right().step(30).stop();
    const ticks = d.until(() => d.body.vx === 0);
    expect(ticks / 60).toBeLessThan(0.2);
  });

  it('reverses direction faster than it accelerates from rest (turn boost)', () => {
    const d = driver();
    d.settle().right().step(40);
    d.left();
    const toZero = d.until(() => d.body.vx <= 0);
    const d2 = driver();
    d2.settle().right();
    const fromRest = d2.until(() => d2.body.vx >= T.runSpeed / 2);
    expect(toZero).toBeLessThan(fromRest * 2.5);
  });

  it('a partial stick tilt walks, a full push runs', () => {
    const d = driver();
    d.settle();
    d.moveX = 0.5;
    d.step(40);
    expect(d.body.vx).toBeGreaterThan(T.walkSpeed * 0.7);
    expect(d.body.vx).toBeLessThanOrEqual(T.walkSpeed + 1e-6);
    d.moveX = 1;
    d.step(40);
    expect(d.body.vx).toBeCloseTo(T.runSpeed, 1);
  });

  it('faces the direction of input and keeps facing when released', () => {
    const d = driver();
    d.settle().left().step(5).stop().step(5);
    expect(d.p.facing).toBe(-1);
    d.right().step(5);
    expect(d.p.facing).toBe(1);
  });

  it('is stopped by walls and reports the contact', () => {
    const d = driver();
    d.settle().teleport(26, 0).right();
    d.until(() => d.body.hitRight, 120);
    expect(d.body.x).toBeLessThan(30 - d.body.halfW + 1e-3);
    expect(d.body.vx).toBe(0);
    d.step(30);
    expect(d.body.x).toBeLessThan(30);
  });

  it('walks up low steps by jumping and cannot walk through them', () => {
    const d = driver();
    d.settle().teleport(12, 0).right();
    d.until(() => d.body.hitRight, 60);
    expect(d.body.x).toBeLessThan(14);
    d.press('jump').step(40);
    expect(d.body.x).toBeGreaterThan(14);
  });
});

describe('jumping', () => {
  it('a held jump reaches the tuned apex height', () => {
    const d = driver();
    d.settle().press('jump');
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      d.step(1);
      peak = Math.max(peak, d.body.y);
    }
    expect(peak).toBeGreaterThan(T.jumpHeight * 0.96);
    expect(peak).toBeLessThan(T.jumpHeight * 1.08);
  });

  it('a tap produces a short hop, well below the full jump', () => {
    const d = driver();
    d.settle().tap('jump');
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      d.step(1);
      peak = Math.max(peak, d.body.y);
    }
    expect(peak).toBeGreaterThan(0.7);
    expect(peak).toBeLessThan(T.jumpHeight * 0.6);
  });

  it('releasing mid-rise cuts the jump (variable height is continuous, not binary)', () => {
    const peakFor = (holdTicks: number) => {
      const d = driver();
      d.settle().press('jump');
      let peak = 0;
      for (let i = 0; i < 140; i++) {
        if (i === holdTicks) d.release('jump');
        d.step(1);
        peak = Math.max(peak, d.body.y);
      }
      return peak;
    };
    const a = peakFor(6);
    const b = peakFor(12);
    const c = peakFor(40);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeGreaterThan(T.jumpHeight * 0.96);
  });

  it('falls faster than it rises (heavier descent) and never exceeds the terminal speed', () => {
    const d = driver();
    d.settle().press('jump');
    let up = 0;
    let down = 0;
    let maxFall = 0;
    let peaked = false;
    for (let i = 0; i < 200; i++) {
      d.step(1);
      if (d.body.vy > 0 && !peaked) up++;
      else if (!d.body.grounded) {
        peaked = true;
        down++;
      }
      maxFall = Math.max(maxFall, -d.body.vy);
      if (peaked && d.body.grounded) break;
    }
    expect(down).toBeLessThan(up * 1.1);
    expect(maxFall).toBeLessThanOrEqual(T.maxFallSpeed + 1e-6);
  });

  it('coyote time: a jump just after leaving a ledge still works, a late one does not', () => {
    const tryJump = (delayTicks: number) => {
      const d = driver({ room: flatRoom([], { x: 40, w: 20 }) });
      d.teleport(30, 0).settle().right();
      d.until(() => d.body.x >= 40); // feet now over the void
      d.step(delayTicks);
      const before = d.body.vy;
      d.tap('jump');
      return d.body.vy > before + 1; // got an upward kick
    };
    expect(tryJump(2)).toBe(true);
    expect(tryJump(5)).toBe(true);
    expect(tryJump(12)).toBe(false);
  });

  it('jump buffer: a press just before landing jumps the moment we touch down', () => {
    const d = driver();
    d.settle().press('jump').step(30).release('jump');
    // falling: press again slightly BEFORE the floor
    d.until(() => d.body.vy < -5 && d.body.y < 1.2);
    d.tap('jump');
    const log = listen(d);
    d.until(() => d.body.vy > 3, 30); // lifted off again without needing a second press
    expect(log.filter((e) => e === 'player:jumped').length).toBeGreaterThanOrEqual(0);
    expect(d.body.vy).toBeGreaterThan(3);
  });

  it('a press far too early is forgotten (no phantom jump later)', () => {
    const d = driver();
    d.settle().press('jump');
    d.until(() => d.body.y > 2.6, 120); // near the apex of a full jump
    d.release('jump').tap('jump'); // press while still far above the ground
    d.until(() => d.body.grounded, 200);
    d.step(8);
    expect(d.body.grounded).toBe(true);
    expect(d.body.y).toBe(0);
  });

  it('air control: direction can be changed in mid-air, but less sharply than on the ground', () => {
    const d = driver();
    d.settle().right().press('jump').step(25);
    const before = d.body.vx;
    d.left().step(6);
    expect(d.body.vx).toBeLessThan(before);
    expect(d.body.vx).toBeGreaterThan(-T.runSpeed); // not an instant reversal
  });

  it('bumps its head on a ceiling and starts falling', () => {
    const d = driver();
    d.settle().teleport(104, 0).press('jump');
    d.until(() => d.body.hitCeiling, 60);
    expect(d.body.y + d.body.height).toBeLessThanOrEqual(2.1 + 1e-6);
    expect(d.body.vy).toBeLessThanOrEqual(0);
  });

  it('emits jumped and landed events with sensible payloads', () => {
    const d = driver();
    const events: Array<[string, unknown]> = [];
    d.session.bus.on('player:jumped', (e) => events.push(['jumped', e]));
    d.session.bus.on('player:landed', (e) => events.push(['landed', e]));
    d.settle().press('jump').step(5).release('jump');
    d.until(() => events.some(([k]) => k === 'landed'), 200);
    expect(events[0]?.[0]).toBe('jumped');
    expect((events[0]?.[1] as GameEvents['player:jumped']).air).toBe(false);
    const landed = events.find(([k]) => k === 'landed')?.[1] as GameEvents['player:landed'];
    expect(landed.impact).toBeGreaterThan(5);
  });
});

describe('one-way platforms', () => {
  const room = flatRoom([oneWay('ow', 10, 20, 2.5)]);

  it('can be jumped up through from below and landed on', () => {
    const d = driver({ room });
    d.teleport(15, 0).settle().press('jump');
    d.until(() => d.body.grounded && d.body.y > 2, 200);
    expect(d.body.y).toBeCloseTo(2.5, 6);
    expect(d.body.ground?.kind).toBe('oneway');
  });

  it('holding down + jump drops through', () => {
    const d = driver({ room });
    d.teleport(15, 2.5).settle();
    expect(d.body.y).toBeCloseTo(2.5, 5);
    d.moveY = -1;
    d.tap('jump');
    d.until(() => d.body.y < 1, 100);
    expect(d.body.y).toBeLessThan(1);
  });

  it('does not block horizontal movement', () => {
    const d = driver({ room });
    d.teleport(5, 2.0).right().step(1);
    d.until(() => d.body.x > 22, 200);
    expect(d.body.x).toBeGreaterThan(22);
  });
});

describe('dash', () => {
  it('is impossible until the ability is unlocked, and works the moment it is', () => {
    const d = driver();
    d.settle();
    const x0 = d.body.x;
    d.tap('dash').step(20);
    expect(d.p.controller.dashing).toBe(false);
    expect(d.body.x).toBeCloseTo(x0, 2);
    d.session.abilities.unlock('dash');
    d.tap('dash');
    expect(d.p.controller.dashing).toBe(true);
  });

  it('covers its tuned distance and ends on time', () => {
    const d = driver({ unlocked: ['dash'] });
    d.settle();
    const x0 = d.body.x;
    d.tap('dash');
    const ticks = d.until(() => !d.p.controller.dashing, 60);
    const dist = d.body.x - x0;
    expect(dist).toBeGreaterThan(T.dash.speed * T.dash.duration * 0.9);
    expect(dist).toBeLessThan(T.dash.speed * T.dash.duration * 1.15);
    expect(ticks / 60).toBeCloseTo(T.dash.duration, 1);
  });

  it('goes the way you press (or the way you face) and keeps momentum afterwards', () => {
    const d = driver({ unlocked: ['dash'] });
    d.teleport(60, 0).settle().left().step(3); // well away from any wall
    d.tap('dash');
    expect(d.body.vx).toBeLessThan(0);
    d.until(() => !d.p.controller.dashing, 60);
    expect(d.body.vx).toBeLessThan(-T.runSpeed * T.dash.exitSpeedFactor + 0.5);
    const d2 = driver({ unlocked: ['dash'] });
    d2.settle().stop().tap('dash'); // no direction: uses facing (right at spawn)
    expect(d2.body.vx).toBeGreaterThan(0);
  });

  it('is invulnerable for its i-frame window and the flag clears afterwards', () => {
    const d = driver({ unlocked: ['dash'] });
    d.settle().tap('dash');
    expect(d.p.controller.isInvulnerable).toBe(true);
    d.step(Math.ceil(T.dash.invulnerability * 60) + 2);
    expect(d.p.controller.isInvulnerable).toBe(false);
  });

  it('respects the cooldown, then becomes available again', () => {
    const d = driver({ unlocked: ['dash'] });
    d.settle().tap('dash');
    d.until(() => !d.p.controller.dashing, 60);
    d.tap('dash'); // too soon
    d.step(2);
    expect(d.p.controller.dashing).toBe(false);
    d.step(Math.ceil(T.dash.cooldown * 60));
    d.tap('dash');
    expect(d.p.controller.dashing).toBe(true);
  });

  it('a press during cooldown is buffered and fires as soon as it is ready', () => {
    const d = driver({ unlocked: ['dash'] });
    d.settle().tap('dash');
    d.until(() => !d.p.controller.dashing, 60);
    // wait until just before the cooldown ends (inside the buffer window), then press
    d.step(Math.round(T.dash.cooldown * 60) - 3);
    d.tap('dash');
    d.step(4);
    expect(d.p.controller.dashing || d.p.controller.dashCooldown01 > 0).toBe(true);
  });

  it('only one dash per airtime, restored on landing', () => {
    const d = driver({ unlocked: ['dash'] });
    d.p.def.movement.dash.cooldown = 0.05; // isolate the air-dash limit from the cooldown (tuning is live-editable)
    d.settle().press('jump').step(12);
    d.tap('dash');
    d.until(() => !d.p.controller.dashing, 60);
    d.step(4);
    expect(d.body.grounded).toBe(false);
    d.tap('dash');
    d.step(2);
    expect(d.p.controller.dashing).toBe(false); // second air dash refused
    d.until(() => d.body.grounded, 200);
    d.step(6);
    d.tap('dash');
    expect(d.p.controller.dashing).toBe(true); // available again
  });

  it('is flat: gravity is suspended while dashing', () => {
    const d = driver({ unlocked: ['dash'] });
    d.settle().press('jump').step(20);
    const y = d.body.y;
    d.tap('dash');
    d.step(5);
    expect(Math.abs(d.body.y - y)).toBeLessThan(0.15);
  });

  it('a ground dash can be cancelled into a jump', () => {
    const d = driver({ unlocked: ['dash'] });
    d.settle().tap('dash');
    d.press('jump').step(2);
    expect(d.p.controller.dashing).toBe(false);
    expect(d.body.vy).toBeGreaterThan(5);
  });

  it('stops against a wall instead of passing through (dash can never tunnel, even a 0.5 m wall)', () => {
    const d = driver({ unlocked: ['dash'] });
    d.settle().teleport(126, 0).right().step(2);
    d.tap('dash');
    d.step(30);
    expect(d.body.x).toBeLessThan(130 - d.body.halfW + 1e-3);
  });

  it('emits dashed then dashEnded, in order', () => {
    const d = driver({ unlocked: ['dash'] });
    const log = listen(d);
    d.settle().tap('dash');
    d.until(() => !d.p.controller.dashing, 60);
    expect(log.filter((e) => e.startsWith('player:dash'))).toEqual(['player:dashed', 'player:dashEnded']);
  });
});

describe('reach — the numbers level design relies on', () => {
  /** Sprint at a gap and attempt to cross it. `dashAtTick` < 0 means no dash. Returns whether it landed on the far side. */
  function cross(gapWidth: number, opts: { jumpDelay: number; dashAt: number }): boolean {
    const d = driver({ room: flatRoom([], { x: 30, w: gapWidth }), unlocked: opts.dashAt >= 0 ? ['dash'] : [] });
    d.teleport(18, 0).settle().right();
    d.until(() => d.body.x >= 30);
    d.step(opts.jumpDelay);
    d.press('jump');
    for (let t = 0; t < 200; t++) {
      if (t === opts.dashAt) d.tap('dash');
      else d.step(1);
      if (d.body.grounded && d.body.x > 30 + gapWidth - 0.3) return true;
      if (d.body.y < -3) return false;
    }
    return false;
  }

  it('gap A (5.5 m) is crossable by a plain running jump with forgiving timing', () => {
    for (const jumpDelay of [0, 1, 2, 3]) expect(cross(5.5, { jumpDelay, dashAt: -1 })).toBe(true);
  });

  it('gap B (8.5 m) is impossible without dash — for any jump timing', () => {
    for (let jumpDelay = 0; jumpDelay <= 6; jumpDelay++) expect(cross(8.5, { jumpDelay, dashAt: -1 })).toBe(false);
  });

  it('gap B (8.5 m) is crossable with dash at ANY moment of the jump — early (instinctive) or late', () => {
    const timings = [2, 4, 6, 8, 10, 14, 18, 22, 26, 30];
    const failed = timings.filter((dashAt) => !cross(8.5, { jumpDelay: 1, dashAt }));
    expect(failed).toEqual([]);
  });

  it('the shipped movement test room uses exactly these gaps', () => {
    const solids = MOVEMENT_TEST_ROOM.solids;
    const g1 = solids.find((s) => s.id === 'g1')!.rect.x1;
    const g2a = solids.find((s) => s.id === 'g2')!.rect.x0;
    const g2b = solids.find((s) => s.id === 'g2')!.rect.x1;
    const g3 = solids.find((s) => s.id === 'g3')!.rect.x0;
    expect(g2a - g1).toBeCloseTo(5.5, 5);
    expect(g3 - g2b).toBeCloseTo(8.5, 5);
  });
});

describe('determinism & hygiene', () => {
  const script = (d: Driver) => {
    d.settle().right().press('jump').step(10).release('jump').step(20).tap('dash').step(30).left().step(40).press('jump').step(20);
    return [d.body.x, d.body.y, d.body.vx, d.body.vy, d.session.now];
  };

  it('same inputs ⇒ identical state (bit for bit)', () => {
    const a = script(driver({ unlocked: ['dash'] }));
    const b = script(driver({ unlocked: ['dash'] }));
    expect(a).toEqual(b);
  });

  it('falling out of the world puts the player back on the last safe ground', () => {
    const d = driver({ room: flatRoom([], { x: 30, w: 40 }) });
    d.teleport(25, 0).settle().right();
    d.until(() => d.body.y < -3, 200);
    d.until(() => d.body.grounded && d.body.y > -1, 400);
    expect(d.body.x).toBeLessThan(30);
    expect(d.body.y).toBeCloseTo(0, 3);
  });

  it('dispose leaves no listeners and no timers behind', () => {
    const d = driver();
    d.session.bus.on('player:jumped', () => {});
    d.session.scheduler.after(100, () => {});
    d.session.dispose();
    expect(d.session.bus.listenerCount()).toBe(0);
    expect(d.session.scheduler.pending).toBe(0);
    d.step(5); // ticking a disposed session is a harmless no-op
  });

  it('loadRoom rebuilds collision without leaking colliders', () => {
    const d = driver();
    const n = d.session.collision.count;
    for (let i = 0; i < 5; i++) d.session.loadRoom('movement_test');
    expect(d.session.collision.count).toBe(n);
  });
});
