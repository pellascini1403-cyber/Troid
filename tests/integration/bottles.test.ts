import { describe, expect, it } from 'vitest';
import { driver, type Driver } from '../helpers/sim';
import { strikeOnPlayer } from '../helpers/combat';
import { createPlayerStatus } from '@/gameplay/PlayerStatus';
import type { GameEvents } from '@/gameplay/events';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * The energy bottles end to end through the simulation (docs/GAME-SPEC-2D.md §11): drinking is a channel of 24 ticks standing
 * still on the ground; the effect (heal 2) lands, and the bottle is spent, on the LAST tick; a hit in the middle costs nothing;
 * a request that would not help (full life) or has nothing to drink is refused once; the bottles recharge one at a time; and
 * the magic is a different resource that neither pays for nor pauses a drink.
 */
function room(): RoomDefinition {
  return {
    id: 'bottles', regionId: 't', name: 'bottles', bounds: rect(-5, -20, 200, 40), killY: -30,
    entries: [{ id: 's', x: 10, y: 0 }],
    solids: [ground('a', -5, 200), block('wl', -7, -20, -5, 40)],
  };
}

const NAMES = ['bottle:drinkStarted', 'bottle:drunk', 'bottle:interrupted', 'bottle:denied', 'bottle:changed', 'magic:changed', 'player:hurt', 'skill:cast'] as const;

function setup(opts: { hp?: number } = {}) {
  const d = driver({ room: room(), unlocked: ['dash'] });
  const log: Array<[string, unknown]> = [];
  for (const k of NAMES) d.session.bus.on(k, (e) => void log.push([k, e]));
  d.step(20); // settle on the ground
  d.p.health.damage(opts.hp === undefined ? 2 : 5 - opts.hp);
  log.length = 0;
  return { d, s: d.session, log };
}
const events = <K extends keyof GameEvents>(log: Array<[string, unknown]>, k: K): Array<GameEvents[K]> => log.filter(([n]) => n === k).map(([, e]) => e as GameEvents[K]);
const states = (d: Driver): string[] => d.session.bottles.slots.map((b) => b.state);

describe('the channel: 24 ticks standing still, the effect on the last one', () => {
  it('a request with life missing starts a drink: the hero is in `drink`, nothing is spent yet', () => {
    const { d, s, log } = setup();
    d.tap('bottle'); // the press tick
    expect(d.p.controller.state).toBe('drink');
    expect(events(log, 'bottle:drinkStarted')).toEqual([{ slot: 0, x: expect.any(Number), y: expect.any(Number), ticks: 24 }]);
    expect(s.player.health.current).toBe(3);
    expect(states(d)).toEqual(['ready', 'ready', 'ready']);
    expect(events(log, 'bottle:drunk')).toHaveLength(0);
  });

  it('the effect lands exactly 24 ticks after the press: +2 life, the bottle spent, `bottle:drunk` says how much', () => {
    const { d, s, log } = setup();
    d.tap('bottle');
    d.step(23);
    expect(s.player.health.current).toBe(3);
    expect(d.p.controller.state).toBe('drink');
    expect(states(d)).toEqual(['ready', 'ready', 'ready']);
    d.step(1);
    expect(s.player.health.current).toBe(5);
    expect(d.p.controller.state).toBe('free');
    expect(events(log, 'bottle:drunk')).toEqual([{ slot: 0, healed: 2, x: expect.any(Number), y: expect.any(Number) }]);
    expect(events(log, 'bottle:changed')[0]).toMatchObject({ type: 'used', slot: 0 });
  });

  it('after the drink the used bottle is empty and recharging; the other two are still ready', () => {
    const { d } = setup();
    d.tap('bottle');
    d.step(24);
    expect(states(d)).toEqual(['recharging', 'ready', 'ready']);
    expect(d.session.bottles.readyCount).toBe(2);
  });

  it('it never heals past the maximum: from 4 / 5 it restores 1, and the bottle is spent all the same', () => {
    const { d, s, log } = setup({ hp: 4 });
    d.tap('bottle');
    d.step(24);
    expect(s.player.health.current).toBe(5);
    expect(events(log, 'bottle:drunk')[0]?.healed).toBe(1);
    expect(states(d)).toEqual(['recharging', 'ready', 'ready']);
  });

  it('the hero stands still while he drinks: the stick, jump, attack and dash cannot change the state', () => {
    const { d, s } = setup();
    d.tap('bottle');
    const x0 = d.body.x;
    d.right();
    d.step(4);
    d.tap('jump');
    d.tap('attack');
    d.tap('dash');
    d.step(2);
    expect(d.p.controller.state).toBe('drink');
    expect(d.body.x).toBe(x0);
    expect(d.body.grounded).toBe(true);
    expect(d.p.combat.attack).toBeNull();
    d.stop();
    d.step(30);
    expect(s.player.health.current).toBe(5);
  });

  it('a run is bled off while he drinks, and the Ability cannot start a cast in the middle of it', () => {
    const { d, s, log } = setup();
    s.loadout.acquire('card_spirit_bolt');
    d.right().step(40);
    expect(Math.abs(d.body.vx)).toBeGreaterThan(5);
    d.tap('bottle');
    d.tap('ability');
    d.step(10);
    expect(d.p.controller.state).toBe('drink');
    expect(d.body.vx).toBe(0);
    expect(s.magic.current).toBe(100);
    expect(events(log, 'skill:cast')).toHaveLength(0);
  });

  it('it can be drunk crouched: the posture is kept and the hero goes back to crouch afterwards', () => {
    const { d, s } = setup();
    d.moveY = -1;
    d.step(10);
    expect(d.p.controller.state).toBe('crouch');
    d.tap('bottle');
    expect(d.p.controller.state).toBe('drink');
    expect(d.p.controller.crouched).toBe(true);
    d.step(24);
    expect(s.player.health.current).toBe(5);
    expect(d.p.controller.state).toBe('crouch');
    expect(d.p.controller.crouched).toBe(true);
  });

  it('the dash cannot cancel the channel: there is no recovery to cancel', () => {
    const { d } = setup();
    d.tap('bottle');
    d.step(5);
    d.tap('dash');
    d.step(3);
    expect(d.p.controller.state).toBe('drink');
  });
});

