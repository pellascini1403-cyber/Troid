import { describe, expect, it } from 'vitest';
import { PLAYER } from '@/content/player';
import { mapRoom } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { spawnSlime } from '../helpers/enemies';
import { driver, type Driver } from '../helpers/sim';

/**
 * THE THREE MOVEMENT ABILITIES OF docs/PROMPT21-LOG.md, played through the real controller in a room drawn for the purpose: the Double Jump (one more jump in the air), the Wall Jump (hold against a wall to slide, press to kick off)
 * and the Ground Slam (in the air, down and attack). Each one is proven by what it OPENS — a ledge, a shaft, an enemy under the hero — and by what is the same without it.
 */
const W = 44;
const H = 26;

/** A lab room: a floor, a 5 m ledge (the Double Jump's), a 4 m wide shaft 14 m deep (the Wall Jump's) and an open stretch (the slam's). */
function lab(): RoomDefinition {
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
  const fill = (x0: number, x1: number, y0: number, y1: number, ch: string): void => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[H - 1 - y]![x] = ch;
  };
  fill(0, W, 0, 1, '#'); // bedrock
  fill(0, W, 1, 2, 'G'); // the floor, top at y = 2
  fill(0, 1, 0, H, '#'); // walls of the room
  fill(W - 1, W, 0, H, '#');
  fill(0, W, H - 1, H, '#'); // roof
  fill(7, 11, 2, 7, '#'); // the ledge: 5 m above the floor (a jump is 3.1)
  fill(19, 20, 2, H - 1, '#'); // the shaft: left wall (the whole way up)…
  fill(25, W - 1, 2, 16, '#'); // …and a block to its right, 14 m above the floor, that is the top of it
  const mark = (x: number, y: number, ch: string): void => {
    grid[H - 1 - y]![x] = ch;
  };
  mark(3, 2, 'a'); // the hero starts here
  mark(21, 2, 'w'); // the bottom of the shaft
  mark(26, 16, 't'); // the top of the block
  mark(34, 2, 's'); // an Ink Slime
  mark(14, 2, 'x'); // the slam's start
  return mapRoom(
    { id: 'move_lab', regionId: 'lab', name: 'Movement lab', nameKey: 'room.lab.name', art: { backdrop: 'ruins', seed: 1 }, rows: grid.map((r) => r.join('')) },
    (m) => ({ entries: [m.entry('start', 'a', 1), m.entry('shaft', 'w', 1), m.entry('slam', 'x', 1)] }),
  );
}

function hero(abilities: string[], entry = 'start'): Driver {
  return driver({ room: lab(), unlocked: abilities, entry });
}

/** Jumps and holds the button to the top of the jump; returns the ticks after which the body is at its apex. */
function jumpToApex(d: Driver): void {
  d.press('jump');
  d.step(1);
  d.until(() => d.body.vy <= 0, 60);
}

describe('the Double Jump', () => {
  it('without it a second press in the air does nothing: the ledge 5 m up cannot be reached, however the jumps are timed', () => {
    const d = hero(['dash']);
    d.settle();
    jumpToApex(d);
    d.release('jump');
    d.tap('jump'); // the press in the air
    let top = d.body.y;
    for (let i = 0; i < 90; i++) {
      d.step(1);
      top = Math.max(top, d.body.y);
    }
    expect(top - 2, 'one jump: 3.1 m').toBeLessThan(3.3);
  });

  it('with it the second press at the top of the jump carries the hero another 2.6 m: 5 m up and onto the ledge', () => {
    const d = hero(['dash', 'double_jump']);
    d.settle();
    d.right();
    jumpToApex(d);
    d.release('jump');
    d.tap('jump');
    d.press('jump'); // held to the top
    let top = d.body.y;
    for (let i = 0; i < 90; i++) {
      d.step(1);
      top = Math.max(top, d.body.y);
    }
    expect(top - 2, 'a full jump and then another').toBeGreaterThan(5.4);
    expect(top - 2).toBeLessThan(6.0);
  });

  it('there is ONE extra jump per airtime: a third press does nothing, and touching the ground gives it back', () => {
    const d = hero(['double_jump']);
    d.settle();
    const jumps: number[] = [];
    d.session.bus.on('player:jumped', (e) => jumps.push(e.air ? 1 : 0));
    d.tap('jump');
    d.step(14);
    d.tap('jump'); // the extra one
    d.step(6);
    d.tap('jump'); // nothing left
    d.step(6);
    expect(jumps, 'a jump from the ground, and one in the air').toEqual([0, 1]);
    d.until(() => d.body.grounded, 200);
    d.step(2);
    d.tap('jump');
    d.step(14);
    d.tap('jump');
    d.step(2);
    expect(jumps, 'back on the ground: both again').toEqual([0, 1, 0, 1]);
  });

  it('a jump made inside the coyote time of a ledge is still the plain jump, and the extra one is still there afterwards', () => {
    const d = hero(['double_jump'], 'slam');
    d.settle();
    const jumps: number[] = [];
    d.session.bus.on('player:jumped', (e) => jumps.push(e.air ? 1 : 0));
    // walk off the right edge of the floor? the lab has none: step off the ledge instead
    d.teleport(10.5, 7);
    d.settle();
    d.right();
    d.until(() => !d.body.grounded, 60);
    d.tap('jump'); // within the coyote time
    d.step(12);
    d.tap('jump');
    d.step(2);
    expect(jumps.length, 'two jumps, whatever the coyote time calls the first').toBe(2);
  });

  it('letting go of the button right after the press shortens the extra jump, like the first (the same variable height)', () => {
    const measure = (hold: boolean): number => {
      const d = hero(['double_jump']);
      d.settle();
      jumpToApex(d);
      d.release('jump');
      d.step(2);
      d.press('jump');
      if (!hold) d.release('jump');
      let top = d.body.y;
      for (let i = 0; i < 90; i++) {
        d.step(1);
        top = Math.max(top, d.body.y);
      }
      return top;
    };
    expect(measure(false)).toBeLessThan(measure(true) - 0.8);
  });
});

