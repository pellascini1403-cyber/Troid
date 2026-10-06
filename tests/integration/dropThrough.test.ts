import { describe, expect, it } from 'vitest';
import { driver } from '../helpers/sim';
import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * Dropping through a one-way platform (docs/GAME-SPEC-2D.md §4.3.3): "down + jump" on keyboard and gamepad (already
 * covered by movement.test.ts), and the `dropPressed` edge — the flick down of the touch controls — which only ever acts
 * on a one-way platform: anywhere else it is ignored.
 */
function room(extra: RoomDefinition['solids'] = []): RoomDefinition {
  return {
    id: 'drop', regionId: 't', name: 'drop', bounds: rect(-5, -20, 200, 40), killY: -30,
    entries: [{ id: 's', x: 10, y: 0 }],
    solids: [ground('a', -5, 200), block('wl', -7, -20, -5, 40), ...extra],
  };
}

describe('dropPressed', () => {
  const R = room([oneWay('ow', 10, 20, 2.5), block('crate', 30, 0, 34, 1.5, 'stone')]);

  it('falls through the one-way platform the player stands on', () => {
    const d = driver({ room: R });
    d.teleport(15, 2.5).settle();
    expect(d.body.ground?.kind).toBe('oneway');
    d.tap('drop');
    d.until(() => d.body.y < 1, 100);
    expect(d.body.y).toBeLessThan(1);
    d.until(() => d.body.grounded, 100);
    expect(d.body.y).toBe(0); // all the way down to the floor
  });

  it('needs no vertical axis: a drop is a drop whatever the finger does to move.y', () => {
    const d = driver({ room: R });
    d.teleport(15, 2.5).settle();
    expect(d.moveY).toBe(0);
    d.tap('drop');
    d.until(() => !d.body.grounded, 20);
    expect(d.body.grounded).toBe(false);
  });

  it('does nothing on solid ground: no hop, no crouch, still grounded on the same spot', () => {
    const d = driver({ room: R });
    d.teleport(5, 0).settle();
    const { x, y } = d.body;
    d.tap('drop').step(30);
    expect(d.body.grounded).toBe(true);
    expect([d.body.x, d.body.y]).toEqual([x, y]);
    expect(d.p.controller.state).toBe('free');
  });

  it('does nothing on top of a solid block either', () => {
    const d = driver({ room: R });
    d.teleport(32, 1.5).settle();
    expect(d.body.ground?.kind).toBe('solid');
    d.tap('drop').step(30);
    expect(d.body.y).toBeCloseTo(1.5, 6);
    expect(d.body.grounded).toBe(true);
  });

  it('is remembered for a few ticks, so a flick that lands a hair early still works', () => {
    const d = driver({ room: R });
    d.teleport(15, 2.6); // 10 cm above the platform: lands on it within a few ticks
    d.tap('drop');
    d.until(() => d.body.grounded, 30);
    // landed on the platform with the press still alive... or already past it: either way the player must end on the floor
    d.step(60);
    expect(d.body.grounded).toBe(true);
    expect(d.body.y).toBe(0);
  });

  it('is NOT remembered for long: a press far above the platform does not drop the player later', () => {
    const d = driver({ room: R });
    d.teleport(15, 8); // a long fall: well over the buffer
    d.tap('drop');
    d.until(() => d.body.grounded, 120);
    expect(d.body.y).toBeCloseTo(2.5, 6); // landed ON the platform and stayed there
    d.step(30);
    expect(d.body.y).toBeCloseTo(2.5, 6);
  });

  it('survives a hit-stop: a flick made while the world is frozen acts on the first tick after it', () => {
    const d = driver({ room: R });
    d.teleport(15, 2.5).settle();
    d.session.requestHitStop(4);
    d.tap('drop'); // consumed by the freeze, latched, delivered after it
    d.step(3);
    d.until(() => d.body.y < 1, 100);
    expect(d.body.y).toBeLessThan(1);
  });

  it('down + jump keeps working next to it (keyboard and gamepad)', () => {
    const d = driver({ room: R });
    d.teleport(15, 2.5).settle();
    d.moveY = -1;
    d.tap('jump');
    d.until(() => d.body.y < 1, 100);
    expect(d.body.y).toBeLessThan(1);
  });

  it('works from a crouch too (the body stands up on the way down)', () => {
    const d = driver({ room: R });
    d.teleport(15, 2.5).settle();
    d.moveY = -1;
    d.step(5);
    expect(d.p.controller.crouched).toBe(true);
    d.tap('drop');
    d.until(() => d.body.y < 1, 100);
    expect(d.body.y).toBeLessThan(1);
  });
});
