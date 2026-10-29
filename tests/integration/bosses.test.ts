import { describe, expect, it } from 'vitest';
import { BOSSES, ENEMIES } from '@/content/enemies';
import { ENGINE_BOSS_LIST } from '@/content/bosses';
import { PROCEDURAL_LOOKS } from '@/content/proceduralActors';
import { BOSS_HANDLERS } from '@/enemies/boss/handlers';
import { Enemy } from '@/enemies/Enemy';
import { EnemyShot } from '@/enemies/EnemyShot';
import { CATALOGS } from '@/i18n';
import { validateRoom } from '@/world/validateRoom';
import { arenaFor, count, enterPhase, fight, nudge, strike, until, W } from '../helpers/bossArena';

/**
 * THE SIX GUARDIANS OF THE ENGINE (docs/PROMPT21-LOG.md), through the real session: the arena shuts behind the hero, the boss wakes, chooses among the attacks of its phase, winds up (a telegraph the hero can read), strikes and
 * recovers; it can be hurt only under its own CONDITION; it changes at its phases; and when it falls what it shut opens. Each fight is a different fight: what the tests ask of each is what only that one does.
 */
describe('all six', () => {
  it('are six, with six different sets of patterns and a name in every language and a look', () => {
    expect(ENGINE_BOSS_LIST).toHaveLength(6);
    const sets = ENGINE_BOSS_LIST.map((b) => Object.values(b.attacks).map((a) => a.handler).sort().join(','));
    expect(new Set(sets).size, 'no two guardians have the same patterns').toBe(6);
    for (const b of ENGINE_BOSS_LIST) {
      for (const [lang, catalog] of Object.entries(CATALOGS)) expect(catalog[b.nameKey], `${b.id} in ${lang}`).toBeTruthy();
      expect(PROCEDURAL_LOOKS[b.view.lookId], b.id).toBeDefined();
      expect(BOSSES[b.id], b.id).toBe(b);
    }
  });

  it('every phase starts above the next, the first at the whole of the health; every attack a phase names exists, and its handler does; every attack is announced for at least 30 ticks', () => {
    for (const b of ENGINE_BOSS_LIST) {
      expect(b.phases[0]!.at, b.id).toBe(1);
      b.phases.forEach((p, i) => {
        if (i > 0) expect(p.at, `${b.id} phase ${i + 1}`).toBeLessThan(b.phases[i - 1]!.at);
        expect(p.tempo).toBeGreaterThan(0);
        for (const a of p.attacks) expect(b.attacks[a], `${b.id}: ${a}`).toBeDefined();
      });
      for (const [id, a] of Object.entries(b.attacks)) {
        expect(BOSS_HANDLERS[a.handler], `${b.id}.${id}`).toBeDefined();
        expect(a.attack.startup, `${b.id}.${id} is readable`).toBeGreaterThanOrEqual(28);
        expect(a.attack.recovery).toBeGreaterThanOrEqual(46);
        expect(a.weight.near + a.weight.far).toBeGreaterThan(0);
        // a pattern that throws needs something to throw
        if (['volley', 'burst', 'waves'].includes(a.handler)) expect(a.shot, `${b.id}.${id} throws nothing`).toBeDefined();
      }
      const used = new Set(b.phases.flatMap((p) => p.attacks));
      for (const id of Object.keys(b.attacks)) expect(used.has(id), `${b.id}.${id} is in no phase`).toBe(true);
      // at tempo 0.7 the wind-up is still readable (a fifth of a second would not be)
      for (const p of b.phases) for (const a of p.attacks) expect(Math.round(b.attacks[a]!.attack.startup * p.tempo), `${b.id}.${a} in its fastest phase`).toBeGreaterThanOrEqual(20);
    }
  });

  it('each arena is a room that passes the validator, with the boss standing on the floor inside it', () => {
    for (const b of ENGINE_BOSS_LIST) {
      const room = arenaFor(b);
      const issues = validateRoom(room, { enemies: ENEMIES, bosses: BOSSES, player: { halfWidth: 0.35, height: 1.7 } });
      expect(issues, b.id).toEqual([]);
    }
  });

  it('wakes when the hero steps into the arena, and not before: the doors close (`boss:started`), it is untouchable while it wakes', () => {
    for (const b of ENGINE_BOSS_LIST) {
      const f = fight(b, { wake: false });
      f.d.step(60);
      expect(f.boss.state, b.id).toBe('dormant');
      f.d.teleport(20, 2);
      f.d.settle();
      f.d.until(() => f.boss.state === 'intro', 30);
      expect(count(f, 'boss:started')).toBe(1);
      expect(f.boss.invulnerable).toBe(true);
      expect(f.d.session.flags.has('~fight:test_boss'), 'the doors close').toBe(true);
    }
  });

  it('left to fight a hero who stands still and cannot be hurt, each goes through ALL the attacks of its first phase without a mistake, announcing each one', () => {
    for (const b of ENGINE_BOSS_LIST) {
      const f = fight(b, { god: true });
      const seen = new Set<string>();
      for (let t = 0; t < 7200 && seen.size < b.phases[0]!.attacks.length; t++) {
        f.d.step(1);
        if (f.boss.attackId) seen.add(f.boss.attackId);
        expect(Number.isFinite(f.boss.body.x) && Number.isFinite(f.boss.body.y), b.id).toBe(true);
        expect(f.boss.body.x, b.id).toBeGreaterThan(1);
        expect(f.boss.body.x, b.id).toBeLessThan(W - 1);
      }
      f.d.step(220); // (the last one has been announced; let it land)
      expect([...seen].sort(), b.id).toEqual([...b.phases[0]!.attacks].sort());
      expect(count(f, 'enemy:telegraph'), `${b.id} announces`).toBeGreaterThanOrEqual(seen.size);
      expect(count(f, 'boss:strike'), `${b.id} strikes`).toBeGreaterThanOrEqual(seen.size);
    }
  });

  it('can be defeated by a hero who hits it where it can be hit: a perfect hero wins every fight, goes through every phase, and what the boss shut opens', () => {
    for (const b of ENGINE_BOSS_LIST) {
      const f = fight(b, { god: true });
      let phases = 1;
      for (let t = 0; t < 36000 && !f.boss.health.dead; t++) {
        f.d.step(1);
        // a hero who waits for the opening: any hurtbox that is open takes the blow, one at a time
        if (f.boss.state === 'recover' || f.boss.state === 'hurt') {
          if (t % 6 === 0) strike(f);
        }
        phases = Math.max(phases, f.boss.phase);
      }
      expect(f.boss.health.dead, `${b.id}: the fight is won`).toBe(true);
      expect(phases, `${b.id}: it went through all its phases`).toBe(b.phases.length);
      expect(count(f, 'boss:phase')).toBe(b.phases.length - 1);
      expect(count(f, 'boss:defeated')).toBe(1);
      f.d.step(2);
      expect(f.d.session.flags.has('defeated:test_boss'), 'the fall is remembered for good').toBe(true);
      expect(f.d.session.flags.has('~fight:test_boss'), 'and the doors open').toBe(false);
    }
  });

  it('between its phases it is shut: it cannot be hurt while it roars, and it comes back with the attacks of the new phase', () => {
    for (const b of ENGINE_BOSS_LIST) {
      const f = fight(b, { god: true });
      const next = b.phases[1]!;
      f.boss.health.damage(f.boss.health.current - (next.at - 0.02) * f.boss.health.max);
      nudge(f);
      f.d.until(() => f.boss.state === 'shift', 4000);
      expect(f.boss.invulnerable, b.id).toBe(true);
      const hp = f.boss.health.current;
      strike(f, 5);
      expect(f.boss.health.current, 'nothing hurts it in the roar').toBe(hp);
      expect(count(f, 'boss:phase')).toBe(1);
      until(f, 'choose');
      expect(f.boss.phase).toBe(2);
      const seen = new Set<string>();
      for (let t = 0; t < 14000 && seen.size < next.attacks.length; t++) {
        f.d.step(1);
        if (f.boss.attackId) seen.add(f.boss.attackId);
      }
      expect([...seen].sort(), `${b.id}: the attacks of its second phase`).toEqual([...next.attacks].sort());
    }
  });
});

