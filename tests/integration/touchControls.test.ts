import { describe, expect, it } from 'vitest';
import { makeSession } from '../helpers/sim';
import { TouchRig } from '../helpers/touch';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';
import type { GameEvents } from '@/gameplay/events';

/**
 * Touch gestures → InputFrame → GameSession, end to end through the abstract touch driver (no browser): what the fingers do
 * must make the hero do the right thing, with the simulation's own movement rules (variable jump height, crouch hysteresis,
 * drop through one-way platforms). The gesture maths is in touchGesture.test.ts; here it is the outcome that is checked.
 */
const T = DEFAULT_MOVEMENT;
const ZONE = { x: 120, y: 300 };

function setup() {
  const session = makeSession({ unlocked: ['dash'] });
  const rig = new TouchRig(session);
  const events: Array<keyof GameEvents> = [];
  for (const k of ['player:jumped', 'player:dashed', 'player:attacked'] as const) session.bus.on(k, () => void events.push(k));
  rig.step(20); // fall to the floor
  expect(session.player.body.grounded).toBe(true);
  return { session, rig, events, body: session.player.body, p: session.player };
}

describe('running', () => {
  it('a full drag to the right runs at the run speed, a gentle one walks (the analog tilt of the existing movement)', () => {
    const run = setup();
    const x0 = run.body.x;
    const m = run.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, 0, 3);
    run.rig.step(40);
    expect(run.body.vx).toBeCloseTo(T.runSpeed, 6);
    expect(run.body.x).toBeGreaterThan(x0 + 5);
    m.up();

    const walk = setup();
    walk.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(20, 0, 3);
    walk.rig.step(40);
    expect(walk.body.vx).toBeGreaterThan(1);
    expect(walk.body.vx).toBeLessThan(T.walkSpeed);
  });

  it('inside the dead zone nothing moves; to the left the hero runs left; lifting the finger stops it', () => {
    const s = setup();
    s.session.player.respawn(40, 0, 1); // room to run left (the playground's entrance is next to its left wall)
    s.session.collision.probeGround(s.body);
    s.rig.step(10);
    const x0 = s.body.x;
    const m = s.rig.finger(1).down('zone', 300, 300);
    m.drag(5, 0, 2);
    s.rig.step(20);
    expect(s.body.x).toBe(x0);
    m.drag(-60, 0, 3);
    s.rig.step(30);
    expect(s.body.vx).toBeLessThan(-8);
    m.up();
    s.rig.step(30);
    expect(s.body.vx).toBe(0);
  });

  it('a tap with no displacement does nothing at all', () => {
    const s = setup();
    const before = [s.body.x, s.body.y, s.p.controller.state];
    s.rig.finger(1).down('zone', ZONE.x, ZONE.y).up();
    s.rig.step(20);
    expect([s.body.x, s.body.y, s.p.controller.state]).toEqual(before);
    expect(s.events).toEqual([]);
  });

  it('the horizontal speed does not depend on the finger also pointing up or down (independent axes)', () => {
    const flat = setup();
    flat.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, 0, 3);
    flat.rig.step(10);
    const up = setup();
    up.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, -30, 3); // run AND jump
    up.rig.step(10);
    expect(up.body.vx).toBeCloseTo(flat.body.vx, 6);
  });
});

describe('jumping with a drag or a flick up', () => {
  it('a flick up jumps, and holding the finger up gives the full jump height (3.1 m)', () => {
    const s = setup();
    const m = s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(0, -40, 2);
    let top = 0;
    for (let i = 0; i < 70; i++) {
      s.rig.step(1);
      top = Math.max(top, s.body.y);
    }
    expect(s.events).toContain('player:jumped');
    expect(top).toBeGreaterThan(T.jumpHeight - 0.15);
    expect(top).toBeLessThan(T.jumpHeight + 0.15);
    m.up();
  });

  it('a flick that is released at once is a short hop (variable height, decided by the simulation)', () => {
    const s = setup();
    s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(0, -40, 1).up();
    let top = 0;
    for (let i = 0; i < 60; i++) {
      s.rig.step(1);
      top = Math.max(top, s.body.y);
    }
    expect(s.events.filter((e) => e === 'player:jumped')).toHaveLength(1);
    expect(top).toBeGreaterThan(0.3);
    expect(top).toBeLessThan(T.jumpHeight * 0.75);
  });

  it('keeping the thumb up does not jump again after landing; it needs to come back down and up (re-arming)', () => {
    const s = setup();
    const m = s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(0, -40, 2);
    s.rig.step(120); // the whole jump and the landing, thumb still up
    expect(s.body.grounded).toBe(true);
    expect(s.events.filter((e) => e === 'player:jumped')).toHaveLength(1);
    m.drag(0, 40, 4); // thumb back down...
    m.drag(0, -40, 2); // ...and up again: a second jump
    s.rig.step(5);
    expect(s.events.filter((e) => e === 'player:jumped')).toHaveLength(2);
  });

  it('running and jumping at once with a single diagonal drag', () => {
    const s = setup();
    const x0 = s.body.x;
    s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, -35, 3);
    s.rig.step(12);
    expect(s.events).toContain('player:jumped');
    expect(s.body.y).toBeGreaterThan(1);
    s.rig.step(18);
    expect(s.body.x).toBeGreaterThan(x0 + 3); // it ran while it jumped
  });

  it('a jump gesture a few ticks before landing is buffered like a key press (0.12 s)', () => {
    const s = setup();
    s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(0, -40, 1).up();
    s.rig.step(60);
    expect(s.body.grounded).toBe(true);
    const jumps = s.events.filter((e) => e === 'player:jumped').length;
    s.session.player.respawn(s.body.x, 1.0, 1); // 1 m up: lands in a few ticks
    s.rig.finger(2).down('zone', ZONE.x, ZONE.y).drag(0, -40, 1).up();
    s.rig.step(60);
    expect(s.events.filter((e) => e === 'player:jumped').length).toBe(jumps + 1);
  });
});

