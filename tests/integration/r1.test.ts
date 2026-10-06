import { describe, expect, it } from 'vitest';
import { ENEMIES, ROOMS } from '@/content';
import type { Enemy } from '@/enemies/Enemy';
import { runBot } from '../helpers/bot';
import { driver, type Driver } from '../helpers/sim';

/**
 * R1 «Puerta de las Ruinas» proven by PHYSICS (docs/MIGRATION-2D.md S10 gate: "alcanzabilidad por física"): a scripted
 * player with the same inputs a person has walks it from the entrance to the exit — jumping the hurdle and the pit, crawling
 * through the low passage, beating the Ink Slime and going through the door it guarded. If a retune of the jump, the crouch
 * or the slime makes the room impossible, this is the test that says so.
 */
const R1 = ROOMS.r1_gate!;
const CROUCH = [[60.5, 77.4]] as const;

function r1(extra: Parameters<typeof driver>[0] = {}): Driver {
  const d = driver({ room: R1, unlocked: ['dash'], ...extra });
  d.settle();
  return d;
}
const slimeOf = (d: Driver): Enemy | undefined => d.session.entities.find((e) => e.kind === 'enemy') as Enemy | undefined;

/** Records what happened, in order, for assertions and for the determinism comparison. */
function watch(d: Driver): string[] {
  const log: string[] = [];
  const bus = d.session.bus;
  bus.on('exit:reached', (e) => log.push(`${d.session.now} exit:${e.exitId}`));
  bus.on('gate:changed', (e) => log.push(`${d.session.now} gate:${e.gateId}:${e.open}`));
  bus.on('flag:set', (e) => log.push(`${d.session.now} flag:${e.flag}`));
  bus.on('actor:died', (e) => log.push(`${d.session.now} died:${e.team}`));
  bus.on('player:hurt', () => log.push(`${d.session.now} hurt`));
  bus.on('player:died', () => log.push(`${d.session.now} PLAYER-DIED`));
  bus.on('enemy:telegraph', () => log.push(`${d.session.now} telegraph`));
  return log;
}

describe('R1: the entrance to the exit, by physics', () => {
  it('a scripted player completes the room: hurdle, pit, crawl, slime, door, exit', () => {
    const d = r1();
    const log = watch(d);
    const result = runBot(d, { crouchZones: CROUCH, until: () => d.session.exitsReached.has('east'), maxTicks: 6000 });
    expect(result.done, `stuck at x=${d.body.x.toFixed(1)} after ${result.ticks} ticks\n${log.join('\n')}`).toBe(true);
    expect(d.p.health.dead).toBe(false);
    expect(log.some((l) => l.includes('PLAYER-DIED'))).toBe(false);
    expect(d.session.flags.has('defeated:r1_slime')).toBe(true);
    expect(d.session.gateOpen('exit_door')).toBe(true);
    expect(log.filter((l) => l.includes('exit:east'))).toHaveLength(1);
    expect(result.jumps).toBeGreaterThanOrEqual(3); // the hurdle, the steps and the pit really needed jumps
    expect(result.slashes).toBeGreaterThanOrEqual(3); // and the slime really took blows
    // the whole room in a reasonable time: ~110 m at run speed, a 12 m crawl and a fight
    expect(result.ticks).toBeLessThan(3600);
  });

  it('every stage is passed in order (the room teaches in the order the spec says)', () => {
    const d = r1();
    const stages: Array<[string, () => boolean]> = [
      ['over the hurdle', () => d.body.x > 20],
      ['across the pit', () => d.body.x > 38],
      ['through the crawl', () => d.body.x > 77],
      ['the slime is beaten', () => d.session.flags.has('defeated:r1_slime')],
      ['at the exit', () => d.session.exitsReached.has('east')],
    ];
    let at = 0;
    const when: number[] = [];
    runBot(d, {
      crouchZones: CROUCH,
      maxTicks: 6000,
      until: () => {
        while (at < stages.length && stages[at]![1]()) when[at++] = d.session.now;
        return at === stages.length;
      },
    });
    expect(at, `stopped after "${stages[at - 1]?.[0] ?? 'nothing'}" at x=${d.body.x.toFixed(1)}`).toBe(stages.length);
    for (let i = 1; i < when.length; i++) expect(when[i]!).toBeGreaterThanOrEqual(when[i - 1]!);
  });
});

