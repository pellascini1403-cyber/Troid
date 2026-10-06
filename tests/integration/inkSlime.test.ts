import { describe, expect, it } from 'vitest';
import { INK_SLIME, SLIME_LUNGE } from '@/content/enemies';
import { driver, type Driver } from '../helpers/sim';
import { ARENA, spawnEnemy, spawnSlime, untilState } from '../helpers/enemies';
import { recordSubmissions } from '../helpers/combat';

/**
 * The Ink Slime end to end, in the real session: it perceives the player, winds up, lunges, recovers, gets hurt and
 * dies, with the timings of docs/GAME-SPEC-2D.md §15.1 counted in simulated ticks.
 *
 * Tick accounting (see SlimeBrain): a state of D ticks occupies exactly D ticks, counting the tick it was entered.
 */
const p = INK_SLIME.ai.params;

function arena(opts: { seed?: number; playerX?: number; playerY?: number } = {}): Driver {
  const d = driver({ room: ARENA, seed: opts.seed ?? 1 });
  d.teleport(opts.playerX ?? 4, opts.playerY ?? 0);
  d.settle();
  return d;
}

/** Counts the ticks the enemy spends in a state while stepping, from now until it leaves it. */
function ticksIn(d: Driver, state: () => string, name: string, max = 400): number {
  let n = 0;
  for (let i = 0; i < max; i++) {
    if (state() === name) n++;
    else if (n > 0) return n;
    d.step(1);
  }
  throw new Error(`never left "${name}" after ${n} ticks`);
}

/** Like `ticksIn`, but counts SIMULATED ticks only: the frozen steps of a hit-stop do not count (the world did not tick). */
function simTicksIn(d: Driver, state: () => string, name: string, max = 400): number {
  let n = 0;
  let last = -1;
  for (let i = 0; i < max; i++) {
    if (state() === name) {
      if (n === 0 || d.session.now !== last) n++;
    } else if (n > 0) return n;
    last = d.session.now;
    d.step(1);
  }
  throw new Error(`never left "${name}" after ${n} ticks`);
}

describe('Ink Slime — perception', () => {
  it('stays idle or patrols while the player is out of its 8 m range', () => {
    const d = arena({ playerX: 4 });
    const s = spawnSlime(d, 20);
    const seen = new Set<string>();
    for (let i = 0; i < 900; i++) {
      d.step(1);
      seen.add(s.state);
    }
    expect([...seen].sort()).toEqual(['idle', 'patrol']);
  });

  it('notices the player inside 8 m (and not at 8.5)', () => {
    const near = arena({ playerX: 23.5 });
    const sNear = spawnSlime(near, 30);
    near.step(2);
    expect(sNear.state).toBe('detect');

    const far = arena({ playerX: 21.5 });
    const sFar = spawnSlime(far, 30);
    far.step(2);
    expect(['idle', 'patrol']).toContain(sFar.state);
  });

  it('does not see a player on a ledge above its vertical tolerance, and does see one within it', () => {
    const high = arena();
    const sHigh = spawnSlime(high, 23);
    high.teleport(23, 3); // standing on the one-way platform, 3 m above the slime's feet
    high.step(2);
    expect(['idle', 'patrol']).toContain(sHigh.state);

    const low = arena();
    const sLow = spawnSlime(low, 23);
    low.teleport(23, 2.0);
    low.step(2);
    expect(sLow.state).toBe('detect');
  });

  it('a wall between them hides the player: no detection through the pillar', () => {
    const d = arena();
    const s = spawnSlime(d, 52); // the pillar is at x 56..57
    d.teleport(60, 0);
    d.step(2);
    expect(['idle', 'patrol']).toContain(s.state);
    // …and the same distance with a clear line does wake it
    const clear = arena();
    const c = spawnSlime(clear, 48);
    clear.teleport(54, 0);
    clear.step(2);
    expect(c.state).toBe('detect');
  });

  it('a one-way platform hides nothing: it sees through the platform above it', () => {
    const d = arena();
    const s = spawnSlime(d, 22, 0);
    d.teleport(23, 2.0); // the line from its eyes to the torso crosses the platform (y 2.7–3.0)
    d.step(2);
    expect(s.state).toBe('detect');
  });

  it('does not see a dead player', () => {
    const d = arena({ playerX: 25 });
    const s = spawnSlime(d, 30);
    d.p.health.damage(99);
    d.step(5);
    expect(['idle', 'patrol']).toContain(s.state);
  });
});