describe('a hit in the middle costs nothing', () => {
  it('it interrupts the channel: no heal, the bottle is still ready, and the interface is told why', () => {
    const { d, s, log } = setup();
    d.tap('bottle');
    d.step(10);
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.controller.state).toBe('hurt');
    expect(states(d)).toEqual(['ready', 'ready', 'ready']);
    expect(s.player.health.current).toBe(2); // 3 − the hit, no +2
    expect(events(log, 'bottle:interrupted')).toEqual([{ slot: 0, reason: 'hit' }]);
    expect(events(log, 'bottle:drunk')).toHaveLength(0);
    d.step(60);
    expect(states(d)).toEqual(['ready', 'ready', 'ready']); // and nothing ever recharges, there was nothing to recharge
  });

  it('a hit on the very tick the channel ends lands AFTER the effect (the hero acts first, then the combat step): both happen', () => {
    const { d, s, log } = setup();
    d.tap('bottle');
    d.step(23);
    strikeOnPlayer(d); // resolved by the next tick, the one that completes the channel
    d.step(1);
    expect(events(log, 'bottle:drunk')).toHaveLength(1);
    expect(events(log, 'bottle:interrupted')).toHaveLength(0);
    expect(s.player.health.current).toBe(4); // 3 + 2, capped at 5, then −1
    expect(states(d)).toEqual(['recharging', 'ready', 'ready']);
  });

  it('a fatal hit ends it too, and the bottle is not spent', () => {
    const { d, s, log } = setup({ hp: 1 });
    d.tap('bottle');
    d.step(6);
    strikeOnPlayer(d);
    d.step(1);
    expect(s.player.health.dead).toBe(true);
    expect(d.p.controller.state).toBe('dead');
    expect(states(d)).toEqual(['ready', 'ready', 'ready']);
    expect(events(log, 'bottle:interrupted')).toEqual([{ slot: 0, reason: 'hit' }]);
  });

  it('losing the ground ends it without spending anything (`air`)', () => {
    const { d, s, log } = setup();
    d.tap('bottle');
    d.step(8);
    d.body.grounded = false; // the floor went away under his feet
    d.step(1);
    expect(d.p.controller.state).not.toBe('drink');
    expect(events(log, 'bottle:interrupted')).toEqual([{ slot: 0, reason: 'air' }]);
    expect(states(d)).toEqual(['ready', 'ready', 'ready']);
    expect(s.player.health.current).toBe(3);
  });

  it('if the life got full during the channel (nothing else heals today, but it could), nothing is spent', () => {
    const { d, s, log } = setup();
    d.tap('bottle');
    d.step(10);
    s.player.health.restore();
    d.step(14);
    expect(events(log, 'bottle:interrupted')).toEqual([{ slot: 0, reason: 'full' }]);
    expect(events(log, 'bottle:drunk')).toHaveLength(0);
    expect(states(d)).toEqual(['ready', 'ready', 'ready']);
    expect(d.p.controller.state).toBe('free');
  });

  it('changing room under a channel cancels it silently: free, nothing spent, no event', () => {
    const { d, s, log } = setup();
    d.tap('bottle');
    d.step(8);
    s.loadRoom('bottles', 's');
    expect(d.p.controller.state).toBe('free');
    d.step(30);
    expect(states(d)).toEqual(['ready', 'ready', 'ready']);
    expect(events(log, 'bottle:interrupted')).toHaveLength(0);
    expect(events(log, 'bottle:drunk')).toHaveLength(0);
  });
});

