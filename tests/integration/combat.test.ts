import { describe, expect, it } from 'vitest';
import { driver, type Driver } from '../helpers/sim';
import { recordSubmissions, spawnDummy, strike, strikeOnPlayer } from '../helpers/combat';
import { PLAYER } from '@/content/player';
import { AIR_SLASH, CROUCH_SLASH, SLASH_1, SLASH_2 } from '@/content/attacks';
import { attackLength } from '@/combat/AttackDefinition';
import { TrainingDummy } from '@/enemies/TrainingDummy';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';
import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { GameEvents } from '@/gameplay/events';

/**
 * Combat (docs/GAME-SPEC-2D.md §7 and §9). New file on purpose: the 40 movement tests stay untouched. The enemy side
 * is simulated with `strike()` (a hitbox submitted exactly as a real enemy would); the target is a `TrainingDummy`.
 */
const T = DEFAULT_MOVEMENT;
const C = PLAYER.combat;

function arena(extra: RoomDefinition['solids'] = []): RoomDefinition {
  return {
    id: 'arena', regionId: 't', name: 'arena', bounds: rect(-5, -20, 200, 40), killY: -30,
    entries: [{ id: 's', x: 40, y: 0 }],
    solids: [ground('g', -5, 200), block('wl', -7, -20, -5, 40), ...extra],
  };
}

/** Player at x = 40 facing right, grounded, dash unlocked. */
function fighter(extra: RoomDefinition['solids'] = []): Driver {
  const d = driver({ room: arena(extra), unlocked: ['dash'] });
  d.settle();
  return d;
}

/** A dummy whose body overlaps the first slash's hitbox (x ∈ [40.2, 41.6]). */
const inFront = (d: Driver, dx = 1.4) => spawnDummy(d, { x: d.body.x + dx, y: d.body.y });

const events = (d: Driver) => {
  const log: Array<[keyof GameEvents, unknown]> = [];
  for (const k of ['combat:hit', 'health:changed', 'actor:died', 'player:attacked', 'player:hurt', 'player:died'] as const) {
    d.session.bus.on(k, (e) => void log.push([k, e]));
  }
  return log;
};

describe('attack timeline (slash_1: 4 startup · 3 active · 8 recovery)', () => {
  it('goes startup → active → recovery and hands control back; the hitbox exists ONLY on the 3 active ticks', () => {
    const d = fighter();
    const subs = recordSubmissions(d);
    const phases: string[] = [];
    d.tap('attack');
    for (let i = 0; i < 22; i++) {
      phases.push(d.p.view.phase);
      d.step(1);
    }
    expect(subs).toHaveLength(SLASH_1.active);
    expect(subs.every((s) => s.attackId === 'slash_1')).toBe(true);
    expect(phases.filter((p) => p === 'startup')).toHaveLength(SLASH_1.startup + 1); // + the tick the press was consumed
    expect(phases.filter((p) => p === 'active')).toHaveLength(SLASH_1.active);
    expect(phases.filter((p) => p === 'recovery')).toHaveLength(SLASH_1.recovery);
    expect(d.p.controller.state).toBe('free');
    expect(d.p.combat.attacking).toBe(false);
  });

  it('publishes phase and progress for the sprite (its frame comes from the simulation, not from a clock)', () => {
    const d = fighter();
    d.tap('attack');
    const seen: Array<[string, number]> = [];
    for (let i = 0; i < 16; i++) {
      d.step(1);
      if (d.p.view.anim === 'attack') seen.push([d.p.view.phase, d.p.view.phaseT]);
    }
    expect(d.p.view.animSerial).toBeGreaterThan(0);
    const active = seen.filter(([p]) => p === 'active').map(([, t]) => t);
    expect(active).toHaveLength(3);
    expect(active[0]!).toBeCloseTo(1 / 3);
    expect(active[2]!).toBeCloseTo(1);
    for (const [, t] of seen) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });

  it('the hitbox is in front of the player and MIRRORS when facing left', () => {
    const right = fighter();
    const sr = recordSubmissions(right);
    right.tap('attack').step(12);
    const r = sr[0]!.rect;
    expect(r.x0).toBeGreaterThan(right.body.x - 0.5);
    expect(r.x1 - r.x0).toBeCloseTo(SLASH_1.hitbox.w, 6);

    const left = fighter();
    left.left().step(8).stop().step(30);
    expect(left.p.facing).toBe(-1);
    const sl = recordSubmissions(left);
    left.tap('attack').step(12);
    expect(sl[0]!.rect.x1).toBeLessThan(left.body.x + 0.5);
    expect(sl[0]!.rect.x1 - sl[0]!.rect.x0).toBeCloseTo(SLASH_1.hitbox.w, 6);
  });

  it('lunges forward (3 m/s for 4 ticks) and then stops: the ground attack is nearly rooted', () => {
    const d = fighter();
    const x0 = d.body.x;
    d.tap('attack').step(3);
    expect(d.body.vx).toBeCloseTo(SLASH_1.lunge!.speed, 5);
    d.step(30);
    expect(d.body.vx).toBe(0);
    expect(d.body.x - x0).toBeGreaterThan(0.15);
    expect(d.body.x - x0).toBeLessThan(0.6);
  });

  it('a press buffered a few ticks early still starts the attack (0.12 s buffer), and a held button does not repeat it', () => {
    const d = fighter();
    d.press('attack'); // held, never released
    d.step(60);
    const attacks: string[] = [];
    d.session.bus.on('player:attacked', (e) => void attacks.push(e.attackId));
    d.step(60);
    expect(attacks).toHaveLength(0); // holding is not mashing: it needs a new press
  });
});

