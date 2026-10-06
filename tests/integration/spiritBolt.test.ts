import { describe, expect, it } from 'vitest';
import { driver, type Driver } from '../helpers/sim';
import { spawnDummy, strikeOnPlayer } from '../helpers/combat';
import { Projectile } from '@/gameplay/Projectile';
import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { GameEvents } from '@/gameplay/events';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';

/**
 * The Spirit Bolt end to end through the simulation (docs/GAME-SPEC-2D.md §10.1): it works only with an equipped card, costs
 * exactly 30 at the release, is refused below 30, takes 6 ticks to prepare and 8 to recover, flies 16 m/s over 12 m, hits for 2
 * without piercing, ends on walls, and the magic does not regenerate while it is cast.
 */
function room(extra: RoomDefinition['solids'] = []): RoomDefinition {
  return {
    id: 'bolt', regionId: 't', name: 'bolt', bounds: rect(-5, -20, 200, 40), killY: -30,
    entries: [{ id: 's', x: 10, y: 0 }],
    solids: [ground('a', -5, 200), block('wl', -7, -20, -5, 40), ...extra],
  };
}

function setup(opts: { card?: boolean; solids?: RoomDefinition['solids'] } = {}) {
  const d = driver({ room: room(opts.solids), unlocked: ['dash'] });
  const log: Array<[string, unknown]> = [];
  for (const k of ['skill:cast', 'skill:denied', 'projectile:ended', 'magic:changed', 'combat:hit', 'player:dashed'] as const) {
    d.session.bus.on(k, (e) => void log.push([k, e]));
  }
  if (opts.card !== false) d.session.loadout.acquire('card_spirit_bolt');
  d.step(20);
  log.length = 0;
  return { d, s: d.session, log };
}
const events = <K extends keyof GameEvents>(log: Array<[string, unknown]>, k: K): Array<GameEvents[K]> => log.filter(([n]) => n === k).map(([, e]) => e as GameEvents[K]);
const bolts = (d: Driver): Projectile[] => d.session.entities.filter((e): e is Projectile => e.kind === 'projectile');

describe('Ability works only with an equipped card', () => {
  it('without a card pressing Ability does nothing at all: no cast, no cost, no projectile, no sound of refusal', () => {
    const { d, s, log } = setup({ card: false });
    const before = [d.body.x, d.body.y, d.p.controller.state];
    d.tap('ability');
    d.step(40);
    expect([d.body.x, d.body.y, d.p.controller.state]).toEqual(before);
    expect(s.magic.current).toBe(100);
    expect(bolts(d)).toHaveLength(0);
    expect(events(log, 'skill:cast')).toHaveLength(0);
    expect(events(log, 'skill:denied')).toHaveLength(0);
  });

  it('with the card taken off it stops working again', () => {
    const { d, s } = setup();
    s.loadout.equip(null);
    d.tap('ability');
    d.step(30);
    expect(s.magic.current).toBe(100);
    expect(bolts(d)).toHaveLength(0);
  });

  it('acquiring the card gives the player the ability it teaches (magic_attack) — progression stays in AbilitySystem', () => {
    const { s } = setup({ card: false });
    expect(s.abilities.has('magic_attack')).toBe(false);
    s.loadout.acquire('card_spirit_bolt');
    expect(s.abilities.has('magic_attack')).toBe(true);
  });
});