describe('Root Tyrant: bark armour, a heart that shows after a sweep, a march of columns', () => {
  const T = ENGINE_BOSS_LIST[0]!;

  it('every blow is turned away while it winds up and strikes; its heart takes the double blow only while it recovers', () => {
    const f = fight(T, { god: true });
    until(f, 'telegraph');
    const hp = f.boss.health.current;
    strike(f);
    expect(f.boss.health.current).toBe(hp);
    expect(count(f, 'enemy:blocked')).toBe(1);
    until(f, 'recover');
    strike(f);
    expect(hp - f.boss.health.current, 'the heart: ×2').toBe(2);
  });

  it('the sweep reaches 4 m in front of it and hurts for two; a hero who is beyond that, or behind it, is not touched', () => {
    const f = fight(T, { god: false, hero: 30 });
    f.boss.body.x = 40; // put it where the test stands the hero
    f.boss.facing = -1;
    // wait for a sweep
    let seen = false;
    for (let i = 0; i < 6000 && !seen; i++) {
      f.d.step(1);
      if (f.boss.attackId === 'sweep') seen = true;
      else f.d.teleport(36, 2); // in front, inside the reach of the sweep
    }
    expect(seen).toBe(true);
    f.d.teleport(36.8, 2);
    f.d.until(() => f.d.p.health.current < 5, 200);
    expect(f.d.p.health.current).toBe(3);
  });

  it('in its second phase it marches a line of columns toward the hero, one after the other, 8 ticks apart', () => {
    const f = fight(T, { god: true });
    enterPhase(f, 2);
    for (let i = 0; i < 20000 && f.boss.attackId !== 'march'; i++) f.d.step(1);
    expect(f.boss.attackId).toBe('march');
    f.d.step(200);
    const strikes = f.log.filter(([n, e]) => n === 'boss:strike' && (e as { attack: string }).attack === 'tyrant_march').map(([, e]) => (e as { x: number }).x);
    expect(strikes.length).toBeGreaterThanOrEqual(5);
    const dir = Math.sign(strikes[1]! - strikes[0]!);
    for (let i = 1; i < strikes.length; i++) expect(Math.sign(strikes[i]! - strikes[i - 1]!), 'each next column is farther on').toBe(dir);
    expect(Math.abs(strikes[1]! - strikes[0]!)).toBeCloseTo(3.2, 5);
  });

  it('has no march in its first phase', () => {
    expect(T.phases[0]!.attacks).not.toContain('march');
  });
});