describe('Ink Slime — wandering', () => {
  it('stands still between legs for a random time from the simulation Rng, then walks at 1.2 m/s', () => {
    const d = arena({ playerX: 70 });
    const s = spawnSlime(d, 20);
    const idles: number[] = [];
    let speeds: number[] = [];
    let last = s.state;
    let n = 0;
    for (let i = 0; i < 1500; i++) {
      d.step(1);
      if (s.state === 'patrol') speeds.push(Math.abs(s.body.vx));
      if (s.state === last) n++;
      else {
        if (last === 'idle') idles.push(n);
        last = s.state;
        n = 1;
      }
    }
    expect(idles.length).toBeGreaterThanOrEqual(3);
    for (const t of idles) {
      expect(t).toBeGreaterThanOrEqual(p.idleTicks[0]);
      expect(t).toBeLessThanOrEqual(p.idleTicks[1] + 2);
    }
    expect(Math.max(...speeds)).toBeCloseTo(1.2, 5);
    expect(new Set(idles).size).toBeGreaterThan(1); // the pauses are not all the same: they are random
    speeds = [];
  });

  it('wanders within 3 m of its home and turns around at the edge of that range', () => {
    const d = arena({ playerX: 70 });
    const s = spawnSlime(d, 20);
    let min = Infinity;
    let max = -Infinity;
    const faces = new Set<number>();
    for (let i = 0; i < 2400; i++) {
      d.step(1);
      min = Math.min(min, s.body.x);
      max = Math.max(max, s.body.x);
      faces.add(s.facing);
    }
    expect(min).toBeGreaterThanOrEqual(20 - p.patrolRange - 0.2);
    expect(max).toBeLessThanOrEqual(20 + p.patrolRange + 0.2);
    expect(max - min).toBeGreaterThan(p.patrolRange); // it really walks both ways
    expect(faces.size).toBe(2);
  });

  it('never walks off a ledge: it turns around at the edge of the pit', () => {
    const d = arena({ playerX: 70 });
    const s = spawnSlime(d, 38.8, 0, 1); // 1.2 m from the pit edge at x = 40, looking at it
    for (let i = 0; i < 1200; i++) {
      d.step(1);
      expect(s.body.y).toBeGreaterThanOrEqual(-0.01);
      expect(s.body.x).toBeLessThan(40);
    }
  });

  it('turns around at a wall and walks back from it', () => {
    const d = arena({ playerX: 70 });
    const s = spawnSlime(d, 54.5, 0, 1); // the pillar's face is at x = 56
    let touched = false;
    let after = Infinity;
    for (let i = 0; i < 900; i++) {
      d.step(1);
      if (s.body.hitRight) touched = true;
      if (touched) after = Math.min(after, s.body.x);
    }
    expect(touched).toBe(true);
    expect(after).toBeLessThan(54); // it came back off the wall
    expect(s.body.x + s.body.halfW).toBeLessThanOrEqual(56.01);
  });
});