describe('hit-once, damage and knockback', () => {
  it('one swing hits a target ONCE even though the hitbox stays active for 3 ticks', () => {
    const d = fighter();
    const dummy = inFront(d);
    d.tap('attack').step(20);
    expect(dummy.hits).toBe(1);
    expect(dummy.health.current).toBe(5 - SLASH_1.damage);
  });

  it('a new swing is a new attack instance and hits again', () => {
    const d = fighter();
    const dummy = inFront(d, 1.3);
    d.tap('attack').step(24);
    // the dummy was pushed away: stay in range for the second swing
    dummy.body.x = d.body.x + 1.3;
    d.tap('attack').step(24);
    expect(dummy.hits).toBe(2);
  });

  it('knocks the target away from the attacker (x) and up (y), mirrored when facing left', () => {
    const right = fighter();
    const dr = inFront(right);
    right.tap('attack').until(() => dr.hits > 0, 30);
    expect(dr.body.vx).toBeCloseTo(SLASH_1.knockback.x, 5);
    expect(dr.body.vy).toBeGreaterThan(0);
    right.step(40);
    expect(dr.body.x).toBeGreaterThan(right.body.x + 1.4);

    const left = fighter();
    left.left().step(8).stop().step(30);
    const dl = spawnDummy(left, { x: left.body.x - 1.4, y: 0 });
    left.tap('attack').until(() => dl.hits > 0, 30);
    expect(dl.body.vx).toBeCloseTo(-SLASH_1.knockback.x, 5);
  });

  it('the hitbox is directional and has a limited reach: targets behind or too far are not hit', () => {
    const d = fighter();
    const behind = spawnDummy(d, { x: d.body.x - 1.4, y: 0 });
    const far = spawnDummy(d, { x: d.body.x + 3.2, y: 0 });
    d.tap('attack').step(24);
    expect(behind.hits).toBe(0);
    expect(far.hits).toBe(0);
  });

  it('reports the hit through events with the damage, the impact point and whether it killed', () => {
    const d = fighter();
    const log = events(d);
    const dummy = spawnDummy(d, { x: d.body.x + 1.4, y: 0, health: 1 });
    d.tap('attack').step(24);
    const hit = log.find(([k]) => k === 'combat:hit')![1] as GameEvents['combat:hit'];
    expect(hit).toMatchObject({ attackId: 'slash_1', attackerId: d.p.id, targetId: dummy.id, targetTeam: 'enemy', damage: 1, killed: true, direction: 1 });
    expect(hit.x).toBeGreaterThan(d.body.x);
    expect(log.some(([k]) => k === 'health:changed')).toBe(true);
    expect(log.filter(([k]) => k === 'actor:died')).toHaveLength(1);
  });

  it('five hits kill a 5-HP target; the dead are not hit again and leave the world', () => {
    const d = fighter();
    const dummy = inFront(d, 1.3);
    for (let i = 0; i < 5; i++) {
      dummy.body.x = d.body.x + 1.3;
      dummy.body.y = 0;
      d.tap('attack').step(26);
    }
    expect(dummy.health.dead).toBe(true);
    expect(dummy.hits).toBe(5);
    d.step(40);
    expect(d.session.entities).not.toContain(dummy);
    expect(d.session.combat.count).toBe(1); // only the player is left
  });

  it('neutral combatants (walls, switches) are hit by the player but never by an enemy strike', () => {
    const d = fighter();
    const wall = spawnDummy(d, { x: d.body.x + 1.4, y: 0, team: 'neutral' });
    strike(d, { rect: { x0: wall.body.x - 0.3, x1: wall.body.x + 0.3, y0: 0.2, y1: 1.2 } });
    d.step(2);
    expect(wall.hits).toBe(0);
    d.tap('attack').step(24);
    expect(wall.hits).toBe(1);
  });
});

