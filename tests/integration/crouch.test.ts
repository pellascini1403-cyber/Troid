import { describe, expect, it } from 'vitest';
import { driver, type Driver } from '../helpers/sim';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';
import { PLAYER } from '@/content/player';
import { deriveAnimation } from '@/player/playerAnimation';
import { createBody, CollisionWorld } from '@/world/collision';
import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * Crouching (docs/GAME-SPEC-2D.md §6): a posture with collision consequences. New file on purpose: the 40 movement
 * tests in movement.test.ts stay untouched and prove nothing about walking, jumping and dashing changed.
 */
const T = DEFAULT_MOVEMENT;
const C = T.crouch;
const STAND = PLAYER.body.height;

/** Flat floor 0..200 with a left wall and a low roof over x ∈ [20, 30] leaving `clearance` metres of headroom. */
function lowRoom(clearance = 1.2, extra: RoomDefinition['solids'] = []): RoomDefinition {
  return {
    id: 'low', regionId: 't', name: 'low', bounds: rect(-5, -20, 200, 40), killY: -30,
    entries: [{ id: 's', x: 10, y: 0 }],
    solids: [ground('g', -5, 200), block('wl', -7, -20, -5, 40), block('roof', 20, clearance, 30, clearance + 3), ...extra],
  };
}

const crouchDown = (d: Driver): Driver => {
  d.moveY = -1;
  return d.step(2);
};

describe('crouch — posture and hysteresis', () => {
  it('holding down on the ground crouches: the body shrinks from 1.7 m to 1.0 m and the feet stay put', () => {
    const d = driver({ room: lowRoom() });
    d.settle();
    expect(d.p.controller.state).toBe('free');
    expect(d.body.height).toBe(STAND);
    const y0 = d.body.y;
    crouchDown(d);
    expect(d.p.controller.state).toBe('crouch');
    expect(d.p.controller.crouched).toBe(true);
    expect(d.body.height).toBe(C.height);
    expect(d.body.height).toBe(1.0);
    expect(d.body.y).toBe(y0);
    expect(d.body.grounded).toBe(true);
    expect(d.body.halfW).toBe(PLAYER.body.halfWidth); // the width does not change
  });

  it('standing again restores the exact standing body', () => {
    const d = driver({ room: lowRoom() });
    d.settle();
    crouchDown(d);
    d.moveY = 0;
    d.step(2);
    expect(d.p.controller.state).toBe('free');
    expect(d.body.height).toBe(STAND);
  });

  it('has hysteresis: it starts at move.y ≤ −0.6 and only ends at ≥ −0.4; values in between keep the posture', () => {
    const d = driver({ room: lowRoom() });
    d.settle();
    d.moveY = -0.5;
    d.step(5);
    expect(d.p.controller.crouched).toBe(false); // not enough to start
    d.moveY = -0.6;
    d.step(2);
    expect(d.p.controller.crouched).toBe(true);
    d.moveY = -0.5;
    d.step(5);
    expect(d.p.controller.crouched).toBe(true); // still down: stays
    d.moveY = -0.45;
    d.step(5);
    expect(d.p.controller.crouched).toBe(true);
    d.moveY = -0.4;
    d.step(2);
    expect(d.p.controller.crouched).toBe(false); // released
    d.moveY = -0.5;
    d.step(5);
    expect(d.p.controller.crouched).toBe(false); // and −0.5 does not start it again
  });

  it('only starts on the ground: pressing down in the air does nothing', () => {
    const d = driver({ room: lowRoom() });
    d.settle();
    d.tap('jump');
    d.step(4);
    expect(d.body.grounded).toBe(false);
    d.moveY = -1;
    d.step(10);
    expect(d.p.controller.crouched).toBe(false);
    expect(d.body.height).toBe(STAND);
  });

  it('walks at most at the crouch speed (3.0 m/s) and recovers full speed after standing', () => {
    const d = driver({ room: lowRoom() });
    d.teleport(40, 0).settle().right();
    crouchDown(d);
    d.step(40);
    expect(d.body.vx).toBeCloseTo(C.speed, 2);
    expect(d.body.vx).toBeCloseTo(3.0, 2);
    d.moveY = 0;
    d.step(40);
    expect(d.body.vx).toBeCloseTo(T.runSpeed, 1);
  });

  it('a gentle tilt is slower than the cap (the cap never speeds anything up)', () => {
    const d = driver({ room: lowRoom() });
    d.teleport(40, 0).settle();
    crouchDown(d);
    d.moveX = 0.3;
    d.step(40);
    expect(d.body.vx).toBeGreaterThan(0);
    expect(d.body.vx).toBeLessThan(C.speed);
  });

  it('down + jump on normal ground is a JUMP: the body stands up first and takes off', () => {
    const d = driver({ room: lowRoom() });
    d.teleport(40, 0).settle();
    crouchDown(d);
    expect(d.p.controller.crouched).toBe(true);
    d.tap('jump');
    expect(d.body.vy).toBeGreaterThan(5);
    expect(d.body.grounded).toBe(false);
    expect(d.p.controller.crouched).toBe(false);
    expect(d.body.height).toBe(STAND);
    d.step(1);
    expect(d.p.controller.state).toBe('free');
  });

  it('down + jump on a one-way platform still drops through (also from the crouch)', () => {
    const d = driver({ room: lowRoom(1.2, [oneWay('ow', 40, 50, 2.5)]) });
    d.teleport(45, 2.5).settle();
    expect(d.body.y).toBeCloseTo(2.5, 5);
    crouchDown(d);
    expect(d.p.controller.crouched).toBe(true);
    d.tap('jump');
    d.until(() => d.body.y < 1, 100);
    expect(d.body.y).toBeLessThan(1);
    d.step(2);
    expect(d.p.controller.crouched).toBe(false); // standing again once it left the platform
  });

  it('walking off a ledge stands up in the air when there is room', () => {
    const room: RoomDefinition = {
      id: 'ledge', regionId: 't', name: 'ledge', bounds: rect(-5, -20, 200, 40), killY: -30,
      entries: [{ id: 's', x: 10, y: 0 }],
      solids: [ground('a', -5, 20), ground('b', 30, 200), block('wl', -7, -20, -5, 40)],
    };
    const d = driver({ room });
    d.settle().right();
    crouchDown(d);
    d.until(() => !d.body.grounded, 400);
    d.step(3);
    expect(d.p.controller.crouched).toBe(false);
    expect(d.body.height).toBe(STAND);
  });
});