describe('Ink Slime — detect and approach', () => {
  it('the "I saw you" beat faces the player, lasts 15 ticks and announces itself once', () => {
    const d = arena({ playerX: 26 });
    const alerted: string[] = [];
    d.session.bus.on('enemy:alerted', (e) => alerted.push(e.defId));
    const s = spawnSlime(d, 31, 0, 1); // looking the other way
    untilState(d, s, 'detect');
    expect(s.facing).toBe(-1);
    expect(s.view.anim).toBe('alert');
    expect(ticksIn(d, () => s.state, 'detect')).toBe(p.alertTicks);
    expect(alerted).toEqual(['ink_slime']);
    expect(s.state).toBe('approach');
  });

  it('slides toward the player: it accelerates up to 2.4 m/s and never beyond', () => {
    const d = arena({ playerX: 24 });
    const s = spawnSlime(d, 31);
    untilState(d, s, 'approach');
    const speeds: number[] = [];
    while (s.state === 'approach') {
      d.step(1);
      if (s.state === 'approach') speeds.push(Math.abs(s.body.vx));
    }
    expect(speeds[0]).toBeGreaterThan(0);
    expect(speeds[0]).toBeLessThan(p.approachSpeed); // it does not snap to full speed
    expect(Math.max(...speeds)).toBeCloseTo(p.approachSpeed, 9);
    expect(speeds.every((v) => v <= p.approachSpeed + 1e-9)).toBe(true);
    for (let i = 1; i < 6; i++) expect(speeds[i]!).toBeGreaterThanOrEqual(speeds[i - 1]!); // ramping up
  });

  it('stops to wind up at its attack distance (2.2 m), facing the player', () => {
    const d = arena({ playerX: 24 });
    const s = spawnSlime(d, 33);
    untilState(d, s, 'telegraph');
    const gap = Math.abs(s.body.x - d.body.x);
    expect(gap).toBeLessThanOrEqual(p.attackRange + 1e-9);
    expect(gap).toBeGreaterThan(p.attackRange - 0.1); // it did not stop early
    expect(s.facing).toBe(-1);
  });

  it('chases a moving player, always turning to face them', () => {
    const d = arena({ playerX: 24 });
    const s = spawnSlime(d, 31);
    untilState(d, s, 'approach');
    d.teleport(36, 0); // the player jumps behind it
    d.step(10);
    expect(s.facing).toBe(1);
    expect(s.body.vx).toBeGreaterThan(0);
  });

  it('does not walk off a ledge to reach the player: it stands at the edge', () => {
    const d = arena({ playerX: 47 }); // across the pit (x 40–46)
    const s = spawnSlime(d, 36);
    for (let i = 0; i < 600; i++) {
      d.step(1);
      expect(s.body.y).toBeGreaterThanOrEqual(-0.01);
      expect(s.body.x).toBeLessThan(40);
    }
  });

  it('gives up beyond 11 m, rests, and walks back to its patch', () => {
    const d = arena({ playerX: 24 });
    d.session.godMode = true;
    const s = spawnSlime(d, 31);
    untilState(d, s, 'recover'); // it chased the player and lunged: it is now 6+ m from its home
    expect(Math.abs(s.body.x - 31)).toBeGreaterThan(p.patrolRange);
    d.teleport(2, 0); // far away: > 11 m
    untilState(d, s, 'idle', 60); // it finishes its recovery, then has nobody to hunt
    d.step(900);
    expect(Math.abs(s.body.x - 31)).toBeLessThanOrEqual(p.patrolRange + 0.2); // back within its patch
  });
});