describe('a request that would not help is refused, once', () => {
  it('with full life: `denied` (`full`), nothing spent, the hero does not even stop', () => {
    const { d, s, log } = setup({ hp: 5 });
    d.tap('bottle');
    d.step(30);
    expect(events(log, 'bottle:denied')).toEqual([{ reason: 'full' }]);
    expect(events(log, 'bottle:drinkStarted')).toHaveLength(0);
    expect(states(d)).toEqual(['ready', 'ready', 'ready']);
    expect(s.player.health.current).toBe(5);
    expect(d.p.controller.state).toBe('free');
  });

  it('with no bottle ready: `denied` (`none`), whatever the life', () => {
    const { d, s, log } = setup();
    for (let i = 0; i < 3; i++) s.bottles.consume(0 + i);
    d.tap('bottle');
    d.step(30);
    expect(events(log, 'bottle:denied')).toEqual([{ reason: 'none' }]);
    expect(s.player.health.current).toBe(3);
    expect(d.p.controller.state).toBe('free');
  });

  it('one press is one refusal, however long it is held', () => {
    const { d, log } = setup({ hp: 5 });
    d.press('bottle');
    d.step(60);
    d.release('bottle');
    expect(events(log, 'bottle:denied')).toHaveLength(1);
    d.tap('bottle');
    expect(events(log, 'bottle:denied')).toHaveLength(2);
  });

  it('a press made while the hero is busy (an attack) is answered when he is free again, inside the buffer', () => {
    const { d, log } = setup({ hp: 5 });
    d.tap('attack');
    d.step(2);
    expect(d.p.controller.state).toBe('attack');
    d.tap('bottle');
    expect(events(log, 'bottle:denied')).toHaveLength(0); // not free yet: the request waits
    d.step(60);
    expect(events(log, 'bottle:denied').length).toBeLessThanOrEqual(1); // answered once if the buffer lasted, else expired
  });

  it('a tap on a HUD icon names its bottle: an empty one is refused although others are ready', () => {
    const { d, s, log } = setup();
    s.bottles.consume(0); // slot 0 is now recharging
    d.bottleSlot = 0;
    d.tap('bottle');
    expect(events(log, 'bottle:denied')).toEqual([{ reason: 'none' }]);
    expect(d.p.controller.state).toBe('free');
  });
});

describe('which bottle is drunk', () => {
  it('the key / the contextual chip (−1) drink the first ready one from the left', () => {
    const { d, s, log } = setup();
    s.bottles.consume(0); // slot 0 is recharging
    d.bottleSlot = -1;
    d.tap('bottle');
    expect(events(log, 'bottle:drinkStarted')[0]?.slot).toBe(1);
    d.step(24);
    expect(states(d)).toEqual(['recharging', 'empty', 'ready']); // slot 1 waits for its turn behind slot 0
  });

  it('a HUD icon (0..n) drinks THAT bottle and leaves the rest alone', () => {
    const { d, log } = setup();
    d.bottleSlot = 2;
    d.tap('bottle');
    expect(events(log, 'bottle:drinkStarted')[0]?.slot).toBe(2);
    d.step(24);
    expect(states(d)).toEqual(['ready', 'ready', 'recharging']);
  });

  it('the fourth bottle (a reward) is one more charge, drunk like the others', () => {
    const { d, s } = setup();
    expect(s.bottles.addSlot('energy_bottle')).toBe(true);
    expect(s.bottles.addSlot('energy_bottle')).toBe(false); // four at most
    d.bottleSlot = 3;
    d.tap('bottle');
    d.step(24);
    expect(states(d)).toEqual(['ready', 'ready', 'ready', 'recharging']);
    expect(s.player.health.current).toBe(5);
  });
});

