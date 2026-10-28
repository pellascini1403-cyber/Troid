import { describe, expect, it } from 'vitest';
import { ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { driver } from '../helpers/sim';

/**
 * A reset in the middle of a dash (found in Prompt 22 by a solver whose trials affected one another): the way out of a room, a hazard, a death — each puts the hero somewhere with `Player.respawn`, which clears the controller
 * and goes to the free state. Leaving the dash runs its exit, which hands back the climb the dash had saved and starts the cooldown AFTER the clearing: the hero arrived in the next room rising at 10 m/s, with a dash not yet ready.
 */
const sky: RoomDefinition = {
  id: 'sky',
  regionId: 't',
  name: 'Sky',
  bounds: rect(-5, -20, 200, 60),
  killY: -30,
  entries: [{ id: 's', x: 10, y: 0 }],
  solids: [ground('a', -5, 200)],
};

describe('a reset in the middle of a dash', () => {
  it('leaves the hero standing still where they are put, with the dash ready: no climb handed back, no cooldown', () => {
    const d = driver({ room: sky, unlocked: ['dash'], extra: { rooms: { sky } } });
    d.step(10);
    d.teleport(10, 30);
    d.body.vy = 12; // rising when the dash begins: the dash saves that climb
    d.right();
    d.tap('dash');
    d.step(2);
    expect(d.p.controller.dashing, 'in the middle of the dash').toBe(true);
    expect(d.body.vx).toBeGreaterThan(10);

    d.p.respawn(60, 0, -1);

    expect(d.p.controller.dashing).toBe(false);
    expect(d.p.controller.state).toBe('free');
    expect(d.body.vx).toBe(0);
    expect(d.body.vy, 'no hop on arrival').toBe(0);
    expect(d.p.controller.dashCooldown01, 'the dash is ready').toBe(0);
    d.stop();
    d.step(1);
    expect(d.body.y, 'the hero stands where they were put').toBeCloseTo(0, 5);
  });
});
