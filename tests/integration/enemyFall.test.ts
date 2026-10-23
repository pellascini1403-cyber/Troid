import { describe, expect, it } from 'vitest';
import type { Enemy } from '@/enemies/Enemy';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { driver, type Driver } from '../helpers/sim';

/**
 * WHAT A DOOR WAITS FOR IS NEVER LOST BELOW THE ROOM (docs/PROMPT20-LOG.md): a room with a pit that has no floor — the one in R1 is the shape of it — and a slime that guards the way on. A blow can throw an enemy
 * over a ledge, and a body that falls out of the world is not the player's to rescue: left to fall it would never be beaten, its flag would never be set and the hero would be shut in with nothing to fight. It
 * comes back where it was placed, alive and with the life it had; and the way on opens when it is beaten there.
 */
const PIT_ROOM: RoomDefinition = {
  id: 'pit_room',
  regionId: 'test',
  name: 'A pit and a door',
  bounds: rect(-2, -14, 72, 20),
  killY: -20,
  entries: [{ id: 'start', x: 4, y: 0, facing: 1 }],
  solids: [
    block('wall_l', -3, -14, -1, 20),
    block('wall_r', 71, -14, 73, 20),
    ground('g_a', -1, 22), // the ground the slime guards…
    ground('g_b', 28, 71), // …and the one across a pit of 6 m with NO floor
    block('door', 60, 0, 61.5, 8, 'gate'),
  ],
  spawns: [{ id: 'guard', enemy: 'ink_slime', x: 20, y: 0, facing: 1, defeatFlag: 'defeated:guard' }],
  gates: [{ id: 'door_1', solid: 'door', openWhen: 'defeated:guard' }],
};

const make = (): Driver => {
  const d = driver({ room: PIT_ROOM, unlocked: ['dash'] });
  d.settle();
  return d;
};
const slime = (d: Driver): Enemy => d.session.entities.find((e) => e.kind === 'enemy') as Enemy;

describe('an enemy that falls out of the world', () => {
  it('is put back where it was placed, alive and with the life it had, instead of falling for ever', () => {
    const d = make();
    const e = slime(d);
    e.health.damage(1);
    const life = e.health.current;
    e.teleport(25, 3); // over the pit
    let lowest = 0;
    for (let i = 0; i < 400; i++) {
      d.step(1);
      lowest = Math.min(lowest, e.body.y);
      if (lowest < -15 && e.body.y > -1) break; // it fell, and it is back
    }
    // (it is put back in the very tick it crosses the line under which the hero is rescued, so no sample sees it below it)
    expect(lowest, 'it did fall, a long way, before it was put back').toBeLessThan(-15);
    expect(e.body.x).toBeCloseTo(20, 1);
    expect(e.body.y).toBeGreaterThan(-1);
    expect(e.health.current).toBe(life);
    expect(e.health.dead).toBe(false);
    expect(d.session.entities.includes(e), 'it is still the same body in the world').toBe(true);
    d.step(60);
    expect(e.body.y, 'and it stands on the ground it was placed on').toBeCloseTo(0, 2);
  });

  it('the way on is not lost: the slime that fell and came back can be beaten where it is, and its fall opens the door', () => {
    const d = make();
    d.session.godMode = true; // the point is the way on, not the fight
    const e = slime(d);
    e.teleport(25, 3);
    d.step(300);
    expect(d.session.flags.has('defeated:guard')).toBe(false);
    expect(d.session.gateOpen('door_1')).toBe(false);
    expect(e.body.y).toBeGreaterThan(-1);
    // the hero strikes it where it stands now
    for (let i = 0; i < 12 && !d.session.flags.has('defeated:guard'); i++) {
      d.teleport(e.body.x - 1.5, 0).step(2);
      d.tap('attack');
      d.step(30);
    }
    expect(d.session.flags.has('defeated:guard')).toBe(true);
    expect(d.session.gateOpen('door_1')).toBe(true);
  });

  it('a body that is already gone is let fall (it is dissolving: nothing waits for it)', () => {
    const d = make();
    const e = slime(d);
    d.session.combat.submit({ ownerId: d.p.id, team: 'player', rect: { x0: e.body.x - 0.5, x1: e.body.x + 0.5, y0: 0, y1: 1 }, attackId: 'test_kill', damage: 99, knockback: { x: 0, y: 0 }, stun: 0, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set() });
    d.step(1);
    expect(e.health.dead).toBe(true);
    e.teleport(25, -19);
    d.step(60);
    expect(e.body.y, 'a dead one is not brought back').toBeLessThan(-20);
    d.step(60);
    expect(d.session.entities.includes(e)).toBe(false);
  });

  it('the hero\'s own rescue is not disturbed: they come back to the last ground they stood on', () => {
    const d = make();
    d.teleport(25, -5);
    d.step(300);
    expect(d.body.x).toBeLessThan(23);
    expect(d.body.y).toBeGreaterThan(-1);
  });
});