describe('the ground is needed: in the air the request waits for the landing', () => {
  it('pressed a few ticks before touching down it starts on landing; pressed too early it expires without a word', () => {
    const early = setup();
    early.d.tap('jump');
    early.d.step(6);
    expect(early.d.body.grounded).toBe(false);
    early.d.tap('bottle'); // rising: the landing is far beyond the buffer
    early.d.step(80);
    expect(events(early.log, 'bottle:drinkStarted')).toHaveLength(0);
    expect(events(early.log, 'bottle:denied')).toHaveLength(0);
    expect(states(early.d)).toEqual(['ready', 'ready', 'ready']);

    const late = setup();
    late.d.tap('jump');
    late.d.until(() => late.d.body.vy < 0 && late.d.body.y < 0.25, 200);
    late.d.tap('bottle');
    expect(late.d.p.controller.state).not.toBe('drink'); // still in the air on the press tick
    late.d.until(() => late.d.p.controller.state === 'drink', 12);
    expect(late.d.body.grounded).toBe(true);
  });
});

describe('the recharge is slow, in order, and independent of everything else', () => {
  it('two bottles drunk in a row recharge one after the other, 3600 ticks each, from the left', () => {
    const { d, s } = setup();
    d.tap('bottle');
    d.step(24);
    s.player.health.damage(2);
    d.tap('bottle');
    d.step(24);
    expect(states(d)).toEqual(['recharging', 'empty', 'ready']);
    d.step(3600 - 24 - 24 - 1);
    expect(states(d)).toEqual(['recharging', 'empty', 'ready']);
    d.step(25);
    expect(states(d)[0]).toBe('ready');
    expect(states(d)[1]).toBe('recharging');
  });

  it('the magic does not pay for a drink and does not stop regenerating during one', () => {
    const { d, s, log } = setup();
    s.magic.spend(50);
    d.step(70); // the second of waiting is over
    const before = s.magic.current;
    log.length = 0;
    d.tap('bottle');
    d.step(24);
    expect(s.magic.current).toBeGreaterThan(before + 2); // 24 ticks at 6 per second ≈ 2.4
    expect(s.player.health.current).toBe(5);
    expect(events(log, 'magic:changed').filter((c) => c.reason !== 'regen')).toHaveLength(0); // it only regenerated: nothing was spent
  });

  it('a defeat does not refill them (the recharge is slow on purpose)', () => {
    const { d, s } = setup({ hp: 1 });
    d.tap('bottle');
    d.step(24); // 1 → 3 life
    expect(states(d)[0]).toBe('recharging');
    strikeOnPlayer(d, { damage: 5 });
    d.step(2);
    expect(s.player.health.dead).toBe(true);
    d.until(() => s.death.phase === 'none' && !s.player.health.dead, 600);
    expect(s.player.health.current).toBe(5);
    expect(states(d)[0]).toBe('recharging');
  });
});

describe('what the HUD reads', () => {
  it('the status says which vial is being drunk and how far along it is, and `bottleUseful` follows the life', () => {
    const { d, s } = setup();
    const st = createPlayerStatus();
    s.status(st);
    expect(st.drink).toEqual({ slot: -1, progress01: 0 });
    expect(st.bottleUseful).toBe(true);
    d.tap('bottle');
    d.step(11);
    s.status(st);
    expect(st.drink.slot).toBe(0);
    expect(st.drink.progress01).toBeCloseTo(11 / 24, 6); // 11 ticks of the channel done since the press tick
    d.step(13);
    s.status(st);
    expect(st.drink).toEqual({ slot: -1, progress01: 0 });
    expect(st.life.current).toBe(5);
    expect(st.bottleUseful).toBe(false); // full life: the chip hides
    expect(st.bottles.map((b) => b.state)).toEqual(['recharging', 'ready', 'ready']);
  });
});

describe('determinism', () => {
  it('the same script of presses gives the same life, bottles and events, twice', () => {
    const run = () => {
      const { d, s, log } = setup();
      const trace: unknown[] = [];
      for (let i = 0; i < 400; i++) {
        if (i === 10 || i === 90 || i === 200) d.tap('bottle');
        if (i === 40) strikeOnPlayer(d);
        if (i === 120) s.player.health.damage(2);
        if (i === 150) d.right();
        if (i === 180) d.stop();
        d.step(1);
        trace.push([d.body.x, d.body.y, d.p.controller.state, s.player.health.current, states(d).join(',')]);
      }
      return JSON.stringify([trace, log]);
    };
    expect(run()).toBe(run());
  });
});