describe('Ink Slime — the telegraph, the lunge and the recovery', () => {
  it('winds up for EXACTLY 24 ticks, rooted, announcing it once; the view reads startup 0 → 1', () => {
    const d = arena({ playerX: 24 });
    d.session.godMode = true;
    const events: Array<{ ticks: number; facing: number }> = [];
    d.session.bus.on('enemy:telegraph', (e) => events.push({ ticks: e.ticks, facing: e.facing }));
    const log = recordSubmissions(d);
    const s = spawnSlime(d, 31);
    untilState(d, s, 'telegraph');
    const x0 = s.body.x;
    const t: number[] = [];
    let n = 0;
    while (s.state === 'telegraph') {
      expect(s.view.anim).toBe('telegraph');
      expect(s.view.phase).toBe('startup');
      expect(s.body.vx).toBe(0);
      expect(s.body.x).toBeCloseTo(x0, 9);
      t.push(s.view.phaseT);
      n++;
      d.step(1);
    }
    expect(n).toBe(24);
    expect(events).toEqual([{ ticks: 24, facing: -1 }]);
    expect(t[0]).toBe(0);
    for (let i = 1; i < t.length; i++) expect(t[i]!).toBeGreaterThan(t[i - 1]!);
    expect(t[t.length - 1]!).toBeLessThan(1);
    // nothing hurts while it winds up: the first hitbox is on the very tick the lunge begins
    const boxes = log.filter((h) => h.attackId === 'slime_lunge');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.tick).toBe(d.session.now);
    expect(s.state).toBe('attack');
  });

  it('lunges for EXACTLY 10 ticks at 9 m/s: ten hitboxes of 1.3 × 0.9 m centred on the body, ≈ 1.5 m travelled', () => {
    const d = arena({ playerX: 24 });
    d.session.godMode = true;
    const log = recordSubmissions(d);
    const s = spawnSlime(d, 31);
    untilState(d, s, 'telegraph');
    const x0 = s.body.x; // rooted all through the wind-up
    untilState(d, s, 'attack');
    let n = 0;
    while (s.state === 'attack') {
      expect(s.view.anim).toBe('attack');
      expect(s.view.phase).toBe('active');
      n++;
      d.step(1);
    }
    expect(n).toBe(10);
    expect(Math.abs(s.body.x - x0)).toBeCloseTo(1.5, 6);
    expect(s.body.x).toBeLessThan(x0); // it lunged toward the player (to its left)
    const lunge = log.filter((h) => h.attackId === 'slime_lunge');
    expect(lunge).toHaveLength(10);
    for (const h of lunge) {
      expect(h.rect.x1 - h.rect.x0).toBeCloseTo(1.3, 9);
      expect(h.rect.y1 - h.rect.y0).toBeCloseTo(0.9, 9);
    }
    // the box travels with the body, 0.15 m per tick
    for (let i = 1; i < lunge.length; i++) expect(lunge[i - 1]!.rect.x0 - lunge[i]!.rect.x0).toBeCloseTo(0.15, 6);
    expect(s.state).toBe('recover');
  });

  it('recovers for EXACTLY 36 ticks, vulnerable and still, then hunts again if the player is near', () => {
    const d = arena({ playerX: 24 });
    d.session.godMode = true;
    const s = spawnSlime(d, 31);
    untilState(d, s, 'recover');
    const x0 = s.body.x;
    const phases: number[] = [];
    let n = 0;
    while (s.state === 'recover') {
      expect(s.view.phase).toBe('recovery');
      expect(s.body.vx).toBe(0);
      expect(s.invulnerable).toBe(false);
      phases.push(s.view.phaseT);
      n++;
      d.step(1);
    }
    expect(n).toBe(36);
    expect(s.body.x).toBeCloseTo(x0, 9);
    expect(phases[0]).toBe(0);
    expect(s.state === 'approach' || s.state === 'telegraph').toBe(true);
  });

  it('after the recovery it rests if the player is gone', () => {
    const d = arena({ playerX: 24 });
    d.session.godMode = true;
    const s = spawnSlime(d, 31);
    untilState(d, s, 'recover');
    d.teleport(2, 0);
    untilState(d, s, 'idle', 80);
  });

  it('commits to the direction it started: a player who slips behind it is missed', () => {
    const d = arena({ playerX: 24 });
    const s = spawnSlime(d, 31);
    untilState(d, s, 'telegraph');
    const hp = d.p.health.current;
    d.teleport(36, 0); // behind it, mid wind-up
    d.step(60);
    expect(s.facing).toBe(-1); // it lunged where it had been looking
    expect(d.p.health.current).toBe(hp);
  });

  it('a full cycle is wind-up 24 + lunge 10 + recovery 36 = 70 ticks', () => {
    const d = arena({ playerX: 24 });
    d.session.godMode = true;
    const s = spawnSlime(d, 31);
    untilState(d, s, 'telegraph');
    const total = ticksIn(d, () => (['telegraph', 'attack', 'recover'].includes(s.state) ? 'x' : s.state), 'x');
    expect(total).toBe(70);
  });
});