describe('R1: the obstacles really are obstacles', () => {
  it('the low passage needs the crouch: a standing player is stopped at its mouth, and crouching gets through', () => {
    const standing = r1();
    standing.teleport(58, 0).settle();
    standing.right();
    standing.step(240);
    expect(standing.body.x).toBeLessThan(64); // stopped by the roof's edge

    const crouching = r1();
    crouching.teleport(58, 0).settle();
    crouching.right();
    crouching.moveY = -1;
    crouching.step(400);
    expect(crouching.body.x).toBeGreaterThan(77);
  });

  it('the pit needs a jump: walking into it drops the player, who is put back on the last safe ground', () => {
    const d = r1();
    d.teleport(30, 0).settle();
    d.right();
    d.until(() => d.body.y < -2, 200); // over the edge
    d.stop();
    d.step(120); // falls past the kill plane and is rescued
    expect(d.body.y).toBeGreaterThanOrEqual(-0.01);
    expect(d.body.x).toBeLessThan(32); // back on the near side
  });

  it('the pit is a fair jump: a running jump from the edge clears it with room to spare', () => {
    const d = r1();
    d.teleport(29.5, 0).settle();
    d.right();
    d.until(() => d.body.x > 31.0, 100);
    d.press('jump');
    d.step(26);
    d.release('jump');
    d.step(60);
    expect(d.body.x).toBeGreaterThan(37.5);
    expect(d.body.y).toBeGreaterThanOrEqual(-0.01);
  });

  it('the door is a wall while the slime lives: the way out cannot be reached without beating it', () => {
    const d = r1();
    d.session.godMode = true; // this test is about the door, not about the slime's lunges
    d.teleport(98, 0).settle();
    d.right();
    d.step(300);
    expect(d.body.x).toBeLessThan(104); // the door's face
    expect(d.session.exitsReached.size).toBe(0);
    expect(d.session.gateOpen('exit_door')).toBe(false);
  });

  it('the door cannot be jumped over (a full jump is 3.1 m, the door is 9 m)', () => {
    const d = r1();
    d.session.godMode = true;
    d.teleport(101, 0).settle();
    d.right();
    d.press('jump');
    d.step(30);
    d.release('jump');
    d.step(200);
    expect(d.body.x).toBeLessThan(104);
  });

  it('the one-way platform of the arena can be jumped onto and dropped from', () => {
    const d = r1();
    d.session.godMode = true;
    d.teleport(88, 0).settle();
    d.press('jump');
    d.step(20);
    d.release('jump');
    d.until(() => d.body.grounded && d.body.y > 2.9, 120);
    expect(d.body.y).toBeCloseTo(3, 1);
    // crouch + jump drops through
    d.moveY = -1;
    d.tap('jump');
    d.until(() => d.body.y < 1, 120);
  });
});

describe('R1: a defeat does not undo what was won', () => {
  it('dying in front of the slime sends the player to the entrance, the slime is back, the door is shut', () => {
    const d = r1({ extra: { death: { dying: 10, fadeOut: 5, hold: 5, fadeIn: 5, skipAfter: 2 } } });
    d.teleport(95, 0).settle();
    expect(slimeOf(d)).toBeDefined();
    d.p.health.damage(0);
    const hit = (): void => {
      d.session.combat.submit({
        ownerId: 'x', team: 'enemy', rect: { x0: d.body.x - 1, x1: d.body.x + 1, y0: 0, y1: 2 }, attackId: 'x', damage: 99,
        knockback: { x: 0, y: 0 }, stun: 0, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(),
      });
    };
    hit();
    d.step(80);
    expect(d.p.health.dead).toBe(false);
    expect(d.body.x).toBeCloseTo(4, 0);
    expect(slimeOf(d)).toBeDefined();
    expect(d.session.flags.list()).toEqual([]);
    expect(d.session.gateOpen('exit_door')).toBe(false);
  });

  it('beating the slime and then dying: the slime stays beaten and the door stays open', () => {
    const d = r1({ extra: { death: { dying: 10, fadeOut: 5, hold: 5, fadeIn: 5, skipAfter: 2 } } });
    runBot(d, { crouchZones: CROUCH, maxTicks: 6000, until: () => d.session.flags.has('defeated:r1_slime') });
    expect(d.session.flags.has('defeated:r1_slime')).toBe(true);
    d.step(60);
    d.session.combat.submit({
      ownerId: 'x', team: 'enemy', rect: { x0: d.body.x - 1, x1: d.body.x + 1, y0: 0, y1: 2 }, attackId: 'x', damage: 99,
      knockback: { x: 0, y: 0 }, stun: 0, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(),
    });
    d.step(80);
    expect(d.p.health.dead).toBe(false);
    expect(d.body.x).toBeCloseTo(4, 0);
    expect(slimeOf(d)).toBeUndefined();
    expect(d.session.gateOpen('exit_door')).toBe(true);
    // and the whole way is still passable
    const r = runBot(d, { crouchZones: CROUCH, maxTicks: 4000, until: () => d.session.exitsReached.has('east') });
    expect(r.done).toBe(true);
  });
});

describe('R1: determinism and leaks', () => {
  it('the whole playthrough is reproducible bit for bit', () => {
    const play = (): string[] => {
      const d = r1();
      const log = watch(d);
      runBot(d, { crouchZones: CROUCH, until: () => d.session.exitsReached.has('east'), maxTicks: 6000 });
      log.push(`end ${d.session.now} ${d.body.x.toFixed(9)} ${d.p.health.current} ${d.session.rng.state}`);
      return log;
    };
    const a = play();
    expect(a.length).toBeGreaterThan(5);
    expect(play()).toEqual(a);
  });

  it('a different seed plays out differently in the details but still completes the room', () => {
    const d = r1({ seed: 99 });
    const r = runBot(d, { crouchZones: CROUCH, until: () => d.session.exitsReached.has('east'), maxTicks: 6000 });
    expect(r.done).toBe(true);
  });

  it('40 reloads of R1 leave nothing behind', () => {
    const d = r1();
    const listeners = d.session.bus.listenerCount();
    for (let i = 0; i < 40; i++) {
      d.step(10);
      d.session.loadRoom('r1_gate', 'start');
      expect(d.session.entities).toHaveLength(1);
      expect(d.session.combat.count).toBe(2);
      expect(d.session.bus.listenerCount()).toBe(listeners);
    }
  });

  it('uses the shipped slime definition', () => {
    const d = r1();
    expect(slimeOf(d)!.def).toBe(ENEMIES.ink_slime);
  });
});