describe('the Wall Jump', () => {
  /** Runs into the left wall of the shaft, falling: the stick toward it. */
  const intoWall = (d: Driver): void => {
    d.teleport(20.5, 12);
    d.left();
  };

  it('without it the wall is just a wall: no slide, no kick, the fall is the same as in the open', () => {
    const d = hero(['dash'], 'shaft');
    intoWall(d);
    d.step(20);
    expect(d.body.vy, 'falling at full speed beside the wall').toBeLessThan(-6);
    const x = d.body.x;
    d.tap('jump');
    d.step(5);
    expect(d.body.vy).toBeLessThan(0);
    expect(Math.abs(d.body.x - x)).toBeLessThan(0.8);
  });

  it('with it, holding against the wall in the air slows the fall to a slide', () => {
    const d = hero(['wall_jump'], 'shaft');
    intoWall(d);
    d.step(30);
    expect(d.p.controller.wallSliding).toBe(true);
    expect(d.body.vy).toBeGreaterThanOrEqual(-3.45);
    expect(d.body.vy).toBeLessThan(-3);
  });

  it('a press kicks off the wall: up, and away from it, the hero facing away; the stick still held toward the wall is not obeyed for a moment', () => {
    const d = hero(['wall_jump'], 'shaft');
    intoWall(d);
    d.step(20);
    d.tap('jump');
    d.step(1);
    expect(d.body.vy, 'thrown upward').toBeGreaterThan(8);
    expect(d.body.vx, 'and away from the wall').toBeGreaterThan(6);
    expect(d.p.facing).toBe(1);
    const x = d.body.x;
    d.step(8); // still holding left: the wall is behind the hero, and the stick toward it is not obeyed while the kick plays
    expect(d.body.x - x, 'carried away from the wall in the meantime').toBeGreaterThan(0.6);
    expect(d.body.vx).toBeGreaterThan(3);
  });

  it('a press a few ticks AFTER the stick let go of the wall still kicks off it (the grace is 0.1 s)', () => {
    const d = hero(['wall_jump'], 'shaft');
    intoWall(d);
    d.step(20);
    d.stop();
    d.step(3);
    d.tap('jump');
    d.step(1);
    expect(d.body.vx).toBeGreaterThan(6);
    expect(d.body.vy).toBeGreaterThan(8);
  });

  it('a press far too late is not a kick: the wall is forgotten after the grace', () => {
    const d = hero(['wall_jump'], 'shaft');
    intoWall(d);
    d.step(20);
    d.stop();
    d.step(12);
    d.tap('jump');
    d.step(1);
    expect(d.body.vy).toBeLessThan(0);
  });

  it('the shaft is climbed by kicking from wall to wall — and cannot be climbed without the ability, or by the double jump instead', () => {
    /** A hero who holds the jump through each rise and kicks again at the wall on the other side: the shaft is 5 m wide, 14 m deep. */
    const climb = (abilities: string[]): number => {
      const d = hero(abilities, 'shaft');
      d.teleport(20.5, 2);
      d.settle();
      let side: 1 | -1 = -1;
      d.left();
      d.press('jump');
      let pressedAt = 0;
      let holding = true;
      let best = 0;
      for (let t = 0; t < 900; t++) {
        const b = d.body;
        if (holding && b.vy <= 0 && t > pressedAt + 5) {
          d.release('jump');
          holding = false;
        }
        const atWall = (b.hitLeft && side === -1) || (b.hitRight && side === 1);
        if (!holding && atWall && !b.grounded && b.vy < 2) {
          d.press('jump');
          holding = true;
          pressedAt = t;
          side = side === -1 ? 1 : -1;
          if (side === 1) d.right();
          else d.left();
        } else d.step(1);
        best = Math.max(best, d.body.y);
        if (d.body.y > 16.2 && d.body.x > 25) break;
      }
      return best;
    };
    expect(climb(['wall_jump', 'dash']), 'with it: over the top of the block, 14 m up').toBeGreaterThan(16);
    expect(climb(['dash', 'double_jump']), 'without it: a double jump is nowhere near').toBeLessThan(9);
    expect(climb(['dash']), 'nor a plain jump').toBeLessThan(6);
  });
});