describe('the cast: cost, timing, release', () => {
  it('the press starts a cast (6 ticks of preparation) and the cost is paid at the RELEASE, exactly 30', () => {
    const { d, s, log } = setup();
    d.tap('ability'); // the press tick: the cast begins
    expect(d.p.controller.state).toBe('cast');
    expect(s.magic.current).toBe(100); // nothing paid while preparing
    d.step(6); // the 6 ticks of preparation
    expect(s.magic.current).toBe(100);
    expect(bolts(d)).toHaveLength(0);
    d.step(1); // the release
    expect(s.magic.current).toBe(70);
    expect(events(log, 'skill:cast')).toEqual([{ skillId: 'spirit_bolt', x: expect.any(Number), y: expect.any(Number), facing: 1, cost: 30 }]);
    expect(events(log, 'magic:changed')[0]).toMatchObject({ delta: -30, reason: 'spend', current: 70 });
    d.step(1); // the projectile joins the world at the end of the release tick
    expect(bolts(d)).toHaveLength(1);
  });

  it('the whole cast is 14 ticks (6 + 8) and then the hero is free again', () => {
    const { d } = setup();
    d.tap('ability');
    expect(d.p.controller.state).toBe('cast');
    d.step(12);
    expect(d.p.controller.state).toBe('cast');
    d.step(2);
    expect(d.p.controller.state).toBe('free');
  });

  it('the projectile leaves in front of the hero, at chest height, in the direction it faces', () => {
    const { d, log } = setup();
    d.tap('ability');
    d.step(8);
    const cast = events(log, 'skill:cast')[0]!;
    expect(cast.x).toBeCloseTo(d.body.x + 0.8 - 0, 0);
    expect(cast.y).toBeGreaterThan(d.body.y + 0.8);
    expect(cast.y).toBeLessThan(d.body.y + 1.4);
    const left = setup();
    left.d.moveX = -1;
    left.d.step(5);
    left.d.moveX = 0;
    left.d.step(30);
    left.d.tap('ability');
    left.d.step(8);
    expect(events(left.log, 'skill:cast')[0]!.facing).toBe(-1);
    expect(events(left.log, 'skill:cast')[0]!.x).toBeLessThan(left.d.body.x);
  });

  it('three casts in a row from a full bar leave 10; a fourth is refused ("denied") and changes nothing', () => {
    const { d, s, log } = setup();
    for (let i = 0; i < 3; i++) {
      d.tap('ability');
      d.step(30);
    }
    expect(s.magic.current).toBe(10);
    expect(events(log, 'skill:cast')).toHaveLength(3);
    const state = [d.body.x, d.p.controller.state];
    d.tap('ability');
    d.step(10);
    expect(events(log, 'skill:cast')).toHaveLength(3);
    expect(events(log, 'skill:denied')).toEqual([{ skillId: 'spirit_bolt', reason: 'noMagic' }]);
    expect(s.magic.current).toBeGreaterThan(9.9); // not spent: it is only regenerating
    expect([d.body.x, d.p.controller.state]).toEqual(state);
  });

  it('below 30 it cannot be cast (29.9: denied, once per press); at exactly 30 it can, and leaves 0', () => {
    const { d, s, log } = setup();
    s.magic.set(29.9);
    d.tap('ability');
    d.step(20);
    expect(events(log, 'skill:cast')).toHaveLength(0);
    expect(events(log, 'skill:denied')).toHaveLength(1); // once, not once per tick of the buffer
    s.magic.set(30);
    d.step(40); // the cooldown is not an issue: nothing was cast
    d.tap('ability');
    d.step(30);
    expect(events(log, 'skill:cast')).toHaveLength(1);
    expect(s.magic.current).toBeLessThan(5); // 0 plus whatever regenerated in the ticks after the cast
  });

  it('the magic does NOT regenerate while casting; the second of delay starts when the cast is over', () => {
    const { d, s } = setup();
    d.tap('ability');
    d.step(14); // the cast is over
    expect(s.magic.current).toBe(70);
    expect(s.magic.delayLeft).toBe(59); // frozen at 60 during the cast; the tick that ends it is the first that counts
    d.step(59);
    expect(s.magic.current).toBe(70); // the whole second has passed without a unit regained
    d.step(60);
    expect(s.magic.current).toBeCloseTo(76, 9);
  });

  it('the cooldown is 0.3 s after the release: a press made too soon waits for it (within the 0.12 s buffer) instead of being lost', () => {
    const { d, s, log } = setup();
    d.tap('ability'); // tick 1 of the cast; the release is 6 ticks later
    d.step(6); // released now: cooldown 18 ticks starts
    d.step(16); // 22 ticks since the press, 16 since the release: still cooling down for 2 more ticks
    expect(d.p.controller.state).toBe('free');
    d.tap('ability'); // within the buffer of the end of the cooldown
    d.step(30);
    expect(events(log, 'skill:cast')).toHaveLength(2);
    expect(s.magic.current).toBe(40);
  });

  it('a press far before the cooldown ends is not remembered for ever (the buffer is 0.12 s)', () => {
    const { d, log } = setup();
    d.tap('ability');
    d.step(7); // released, 18 ticks of cooldown ahead
    d.tap('ability'); // 18 ticks away: well outside the 7-tick buffer
    d.step(60);
    expect(events(log, 'skill:cast')).toHaveLength(1);
  });

  it('a hit during the preparation ends the cast and the cost is NOT taken', () => {
    const { d, s, log } = setup();
    d.tap('ability');
    d.step(2);
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.controller.state).toBe('hurt');
    d.step(60);
    expect(s.magic.current).toBe(100);
    expect(events(log, 'skill:cast')).toHaveLength(0);
    expect(bolts(d)).toHaveLength(0);
    expect(s.skills.ticksLeft('spirit_bolt')).toBe(0); // no cooldown either
  });

  it('a hit during the RECOVERY does not take the bolt back: it was already released and paid for', () => {
    const { d, s, log } = setup();
    d.tap('ability');
    d.step(9);
    strikeOnPlayer(d);
    d.step(30);
    expect(events(log, 'skill:cast')).toHaveLength(1);
    expect(s.magic.current).toBeLessThan(100);
  });

  it('while casting the hero keeps 40 % of the control: it can steer a little, not run', () => {
    const { d } = setup();
    d.right();
    d.step(40);
    const run = d.body.vx;
    expect(run).toBeCloseTo(DEFAULT_MOVEMENT.runSpeed, 6);
    d.tap('ability');
    d.step(10);
    expect(d.p.controller.state).toBe('cast');
    expect(d.body.vx).toBeLessThan(run * 0.6);
    expect(d.body.vx).toBeGreaterThan(0);
  });

  it('it can be cast in the air (gravity keeps acting) and from a crouch (the hero stays crouched, the bolt leaves lower)', () => {
    const air = setup();
    air.d.press('jump').step(6);
    air.d.release('jump');
    expect(air.d.body.grounded).toBe(false);
    air.d.tap('ability');
    air.d.step(8);
    expect(events(air.log, 'skill:cast')).toHaveLength(1);

    const crouch = setup();
    crouch.d.moveY = -1;
    crouch.d.step(6);
    expect(crouch.d.p.controller.crouched).toBe(true);
    crouch.d.tap('ability');
    crouch.d.step(8);
    expect(crouch.d.p.controller.crouched).toBe(true);
    const cast = events(crouch.log, 'skill:cast')[0]!;
    expect(cast.y - crouch.d.body.y).toBeLessThan(0.9);
    expect(cast.y - crouch.d.body.y).toBeGreaterThan(0.4);
  });

  it('the dash can cancel the recovery (never the preparation), like it does with an attack', () => {
    const early = setup();
    early.d.tap('ability');
    early.d.tap('dash'); // during the preparation: the buffer keeps it, but the preparation cannot be cancelled
    early.d.step(3);
    expect(events(early.log, 'player:dashed')).toHaveLength(0);
    expect(early.d.p.controller.state).toBe('cast');
    const late = setup();
    late.d.tap('ability');
    late.d.step(8); // released: in the recovery
    late.d.tap('dash');
    late.d.step(2);
    expect(events(late.log, 'player:dashed')).toHaveLength(1);
  });

  it('a defeat clears the cooldown and refills the magic', () => {
    const { d, s } = setup();
    d.tap('ability');
    d.step(8);
    expect(s.skills.ticksLeft('spirit_bolt')).toBeGreaterThan(0);
    s.player.health.damage(5);
    s.bus.emit('player:died', { x: 0, y: 0 });
    d.until(() => s.death.phase === 'none' && !s.player.health.dead && s.now > 300, 800);
    expect(s.skills.ticksLeft('spirit_bolt')).toBe(0);
    expect(s.magic.current).toBe(100);
  });
});