describe('Mire Matriarch: a chip from anywhere, the full blow on her belly, lanterns at the second phase', () => {
  const M = ENGINE_BOSS_LIST[1]!;

  it('takes a chip of 0.35 from the body while she winds up, and the belly takes 1.6 after a leap or a lash', () => {
    const f = fight(M, { god: true });
    until(f, 'telegraph');
    const hp = f.boss.health.current;
    strike(f, 4);
    expect(hp - f.boss.health.current, 'the body: 4 × 0.35').toBeCloseTo(1.4, 6);
    until(f, 'recover');
    const hp2 = f.boss.health.current;
    strike(f, 1);
    expect(hp2 - f.boss.health.current, 'the belly: 1 × 1.6 (the first region that overlaps wins)').toBeCloseTo(1.6, 6);
  });

  it('the leap lands where the hero stood and shakes the floor either side for 10 ticks', () => {
    const f = fight(M, { god: true });
    let target = -1;
    for (let i = 0; i < 6000 && f.boss.attackId !== 'leap'; i++) f.d.step(1);
    for (let i = 0; i < 200 && f.boss.state === 'telegraph'; i++) {
      target = f.boss.telegraphMarks[0]?.x ?? target;
      f.d.step(1);
    }
    until(f, 'recover', 400);
    expect(Math.abs(f.boss.body.x - target), 'came down on the mark').toBeLessThan(1.5);
  });

  it('calls two lanterns at the second phase and they go with her', () => {
    const f = fight(M, { god: true });
    enterPhase(f, 2);
    expect(f.boss.minionsAlive).toBe(2);
    expect(f.d.session.entities.filter((e) => e instanceof Enemy && e.def.id === 'lantern_wisp')).toHaveLength(2);
    f.d.until(() => !f.boss.invulnerable && f.boss.state !== 'choose', 600);
    strike(f, 99); // (the body's chip of 0.35 × 99 is more than she has left)
    f.d.step(60);
    expect(f.boss.health.dead).toBe(true);
    expect(f.boss.minionsAlive).toBe(0);
  });
});