describe('crouch — low ceilings', () => {
  it('a crouched player fits a 1.2 m passage that a standing player cannot enter', () => {
    const standing = driver({ room: lowRoom() });
    standing.teleport(15, 0).settle().right().step(120);
    expect(standing.body.x).toBeLessThan(20 - PLAYER.body.halfWidth + 0.01); // stopped by the roof's face

    const ducking = driver({ room: lowRoom() });
    ducking.teleport(15, 0).settle().right();
    crouchDown(ducking);
    ducking.until(() => ducking.body.x > 31, 400);
    expect(ducking.body.x).toBeGreaterThan(31);
  });

  it('forced crouch: releasing down under the ceiling keeps the player crouched until the ceiling ends', () => {
    const d = driver({ room: lowRoom() });
    d.teleport(17, 0).settle().right();
    crouchDown(d);
    d.until(() => d.body.x > 22, 200);
    d.moveY = 0; // let go of down while still under the roof
    d.step(30);
    expect(d.body.x).toBeGreaterThan(22);
    expect(d.p.controller.state).toBe('crouch');
    expect(d.p.controller.crouched).toBe(true);
    expect(d.body.height).toBe(C.height);
    expect(d.body.vx).toBeCloseTo(C.speed, 1); // the speed cap applies while forced too
    // out the far side: stands up by itself
    d.until(() => d.body.x > 30 + PLAYER.body.halfWidth + 0.05, 400);
    d.step(2);
    expect(d.p.controller.state).toBe('free');
    expect(d.body.height).toBe(STAND);
  });

  it('cannot jump from a crouch without room (the body would not fit); it can once there is room', () => {
    const d = driver({ room: lowRoom() });
    d.teleport(17, 0).settle().right();
    crouchDown(d);
    d.until(() => d.body.x > 23, 200);
    d.stop();
    d.step(5);
    d.tap('jump');
    d.step(15);
    expect(d.body.grounded).toBe(true);
    expect(d.body.y).toBe(0);
    expect(d.p.controller.crouched).toBe(true);
    // with room (outside the passage) the same press works
    d.teleport(40, 0).settle();
    crouchDown(d);
    d.tap('jump');
    expect(d.body.vy).toBeGreaterThan(5);
  });

  it('a passage of 1.4 m (the top of the spec range) also needs a crouch, and 1.0 m is the minimum that fits', () => {
    for (const [clearance, fits] of [[1.4, true], [1.0, true], [0.95, false]] as const) {
      const d = driver({ room: lowRoom(clearance) });
      d.teleport(15, 0).settle().right();
      crouchDown(d);
      d.step(450);
      expect(d.body.x > 31, `clearance ${clearance}`).toBe(fits);
    }
  });

  it('a one-way platform above never blocks standing up', () => {
    const d = driver({ room: lowRoom(1.2, [oneWay('ow', 40, 50, 1.4)]) });
    d.teleport(45, 0).settle();
    crouchDown(d);
    d.moveY = 0;
    d.step(3);
    expect(d.p.controller.crouched).toBe(false);
  });
});