describe('Ink Slime — hurting the player', () => {
  it('a lunge that connects does 1 damage with the standard knockback, hit-stop and i-frames', () => {
    const d = arena({ playerX: 24 });
    const hurt: Array<{ damage: number; direction: number }> = [];
    d.session.bus.on('player:hurt', (e) => hurt.push({ damage: e.damage, direction: e.direction }));
    const s = spawnSlime(d, 31);
    untilState(d, s, 'attack');
    d.until(() => d.p.health.current < 5, 20);
    expect(d.p.health.current).toBe(4);
    expect(hurt).toEqual([{ damage: 1, direction: -1 }]); // pushed the way the slime faces: to the left
    expect(d.body.vx).toBeLessThan(0);
    expect(d.session.frozen).toBe(true); // hit-stop
    expect(d.session.hitStopLeft).toBeGreaterThan(0);
    d.step(40);
    expect(d.p.health.current).toBe(4); // one lunge, one hit: the i-frames and the hit-once rule
  });

  it('the hit lands late in the lunge, when the body reaches the player (at ≈ tick 9 of 10)', () => {
    const d = arena({ playerX: 24 });
    const s = spawnSlime(d, 31);
    untilState(d, s, 'attack');
    let tick = 1;
    while (d.p.health.current === 5 && tick < 20) {
      d.step(1);
      tick++;
    }
    expect(d.p.health.current).toBe(4);
    expect(tick).toBeGreaterThanOrEqual(8);
    expect(tick).toBeLessThanOrEqual(10);
  });

  it('there is no damage by touching it: walking through an idle slime hurts nothing', () => {
    const d = arena({ playerX: 4 });
    spawnSlime(d, 14);
    d.teleport(10, 0);
    d.right();
    d.step(10);
    // Overlapping while it is still asleep… the slime woke up, but it has not attacked: the body alone is harmless.
    d.until(() => d.body.x > 17, 200);
    expect(d.p.health.current).toBe(5);
  });

  it('a jump over the lunge avoids it', () => {
    const d = arena({ playerX: 24 });
    const s = spawnSlime(d, 31);
    untilState(d, s, 'attack');
    d.tap('jump');
    d.step(30);
    expect(d.p.health.current).toBe(5);
  });

  it('a dash away avoids it; so does a dash through it (i-frames)', () => {
    const away = driver({ room: ARENA, unlocked: ['dash'] });
    away.teleport(24, 0).settle();
    const sA = spawnSlime(away, 31);
    untilState(away, sA, 'attack');
    away.right().tap('dash');
    away.step(30);
    expect(away.p.health.current).toBe(5);

    const through = driver({ room: ARENA, unlocked: ['dash'] });
    through.teleport(24, 0).settle();
    const sT = spawnSlime(through, 31);
    untilState(through, sT, 'attack');
    through.step(2);
    through.left().tap('dash');
    through.step(30);
    expect(through.p.health.current).toBe(5);
  });

  it('keeps no damage hitbox once the player is dead: it stops attacking', () => {
    const d = arena({ playerX: 24 });
    const s = spawnSlime(d, 31);
    untilState(d, s, 'telegraph');
    d.step(5);
    d.p.health.damage(99);
    d.step(2);
    expect(s.state).toBe('idle');
    const log = recordSubmissions(d);
    d.step(120);
    expect(log.filter((h) => h.attackId === 'slime_lunge')).toHaveLength(0);
  });
});

describe('Ink Slime — being hurt and dying', () => {
  /** A slime next to a player who faces it, ready to be hit (the slime idle, asleep for the moment). */
  function duel(): { d: Driver; s: ReturnType<typeof spawnSlime> } {
    const d = arena({ playerX: 24 });
    d.session.godMode = true;
    const s = spawnSlime(d, 25.2, 0, -1);
    return { d, s };
  }

  it('a slash does 1 damage, pushes it away and staggers it for the slash\'s own stun (12 ticks)', () => {
    const { d, s } = duel();
    d.tap('attack');
    d.until(() => s.health.current < 3, 30);
    expect(s.health.current).toBe(2);
    expect(s.state).toBe('hurt');
    expect(s.body.vx).toBeGreaterThan(0); // away from the player (who is on its left)
    expect(s.view.flash).toBe(1); // visible NOW, during the hit-stop
    expect(s.view.anim).toBe('hurt');
    expect(simTicksIn(d, () => s.state, 'hurt')).toBe(12); // the hit-stop freeze is not counted: the world did not tick
  });

  it('a stagger interrupts the wind-up: the lunge never comes', () => {
    const d = arena({ playerX: 24 });
    d.session.godMode = true;
    const s = spawnSlime(d, 27);
    untilState(d, s, 'telegraph');
    d.step(8);
    const log = recordSubmissions(d);
    // a hit lands on it mid wind-up
    d.session.combat.submit({
      ownerId: d.p.id, team: 'player', rect: { x0: s.body.x - 0.4, x1: s.body.x + 0.4, y0: 0, y1: 1 }, attackId: 'test_hit',
      damage: 1, knockback: { x: 4, y: 1 }, stun: 12, hitStop: 4, shake: 0, facing: 1, alreadyHit: new Set(),
    });
    d.step(1);
    expect(s.state).toBe('hurt');
    d.step(8);
    expect(log.filter((h) => h.attackId === 'slime_lunge')).toHaveLength(0);
  });

  it('a stagger interrupts the lunge itself: the hitbox stops the tick it is hit', () => {
    const d = arena({ playerX: 20 });
    d.session.godMode = true;
    const s = spawnSlime(d, 27);
    untilState(d, s, 'attack');
    d.step(3);
    const log = recordSubmissions(d);
    d.session.combat.submit({
      ownerId: d.p.id, team: 'player', rect: { x0: s.body.x - 0.4, x1: s.body.x + 0.4, y0: 0, y1: 1 }, attackId: 'test_hit',
      damage: 1, knockback: { x: 4, y: 1 }, stun: 12, hitStop: 0, shake: 0, facing: -1, alreadyHit: new Set(),
    });
    d.step(1);
    expect(s.state).toBe('hurt');
    d.step(20);
    expect(log.filter((h) => h.attackId === 'slime_lunge')).toHaveLength(1); // only the one submitted before the hit landed
  });

  it('after the stun it turns to the player and hunts again', () => {
    const { d, s } = duel();
    d.tap('attack');
    d.until(() => s.state === 'hurt', 30);
    d.until(() => s.state !== 'hurt', 60);
    expect(['approach', 'telegraph']).toContain(s.state);
    expect(s.facing).toBe(-1);
  });

  it('three slashes kill it: actor:died once, 40 ticks of dissolving, then it is gone and unregistered', () => {
    const { d, s } = duel();
    const died: Array<{ id: string; team: string }> = [];
    d.session.bus.on('actor:died', (e) => died.push({ id: e.id, team: e.team }));
    const despawned: unknown[] = [];
    d.session.bus.on('entity:despawned', (e) => despawned.push(e.entity));
    for (let hit = 0; hit < 3; hit++) {
      d.until(() => d.session.combat.activeHitboxes.length === 0 && !d.session.frozen, 120);
      d.tap('attack');
      d.until(() => s.health.current < 3 - hit, 60);
      d.step(30); // let the swing end and the stagger pass
      s.body.x = 25.2;
      s.body.vx = 0;
    }
    expect(s.health.dead).toBe(true);
    expect(died).toEqual([{ id: s.id, team: 'enemy' }]);
    expect(s.state).toBe('dead');
    expect(s.invulnerable).toBe(true);
    expect(d.session.entities).toContain(s);
    d.step(60);
    expect(d.session.entities).not.toContain(s);
    expect(despawned).toEqual([s]);
    expect(d.session.combat.all.includes(s)).toBe(false);
  });
});

