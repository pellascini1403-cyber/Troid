import { describe, expect, it } from 'vitest';
import { InputManager } from '@/input/InputManager';

function make() {
  const input = new InputManager();
  input.registerSource('kb', 'keyboard');
  input.registerSource('touch', 'touch');
  input.registerSource('pad', 'gamepad');
  return input;
}

describe('InputManager', () => {
  it('a tap that starts and ends between two ticks still yields exactly one pressed frame', () => {
    const input = make();
    input.setAction('kb', 'jump', true);
    input.setAction('kb', 'jump', false); // released before the sim ever sampled
    const f1 = input.sample();
    expect(f1.jumpPressed).toBe(true);
    expect(f1.jumpReleased).toBe(true);
    expect(f1.jumpHeld).toBe(false);
    const f2 = input.sample();
    expect(f2.jumpPressed).toBe(false);
    expect(f2.jumpReleased).toBe(false);
  });

  it('a held button is "pressed" only on the first tick but "held" on all of them', () => {
    const input = make();
    input.setAction('kb', 'attack', true);
    // sample() returns one reused object: read each frame immediately
    const read = () => {
      const f = input.sample();
      return [f.attackPressed, f.attackHeld];
    };
    expect([read(), read(), read()]).toEqual([[true, true], [false, true], [false, true]]);
    input.setAction('kb', 'attack', false);
    expect(input.sample().attackHeld).toBe(false);
  });

  it('key repeat does not create phantom presses (setting an already-held action is not an edge)', () => {
    const input = make();
    input.setAction('kb', 'dash', true);
    input.sample();
    input.setAction('kb', 'dash', true);
    input.setAction('kb', 'dash', true);
    expect(input.sample().dashPressed).toBe(false);
  });

  it('ORs sources: releasing the key does not cancel a button still held by touch', () => {
    const input = make();
    input.setAction('kb', 'jump', true);
    input.setAction('touch', 'jump', true);
    input.sample();
    input.setAction('kb', 'jump', false);
    const f = input.sample();
    expect(f.jumpHeld).toBe(true);
    expect(f.jumpReleased).toBe(false);
    input.setAction('touch', 'jump', false);
    expect(input.sample().jumpReleased).toBe(true);
  });

  it('digital directions give exactly -1 / 0 / 1 and opposite keys cancel', () => {
    const input = make();
    input.setAction('kb', 'right', true);
    expect(input.sample().move.x).toBe(1);
    input.setAction('kb', 'left', true);
    expect(input.sample().move.x).toBe(0);
    input.setAction('kb', 'right', false);
    expect(input.sample().move.x).toBe(-1);
  });

  it('the strongest analog axis wins and the result stays inside the unit circle', () => {
    const input = make();
    input.setAxis('pad', 0.3, 0);
    input.setAxis('touch', 0.8, 0);
    expect(input.sample().move.x).toBeCloseTo(0.8);
    input.setAxis('touch', 1, 1);
    const f = input.sample();
    expect(Math.hypot(f.move.x, f.move.y)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('the walk modifier halves keyboard speed so keyboard players can walk too', () => {
    const input = make();
    input.setAction('kb', 'right', true);
    input.setAction('kb', 'walk', true);
    expect(input.sample().move.x).toBe(0.5);
  });

  it('releaseSource clears everything a device was holding (blur, pointercancel, pad unplugged)', () => {
    const input = make();
    input.setAction('kb', 'right', true);
    input.setAction('kb', 'jump', true);
    input.setAxis('kb', 0.7, 0);
    input.sample();
    input.releaseSource('kb');
    const f = input.sample();
    expect(f.move.x).toBe(0);
    expect(f.jumpHeld).toBe(false);
    expect(f.jumpReleased).toBe(true);
  });

  it('releaseAll clears every source', () => {
    const input = make();
    input.setAction('kb', 'left', true);
    input.setAction('touch', 'attack', true);
    input.releaseAll();
    const f = input.sample();
    expect(f.move.x).toBe(0);
    expect(f.attackHeld).toBe(false);
  });

  it('remembers the last used device (prompts adapt: keyboard / touch / gamepad)', () => {
    const input = make();
    input.setAction('kb', 'jump', true);
    expect(input.sample().device).toBe('keyboard');
    input.setAction('touch', 'attack', true);
    expect(input.sample().device).toBe('touch');
    input.setAxis('pad', 0.9, 0);
    expect(input.sample().device).toBe('gamepad');
  });

  it('polled devices run at the start of every sample', () => {
    const input = make();
    let calls = 0;
    input.addPoller(() => {
      calls++;
      input.setAction('pad', 'ability', true);
    });
    expect(input.sample().abilityPressed).toBe(true);
    input.sample();
    expect(calls).toBe(2);
  });

  it('the frame object is reused (no per-tick allocation)', () => {
    const input = make();
    expect(input.sample()).toBe(input.sample());
  });

  it('convenience getters mirror the last sampled frame (Input.Move, Input.JumpPressed…)', () => {
    const input = make();
    input.setAction('kb', 'right', true);
    input.setAction('kb', 'jump', true);
    input.sample();
    expect(input.move.x).toBe(1);
    expect(input.jumpPressed).toBe(true);
    expect(input.dashPressed).toBe(false);
    expect(input.attackPressed).toBe(false);
    expect(input.abilityPressed).toBe(false);
  });
});