describe('crouch — dash', () => {
  it('a dash out of a crouch keeps the crouched body for its whole length and slides under a low roof', () => {
    const d = driver({ room: lowRoom(), unlocked: ['dash'] });
    d.teleport(17.5, 0).settle();
    crouchDown(d);
    d.right();
    d.tap('dash');
    expect(d.p.controller.dashing).toBe(true);
    let minHeight = Infinity;
    let maxHeight = 0;
    while (d.p.controller.dashing) {
      minHeight = Math.min(minHeight, d.body.height);
      maxHeight = Math.max(maxHeight, d.body.height);
      d.step(1);
    }
    expect(minHeight).toBe(C.height);
    expect(maxHeight).toBe(C.height);
    expect(d.body.x).toBeGreaterThan(20 + PLAYER.body.halfWidth); // fully under the roof
  });

  it('after a crouched dash without room the player stays crouched (forced), and stands once the roof ends', () => {
    const d = driver({ room: lowRoom(), unlocked: ['dash'] });
    d.teleport(17.5, 0).settle();
    crouchDown(d);
    d.right();
    d.tap('dash');
    d.moveY = 0; // let go of down: there is no room to stand
    d.step(40);
    expect(d.body.x).toBeGreaterThan(20.4);
    expect(d.p.controller.crouched).toBe(true);
    expect(d.p.controller.state).toBe('crouch');
    d.until(() => d.body.x > 30.5, 600);
    d.step(2);
    expect(d.p.controller.crouched).toBe(false);
    expect(d.body.height).toBe(STAND);
  });

  it('a crouched dash in the open ends crouched and stands as soon as down is released', () => {
    const d = driver({ room: lowRoom(), unlocked: ['dash'] });
    d.teleport(60, 0).settle();
    crouchDown(d);
    d.right();
    d.tap('dash');
    d.until(() => !d.p.controller.dashing, 30);
    expect(d.p.controller.crouched).toBe(true);
    d.moveY = 0;
    d.step(2);
    expect(d.p.controller.crouched).toBe(false);
  });

  it('a standing dash never shrinks the body', () => {
    const d = driver({ room: lowRoom(), unlocked: ['dash'] });
    d.teleport(60, 0).settle().right();
    d.tap('dash');
    while (d.p.controller.dashing) {
      expect(d.body.height).toBe(STAND);
      d.step(1);
    }
  });

  it('a jump pressed during a crouched dash needs room: in the open it takes off standing, under a roof it waits', () => {
    const open = driver({ room: lowRoom(), unlocked: ['dash'] });
    open.teleport(60, 0).settle();
    crouchDown(open);
    open.right();
    open.tap('dash');
    open.press('jump');
    open.step(2);
    expect(open.body.vy).toBeGreaterThan(5);
    expect(open.body.height).toBe(STAND);

    // starts with the head already under the roof's edge (x + halfWidth > 20): there is no room to stand
    const roofed = driver({ room: lowRoom(), unlocked: ['dash'] });
    roofed.teleport(19.8, 0).settle();
    crouchDown(roofed);
    roofed.right();
    roofed.tap('dash');
    roofed.press('jump');
    roofed.step(3);
    expect(roofed.body.vy).toBeLessThanOrEqual(0); // never took off inside the passage
    expect(roofed.body.height).toBe(C.height);
  });
});