describe('Ink Slime — dying, mirrored, data-driven', () => {
  const hit = (d: Driver, s: { body: { x: number } }, over: Partial<Parameters<Driver['session']['combat']['submit']>[0]> = {}): void => {
    d.session.combat.submit({
      ownerId: d.p.id, team: 'player', rect: { x0: s.body.x - 0.4, x1: s.body.x + 0.4, y0: 0, y1: 1 }, attackId: 'test_hit',
      damage: 1, knockback: { x: 4, y: 1 }, stun: 12, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(), ...over,
    });
  };

  it('dissolves for 40 simulated ticks: the view fades from 1 to 0 and the hurtbox is dead meat that cannot be hit again', () => {
    const d = arena({ playerX: 5 });
    d.session.godMode = true;
    const s = spawnSlime(d, 30);
    hit(d, s, { damage: 3 });
    d.step(1);
    expect(s.state).toBe('dead');
    expect(s.view.anim).toBe('death');
    const opacities: number[] = [];
    let n = 0;
    while (s.state === 'dead') {
      opacities.push(s.view.opacity);
      n++;
      // a body that is dissolving ignores further blows (the hit is not consumed)
      hit(d, s);
      d.step(1);
      if (n >= 60) break;
    }
    expect(n).toBe(40);
    expect(opacities[0]).toBe(1);
    expect(opacities[opacities.length - 1]!).toBeLessThan(0.05);
    for (let i = 1; i < opacities.length; i++) expect(opacities[i]!).toBeLessThanOrEqual(opacities[i - 1]!);
    expect(s.hits).toBe(1);
  });

  it('knockback follows the direction of the blow (mirrored): a hit from the right pushes it left', () => {
    const d = arena({ playerX: 5 });
    const s = spawnSlime(d, 30);
    hit(d, s, { facing: -1, knockback: { x: 6, y: 2 } });
    d.step(1);
    expect(s.body.vx).toBeLessThan(0);
    expect(s.body.vy).toBeGreaterThan(0);
    expect(s.state).toBe('hurt');
  });

  it('a blow with no stun of its own staggers it for the definition\'s 14 ticks', () => {
    const d = arena({ playerX: 5 });
    const s = spawnSlime(d, 30);
    hit(d, s, { stun: 0 });
    d.step(1);
    expect(simTicksIn(d, () => s.state, 'hurt')).toBe(INK_SLIME.hurt.stun);
  });

  it('is symmetric: a slime on the player\'s LEFT winds up, lunges right, and the hitbox is mirrored', () => {
    const d = arena({ playerX: 24 });
    d.session.godMode = true;
    const log = recordSubmissions(d);
    const s = spawnSlime(d, 17, 0, 1);
    untilState(d, s, 'telegraph');
    expect(s.facing).toBe(1);
    const x0 = s.body.x;
    untilState(d, s, 'recover');
    expect(s.body.x - x0).toBeCloseTo(1.5, 6);
    const boxes = log.filter((h) => h.attackId === 'slime_lunge');
    expect(boxes).toHaveLength(10);
    expect(boxes[0]!.rect.x1 - boxes[0]!.rect.x0).toBeCloseTo(1.3, 9);
    expect(boxes[9]!.rect.x0).toBeGreaterThan(boxes[0]!.rect.x0);
  });

  it('every timing is DATA: a faster variant of the attack changes the counts and nothing else', () => {
    const d = arena({ playerX: 24 });
    d.session.godMode = true;
    const fast = {
      ...INK_SLIME,
      attacks: { slime_lunge: { ...SLIME_LUNGE, startup: 10, active: 4, recovery: 12, lunge: { speed: 12, ticks: 4 } } },
    };
    const log = recordSubmissions(d);
    const s = spawnEnemy(d, fast, { x: 31, y: 0, facing: -1 });
    untilState(d, s, 'telegraph');
    const x0 = s.body.x;
    expect(ticksIn(d, () => s.state, 'telegraph')).toBe(10);
    expect(ticksIn(d, () => s.state, 'attack')).toBe(4);
    expect(x0 - s.body.x).toBeCloseTo((12 * 4) / 60, 6);
    expect(ticksIn(d, () => s.state, 'recover')).toBe(12);
    expect(log.filter((h) => h.attackId === 'slime_lunge')).toHaveLength(4);
  });
});

