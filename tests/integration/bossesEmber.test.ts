import { describe, expect, it } from 'vitest';
import { ENGINE_BOSS_LIST } from '@/content/bosses';
import { CRATER_BEHEMOTH, CINDER_SOVEREIGN, DUSK_SHEPHERD, EMBER_BOSS_LIST, GROVE_GARDENER } from '@/content/bossesEmber';
import { BOSSES, ENEMIES } from '@/content/enemies';
import { PROCEDURAL_LOOKS } from '@/content/proceduralActors';
import type { BossDefinition } from '@/enemies/boss/BossDefinition';
import { BOSS_HANDLERS } from '@/enemies/boss/handlers';
import { Enemy } from '@/enemies/Enemy';
import { EnemyShot } from '@/enemies/EnemyShot';
import { validateRoom } from '@/world/validateRoom';
import { ALL_CATALOGS } from '../helpers/catalogs';
import { arenaFor, count, enterPhase, fight, nudge, strike, until, W, type Fight } from '../helpers/bossArena';

/**
 * THE FOUR GUARDIANS OF THE SECOND HALF (docs/PROMPT23-LOG.md §7), through the real session, in the lab arena of the six before them (`helpers/bossArena.ts`): the Shepherd of the Verge, the Gardener of the Grove, the Behemoth of the Crater
 * and the Sovereign of the Throne. They run the same engine (`enemies/boss/Boss.ts`) as the guardians of the first half, and what the tests ask of them is what that asks of any guardian — the arena shuts, the boss wakes, winds up where it can
 * be read, strikes, recovers; it changes at its phases; when it falls what it shut opens — and then what only each one does: the CONDITION under which it can be hurt at all, and the creatures it calls. (Whether a person can win each fight, and
 * what it costs, is `encountersEmber.test.ts`: there a mortal hero plays them in their own arenas.)
 */