describe('crouch — hurtbox (docs/GAME-SPEC-2D.md §6: a hit at head height misses)', () => {
  const rectOver = (y0: number, y1: number, x = 0) => ({ x0: x - 1, x1: x + 1, y0, y1 });
  const hit = (h: ReturnType<typeof driver>['p'], r: { x0: number; x1: number; y0: number; y1: number }): boolean => {
    const hb = h.hurtbox();
    return hb.x0 < r.x1 && hb.x1 > r.x0 && hb.y0 < r.y1 && hb.y1 > r.y0;
  };

  it('is 1.55 m tall standing and 0.9 m tall crouched', () => {
    const d = driver({ room: lowRoom() });
    d.teleport(40, 0).settle();
    expect(d.p.hurtbox().y1 - d.p.hurtbox().y0).toBeCloseTo(1.55, 8);
    crouchDown(d);
    expect(d.p.hurtbox().y1 - d.p.hurtbox().y0).toBeCloseTo(0.9, 8);
    expect(d.p.hurtbox().y1 - d.p.hurtbox().y0).toBeCloseTo(C.hurtboxHeight, 8);
  });

  it('a blow at head height hits a standing player and MISSES a crouched one; a low blow hits both', () => {
    const d = driver({ room: lowRoom() });
    d.teleport(40, 0).settle();
    const head = rectOver(d.body.y + 1.2, d.body.y + 1.5, d.body.x);
    const feet = rectOver(d.body.y + 0.1, d.body.y + 0.5, d.body.x);
    expect(hit(d.p, head)).toBe(true);
    expect(hit(d.p, feet)).toBe(true);
    crouchDown(d);
    expect(hit(d.p, head)).toBe(false);
    expect(hit(d.p, feet)).toBe(true);
  });

  it('is always inside the collision body (near-misses feel fair)', () => {
    const d = driver({ room: lowRoom() });
    d.teleport(40, 0).settle();
    for (const down of [false, true]) {
      d.moveY = down ? -1 : 0;
      d.step(3);
      const hb = d.p.hurtbox();
      expect(hb.x0).toBeGreaterThanOrEqual(d.body.x - d.body.halfW);
      expect(hb.x1).toBeLessThanOrEqual(d.body.x + d.body.halfW);
      expect(hb.y0).toBeGreaterThanOrEqual(d.body.y);
      expect(hb.y1).toBeLessThanOrEqual(d.body.y + d.body.height);
    }
  });
});

