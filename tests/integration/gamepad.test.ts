import { describe, expect, it } from 'vitest';
import { makeSession } from '../helpers/sim';
import { FakePad, PAD, padList } from '../helpers/gamepad';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { InputManager } from '@/input/InputManager';
import { attachGamepad } from '@/input/sources/GamepadSource';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';
import type { GameEvents } from '@/gameplay/events';

/**
 * Gamepad → InputFrame → GameSession with the abstract pad: the same simulation, the same rules, a different device. No
 * parallel gameplay path: if the keyboard test of an action passes, the pad has only to prove that its buttons say the same.
 */
const T = DEFAULT_MOVEMENT;

function setup() {
  const session = makeSession({ unlocked: ['dash'] });
  const input = new InputManager();
  const pad = new FakePad();
  const { provider, pads } = padList(pad);
  const handle = attachGamepad(input, () => structuredClone(DEFAULT_BINDINGS), provider);
  const events: Array<keyof GameEvents> = [];
  for (const k of ['player:jumped', 'player:dashed', 'player:attacked'] as const) session.bus.on(k, () => void events.push(k));
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) session.tick(input.sample());
  };
  step(20);
  return { session, input, pad, pads, handle, events, step, body: session.player.body, p: session.player };
}

describe('gamepad drives the hero', () => {
  it('the stick runs at the run speed and a gentle tilt walks', () => {
    const run = setup();
    run.pad.stick(1, 0);
    run.step(40);
    expect(run.body.vx).toBeCloseTo(T.runSpeed, 6);
    const walk = setup();
    walk.pad.stick(0.5, 0);
    walk.step(40);
    expect(walk.body.vx).toBeGreaterThan(1);
    expect(walk.body.vx).toBeLessThan(T.walkSpeed);
  });

  it('the dead zone holds the hero still, and a stick pulled left runs left', () => {
    const s = setup();
    s.session.player.respawn(40, 0, 1);
    s.session.collision.probeGround(s.body);
    s.step(10);
    const x0 = s.body.x;
    s.pad.stick(0.2, 0); // drift
    s.step(30);
    expect(s.body.x).toBe(x0);
    s.pad.stick(-1, 0);
    s.step(30);
    expect(s.body.vx).toBeLessThan(-8);
  });

  it('A jumps, with the variable height of the simulation: held gives the full jump, tapped is a hop', () => {
    const held = setup();
    held.pad.press(PAD.A);
    let top = 0;
    for (let i = 0; i < 70; i++) {
      held.step(1);
      top = Math.max(top, held.body.y);
    }
    expect(held.events).toContain('player:jumped');
    expect(top).toBeGreaterThan(T.jumpHeight - 0.15);

    const tap = setup();
    tap.pad.press(PAD.A);
    tap.step(1);
    tap.pad.release(PAD.A);
    let hop = 0;
    for (let i = 0; i < 60; i++) {
      tap.step(1);
      hop = Math.max(hop, tap.body.y);
    }
    expect(hop).toBeLessThan(T.jumpHeight * 0.75);
  });

  it('X attacks, B dashes, and the D-pad down crouches', () => {
    const s = setup();
    s.pad.press(PAD.X);
    s.step(2);
    s.pad.release(PAD.X);
    expect(s.events).toContain('player:attacked');
    s.step(40);
    s.pad.press(PAD.B);
    s.step(2);
    s.pad.release(PAD.B);
    expect(s.events).toContain('player:dashed');
    s.step(40);
    s.pad.press(PAD.DOWN);
    s.step(5);
    expect(s.p.controller.crouched).toBe(true);
    s.pad.release(PAD.DOWN);
    s.step(5);
    expect(s.p.controller.crouched).toBe(false);
  });

  it('stick down crouches with the same hysteresis as the keys', () => {
    const s = setup();
    s.pad.stick(0, 1); // the API's +y is down
    s.step(5);
    expect(s.p.controller.crouched).toBe(true);
    s.pad.stick(0, 0);
    s.step(5);
    expect(s.p.controller.crouched).toBe(false);
  });

  it('down + A drops through a one-way platform (no button of its own)', () => {
    const s = setup();
    s.session.player.respawn(64, 2.7, 1); // one_way_a of the playground
    s.session.collision.probeGround(s.body);
    s.step(10);
    expect(s.body.ground?.kind).toBe('oneway');
    s.pad.press(PAD.DOWN).press(PAD.A);
    s.step(3);
    s.pad.release(PAD.A);
    s.step(60);
    expect(s.body.y).toBeLessThan(0.5);
  });

  it('unplugging the pad while running stops the hero: nothing stays pressed', () => {
    const s = setup();
    s.pad.stick(1, 0);
    s.step(20);
    expect(s.body.vx).toBeGreaterThan(5);
    s.pad.disconnect();
    s.step(30);
    expect(s.body.vx).toBe(0);
  });

  it('the pad and the keyboard are one input: the stronger axis decides and a tie goes to the digital key (no jitter)', () => {
    const s = setup();
    s.input.registerSource('kb', 'keyboard');
    s.input.setAction('kb', 'right', true);
    s.pad.stick(-1, 0); // equal magnitude, opposite direction: the key (read first) keeps the tie
    s.step(30);
    expect(s.body.vx).toBeCloseTo(T.runSpeed, 6);
    s.pad.stick(-1, 0).stick(-1, 0);
    s.input.setAction('kb', 'right', false);
    s.step(30);
    expect(s.body.vx).toBeCloseTo(-T.runSpeed, 6); // the key let go: the stick is alone again
  });

  it('is deterministic: the same pad movements at the same ticks give the same hero, bit for bit', () => {
    const run = () => {
      const s = setup();
      s.pad.stick(1, 0).press(PAD.A);
      s.step(10);
      s.pad.release(PAD.A).press(PAD.X);
      s.step(3);
      s.pad.release(PAD.X).press(PAD.B);
      s.step(40);
      return [s.body.x, s.body.y, s.body.vx, s.body.vy, s.p.controller.state, s.session.rng.state];
    };
    expect(run()).toEqual(run());
  });
});
