import { describe, expect, it } from 'vitest';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';
import { ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { driver } from '../helpers/sim';

/**
 * The Air Dash (docs/PROMPT6-LOG.md S29), the reward of the Ink Warden: one more dash in the air. The dash itself allows one in the air per jump
 * (`airDashes: 1`); the Air Dash adds a second, and nothing else about the dash changes — the same speed, the same i-frames, the same cooldown, the
 * same refill on landing. Without the ability the second press in the air does nothing.
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

function airborne(unlocked: string[]) {
  const d = driver({ room: sky, unlocked, extra: { rooms: { sky } } });
  const dashes: boolean[] = [];
  d.session.bus.on('player:dashed', (e) => dashes.push(e.air));
  d.step(10);
  d.teleport(10, 45); // high above the floor: three dashes fit in the fall
  d.step(2);
  return { d, dashes };
}
/** One dash press and the wait until the next one may start. */
function dashNow(d: ReturnType<typeof airborne>['d']): void {
  d.right();
  d.tap('dash');
  d.step(Math.ceil((DEFAULT_MOVEMENT.dash.duration + DEFAULT_MOVEMENT.dash.cooldown) * 60) + 2); // the cooldown runs from the end of the dash
}

describe('the dash in the air', () => {
  it('without the Air Dash: one dash in the air per jump — the second press does nothing', () => {
    const { d, dashes } = airborne(['dash']);
    expect(d.body.grounded).toBe(false);
    dashNow(d);
    expect(dashes).toEqual([true]);
    expect(d.body.grounded, 'still in the air').toBe(false);
    dashNow(d);
    expect(dashes, 'the second one is refused').toEqual([true]);
  });

  it('with the Air Dash: two dashes in the air, and no third', () => {
    const { d, dashes } = airborne(['dash', 'air_dash']);
    dashNow(d);
    dashNow(d);
    expect(dashes).toEqual([true, true]);
    dashNow(d);
    expect(dashes, 'only one more than the dash allows').toEqual([true, true]);
  });

  it('landing refills them: after touching the ground the hero has both again', () => {
    const { d, dashes } = airborne(['dash', 'air_dash']);
    dashNow(d);
    dashNow(d);
    d.stop();
    d.until(() => d.body.grounded, 400);
    d.step(40);
    d.teleport(10, 45); // up again
    d.step(2);
    dashNow(d);
    dashNow(d);
    expect(dashes.filter(Boolean)).toHaveLength(4);
  });

  it('the ability changes nothing on the ground: a dash there is a dash, with or without it', () => {
    for (const unlocked of [['dash'], ['dash', 'air_dash']]) {
      const d = driver({ room: sky, unlocked, extra: { rooms: { sky } } });
      const dashes: boolean[] = [];
      d.session.bus.on('player:dashed', (e) => dashes.push(e.air));
      d.step(10);
      d.right();
      d.tap('dash');
      d.step(40);
      expect(dashes, unlocked.join('+')).toEqual([false]);
    }
  });

  it('the Air Dash alone is not a dash: without `dash` nothing happens, in the air or out of it', () => {
    const { d, dashes } = airborne(['air_dash']);
    dashNow(d);
    expect(dashes).toEqual([]);
  });

  it('a dash in the air keeps its i-frames and its speed: the second one is as good as the first', () => {
    const { d, dashes } = airborne(['dash', 'air_dash']);
    dashNow(d);
    d.right();
    d.tap('dash');
    expect(dashes).toEqual([true, true]);
    expect(d.p.invulnerable, 'the i-frames of a dash').toBe(true);
    expect(Math.abs(d.body.vx)).toBeGreaterThan(DEFAULT_MOVEMENT.dash.speed * 0.9);
  });
});