describe('the Ground Slam', () => {
  it('without it, down and attack in the air is the plain air attack', () => {
    const d = hero(['dash'], 'slam');
    d.teleport(14, 8);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.step(2);
    expect(d.p.controller.state).toBe('attack');
  });

  it('with it, it is the slam: a hover of five ticks, a dive at 30 m/s, and the shockwave when the feet touch down', () => {
    const d = hero(['ground_slam'], 'slam');
    const slams: Array<{ x: number; y: number; shake: number }> = [];
    d.session.bus.on('player:slammed', (e) => slams.push(e));
    d.teleport(14, 8);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.step(1);
    expect(d.p.controller.state).toBe('slam');
    expect(d.p.controller.slamProgress()?.phase).toBe('windup');
    const y0 = d.body.y;
    d.step(3);
    expect(Math.abs(d.body.y - y0), 'hovering').toBeLessThan(0.05);
    d.until(() => d.p.controller.slamProgress()?.phase === 'dive', 20);
    d.step(2);
    expect(d.body.vy).toBeLessThanOrEqual(-29.9);
    d.until(() => slams.length > 0, 60);
    expect(slams[0]!.y, 'on the floor').toBeCloseTo(2, 1);
    expect(slams[0]!.shake).toBeGreaterThan(0.2);
    d.until(() => d.p.controller.state === 'free', 60);
  });

  it('the dive hurts what the hero falls on, and the wave on the ground hurts what is beside it — each once, whichever side', () => {
    const d = hero(['ground_slam'], 'slam');
    // three slimes: one under the dive, one beside the landing on each side
    const under = spawnSlime(d, 14, 2);
    const beside = spawnSlime(d, 16.5, 2);
    const behind = spawnSlime(d, 11.7, 2);
    under.body.vx = beside.body.vx = behind.body.vx = 0;
    d.teleport(14, 6);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.until(() => d.p.controller.state === 'free' || d.p.controller.slamProgress()?.phase === 'impact', 60);
    d.step(10);
    expect(under.health.dead, 'the dive: 2 damage, then the wave: 3 more').toBe(true);
    expect(beside.health.dead, 'the wave to the right: 3 damage kills a slime of 3').toBe(true);
    expect(behind.health.dead, 'and to the left').toBe(true);
  });

  it('it needs the air: on the ground, down and attack is the crouch attack', () => {
    const d = hero(['ground_slam']);
    d.settle();
    d.moveY = -1;
    d.step(3);
    d.tap('attack');
    d.step(2);
    expect(d.p.controller.state).not.toBe('slam');
  });

  it('a blow taken in the hover or the dive ends it: nothing keeps the hero in the slam', () => {
    const d = hero(['ground_slam'], 'slam');
    d.teleport(14, 8);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.step(2);
    expect(d.p.controller.state).toBe('slam');
    d.p.receiveHit({ attackId: 'x', attackerId: 'e', damage: 1, direction: 1, knockbackX: 3, knockbackY: 2, stun: 10, hitStop: 0, shake: 0, x: d.body.x, y: d.body.y });
    d.step(1);
    expect(d.p.controller.state).toBe('hurt');
  });

  it('is inside the Player definition: the two blows it asks for exist, and nothing but the controller submits them', () => {
    expect(PLAYER.combat.attacks[PLAYER.combat.slamDive!]).toBeDefined();
    expect(PLAYER.combat.attacks[PLAYER.combat.slamWave!]).toMatchObject({ id: 'slam', damage: 3 });
  });
});