describe('the projectile', () => {
  it('flies at 16 m/s, a quarter of a metre per tick, and fizzles out after 12 m (45 ticks)', () => {
    const { d, log } = setup();
    d.tap('ability');
    d.step(8);
    const b = bolts(d)[0]!;
    const x0 = b.x;
    d.step(10);
    expect(b.x - x0).toBeCloseTo((16 / 60) * 10, 6);
    const start = events(log, 'skill:cast')[0]!.x;
    d.until(() => b.expired, 120);
    expect(events(log, 'projectile:ended')).toHaveLength(1);
    const end = events(log, 'projectile:ended')[0]!;
    expect(end.reason).toBe('range');
    expect(Math.abs(end.x - start)).toBeCloseTo(12, 0);
    d.step(2);
    expect(bolts(d)).toHaveLength(0);
  });

  it('flies straight (it does not fall) and the speed is the same whatever the hero does afterwards', () => {
    const { d } = setup();
    d.tap('ability');
    d.step(8);
    const b = bolts(d)[0]!;
    const y0 = b.y;
    d.right();
    d.step(20);
    expect(b.y).toBe(y0);
  });

  it('hits a target for 2, pushes it away (6, 2), freezes the world 3 ticks and ENDS there (no piercing)', () => {
    const { d, log } = setup();
    const near = spawnDummy(d, { x: d.body.x + 5, y: 0, health: 10 });
    const far = spawnDummy(d, { x: d.body.x + 8, y: 0, health: 10 });
    d.tap('ability');
    d.until(() => near.health.current < 10, 120);
    expect(near.health.current).toBe(8);
    expect(near.body.vx).toBeGreaterThan(5); // pushed away from the hero, right now (the push fades with friction afterwards)
    const hit = events(log, 'combat:hit').find((h) => h.attackId === 'spirit_bolt')!;
    expect(hit).toMatchObject({ damage: 2, targetId: near.id, hitStop: 3, direction: 1 });
    expect(d.session.hitStopLeft).toBe(3);
    d.step(30);
    expect(far.health.current).toBe(10); // the bolt did not pass through the first one
    expect(events(log, 'projectile:ended').map((e) => e.reason)).toEqual(['hit']);
  });

  it('a kill on the first hit still ends it; two casts hit two targets one each', () => {
    const { d } = setup();
    const a = spawnDummy(d, { x: d.body.x + 4, y: 0, health: 2 });
    d.tap('ability');
    d.until(() => a.health.dead, 120);
    expect(a.health.dead).toBe(true);
    const b = spawnDummy(d, { x: d.body.x + 6, y: 0, health: 10 });
    d.step(30);
    d.tap('ability');
    d.until(() => b.health.current < 10, 120);
    expect(b.health.current).toBe(8);
  });

  it('hits neutrals too (a breakable wall, a switch) but never the hero it came from', () => {
    const { d } = setup();
    const crate = spawnDummy(d, { x: d.body.x + 4, y: 0, health: 4, team: 'neutral' });
    d.tap('ability');
    d.until(() => crate.health.current < 4, 120);
    expect(crate.health.current).toBe(2);
    expect(d.p.health.current).toBe(5);
  });

  it('ends on a wall without hurting anything behind it, and says so', () => {
    const { d, log } = setup({ solids: [block('pillar', 18, 0, 19.5, 6, 'stone'), ] });
    const behind = spawnDummy(d, { x: 22, y: 0, health: 10 });
    d.tap('ability');
    d.step(60);
    expect(events(log, 'projectile:ended').map((e) => e.reason)).toEqual(['wall']);
    expect(behind.health.current).toBe(10);
  });

  it('flies through one-way platforms (they are floors, not walls)', () => {
    const { d, log } = setup({ solids: [oneWay('ow', 12, 20, 1.05)] });
    const target = spawnDummy(d, { x: d.body.x + 8, y: 0, health: 10 });
    d.tap('ability');
    d.until(() => target.health.current < 10, 120);
    expect(events(log, 'projectile:ended').map((e) => e.reason)).toEqual(['hit']);
  });

  it('a cast with the muzzle inside a wall spends the magic and fizzles at once (it is the player\'s mistake, not a free cast)', () => {
    const { d, s, log } = setup({ solids: [block('close', 10.9, 0, 12.5, 4, 'stone')] });
    d.tap('ability');
    d.step(20);
    expect(s.magic.current).toBeLessThan(100);
    expect(events(log, 'projectile:ended').map((e) => e.reason)).toEqual(['wall']);
  });

  it('a room change under a flying bolt removes it without announcing an ending', () => {
    const { d, s, log } = setup();
    d.tap('ability');
    d.step(10);
    expect(bolts(d)).toHaveLength(1);
    s.loadRoom(s.room.id);
    expect(bolts(d)).toHaveLength(0);
    expect(events(log, 'projectile:ended')).toHaveLength(0);
  });
});

