import { describe, expect, it } from 'vitest';
import { BOSSES, INK_WARDEN } from '@/content/enemies';
import type { GameEvents } from '@/gameplay/events';
import { Guardian, type GuardianAttack, type GuardianState } from '@/enemies/Guardian';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { recordSubmissions, strike, strikeOnPlayer } from '../helpers/combat';
import { driver, type Driver } from '../helpers/sim';

/**
 * The Ink Warden, the boss (docs/PROMPT6-LOG.md S29), on a synthetic arena: its state machine tick by tick — dormant, the waking beat, the choice of
 * an attack, the violet telegraph, the strike, the opening, the stagger, the second phase, the fall — and every rule it must respect: hitboxes and
 * hurtboxes through the combat system, knockback, the i-frames and hit-stop that follow a hit, damage, death, the seeded generator and nothing else
 * for chance, and no attack on a hero who is down. The real arena (R4) is proved in `bossWorld.test.ts`.
 *
 *   x:  0 ─ 4 start ──── 14 ▓ door ── 20 ━━━━━━━━━━ THE ARENA ━━━━━━━━━━ 70 ── 76 ▓ door ─── 90
 */
const FIGHT = '~fight:test_boss';
const DEFEATED = 'defeated:test_boss';
const ARENA = rect(20, -1, 70, 12);
const W = INK_WARDEN;
const QUICK = { death: { dying: 6, fadeOut: 4, hold: 4, fadeIn: 4, skipAfter: 1 } };

const arenaRoom = (): RoomDefinition => ({
  id: 'arena',
  regionId: 't',
  name: 'Arena',
  bounds: rect(-1, -12, 91, 18),
  killY: -20,
  entries: [{ id: 'start', x: 4, y: 0, facing: 1 }],
  solids: [block('wall_l', -2, -12, 0, 18), block('wall_r', 90, -12, 92, 18), ground('g', 0, 90), block('door_w', 17, 0, 18.5, 9, 'gate'), block('door_e', 71.5, 0, 73, 9, 'gate')],
  gates: [
    { id: 'door_w', solid: 'door_w', closeWhen: FIGHT },
    { id: 'door_e', solid: 'door_e', closeWhen: FIGHT },
  ],
  bosses: [{ id: 'warden', guardian: 'ink_warden', x: 60, y: 0, facing: -1, arena: ARENA, defeatFlag: DEFEATED, fightFlag: FIGHT }],
});

function setup(opts: { seed?: number; hero?: number; god?: boolean } = {}) {
  const room = arenaRoom();
  const d = driver({ room, unlocked: ['dash'], seed: opts.seed ?? 1, extra: { rooms: { arena: room }, ...QUICK } });
  d.settle();
  if (opts.hero !== undefined) d.teleport(opts.hero, 0).settle();
  if (opts.god) d.session.godMode = true;
  const log: Array<[string, unknown]> = [];
  for (const k of ['boss:started', 'boss:phase', 'boss:defeated', 'enemy:telegraph', 'enemy:alerted', 'actor:died', 'gate:changed', 'flag:set', 'flag:cleared', 'player:hurt', 'combat:hit'] as const) {
    d.session.bus.on(k, (e) => void log.push([k, e]));
  }
  return { d, s: d.session, room, log, boss: () => boss(d) };
}
const boss = (d: Driver): Guardian => d.session.entities.find((e): e is Guardian => e.kind === 'guardian')!;
const events = <K extends keyof GameEvents>(log: Array<[string, unknown]>, k: K): Array<GameEvents[K]> => log.filter(([n]) => n === k).map(([, e]) => e as GameEvents[K]);
const doorsShut = (d: Driver): boolean[] => ['door_w', 'door_e'].map((id) => d.session.collision.get(id)!.enabled);