describe('crouching and dropping', () => {
  it('dragging down crouches (≤ −0.6 enters) and bringing the finger back up stands again (≥ −0.4 leaves)', () => {
    const s = setup();
    const m = s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(0, 30, 6);
    s.rig.step(5);
    expect(s.p.controller.crouched).toBe(true);
    expect(s.body.height).toBeCloseTo(T.crouch.height, 9);
    m.drag(0, -14, 4); // ay = −0.32: hysteresis lets go
    s.rig.step(5);
    expect(s.p.controller.crouched).toBe(false);
  });

  it('crouch-walking: dragging down-right moves at the crouch speed, not the run speed', () => {
    const s = setup();
    s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, 31, 6);
    s.rig.step(40);
    expect(s.p.controller.crouched).toBe(true);
    expect(s.body.vx).toBeCloseTo(T.crouch.speed, 6);
  });

  it('a flick down on a one-way platform drops through it; on solid ground it is only a crouch', () => {
    const s = setup();
    s.session.player.respawn(64, 2.7, 1); // one_way_a: x 60–68, top at 2.7
    s.session.collision.probeGround(s.body);
    s.rig.step(10);
    expect(s.body.ground?.kind).toBe('oneway');
    s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(0, 34, 3);
    s.rig.step(2);
    expect(s.body.grounded).toBe(false);
    s.rig.step(60);
    expect(s.body.y).toBeLessThan(0.5);

    const solid = setup();
    const y0 = solid.body.y;
    solid.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(0, 34, 3);
    solid.rig.step(30);
    expect(solid.body.y).toBe(y0);
    expect(solid.body.grounded).toBe(true);
  });

  it('a SLOW drag down on a one-way platform crouches but does not drop', () => {
    const s = setup();
    s.session.player.respawn(64, 2.7, 1);
    s.session.collision.probeGround(s.body);
    s.rig.step(10);
    s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(0, 34, 30);
    s.rig.step(20);
    expect(s.body.grounded).toBe(true);
    expect(s.body.y).toBeCloseTo(2.7, 5);
    expect(s.p.controller.crouched).toBe(true);
  });
});

describe('buttons and the movement finger together', () => {
  it('move + attack: the hero keeps running while the attack button starts the attack', () => {
    const s = setup();
    const x0 = s.body.x;
    s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, 0, 3);
    s.rig.finger(2).down('attack', 700, 340);
    s.rig.step(30);
    expect(s.events).toContain('player:attacked');
    expect(s.body.x).toBeGreaterThan(x0 + 1.5); // an attack only lets the stick steer a little (its own moveControl), but it does not stop the hero
    expect(s.rig.frame().move.x).toBe(1);
  });

  it('move + dash: a dash from a run, and the movement finger is not disturbed by it', () => {
    const s = setup();
    const m = s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, 0, 3);
    s.rig.step(10);
    s.rig.finger(2).down('dash', 650, 350).up();
    s.rig.step(15);
    expect(s.events).toContain('player:dashed');
    expect(s.rig.frame().move.x).toBe(1);
    m.up();
  });

  it('attack + dash: the dash cancels the recovery of an attack, as it does with the keys', () => {
    const s = setup();
    s.rig.finger(1).down('attack', 700, 340).up();
    s.rig.step(2);
    expect(s.p.controller.state).toBe('attack');
    s.rig.step(24); // into the recovery
    s.rig.finger(2).down('dash', 650, 350).up();
    s.rig.step(10);
    expect(s.events).toContain('player:dashed');
  });

  it('the ability button reaches the simulation as an action (without a card it does nothing yet: the card comes next)', () => {
    const s = setup();
    const before = [s.body.x, s.body.y, s.p.controller.state];
    s.rig.finger(1).down('ability', 640, 250).up();
    s.rig.step(20);
    expect([s.body.x, s.body.y, s.p.controller.state]).toEqual(before);
  });
});

describe('cancelling and releasing', () => {
  it('a cancelled movement pointer stops the hero (no run-away after the system takes the touch)', () => {
    const s = setup();
    const m = s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, 0, 3);
    s.rig.step(20);
    expect(s.body.vx).toBeGreaterThan(5);
    m.cancel();
    s.rig.step(30);
    expect(s.body.vx).toBe(0);
  });

  it('releaseAll (blur / rotation / pause) stops the hero and the attack button together', () => {
    const s = setup();
    s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, 0, 3);
    s.rig.finger(2).down('attack', 700, 340);
    s.rig.step(10);
    s.rig.touch.releaseAll();
    const f = s.rig.frame();
    expect([f.move.x, f.attackHeld]).toEqual([0, false]);
  });
});

describe('determinism', () => {
  it('the same gestures at the same ticks give the same hero, bit for bit', () => {
    const run = () => {
      const s = setup();
      const m = s.rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, -35, 3);
      s.rig.step(15);
      s.rig.finger(2).down('attack', 700, 340);
      s.rig.step(10);
      m.drag(-80, 20, 5);
      s.rig.finger(3).down('dash', 650, 350).up();
      s.rig.step(60);
      return [s.body.x, s.body.y, s.body.vx, s.body.vy, s.p.controller.state, s.session.rng.state];
    };
    expect(run()).toEqual(run());
  });
});