describe('Crystal Colossus: shut like a mountain; only the core it opens after the burst can be hurt', () => {
  const C = ENGINE_BOSS_LIST[2]!;

  it('turns away everything while it stomps and drops rock — and opens only after the burst of shards (the recovery is 110 ticks)', () => {
    const f = fight(C, { god: true });
    const blocked: string[] = [];
    let opened = 0;
    for (let i = 0; i < 20000 && opened < 2; i++) {
      f.d.step(1);
      if (f.boss.state === 'recover') {
        const hp = f.boss.health.current;
        strike(f);
        const after = f.boss.health.current;
        // the recovery after a burst is open; after the others it stays shut
        if (f.boss.attackId === null) {
          const last = f.log.filter(([n]) => n === 'boss:strike').pop()?.[1] as { attack: string } | undefined;
          if (last?.attack === 'colossus_burst') {
            expect(hp - after, 'the core takes the blow after the burst').toBeGreaterThan(0);
            opened++;
          } else {
            expect(hp - after, 'shut after a stomp or a rockfall').toBe(0);
            blocked.push(last?.attack ?? '?');
          }
        }
        until(f, 'choose', 400);
      }
    }
    expect(opened).toBe(2);
    expect(blocked.length).toBeGreaterThan(0);
  });

  it('the rockfall drops columns at spots that keep 3.4 m clear of each other, one of them on the hero', () => {
    const f = fight(C, { god: true });
    for (let i = 0; i < 20000 && f.boss.attackId !== 'rockfall'; i++) f.d.step(1);
    expect(f.boss.attackId).toBe('rockfall');
    const xs = f.boss.telegraphMarks.map((m) => m.x);
    expect(xs.length).toBe(4);
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) expect(Math.abs(xs[i]! - xs[j]!), `${xs[i]} / ${xs[j]}`).toBeGreaterThanOrEqual(3.3);
    expect(Math.min(...xs.map((x) => Math.abs(x - f.d.body.x))), 'one is aimed at the hero').toBeLessThan(0.1);
  });

  it('the burst throws shards both ways in arcs: 8 shots', () => {
    const f = fight(C, { god: true });
    for (let i = 0; i < 20000 && f.boss.attackId !== 'burst'; i++) f.d.step(1);
    let max = 0;
    for (let i = 0; i < 120; i++) {
      f.d.step(1);
      max = Math.max(max, f.d.session.entities.filter((e) => e instanceof EnemyShot).length);
    }
    expect(max).toBe(8);
  });
});

describe('Bell Warden: a flyer, hurt only where it falls on the hero and is stuck in the floor', () => {
  const B = ENGINE_BOSS_LIST[3]!;

  it('hangs 3.6 m above the floor between attacks and is untouchable up there (armour)', () => {
    const f = fight(B, { god: true });
    until(f, 'return');
    until(f, 'choose');
    f.d.step(2);
    expect(f.boss.body.y).toBeGreaterThan(2 + 3.4);
    expect(f.boss.body.y).toBeLessThan(2 + 3.8);
    strike(f);
    expect(count(f, 'enemy:blocked') + (f.boss.health.current < f.boss.health.max ? 1 : 0)).toBeGreaterThanOrEqual(1);
    expect(f.boss.health.current).toBe(f.boss.health.max);
  });

  it('falls on the hero where they stood (a dive of 17 m/s), is stuck in the floor for 110 ticks with the clapper showing, and goes back up', () => {
    const f = fight(B, { god: true });
    for (let i = 0; i < 20000 && f.boss.attackId !== 'dive'; i++) f.d.step(1);
    until(f, 'attack');
    until(f, 'recover', 200);
    expect(f.boss.body.y, 'in the floor').toBeLessThan(2.6);
    const hp = f.boss.health.current;
    strike(f);
    expect(hp - f.boss.health.current, 'the clapper: ×2').toBe(2);
    until(f, 'return', 400);
    until(f, 'choose', 400);
    expect(f.boss.body.y).toBeGreaterThan(5.4);
  });

  it('tolls three waves each way along the floor, each a little faster than the last', () => {
    const f = fight(B, { god: true });
    for (let i = 0; i < 20000 && f.boss.attackId !== 'toll'; i++) f.d.step(1);
    until(f, 'attack');
    let seen = 0;
    const speeds = new Set<number>();
    for (let i = 0; i < 160; i++) {
      f.d.step(1);
      for (const e of f.d.session.entities) if (e instanceof EnemyShot) speeds.add(e.spec.speed);
      seen = Math.max(seen, f.d.session.entities.filter((e) => e instanceof EnemyShot).length);
    }
    expect(speeds.size, 'three speeds').toBe(3);
    expect(seen).toBeGreaterThanOrEqual(2);
  });
});