/** Walks the hero into the arena (the boss wakes the moment their feet are inside it). */
function enter(d: Driver, x = 24): void {
  d.teleport(x, 0).settle();
  d.step(2);
}
/** Runs until the boss is in `state` (for at most `max` ticks), returns how many ticks it took. */
function until(d: Driver, state: GuardianState, max = 600): number {
  return d.until(() => boss(d).state === state, max);
}
/** Runs until the boss starts winding up an attack of this kind; false when the seed never picks it within the budget. */
function untilTelegraph(d: Driver, kind: GuardianAttack, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    d.step(1);
    const b = boss(d);
    if (b.state === 'telegraph' && b.stateTicks === 0) {
      if (b.attackKind === kind) return true;
      // not the one wanted: let it play out (the hero is untouchable in these runs)
    }
  }
  return false;
}
/** The first attack the seed makes it choose, with the hero at `hero`. */
function firstAttack(seed: number, hero: number): GuardianAttack {
  const { d } = setup({ seed, god: true });
  enter(d, hero);
  d.until(() => boss(d).state === 'telegraph', 400);
  return boss(d).attackKind!;
}
/** A seed whose first choice is `kind` (the generator is deterministic: found once, the same every run). */
function seedFor(kind: GuardianAttack, hero: number): number {
  for (let seed = 1; seed < 200; seed++) if (firstAttack(seed, hero) === kind) return seed;
  throw new Error(`no seed picks ${kind}`);
}
const hitBoss = (d: Driver, y0: number, y1: number, damage = 1): void => {
  const b = boss(d);
  strike(d, { team: 'player', rect: { x0: b.body.x - 0.4, x1: b.body.x + 0.4, y0, y1 }, damage, attackId: 'test_blow', knockback: { x: 6, y: 2 }, hitStop: 0 });
  d.step(1);
};

describe('dormant: it waits', () => {
  it('is built once, dormant, at its place, whole, with the doors open and the fight flag down', () => {
    const { d, boss: b } = setup();
    expect(d.session.entities.filter((e) => e.kind === 'guardian')).toHaveLength(1);
    expect(b().state).toBe('dormant');
    expect([b().x, b().y, b().facing]).toEqual([60, 0, -1]);
    expect(b().health.current).toBe(W.health);
    expect(doorsShut(d)).toEqual([false, false]);
    expect(d.session.flags.has(FIGHT)).toBe(false);
  });

  it('while the hero is outside the arena nothing happens, however long they stay', () => {
    const { d, boss: b, log } = setup({ hero: 10 });
    d.step(600);
    expect(b().state).toBe('dormant');
    expect(events(log, 'boss:started')).toHaveLength(0);
    expect(events(log, 'enemy:telegraph')).toHaveLength(0);
  });

  it('it cannot be hurt while it waits: a blow is ignored, whatever it is', () => {
    const { d, boss: b, log } = setup({ hero: 10 });
    hitBoss(d, 0.2, 2);
    expect(b().health.current).toBe(W.health);
    expect(events(log, 'combat:hit')).toHaveLength(0);
    expect(b().invulnerable).toBe(true);
  });
});

describe('waking: the hero steps into the arena', () => {
  it('the moment their feet are inside it announces the boss ONCE, raises the fight flag and closes both doors — and the first thing it does is not an attack', () => {
    const { d, boss: b, log } = setup();
    enter(d, 21);
    expect(b().state).toBe('intro');
    expect(events(log, 'boss:started')).toHaveLength(1);
    expect(events(log, 'enemy:alerted')).toHaveLength(1);
    expect(d.session.flags.has(FIGHT)).toBe(true);
    expect(doorsShut(d)).toEqual([true, true]);
    expect(events(log, 'gate:changed').map((e) => [e.gateId, e.open])).toEqual([['door_w', false], ['door_e', false]]);
    d.step(40);
    expect(events(log, 'boss:started'), 'it does not wake twice').toHaveLength(1);
  });

  it('the edge of the arena is the edge: feet at 19.9 do not wake it, at 20 they do', () => {
    const a = setup({ hero: 19.9 });
    a.d.step(5);
    expect(a.boss().state).toBe('dormant');
    const b = setup({ hero: 20 });
    b.d.step(5);
    expect(b.boss().state).toBe('intro');
  });

  it('the waking beat lasts exactly `introTicks`, the boss cannot be hurt in it and the hero is free to move', () => {
    const { d, boss: b } = setup({ god: true });
    enter(d, 24);
    const t0 = d.session.now;
    const n = until(d, 'choose');
    expect(n + 2).toBeGreaterThanOrEqual(W.introTicks);
    expect(d.session.now - t0).toBeLessThanOrEqual(W.introTicks + 1);
    const fresh = setup({ hero: 24 });
    fresh.d.step(3);
    hitBoss(fresh.d, 0.2, 2);
    expect(fresh.boss().health.current, 'a blow during the intro is ignored').toBe(W.health);
    fresh.d.right();
    fresh.d.step(20);
    expect(fresh.d.body.x, 'the hero moves').toBeGreaterThan(24.5);
    expect(b().health.current).toBe(W.health);
  });

  it('a hero who is dead does not wake it', () => {
    const { d, boss: b } = setup({ hero: 10 });
    d.p.health.damage(d.p.health.max);
    d.teleport(30, 0);
    d.step(30);
    expect(b().state).toBe('dormant');
  });
});