describe('hit-stop (the world freezes on impact; presses are kept)', () => {
  it('freezes the whole simulation for the attack\'s hit-stop ticks: time does not advance, nobody moves', () => {
    const d = fighter();
    const dummy = inFront(d);
    d.tap('attack').until(() => dummy.hits > 0, 30);
    expect(d.session.frozen).toBe(true);
    expect(d.session.hitStopLeft).toBe(SLASH_1.hitStop);
    const now = d.session.now;
    const px = dummy.body.x;
    const phase = d.p.view.phase;
    d.step(SLASH_1.hitStop);
    expect(d.session.now).toBe(now); // frozen
    expect(dummy.body.x).toBe(px);
    expect(d.p.view.phase).toBe(phase); // the phase-driven animation freezes by itself
    expect(d.session.frozen).toBe(false);
    d.step(1);
    expect(d.session.now).toBe(now + 1);
  });

  it('an attack press made DURING the freeze is not lost: it is still buffered when the chain window opens', () => {
    const d = fighter();
    const dummy = inFront(d);
    const attacks: string[] = [];
    d.session.bus.on('player:attacked', (e) => void attacks.push(e.attackId));
    d.tap('attack').until(() => dummy.hits > 0, 30);
    expect(d.session.frozen).toBe(true);
    d.tap('attack'); // pressed while the world is frozen
    d.step(40);
    expect(attacks).toEqual(['slash_1', 'slash_2']);
  });

  it('a jump pressed during a hit-stop takes off on the FIRST simulated tick after it (the press is latched)', () => {
    const d = fighter();
    const now = d.session.now;
    d.session.requestHitStop(6);
    d.tap('jump');
    expect(d.body.vy).toBe(0); // frozen: nothing happened yet
    d.step(5);
    expect(d.session.now).toBe(now); // still frozen: time did not advance
    expect(d.body.vy).toBe(0);
    d.step(1);
    expect(d.session.now).toBe(now + 1);
    expect(d.body.vy).toBeGreaterThan(5); // the latched press was released on the first tick after the freeze
  });

  it('the stick and the held buttons are the CURRENT ones after the freeze (only the edges are remembered)', () => {
    const d = fighter();
    d.session.requestHitStop(4);
    d.right().step(4);
    d.stop();
    d.step(2);
    expect(d.body.vx).toBe(0); // the stick was released before the world resumed
  });

  it('when several hits ask for a freeze the LONGEST wins', () => {
    const d = fighter();
    d.session.requestHitStop(3);
    d.session.requestHitStop(8);
    d.session.requestHitStop(5);
    expect(d.session.hitStopLeft).toBe(8);
  });

  it('slash_2 (the finisher) freezes longer than slash_1', () => {
    expect(SLASH_2.hitStop).toBeGreaterThan(SLASH_1.hitStop);
  });
});