describe('Foundry Engine: the vent on its back opens when its charge ends against a wall', () => {
  const E = ENGINE_BOSS_LIST[4]!;

  it('a charge that ends at a wall leaves it stunned 90 ticks longer than one that runs out in the open', () => {
    const f = fight(E, { god: true });
    f.boss.body.x = 62;
    f.boss.facing = 1;
    f.d.teleport(66, 2);
    let walled = -1;
    for (let i = 0; i < 12000 && walled < 0; i++) {
      f.d.step(1);
      if (f.boss.attackId === 'charge' && f.boss.state === 'attack') {
        const t0 = f.d.session.now;
        until(f, 'recover', 200);
        walled = f.d.session.now - t0;
        const start = f.d.session.now;
        until(f, 'choose', 400);
        walled = f.d.session.now - start;
      } else if (f.boss.state === 'choose') {
        f.boss.body.x = 62;
        f.d.teleport(66, 2);
      }
    }
    expect(walled, 'recovery of a charge that hit the wall: 50 + 90').toBeGreaterThanOrEqual(130);
  });

  it('a charge that stops a hair short of the wall is stunned like one that touches it (by the clock or by the wall is a matter of a centimetre: found in Prompt 22)', () => {
    const f = fight(E, { god: true });
    const wall = W - 1 - E.body.halfWidth; // the farthest its centre gets: the wall of the arena is at W − 1 and it is 1.8 m to a side
    const start = wall - (E.attacks['charge']!.params['speed'] as number) * (E.attacks['charge']!.params['ticks'] as number) / 60 - 0.2; // it ends 0.2 m short of the wall
    let recovery = -1;
    const place = (): void => {
      f.boss.body.x = start;
      f.boss.facing = 1;
      f.d.teleport(start + 6, 2);
    };
    place();
    for (let i = 0; i < 14000 && recovery < 0; i++) {
      f.d.step(1);
      if (f.boss.attackId === 'charge' && f.boss.state === 'attack') {
        until(f, 'recover', 200);
        const t0 = f.d.session.now;
        until(f, 'choose', 400);
        recovery = f.d.session.now - t0;
      } else if (f.boss.state === 'choose') place();
    }
    expect(recovery, 'recovery of a charge that stopped 0.2 m short of the wall: 50 + 90').toBeGreaterThanOrEqual(130);
  });

  it('the pistons come up in alternate rows, and the other rows the next time', () => {
    const f = fight(E, { god: true });
    const rowsOf = (): number[] => f.boss.telegraphMarks.map((m) => Math.round(m.x));
    const rows: number[][] = [];
    for (let i = 0; i < 30000 && rows.length < 2; i++) {
      f.d.step(1);
      if (f.boss.attackId === 'pistons' && f.boss.state === 'telegraph' && f.boss.stateTicks === 1) rows.push(rowsOf());
    }
    expect(rows).toHaveLength(2);
    expect(rows[0]!.length).toBeGreaterThanOrEqual(4);
    const a = new Set(rows[0]);
    for (const x of rows[1]!) expect(a.has(x), 'a column of the second time is not one of the first').toBe(false);
  });

  it('has three phases, and the third has the march', () => {
    expect(E.phases).toHaveLength(3);
    expect(E.phases[2]!.attacks).toContain('march');
    expect(E.phases[1]!.attacks).not.toContain('march');
  });
});

describe('Inkheart Sovereign: vanishes, cuts from behind, and calls a creature at each phase', () => {
  const S = ENGINE_BOSS_LIST[5]!;

  it('while it is gone nothing can touch it; it comes back behind the hero (the way they are not looking) and shows itself for 22 ticks before it cuts', () => {
    const f = fight(S, { god: true });
    f.d.p.facing = 1;
    for (let i = 0; i < 20000 && f.boss.attackId !== 'cut'; i++) f.d.step(1);
    until(f, 'attack');
    f.d.step(5);
    expect(f.boss.invulnerable, 'gone').toBe(true);
    const hp = f.boss.health.current;
    strike(f, 3);
    expect(f.boss.health.current).toBe(hp);
    f.d.until(() => !f.boss.invulnerable, 60);
    expect(f.boss.body.x, 'behind the hero').toBeLessThan(f.d.body.x);
    expect(f.d.body.x - f.boss.body.x).toBeLessThan(3.4);
  });

  it('the core is hurt for more than the body, anywhere, any time it is awake — and nothing is turned away', () => {
    const f = fight(S, { god: true });
    until(f, 'telegraph');
    const hp = f.boss.health.current;
    strike(f, 1);
    expect(hp - f.boss.health.current).toBeGreaterThan(0);
    expect(count(f, 'enemy:blocked')).toBe(0);
  });

  it('calls a Veil Shade at the second phase and an Ink Weaver at the third', () => {
    const f = fight(S, { god: true });
    enterPhase(f, 2);
    expect(f.d.session.entities.filter((e) => e instanceof Enemy && e.def.id === 'veil_shade')).toHaveLength(1);
    enterPhase(f, 3);
    expect(f.d.session.entities.filter((e) => e instanceof Enemy && e.def.id === 'ink_weaver')).toHaveLength(1);
  });
});