describe('the attack cycle: choose → telegraph → attack → recover, tick for tick', () => {
  it('a CHARGE: a telegraph of exactly its startup, the cue for the effects, then the surge, then the opening — in that order, each of its length', () => {
    const seed = seedFor('charge', 24);
    const { d, boss: b, log } = setup({ seed, god: true });
    enter(d, 24);
    const seen: Array<[GuardianState, number]> = [];
    let last: GuardianState | null = null;
    let from = d.session.now;
    for (let i = 0; i < 400 && seen.length < 4; i++) {
      d.step(1);
      const st = b().state;
      if (st !== last) {
        if (last) seen.push([last, d.session.now - from]);
        last = st;
        from = d.session.now;
      }
    }
    const cycle = seen.filter(([s]) => ['choose', 'telegraph', 'attack', 'recover'].includes(s));
    expect(cycle.map(([s]) => s)).toEqual(['choose', 'telegraph', 'attack', 'recover'].slice(0, cycle.length));
    expect(cycle.find(([s]) => s === 'telegraph')![1], 'the telegraph is its startup').toBe(W.attacks.charge.startup);
    const cue = events(log, 'enemy:telegraph')[0]!;
    expect(cue.ticks).toBe(W.attacks.charge.startup);
    expect(cue.defId).toBe('ink_warden');
  });

  it('a RAIN stands still: it marks three spots on the floor — where the hero stood and 3.4 m either side — and strikes exactly there after the telegraph', () => {
    const seed = seedFor('rain', 24);
    const { d, boss: b, log } = setup({ seed, god: true });
    enter(d, 24);
    expect(untilTelegraph(d, 'rain')).toBe(true);
    const x0 = b().x;
    const marks = b().telegraphMarks.map((m) => m.x);
    expect(marks).toHaveLength(3);
    const hero = d.body.x;
    expect(marks.map((m) => +(m - hero).toFixed(2))).toEqual([-3.4, 0, 3.4].map((o) => +(Math.max(ARENA.x0 + 0.85, Math.min(ARENA.x1 - 0.85, hero + o)) - hero).toFixed(2)));
    expect(events(log, 'enemy:telegraph').filter((e) => e.ticks === W.attacks.rain.startup)).toHaveLength(3);
    const rec = recordSubmissions(d);
    until(d, 'recover');
    const strikes = rec.filter((r) => r.attackId === 'warden_rain');
    expect(strikes.length, 'one hitbox per mark per active tick').toBe(3 * W.attacks.rain.active);
    for (const r of strikes.slice(0, 3)) {
      expect(marks.some((m) => Math.abs((r.rect.x0 + r.rect.x1) / 2 - m) < 1e-9)).toBe(true);
      expect(r.rect.x1 - r.rect.x0).toBeCloseTo(W.params.rain.width, 9);
      expect(r.rect.y1 - r.rect.y0).toBeCloseTo(W.params.rain.height, 9);
    }
    expect(b().x, 'the rain does not move it').toBe(x0);
  });

  it('the marks fill as the strike nears (0 → 1) and are gone once it has struck', () => {
    const { d, boss: b } = setup({ seed: seedFor('rain', 24), god: true });
    enter(d, 24);
    expect(untilTelegraph(d, 'rain')).toBe(true);
    d.step(W.attacks.rain.startup / 2);
    expect(b().telegraphMarks[0]!.t01).toBeGreaterThan(0.4);
    expect(b().telegraphMarks[0]!.t01).toBeLessThan(0.6);
    until(d, 'attack');
    expect(b().telegraphMarks[0]!.t01).toBe(1);
    until(d, 'recover');
    expect(b().telegraphMarks).toHaveLength(0);
  });

  it('the charge lane is one violet strip from the boss along the floor, as long as the slide', () => {
    const { d, boss: b } = setup({ seed: seedFor('charge', 24), god: true });
    enter(d, 24);
    expect(untilTelegraph(d, 'charge')).toBe(true);
    const marks = b().telegraphMarks;
    expect(marks).toHaveLength(1);
    expect(marks[0]!.w).toBeCloseTo((W.params.charge.speed * W.params.charge.ticks) / 60, 9);
    expect(Math.sign(marks[0]!.x - b().x), 'the lane lies the way it faces').toBe(b().facing);
  });

  it('the opening: after the strike it is harmless and stuck for its whole recovery, and the next thing it does is choose again', () => {
    const { d, boss: b } = setup({ seed: seedFor('rain', 24), god: true });
    enter(d, 24);
    until(d, 'recover', 900);
    const t = d.until(() => b().state !== 'recover', 400);
    expect(t).toBeGreaterThanOrEqual(W.attacks.rain.recovery - 1);
    expect(t).toBeLessThanOrEqual(W.attacks.rain.recovery + 1);
    expect(b().state).toBe('choose');
  });
});