describe('Ink Slime — several, the room reload, determinism', () => {
  it('several slimes act on their own: each has its own state, id and timers', () => {
    const d = arena({ playerX: 24 });
    d.session.godMode = true;
    const a = spawnSlime(d, 31);
    const b = spawnSlime(d, 50);
    const c = spawnSlime(d, 18);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    d.step(30);
    expect(['approach', 'telegraph', 'detect']).toContain(a.state); // 7 m on one side: awake
    expect(['approach', 'telegraph', 'detect']).toContain(c.state); // 6 m on the other: awake
    expect(['idle', 'patrol']).toContain(b.state); // 26 m: asleep
    expect(a.facing).toBe(-1);
    expect(c.facing).toBe(1);
  });

  it('a room reload removes every slime and its combatant: no leaks after 40 reloads', () => {
    const d = arena({ playerX: 24 });
    for (let i = 0; i < 40; i++) {
      spawnSlime(d, 31);
      spawnSlime(d, 33);
      d.step(30);
      d.session.loadRoom('slime_arena', 'start');
      expect(d.session.entities).toHaveLength(0);
      expect(d.session.combat.count).toBe(1); // only the player
      expect(d.session.combat.pendingHitboxes).toHaveLength(0);
    }
  });

  it('is reproducible bit for bit: same seed and inputs, same slime, to the last decimal', () => {
    const run = (seed: number): string[] => {
      const d = driver({ room: ARENA, seed, unlocked: ['dash'] });
      d.teleport(24, 0).settle();
      const s = spawnSlime(d, 31);
      const log: string[] = [];
      for (let i = 0; i < 1500; i++) {
        // a scripted player that fights back and dodges
        if (i % 90 === 40) d.tap('attack');
        if (i % 210 === 100) d.right().tap('dash');
        if (i % 130 === 0) d.moveX = i % 260 === 0 ? 1 : -1;
        if (i % 130 === 40) d.moveX = 0;
        d.step(1);
        log.push(`${s.state} ${s.body.x.toFixed(9)} ${s.body.y.toFixed(9)} ${s.health.current} ${d.p.health.current} ${d.body.x.toFixed(9)} ${d.session.rng.state}`);
      }
      return log;
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8)); // the seed matters: the pauses of the patrol come from the Rng
  });
});