describe('the card of the HUD while casting', () => {
  it('is ready, then sweeps its cooldown, then is ready again; and dims when the magic is short', () => {
    const { d, s } = setup();
    expect(s.status().card.state).toBe('ready');
    d.tap('ability');
    d.step(7);
    const st = s.status();
    expect(st.card.state).toBe('cooldown');
    expect(st.card.cooldown01).toBeGreaterThan(0.9);
    d.step(9);
    expect(s.status().card.cooldown01).toBeLessThan(0.6);
    d.step(20);
    expect(s.status().card.state).toBe('ready');
    s.magic.set(10);
    expect(s.status().card.state).toBe('noMagic');
    s.magic.set(30);
    expect(s.status().card.state).toBe('ready');
  });
});

describe('determinism', () => {
  it('the same presses at the same ticks give the same bolts, hits and magic, bit for bit', () => {
    const run = () => {
      const { d, s } = setup();
      const dummy = spawnDummy(d, { x: d.body.x + 7, y: 0, health: 20 });
      const out: number[] = [];
      for (let i = 0; i < 240; i++) {
        if (i % 40 === 3) d.tap('ability');
        else d.step(1);
        if (i % 20 === 0) out.push(s.magic.current, dummy.health.current, d.body.x, bolts(d)[0]?.x ?? -1);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