describe('all four', () => {
  it('are four, with four different sets of patterns — and none of the six before them fights the same way —, a name in every language and a look', () => {
    expect(EMBER_BOSS_LIST).toHaveLength(4);
    const sets = [...ENGINE_BOSS_LIST, ...EMBER_BOSS_LIST].map((b) =>
      Object.values(b.attacks)
        .map((a) => a.handler)
        .sort()
        .join(','),
    );
    expect(new Set(sets).size, 'no two guardians of the world have the same patterns').toBe(10);
    for (const b of EMBER_BOSS_LIST) {
      for (const [lang, catalog] of Object.entries(ALL_CATALOGS)) expect(catalog[b.nameKey], `${b.id} in ${lang}`).toBeTruthy();
      expect(PROCEDURAL_LOOKS[b.view.lookId], b.id).toBeDefined();
      expect(BOSSES[b.id], b.id).toBe(b);
    }
  });

  it('every phase starts above the next, the first at the whole of the health; every attack a phase names exists, and its handler does; every attack is announced for at least 28 ticks', () => {
    for (const b of EMBER_BOSS_LIST) {
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
      // the last phase has them all: there is no attack of a guardian that the hero has to wait a phase for and then never sees again
      expect([...b.phases[b.phases.length - 1]!.attacks].sort(), `${b.id}: the last phase`).toEqual(Object.keys(b.attacks).sort());
    }
  });

  it('each arena is a room that passes the validator, with the boss standing on the floor inside it', () => {
    for (const b of EMBER_BOSS_LIST) {
      const room = arenaFor(b);
      const issues = validateRoom(room, { enemies: ENEMIES, bosses: BOSSES, player: { halfWidth: 0.35, height: 1.7 } });
      expect(issues, b.id).toEqual([]);
    }
  });

  it('wakes when the hero steps into the arena, and not before: the doors close (`boss:started`), it is untouchable while it wakes', () => {
    for (const b of EMBER_BOSS_LIST) {
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
    for (const b of EMBER_BOSS_LIST) {
      const f = fight(b, { god: true });
      const seen = new Set<string>();
      for (let t = 0; t < 9000 && seen.size < b.phases[0]!.attacks.length; t++) {
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

  it('can be defeated by a hero who hits it where it can be hit, at the pace of a sword: every fight is won, goes through every phase, and what the boss shut opens', () => {
    for (const b of EMBER_BOSS_LIST) {
      const f = fight(b, { god: true });
      let phases = 1;
      for (let t = 0; t < 54000 && !f.boss.health.dead; t++) {
        f.d.step(1);
        // a hero who waits for the opening and swings a blow every fourteen ticks: whatever part is open takes it
        if ((f.boss.state === 'recover' || f.boss.state === 'hurt') && t % 14 === 0) strike(f);
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
    for (const b of EMBER_BOSS_LIST) {
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

/**
 * THE CONDITION. Each guardian has a weak point (`when: ['exposed']`, the part that takes the double blow) that shows only in the recovery of the attacks that say so (`exposes`), and a body that takes a chip, or nothing, the rest of the time.
 * The hero learns which attack opens each one — that is the fight. Here the conditions are read off the guardians by playing: a blow of 0.5 on the recovery of every attack of the last phase, and the multiplier that took is what was open.
 */
const OPENS: Readonly<Record<string, readonly string[]>> = {
  boss_shepherd: ['volley'],
  boss_gardener: ['leap'],
  boss_behemoth: ['charge', 'stomp'],
  boss_cinder_sovereign: ['cut', 'nova', 'orbs', 'rush'],
};

const weakOf = (b: BossDefinition): number => b.hurtboxes.find((h) => h.when?.includes('exposed'))!.multiplier;
const bodyOf = (b: BossDefinition): number => b.hurtboxes.find((h) => !h.when)!.multiplier;
/** The attack whose recovery it is (the last the boss struck with). */
const lastAttack = (f: Fight): string => {
  const e = f.log.filter(([n]) => n === 'boss:strike').pop()?.[1] as { attack: string } | undefined;
  return Object.entries(f.boss.def.attacks).find(([, a]) => a.attack.id === e?.attack)?.[0] ?? '?';
};

/** The multiplier that took the blow on the recovery of each attack of the last phase. */
function multipliers(b: BossDefinition): Map<string, number[]> {
  const f = fight(b, { god: true });
  enterPhase(f, b.phases.length);
  const seen = new Map<string, number[]>();
  const want = b.phases[b.phases.length - 1]!.attacks;
  const enough = (): boolean => want.every((a) => (seen.get(a)?.length ?? 0) >= 2);
  for (let t = 0; t < 90000 && !enough() && !f.boss.health.dead; t++) {
    f.d.step(1);
    if (f.boss.state !== 'recover') continue;
    const id = lastAttack(f);
    const hp = f.boss.health.current;
    strike(f, 0.5);
    seen.set(id, [...(seen.get(id) ?? []), (hp - f.boss.health.current) / 0.5]);
    until(f, 'choose', 600);
  }
  return seen;
}

describe('the condition of each: the weak point shows only in the recovery of the attacks that open it', () => {
  it('each guardian opens on its own attacks: the Shepherd on the volley, the Gardener on the leap, the Behemoth on the charge and the stomp, the Sovereign on all but the geysers — four conditions, no two the same', () => {
    for (const b of EMBER_BOSS_LIST) {
      const opens = Object.entries(b.attacks)
        .filter(([, a]) => a.exposes !== false)
        .map(([id]) => id)
        .sort();
      expect(opens, b.id).toEqual([...OPENS[b.id]!].sort());
      // there is always something that shuts it (or the fight would be only a wait)
      expect(opens.length, b.id).toBeLessThan(Object.keys(b.attacks).length);
      expect(opens.length, b.id).toBeGreaterThan(0);
    }
    expect(new Set(Object.values(OPENS).map((o) => o.join(','))).size).toBe(4);
  });

  for (const b of EMBER_BOSS_LIST) {
    it(`${b.id}: the multiplier of the weak point (${weakOf(b)}) on the recovery of the attacks that open it, and that of the body (${bodyOf(b)}) on the others`, () => {
      const seen = multipliers(b);
      expect([...seen.keys()].sort(), 'every attack of the last phase was met').toEqual([...b.phases[b.phases.length - 1]!.attacks].sort());
      for (const [id, ms] of seen) {
        const open = b.attacks[id]!.exposes !== false;
        for (const m of ms) expect(m, `${b.id}.${id}`).toBeCloseTo(open ? weakOf(b) : bodyOf(b), 6);
      }
    });
  }
});

describe('Dusk Shepherd: the sphere in its chest is out only to be thrown', () => {
  const S = DUSK_SHEPHERD;

  it('while it winds up for a sweep, a stamp or a volley the sphere is in: the body takes a chip of 0.3; and it is the volley, and only the volley, that brings it out for 100 ticks', () => {
    const f = fight(S, { god: true });
    until(f, 'telegraph');
    const hp = f.boss.health.current;
    strike(f, 1);
    expect(hp - f.boss.health.current, 'the body: 0.3').toBeCloseTo(0.3, 6);
    // the volley throws five spheres in an arc toward the hero
    for (let i = 0; i < 20000 && f.boss.attackId !== 'volley'; i++) f.d.step(1);
    until(f, 'attack');
    let max = 0;
    for (let i = 0; i < 60; i++) {
      f.d.step(1);
      max = Math.max(max, f.d.session.entities.filter((e) => e instanceof EnemyShot).length);
    }
    expect(max, 'five spheres').toBe(5);
    until(f, 'recover', 200);
    const hp2 = f.boss.health.current;
    strike(f, 1);
    expect(hp2 - f.boss.health.current, 'the sphere: ×2').toBeCloseTo(2, 6);
    const left = f.boss.def.attacks['volley']!.attack.recovery * f.boss.def.phases[0]!.tempo;
    expect(left, 'it stays out for long enough to be reached by a hero who has to come back').toBeGreaterThanOrEqual(100);
  });

  it('its stamp sends two waves each way along the floor, the second a little faster, and its sweep reaches 4.8 m in front of it', () => {
    const f = fight(S, { god: true });
    for (let i = 0; i < 20000 && f.boss.attackId !== 'stamp'; i++) f.d.step(1);
    until(f, 'attack');
    const speeds = new Set<number>();
    let max = 0;
    for (let i = 0; i < 110; i++) {
      f.d.step(1);
      for (const e of f.d.session.entities) if (e instanceof EnemyShot) speeds.add(e.spec.speed);
      max = Math.max(max, f.d.session.entities.filter((e) => e instanceof EnemyShot).length);
    }
    expect([...speeds].sort(), 'two speeds').toEqual([6, 7]);
    expect(max, 'two each way').toBe(4);
    const sweep = S.attacks['sweep']!.attack.hitbox;
    expect(sweep.x + sweep.w).toBeCloseTo(4.8, 6);
  });

  it('calls a Cinder Crawler at the second phase and it goes with it', () => {
    const f = fight(S, { god: true });
    expect(f.d.session.entities.filter((e) => e instanceof Enemy && e.def.id === 'cinder_crawler')).toHaveLength(0);
    enterPhase(f, 2);
    expect(f.boss.minionsAlive).toBe(1);
    expect(f.d.session.entities.filter((e) => e instanceof Enemy && e.def.id === 'cinder_crawler')).toHaveLength(1);
    f.d.until(() => !f.boss.invulnerable && f.boss.state !== 'choose', 600);
    strike(f, 99); // (the body's chip of 0.3 × 99 is more than it has left)
    f.d.step(60);
    expect(f.boss.health.dead).toBe(true);
    expect(f.boss.minionsAlive, 'what it called goes when it falls').toBe(0);
  });
});

describe('Grove Gardener: leaps onto the hero, plants roots, calls the spheres it tends', () => {
  const G = GROVE_GARDENER;

  it('the leap lands where the hero stood and its bloom shows after it (×2); the ring and the roots leave it shut', () => {
    const f = fight(G, { god: true });
    let target = -1;
    for (let i = 0; i < 20000 && f.boss.attackId !== 'leap'; i++) f.d.step(1);
    for (let i = 0; i < 200 && f.boss.state === 'telegraph'; i++) {
      target = f.boss.telegraphMarks[0]?.x ?? target;
      f.d.step(1);
    }
    until(f, 'recover', 400);
    expect(Math.abs(f.boss.body.x - target), 'came down on the mark').toBeLessThan(1.5);
    const hp = f.boss.health.current;
    strike(f, 1);
    expect(hp - f.boss.health.current, 'the bloom: ×2').toBeCloseTo(2, 6);
  });

  it('plants six roots in a line toward the hero, 8 ticks apart and 3.2 m from each other — in its second phase and the third, not in the first', () => {
    expect(G.phases[0]!.attacks).not.toContain('roots');
    const f = fight(G, { god: true });
    enterPhase(f, 2);
    // (it leaps toward the hero, who does not move: it is put back at the far end of the arena each time it chooses, so that the line has the room to be six)
    for (let i = 0; i < 40000 && f.boss.attackId !== 'roots'; i++) {
      f.d.step(1);
      if (f.boss.state === 'choose') {
        f.boss.body.x = 56;
        f.boss.facing = -1;
        f.d.teleport(20, 2);
      }
    }
    expect(f.boss.attackId).toBe('roots');
    f.d.step(200);
    const strikes = f.log.filter(([n, e]) => n === 'boss:strike' && (e as { attack: string }).attack === 'gardener_roots').map(([, e]) => (e as { x: number }).x);
    expect(strikes).toHaveLength(6);
    const dir = Math.sign(strikes[1]! - strikes[0]!);
    for (let i = 1; i < strikes.length; i++) {
      expect(Math.sign(strikes[i]! - strikes[i - 1]!), 'each next root is farther on').toBe(dir);
      expect(Math.abs(strikes[i]! - strikes[i - 1]!)).toBeCloseTo(3.2, 5);
    }
  });

  it('calls two ember wisps at two thirds of its life and three more at a third (a wisp that has found the hero is gone: they are counted as they are called)', () => {
    const f = fight(G, { god: true });
    const called = new Set<string>();
    const poll = (): void => {
      for (const e of f.d.session.entities) if (e instanceof Enemy && e.def.id === 'ember_wisp') called.add(e.id);
    };
    // (`enterPhase`, looking at the arena on every tick)
    const toPhase = (n: number): void => {
      const next = f.boss.def.phases[f.boss.phase]!;
      f.boss.health.damage(f.boss.health.current - (next.at - 0.02) * f.boss.health.max);
      nudge(f);
      f.d.until(() => {
        poll();
        return f.boss.state === 'choose' && f.boss.phase >= n;
      }, 4400);
    };
    poll();
    expect(called.size).toBe(0);
    toPhase(2);
    expect(called.size).toBe(2);
    toPhase(3);
    expect(called.size, 'three more').toBe(5);
  });
});

describe('Crater Behemoth: armour all over, and a crust that cracks open when it comes down', () => {
  const B = CRATER_BEHEMOTH;

  it('turns away every blow while it winds up and strikes; its crust takes ×2.1 on the recovery of a charge or a stomp, and nothing but a blocked blow after the lava it throws', () => {
    const f = fight(B, { god: true });
    until(f, 'telegraph');
    const hp = f.boss.health.current;
    strike(f);
    expect(f.boss.health.current).toBe(hp);
    expect(count(f, 'enemy:blocked')).toBe(1);
    until(f, 'recover', 600);
    strike(f);
    // (the first attack of the first phase is a charge or a stomp: both open it)
    expect(hp - f.boss.health.current, 'the crust: ×2.1').toBeCloseTo(2.1, 6);
    enterPhase(f, 2);
    for (let i = 0; i < 40000 && f.boss.attackId !== 'bombs'; i++) f.d.step(1);
    until(f, 'recover', 400);
    const hp2 = f.boss.health.current;
    const blocked = count(f, 'enemy:blocked');
    strike(f);
    expect(f.boss.health.current, 'after the bombs it is shut').toBe(hp2);
    expect(count(f, 'enemy:blocked')).toBe(blocked + 1);
  });

  it('a charge that ends against a wall leaves it stunned 85 ticks longer than one that runs out in the open — the longest opening of the world', () => {
    const recoveryAfterCharge = (start: number): number => {
      const f = fight(B, { god: true });
      const place = (): void => {
        f.boss.body.x = start;
        f.boss.facing = 1;
        f.d.teleport(start + 4, 2);
      };
      place();
      for (let i = 0; i < 20000; i++) {
        f.d.step(1);
        if (f.boss.attackId === 'charge' && f.boss.state === 'attack') {
          until(f, 'recover', 200);
          const t0 = f.d.session.now;
          until(f, 'choose', 400);
          return f.d.session.now - t0;
        }
        if (f.boss.state === 'choose') place();
      }
      return -1;
    };
    const open = recoveryAfterCharge(20);
    const wall = recoveryAfterCharge(62);
    expect(Math.abs(open - B.attacks['charge']!.attack.recovery), `a charge in the open: its recovery (${open})`).toBeLessThanOrEqual(1);
    expect(Math.abs(wall - open - 85), `against the wall: 85 more (${wall} against ${open})`).toBeLessThanOrEqual(1);
  });

  it('throws lava in arcs from its second phase and rolls it along the floor from its third — three waves each way, each faster than the last', () => {
    expect(B.phases[0]!.attacks).not.toContain('bombs');
    expect(B.phases[1]!.attacks).not.toContain('rolls');
    expect(B.phases[2]!.attacks).toContain('rolls');
    const f = fight(B, { god: true });
    enterPhase(f, 3);
    for (let i = 0; i < 60000 && f.boss.attackId !== 'rolls'; i++) f.d.step(1);
    until(f, 'attack');
    const speeds = new Set<number>();
    for (let i = 0; i < 160; i++) {
      f.d.step(1);
      for (const e of f.d.session.entities) if (e instanceof EnemyShot && e.spec.attackId === 'behemoth_roll') speeds.add(e.spec.speed);
    }
    expect([...speeds].sort((a, b) => a - b).map((s) => Math.round(s * 10) / 10)).toEqual([6.5, 7.7, 8.9]);
  });
});

describe('Cinder Sovereign: vanishes, rains fire where the hero stands, calls a shade and a weaver', () => {
  const S = CINDER_SOVEREIGN;

  it('while it is gone nothing can touch it; it comes back behind the hero (the way they are not looking) and shows itself before it cuts', () => {
    const f = fight(S, { god: true });
    f.d.p.facing = 1;
    for (let i = 0; i < 30000 && f.boss.attackId !== 'cut'; i++) f.d.step(1);
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

  it('the geysers put a column under the hero in the first two phases — and in the third they surround them, and leave the spot they stand on clear', () => {
    const marks = (phase: number): number[] => {
      const f = fight(S, { god: true });
      enterPhase(f, phase);
      for (let i = 0; i < 60000 && !(f.boss.attackId === 'geysers' && f.boss.state === 'telegraph'); i++) f.d.step(1);
      expect(f.boss.attackId).toBe('geysers');
      const xs = f.boss.telegraphMarks.map((m) => m.x - f.d.body.x);
      // the columns keep clear of each other (the room is read as a whole)
      for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) expect(Math.abs(xs[i]! - xs[j]!), `phase ${phase}: ${xs[i]} / ${xs[j]}`).toBeGreaterThanOrEqual(3.3);
      return xs;
    };
    for (const phase of [1, 2]) {
      const xs = marks(phase);
      expect(xs.length, `phase ${phase}`).toBeGreaterThanOrEqual(3);
      expect(Math.min(...xs.map(Math.abs)), `phase ${phase}: one is under the hero`).toBeLessThan(0.1);
    }
    const third = marks(3);
    expect(third.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...third.map(Math.abs)), 'in the third phase the spot they stand on is clear').toBeGreaterThan(1.6);
  });

  it('charges across the floor from its second phase, and throws the ring of fire only in the third', () => {
    expect(S.phases[0]!.attacks).not.toContain('rush');
    expect(S.phases[1]!.attacks).toContain('rush');
    expect(S.phases[1]!.attacks).not.toContain('nova');
    expect(S.phases[2]!.attacks).toContain('nova');
    const f = fight(S, { god: true });
    enterPhase(f, 3);
    for (let i = 0; i < 60000 && f.boss.attackId !== 'nova'; i++) f.d.step(1);
    until(f, 'attack');
    let max = 0;
    for (let i = 0; i < 30; i++) {
      f.d.step(1);
      max = Math.max(max, f.d.session.entities.filter((e) => e instanceof EnemyShot && e.spec.attackId === 'cinder_nova').length);
    }
    expect(max, 'four each way').toBe(8);
  });

  it('calls a Dusk Shade at 70 % of its life and a Cinder Weaver at 38 %', () => {
    const f = fight(S, { god: true });
    enterPhase(f, 2);
    expect(f.d.session.entities.filter((e) => e instanceof Enemy && e.def.id === 'dusk_shade')).toHaveLength(1);
    expect(f.d.session.entities.filter((e) => e instanceof Enemy && e.def.id === 'cinder_weaver')).toHaveLength(0);
    enterPhase(f, 3);
    expect(f.d.session.entities.filter((e) => e instanceof Enemy && e.def.id === 'cinder_weaver')).toHaveLength(1);
  });
});