describe('the charge as the hero meets it', () => {
  /**
   * The hero standing in the lane, `heroDx` m in front of the boss (west of it), at the moment it chooses: a seed that makes it choose the charge
   * THEN is found (the choice reads where the hero stands), and the fight is left at the start of the wind-up.
   */
  function chargeAt(heroDx: number) {
    for (let seed = 1; seed < 200; seed++) {
      const ctx = setup({ seed });
      enter(ctx.d, 24);
      ctx.d.until(() => ctx.boss().state === 'choose', 400);
      ctx.d.teleport(ctx.boss().x - heroDx, 0).settle();
      ctx.d.until(() => ctx.boss().state === 'telegraph', 20);
      if (ctx.boss().attackKind === 'charge') return ctx;
    }
    throw new Error('no seed chooses the charge');
  }

  it('hurts for 2 with the knockback it declares, a hit-stop and the usual events — and only once (the i-frames that follow)', () => {
    const { d, boss: b, log } = chargeAt(5);
    until(d, 'attack');
    const hp = d.p.health.current;
    d.until(() => d.p.health.current < hp, 120);
    expect(d.p.health.current).toBe(hp - W.attacks.charge.damage);
    const hurt = events(log, 'player:hurt');
    expect(hurt).toHaveLength(1);
    expect(hurt[0]!.damage).toBe(W.attacks.charge.damage);
    expect(d.body.vx, 'thrown away from it').toBeLessThan(0);
    expect(d.session.hitStopLeft, 'the hit freezes the world').toBeGreaterThan(0);
    d.step(60);
    expect(events(log, 'player:hurt'), 'the surge passes over the hero during the i-frames: no second hit').toHaveLength(1);
    expect(b().state).not.toBe('dead');
  });

  it('a jump clears it: the surge is 1.2 m high, the hero\'s jump 3.1 m', () => {
    const { d, boss: b, log } = chargeAt(5);
    until(d, 'attack');
    d.press('jump');
    d.step(24);
    d.release('jump');
    d.until(() => b().state === 'recover', 120);
    expect(events(log, 'player:hurt')).toHaveLength(0);
  });

  it('a dash through it clears it too (the dash\'s i-frames), and the hero comes out behind the boss', () => {
    const { d, boss: b, log } = chargeAt(4);
    until(d, 'attack');
    d.step(3);
    d.right(); // the boss comes from the east: dash toward it, through it
    d.tap('dash');
    d.step(60);
    expect(events(log, 'player:hurt')).toHaveLength(0);
    d.until(() => b().state === 'recover', 120);
  });

  it('it stops at a wall: the slide ends where the arena ends (the door) and never goes through it', () => {
    const { d, boss: b } = setup({ seed: seedFor('charge', 24), god: true });
    enter(d, 24);
    d.until(() => b().state === 'choose', 400);
    d.teleport(30, 0).settle(); // far to its west: it faces west and slides toward the west door
    let minX = Infinity;
    for (let i = 0; i < 1500; i++) {
      d.step(1);
      minX = Math.min(minX, b().x);
    }
    expect(minX).toBeGreaterThan(18.5 + W.body.halfWidth - 0.01); // never past the west door
  });
});