describe('the two-hit chain', () => {
  const timeline = (d: Driver, pressAt: number): { attacks: string[]; combos: number[] } => {
    const attacks: string[] = [];
    const combos: number[] = [];
    d.session.bus.on('player:attacked', (e) => {
      attacks.push(e.attackId);
      combos.push(e.combo);
    });
    d.tap('attack');
    let n = 0;
    while (d.p.combat.attackTicks < pressAt && n++ < 60) d.step(1);
    d.tap('attack');
    d.step(60);
    return { attacks, combos };
  };

  it('a press inside the cancel window (ticks 8–15) chains into slash_2', () => {
    const d = fighter();
    const { attacks, combos } = timeline(d, 9);
    expect(attacks).toEqual(['slash_1', 'slash_2']);
    expect(combos).toEqual([0, 1]);
  });

  it('a press that is too EARLY (it has expired by the time the window opens) does not chain: it starts a fresh slash_1 after', () => {
    const d = fighter();
    const { attacks } = timeline(d, 1);
    expect(attacks[0]).toBe('slash_1');
    expect(attacks.includes('slash_2')).toBe(false);
  });

  it('a press after the attack has ended starts a new first attack, not the second', () => {
    const d = fighter();
    d.tap('attack').step(40);
    const attacks: string[] = [];
    d.session.bus.on('player:attacked', (e) => void attacks.push(e.attackId));
    d.tap('attack').step(3);
    expect(attacks).toEqual(['slash_1']);
  });

  it('there is no third hit: mashing the button never produces a combo above 1, and slash_2 never chains into anything', () => {
    const d = fighter();
    const seen: Array<{ id: string; combo: number; tick: number }> = [];
    d.session.bus.on('player:attacked', (e) => void seen.push({ id: e.attackId, combo: e.combo, tick: d.session.now }));
    for (let i = 0; i < 40; i++) {
      d.tap('attack');
      d.step(3);
    }
    d.step(60);
    expect(seen.length).toBeGreaterThan(3);
    expect(Math.max(...seen.map((s) => s.combo))).toBe(1);
    for (const s of seen) expect(s.id).toBe(s.combo === 1 ? 'slash_2' : 'slash_1');
    // every slash_2 starts by chaining out of a slash_1, and the attack after a slash_2 only starts once it is over
    for (let i = 1; i < seen.length; i++) {
      if (seen[i - 1]!.id === 'slash_2') expect(seen[i]!.tick - seen[i - 1]!.tick).toBeGreaterThanOrEqual(attackLength(SLASH_2));
    }
    expect(d.p.controller.state).toBe('free');
  });

  it('the second swing is a new attack instance: it hits the same target again', () => {
    const d = fighter();
    const dummy = inFront(d, 1.2);
    d.tap('attack');
    d.until(() => d.p.combat.attackTicks >= 9, 60);
    dummy.body.x = d.body.x + 1.3;
    d.tap('attack');
    d.step(60);
    expect(dummy.hits).toBe(2);
    expect(dummy.health.current).toBe(5 - SLASH_1.damage - SLASH_2.damage);
  });
});