describe('crouch — resets, determinism and animation', () => {
  it('respawn and room reloads always restore the standing body (the spawn point is free)', () => {
    const d = driver({ room: lowRoom() });
    d.teleport(17, 0).settle().right();
    crouchDown(d);
    d.until(() => d.body.x > 23, 200);
    expect(d.p.controller.crouched).toBe(true);
    d.session.player.respawn(10, 0);
    expect(d.p.controller.crouched).toBe(false);
    expect(d.p.controller.state).toBe('free');
    expect(d.body.height).toBe(STAND);
  });

  it('is deterministic: the same inputs give the same state tick for tick', () => {
    const script = (d: Driver): string[] => {
      let seed = 12345;
      const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const trace: string[] = [];
      d.teleport(12, 0);
      for (let i = 0; i < 900; i++) {
        if (i % 30 === 0) {
          d.moveX = rnd() < 0.2 ? 0 : rnd() < 0.5 ? -1 : 1;
          d.moveY = rnd() < 0.4 ? -1 : 0;
        }
        if (rnd() < 0.03) d.press('jump');
        else d.release('jump');
        if (rnd() < 0.02) d.tap('dash');
        d.step(1);
        const b = d.body;
        trace.push([b.x, b.y, b.vx, b.vy, b.height, d.p.controller.state, d.p.controller.crouched].join(','));
      }
      return trace;
    };
    const a = script(driver({ room: lowRoom(), unlocked: ['dash'] }));
    const b = script(driver({ room: lowRoom(), unlocked: ['dash'] }));
    expect(a).toEqual(b);
    expect(new Set(a.map((l) => l.split(',')[5])).size).toBeGreaterThan(1); // the script really exercised several states
  });

  it('never leaves the player stuck inside a solid, whatever the input (fuzz over a low passage)', () => {
    const d = driver({ room: lowRoom(), unlocked: ['dash'] });
    let seed = 99;
    const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    d.teleport(12, 0);
    const world = d.session.collision;
    for (let i = 0; i < 2000; i++) {
      if (i % 20 === 0) {
        d.moveX = [-1, 0, 1][Math.floor(rnd() * 3)] as number;
        d.moveY = rnd() < 0.5 ? -1 : 0;
      }
      if (rnd() < 0.05) d.tap('jump');
      if (rnd() < 0.03) d.tap('dash');
      d.step(1);
      const b = d.body;
      expect(world.overlapsSolid({ x0: b.x - b.halfW + 1e-3, x1: b.x + b.halfW - 1e-3, y0: b.y + 1e-3, y1: b.y + b.height - 1e-3 }), `tick ${i}`).toBe(false);
    }
  });

  it('crouch animation: idle crouch, crouch-walk with a speed that matches the ground, a crouched dash slides low', () => {
    const base = { dashing: false, grounded: true, vx: 0, vy: 0, landTicks: 0, walkSpeed: T.walkSpeed, runSpeed: T.runSpeed, crouching: true, crouchSpeed: C.speed };
    expect(deriveAnimation(base).anim).toBe('crouch');
    expect(deriveAnimation({ ...base, vx: 3 })).toMatchObject({ anim: 'crouchWalk', speed: 1 });
    expect(deriveAnimation({ ...base, vx: 1.5 }).speed).toBe(0.5);
    expect(deriveAnimation({ ...base, dashing: true, vx: 21 }).anim).toBe('crouchWalk');
    expect(deriveAnimation({ ...base, crouching: false, dashing: true }).anim).toBe('dash');
    expect(deriveAnimation({ ...base, grounded: false, vy: 5 }).anim).toBe('jump'); // forced crouch in the air still reads as air
    expect(deriveAnimation({ ...base, crouching: false })).toMatchObject({ anim: 'idle' });
  });
});

describe('CollisionWorld.hasRoom', () => {
  const world = (): CollisionWorld => {
    const w = new CollisionWorld();
    w.add({ id: 'roof', rect: { x0: 0, y0: 1.2, x1: 10, y1: 4 }, kind: 'solid', enabled: true });
    w.add({ id: 'ow', rect: { x0: 20, y0: 1.0, x1: 30, y1: 1.3 }, kind: 'oneway', enabled: true });
    return w;
  };
  const body = (x: number, h: number) => ({ ...createBody(0.35, h), x, y: 0 });

  it('is false under a low solid and true in the open', () => {
    const w = world();
    expect(w.hasRoom(body(5, 1.0), 1.7)).toBe(false);
    expect(w.hasRoom(body(15, 1.0), 1.7)).toBe(true);
  });

  it('is exactly true when the ceiling is exactly as high as the body', () => {
    const w = new CollisionWorld();
    w.add({ id: 'r', rect: { x0: 0, y0: 1.7, x1: 10, y1: 4 }, kind: 'solid', enabled: true });
    expect(w.hasRoom(body(5, 1.0), 1.7)).toBe(true);
  });

  it('ignores one-way platforms and disabled colliders, and never says no to a body that is not growing', () => {
    const w = world();
    expect(w.hasRoom(body(25, 1.0), 1.7)).toBe(true); // one-way above
    w.get('roof')!.enabled = false;
    expect(w.hasRoom(body(5, 1.0), 1.7)).toBe(true);
    w.get('roof')!.enabled = true;
    expect(w.hasRoom(body(5, 1.7), 1.0)).toBe(true);
    expect(w.hasRoom(body(5, 1.0), 1.0)).toBe(true);
  });
});