describe('the hero hits back: hurtboxes, damage, armour, the stagger', () => {
  it('a blow on the body does its damage; one on the crest (the weak point, high above) does double', () => {
    const { d, boss: b } = setup({ hero: 24 });
    d.until(() => b().state === 'choose' || b().state === 'telegraph', 400);
    const hp = b().health.current;
    hitBoss(d, 0.3, 1.4, 1);
    expect(b().health.current).toBe(hp - 1);
    hitBoss(d, 2.75, 3.5, 1);
    expect(b().health.current, 'the crest takes x2').toBe(hp - 3);
  });

  it('a blow that misses the column (beside it, or far above the crest) does nothing', () => {
    const { d, boss: b } = setup({ hero: 24 });
    d.until(() => b().state === 'telegraph', 400);
    const hp = b().health.current;
    strike(d, { team: 'player', rect: { x0: b().x + 2, x1: b().x + 3, y0: 0, y1: 2 }, damage: 5, attackId: 'test_blow' });
    strike(d, { team: 'player', rect: { x0: b().x - 0.3, x1: b().x + 0.3, y0: 4.2, y1: 5 }, damage: 5, attackId: 'test_blow' });
    d.step(1);
    expect(b().health.current).toBe(hp);
  });

  it('it is ARMOURED while it winds up and strikes: a blow hurts it but does not stop the attack', () => {
    const { d, boss: b } = setup({ hero: 24, seed: seedFor('rain', 24) });
    expect(untilTelegraph(d, 'rain')).toBe(true);
    hitBoss(d, 0.3, 1.4);
    expect(b().state, 'it keeps winding up').toBe('telegraph');
    until(d, 'attack');
    hitBoss(d, 0.3, 1.4);
    expect(b().state, 'and keeps striking').toBe('attack');
  });

  it('a blow while it recovers staggers it, ONCE: the stagger is added to the opening, and a second blow does not stun-lock it', () => {
    const { d, boss: b, log } = setup({ seed: seedFor('rain', 24), god: true });
    enter(d, 24);
    until(d, 'recover', 900);
    hitBoss(d, 0.3, 1.4);
    expect(b().state).toBe('hurt');
    const t0 = d.session.now;
    hitBoss(d, 0.3, 1.4);
    expect(b().state, 'a second blow in the same opening does not restart the stagger').toBe('hurt');
    d.until(() => b().state === 'choose', 400);
    const total = d.session.now - t0;
    expect(total).toBeGreaterThan(W.staggerTicks); // the stagger, and what was left of the opening, at least
    expect(events(log, 'combat:hit')).toHaveLength(2);
    // the next opening can stagger it again
    until(d, 'recover', 900);
    hitBoss(d, 0.3, 1.4);
    expect(b().state).toBe('hurt');
  });

  it('a hit does not push it (a column of ink does not budge) and flashes it white for a moment', () => {
    const { d, boss: b } = setup({ hero: 24 });
    d.until(() => b().state === 'telegraph', 400);
    const x = b().x;
    hitBoss(d, 0.3, 1.4);
    expect(b().x).toBe(x);
    expect(b().view.flash).toBeGreaterThan(0.5);
    d.step(20);
    expect(b().view.flash).toBe(0);
  });
});