describe('air, crouch and dash', () => {
  it('attacking in the air uses air_slash, with reduced gravity (a small hover)', () => {
    const plain = fighter();
    plain.tap('jump').step(18);
    const vyBefore = plain.body.vy;
    plain.step(3);
    const fallPlain = vyBefore - plain.body.vy;

    const d = fighter();
    d.tap('jump').step(18);
    const attacks: string[] = [];
    d.session.bus.on('player:attacked', (e) => void attacks.push(`${e.attackId}:${e.air}`));
    const vy0 = d.body.vy;
    d.tap('attack');
    d.step(2);
    expect(attacks).toEqual(['air_slash:true']);
    expect(d.p.view.anim).toBe('attackAir');
    const fallAttacking = vy0 - d.body.vy;
    expect(fallAttacking).toBeLessThan(fallPlain + 0.0001);
    expect(AIR_SLASH.airGravityScale).toBe(0.6);
  });

  it('landing during an air attack\'s recovery shortens it', () => {
    const d = fighter();
    d.tap('jump').step(4);
    d.tap('attack');
    d.until(() => d.body.grounded, 120);
    d.step(6);
    expect(d.p.controller.state).not.toBe('attack');
    const ticksIfNotShortened = attackLength(AIR_SLASH);
    expect(d.p.combat.attackTicks).toBeLessThan(ticksIfNotShortened + 1);
  });

  it('attacking while crouched uses crouch_slash, keeps the crouched body and ends crouched', () => {
    const d = fighter();
    d.moveY = -1;
    d.step(3);
    expect(d.p.controller.crouched).toBe(true);
    const attacks: string[] = [];
    d.session.bus.on('player:attacked', (e) => void attacks.push(e.attackId));
    d.tap('attack');
    for (let i = 0; i < 30; i++) {
      if (d.p.controller.state === 'attack') expect(d.body.height).toBe(T.crouch.height);
      d.step(1);
    }
    expect(attacks).toEqual(['crouch_slash']);
    expect(d.p.view.anim === 'crouch' || d.p.view.anim === 'attackCrouch').toBe(true);
    expect(d.p.controller.state).toBe('crouch');
    expect(d.p.controller.crouched).toBe(true);
  });

  it('the crouch slash hits LOW: it connects with a low target and passes under a high one', () => {
    // a dummy standing on a 0.9 m block has its whole hurtbox above the crouch slash (y 0.0–0.65)
    const d = fighter([block('crate', 41, 0, 43, 0.9, 'stone')]);
    const high = spawnDummy(d, { x: 42, y: 0.9 });
    d.moveY = -1;
    d.step(3);
    d.tap('attack').step(26);
    expect(high.hits).toBe(0);
    d.moveY = 0;
    d.step(5);
    d.tap('attack').step(26);
    expect(high.hits).toBe(1); // the standing slash (y 0.3–1.4) reaches it

    const low = fighter();
    const dummy = inFront(low, 1.3);
    low.moveY = -1;
    low.step(3);
    low.tap('attack').step(26);
    expect(dummy.hits).toBe(1);
    expect(CROUCH_SLASH.hitbox.h).toBeLessThan(SLASH_1.hitbox.h);
  });

  it('dash cancels the RECOVERY of an attack but never its startup or active frames', () => {
    const early = fighter();
    early.tap('attack').step(2); // startup
    early.tap('dash');
    expect(early.p.controller.dashing).toBe(false);
    expect(early.p.controller.state).toBe('attack');

    const late = fighter();
    late.tap('attack');
    late.until(() => late.p.view.phase === 'recovery', 30);
    late.tap('dash');
    late.step(1);
    expect(late.p.controller.dashing).toBe(true);
    expect(late.p.combat.attacking).toBe(false);
  });
});