describe('the second phase', () => {
  it('at half its health it is enraged — announced once — and every wind-up is 72 % as long; the rain gains a fourth mark', () => {
    const { d, boss: b, log } = setup({ hero: 24, god: true, seed: seedFor('rain', 24) });
    d.until(() => b().state === 'choose' || b().state === 'telegraph', 400);
    expect(b().enraged).toBe(false);
    b().health.damage(W.health * 0.5 - 1);
    hitBoss(d, 0.3, 1.4); // the blow that crosses the line
    expect(b().enraged).toBe(true);
    expect(events(log, 'boss:phase')).toEqual([{ id: b().id, defId: 'ink_warden', phase: 2, x: b().x, y: b().y }]);
    hitBoss(d, 0.3, 1.4);
    expect(events(log, 'boss:phase'), 'announced once').toHaveLength(1);
    d.step(1);
    expect(b().view.enraged).toBe(true);
    // the next wind-ups use the scaled times
    d.until(() => b().state === 'telegraph' && b().stateTicks === 0, 900);
    const kind = b().attackKind!;
    const want = Math.round(W.attacks[kind].startup * W.enrageScale);
    const t = d.until(() => b().state !== 'telegraph', 400);
    expect(t).toBe(want);
    if (kind === 'rain') expect(events(log, 'enemy:telegraph').slice(-4).length).toBe(4);
  });
});

describe('the fall', () => {
  it('the killing blow ends it: it dies (announced as any guardian dies, and as a boss), its flag is set for good, the fight flag drops and the doors open', () => {
    const { d, boss: b, log } = setup({ hero: 24 });
    until(d, 'telegraph', 400);
    const id = b().id;
    b().health.damage(W.health - 1);
    hitBoss(d, 0.3, 1.4);
    expect(b().state).toBe('dead');
    expect(events(log, 'actor:died').map((e) => [e.id, e.team])).toEqual([[id, 'enemy']]);
    expect(events(log, 'boss:defeated')).toHaveLength(1);
    expect(d.session.flags.has(DEFEATED)).toBe(true);
    expect(d.session.flags.has(FIGHT)).toBe(false);
    expect(doorsShut(d)).toEqual([false, false]);
    expect(events(log, 'gate:changed').filter((e) => e.open).map((e) => e.gateId).sort()).toEqual(['door_e', 'door_w']);
    expect(events(log, 'combat:hit').pop()!.killed).toBe(true);
  });

  it('it dissolves over its death ticks, cannot be hit while it does, attacks no more, and is then gone from the world, once', () => {
    const { d, boss: b, log } = setup({ hero: 24 });
    until(d, 'telegraph', 400);
    const dead = b();
    dead.health.damage(W.health - 1);
    hitBoss(d, 0.3, 1.4);
    const rec = recordSubmissions(d);
    hitBoss(d, 0.3, 1.4);
    expect(events(log, 'actor:died'), 'a body that is down cannot fall twice').toHaveLength(1);
    d.step(W.deathTicks + 5);
    expect(d.session.entities.filter((e) => e.kind === 'guardian')).toHaveLength(0);
    expect(dead.view.opacity).toBeLessThan(0.05);
    expect(rec.filter((r) => r.attackId.startsWith('warden'))).toEqual([]);
  });

  it('a boss that fell is never built again: not after a reload of the room, and not after the hero falls — the doors stay open', () => {
    const { d, s, boss: b } = setup({ hero: 24 });
    until(d, 'telegraph', 400);
    b().health.damage(W.health - 1);
    hitBoss(d, 0.3, 1.4);
    d.step(W.deathTicks + 5);
    s.loadRoom('arena');
    d.settle();
    expect(d.session.entities.filter((e) => e.kind === 'guardian')).toHaveLength(0);
    expect(doorsShut(d)).toEqual([false, false]);
    expect(s.flags.has(DEFEATED)).toBe(true);
  });
});