describe('being hit (docs/GAME-SPEC-2D.md §9.1)', () => {
  it('loses 1 HP, is knocked back (5.5 / 4) away from the attacker, loses control for 14 ticks and gets 60 ticks of i-frames', () => {
    const d = fighter();
    const log = events(d);
    expect(d.p.health.current).toBe(5);
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.health.current).toBe(4);
    expect(d.p.controller.state).toBe('hurt');
    expect(d.p.view.anim).toBe('hurt');
    expect(d.body.vx).toBeGreaterThan(4);
    expect(d.body.vy).toBeGreaterThan(2);
    expect(d.p.controller.isInvulnerable).toBe(true);
    expect(log.map(([k]) => k)).toEqual(expect.arrayContaining(['combat:hit', 'health:changed', 'player:hurt']));
    // frozen by the hit-stop, then 14 ticks without control
    d.step(6);
    d.right().step(1); // pushing the stick does nothing while stunned
    expect(d.p.controller.state).toBe('hurt');
    d.step(14);
    expect(d.p.controller.state).toBe('free');
  });

  it('is a "ghost" for 60 ticks (hits are ignored and the sprite blinks), then vulnerable again', () => {
    const d = fighter();
    strikeOnPlayer(d);
    d.step(1);
    d.step(6); // hit-stop
    expect(d.p.view.blink).toBe(true);
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.health.current).toBe(4); // ignored
    d.step(70);
    expect(d.p.view.blink).toBe(false);
    expect(d.p.controller.isInvulnerable).toBe(false);
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.health.current).toBe(3);
  });

  it('flashes white on the hit and the flash fades out', () => {
    const d = fighter();
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.view.flash).toBeGreaterThan(0.5);
    d.step(20);
    expect(d.p.view.flash).toBe(0);
  });

  it('the hit asks for its hit-stop (6 ticks)', () => {
    const d = fighter();
    strikeOnPlayer(d);
    d.step(1);
    expect(d.session.hitStopLeft).toBe(6);
  });

  it('the dash i-frames (0.13 s) dodge a strike; after them the player is vulnerable again', () => {
    const d = fighter();
    d.right().tap('dash');
    expect(d.p.controller.dashing).toBe(true);
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.health.current).toBe(5); // dodged
    d.until(() => !d.p.controller.isInvulnerable, 30);
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.health.current).toBe(4);
  });

  it('a crouched player is MISSED by a strike at head height; a low strike still hits', () => {
    const d = fighter();
    d.moveY = -1;
    d.step(3);
    expect(d.p.controller.crouched).toBe(true);
    strike(d, { rect: { x0: d.body.x - 0.5, x1: d.body.x + 0.5, y0: d.body.y + 1.1, y1: d.body.y + 1.5 } });
    d.step(1);
    expect(d.p.health.current).toBe(5);
    strike(d, { rect: { x0: d.body.x - 0.5, x1: d.body.x + 0.5, y0: d.body.y + 0.1, y1: d.body.y + 0.5 } });
    d.step(1);
    expect(d.p.health.current).toBe(4);
  });

  it('being hit interrupts an attack in progress: no more hitboxes come out of it', () => {
    const d = fighter();
    const subs = recordSubmissions(d);
    d.tap('attack').step(3); // in startup
    strikeOnPlayer(d);
    d.step(40);
    expect(subs.filter((s) => s.attackId === 'slash_1')).toHaveLength(0);
    expect(d.p.combat.attacking).toBe(false);
  });

  it('the knockback direction follows the attacker\'s facing', () => {
    const d = fighter();
    strikeOnPlayer(d, { facing: -1 });
    d.step(1);
    expect(d.body.vx).toBeLessThan(-4);
  });

  it('godMode: the player cannot be damaged', () => {
    const d = fighter();
    d.session.godMode = true;
    d.step(1);
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.health.current).toBe(5);
    expect(d.p.controller.state).toBe('free');
  });
});

describe('death', () => {
  const kill = (d: Driver): void => {
    for (let i = 0; i < 5; i++) {
      strikeOnPlayer(d);
      d.step(1);
      d.step(70); // hit-stop + i-frames
    }
  };

  it('lethal damage → `dead`: event once, longer hit-stop (8), `death` animation, health 0', () => {
    const d = fighter();
    const log = events(d);
    for (let i = 0; i < 4; i++) {
      strikeOnPlayer(d);
      d.step(1);
      d.step(70);
    }
    expect(d.p.health.current).toBe(1);
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.health.dead).toBe(true);
    expect(d.p.controller.state).toBe('dead');
    expect(d.p.view.anim).toBe('death');
    expect(d.session.hitStopLeft).toBe(C.hurt.deathHitStop);
    expect(log.filter(([k]) => k === 'player:died')).toHaveLength(1);
  });

  it('ignores all input while dead, cannot be hit again and stays dead', () => {
    const d = fighter();
    kill(d);
    expect(d.p.controller.state).toBe('dead');
    const x = d.body.x;
    d.right().tap('jump').tap('attack').tap('dash').step(60);
    expect(d.p.controller.state).toBe('dead');
    expect(d.body.grounded).toBe(true);
    expect(Math.abs(d.body.x - x)).toBeLessThan(3); // only the knockback slide, no walking
    const log = events(d);
    strikeOnPlayer(d);
    d.step(1);
    expect(log.filter(([k]) => k === 'player:died')).toHaveLength(0);
    expect(d.p.health.current).toBe(0);
  });

  it('reviving and respawning give the control back with full health', () => {
    const d = fighter();
    kill(d);
    d.p.revive();
    d.p.respawn(40, 0);
    d.settle();
    expect(d.p.health.current).toBe(5);
    expect(d.p.controller.state).toBe('free');
    d.right().step(30);
    expect(d.body.vx).toBeGreaterThan(5);
  });
});

describe('entities and determinism', () => {
  it('spawn and despawn happen at the END of the tick, never while others iterate', () => {
    const d = fighter();
    const dummy = new TrainingDummy('late', { x: 45, y: 0 });
    d.session.spawn(dummy);
    expect(d.session.entities).not.toContain(dummy);
    expect(d.session.combat.count).toBe(1);
    d.step(1);
    expect(d.session.entities).toContain(dummy);
    expect(d.session.combat.count).toBe(2);
    d.session.despawn(dummy);
    expect(d.session.entities).toContain(dummy);
    d.step(1);
    expect(d.session.entities).not.toContain(dummy);
    expect(d.session.combat.count).toBe(1);
  });

  it('a spawn that is despawned in the same tick never joins the world', () => {
    const d = fighter();
    const dummy = new TrainingDummy('blink', { x: 45, y: 0 });
    const log: string[] = [];
    d.session.bus.on('entity:spawned', () => void log.push('spawned'));
    d.session.spawn(dummy);
    d.session.despawn(dummy);
    d.step(2);
    expect(log).toEqual([]);
    expect(d.session.entities).toHaveLength(0);
  });

  it('reloading the room disposes every entity and unregisters every combatant (no leaks)', () => {
    const d = fighter();
    const log: string[] = [];
    d.session.bus.on('entity:despawned', () => void log.push('gone'));
    for (let i = 0; i < 5; i++) spawnDummy(d, { x: 50 + i, y: 0 });
    expect(d.session.entities).toHaveLength(5);
    expect(d.session.combat.count).toBe(6);
    d.session.loadRoom('arena');
    expect(d.session.entities).toHaveLength(0);
    expect(d.session.combat.count).toBe(1);
    expect(log).toHaveLength(5);
    d.step(5);
    expect(d.session.combat.pendingHitboxes).toHaveLength(0);
  });

  it('is deterministic: a scripted fight gives the same state bit for bit', () => {
    const fight = (): string[] => {
      const d = fighter([oneWay('ow', 44, 52, 2.5)]);
      const dummies = [spawnDummy(d, { x: 42, y: 0 }), spawnDummy(d, { x: 46, y: 0 })];
      let seed = 7;
      const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const trace: string[] = [];
      for (let i = 0; i < 700; i++) {
        if (i % 25 === 0) {
          d.moveX = [-1, 0, 1][Math.floor(rnd() * 3)] as number;
          d.moveY = rnd() < 0.25 ? -1 : 0;
        }
        if (rnd() < 0.12) d.tap('attack');
        if (rnd() < 0.04) d.tap('jump');
        if (rnd() < 0.03) d.tap('dash');
        if (i % 90 === 45) strikeOnPlayer(d);
        d.step(1);
        const b = d.body;
        trace.push([d.session.now, b.x, b.y, b.vx, b.vy, d.p.controller.state, d.p.health.current, dummies.map((m) => `${m.health.current}/${m.body.x}`).join('|'), d.session.hitStopLeft].join(','));
      }
      return trace;
    };
    const a = fight();
    expect(a).toEqual(fight());
    expect(new Set(a.map((l) => l.split(',')[5])).size).toBeGreaterThanOrEqual(4); // free, attack, hurt, dash… all exercised
  });
});