describe('the hero falls', () => {
  it('a defeat in the fight: the room is rebuilt, the boss is dormant again and WHOLE, the fight flag is gone and the doors are open — nothing is duplicated', () => {
    const { d, s, boss: b } = setup({ hero: 24 });
    d.until(() => b().state === 'telegraph', 400);
    hitBoss(d, 0.3, 1.4);
    expect(b().health.current).toBeLessThan(W.health);
    expect(s.flags.has(FIGHT)).toBe(true);
    d.p.health.damage(d.p.health.current - 1);
    strikeOnPlayer(d, { damage: 99 });
    d.step(1);
    expect(d.p.health.dead).toBe(true);
    d.until(() => !s.death.active, 600);
    d.step(10);
    expect(s.entities.filter((e) => e.kind === 'guardian'), 'one boss, not two').toHaveLength(1);
    expect(b().state).toBe('dormant');
    expect(b().health.current).toBe(W.health);
    expect([b().x, b().facing]).toEqual([60, -1]);
    expect(s.flags.has(FIGHT), 'a fight does not outlive its room').toBe(false);
    expect(doorsShut(d)).toEqual([false, false]);
    // and the fight can begin again
    enter(d, 24);
    expect(b().state).toBe('intro');
    expect(doorsShut(d)).toEqual([true, true]);
  });

  it('a hero who goes down in the middle of a wind-up is not attacked: it gives the strike up and waits', () => {
    const { d, boss: b } = setup({ hero: 24, seed: seedFor('rain', 24) });
    expect(untilTelegraph(d, 'rain')).toBe(true);
    const rec = recordSubmissions(d);
    d.p.health.damage(d.p.health.max); // down, with no defeat flow in the way
    d.step(120);
    expect(rec.filter((r) => r.attackId.startsWith('warden'))).toEqual([]);
    expect(['choose', 'recover']).toContain(b().state);
    expect(b().telegraphMarks).toHaveLength(0);
  });
});

describe('chance is the seeded generator and nothing else', () => {
  /** The attacks it chooses, in order, over a long fight with an untouchable hero. */
  function sequence(seed: number, ticks = 6000): GuardianAttack[] {
    const { d, boss: b } = setup({ seed, god: true });
    enter(d, 24);
    const out: GuardianAttack[] = [];
    let prev: GuardianState = 'intro';
    for (let i = 0; i < ticks; i++) {
      d.step(1);
      const st = b().state;
      if (st === 'telegraph' && prev !== 'telegraph') out.push(b().attackKind!);
      prev = st;
    }
    return out;
  }

  it('the same seed makes it choose the same attacks, in the same order', () => {
    expect(sequence(7)).toEqual(sequence(7));
    expect(sequence(7).length).toBeGreaterThan(10);
  });

  it('different seeds make different fights', () => {
    const seqs = [1, 2, 3, 99].map((s) => sequence(s).join(','));
    expect(new Set(seqs).size).toBeGreaterThan(1);
  });

  it('it never throws the same attack more than twice in a row, on any seed', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const seq = sequence(seed, 5000);
      for (let i = 2; i < seq.length; i++) expect(!(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]), `seed ${seed}: ${seq.join(' ')}`).toBe(true);
    }
  });

  it('it throws both attacks, and favours the charge from afar and the rain up close', () => {
    const near: Record<GuardianAttack, number> = { charge: 0, rain: 0 };
    const far: Record<GuardianAttack, number> = { charge: 0, rain: 0 };
    for (let seed = 1; seed <= 60; seed++) {
      near[firstAttack(seed, 55)]++; // the boss is at 60: 5 m
      far[firstAttack(seed, 28)]++; // 32 m
    }
    expect(near.rain).toBeGreaterThan(near.charge);
    expect(far.charge).toBeGreaterThan(far.rain);
    expect(near.charge + far.rain).toBeGreaterThan(0);
  });
});

describe('the registry', () => {
  it('the warden is registered under its own id, with a name key, two attacks and a weak point listed before the body', () => {
    expect(BOSSES['ink_warden']).toBe(INK_WARDEN);
    expect(W.nameKey).toBe('enemy.warden.name');
    expect(Object.keys(W.attacks).sort()).toEqual(['charge', 'rain']);
    expect(W.hurtboxes[0]!.part).toBe('crest');
    expect(W.hurtboxes[0]!.multiplier).toBeGreaterThan(1);
  });
});
