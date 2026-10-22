import { describe, expect, it } from 'vitest';
import { ROOMS } from '@/content';
import { SKILLS } from '@/content/skills';
import { BOTTLE_FADE_SECONDS, HudModel } from '@/ui/hud/HudModel';
import { strikeOnPlayer } from '../helpers/combat';
import { driver, type Driver } from '../helpers/sim';

/**
 * WHAT THE HUD READS (docs/PROMPT14-LOG.md, docs/PROMPT17-LOG.md): everything it shows is read from the simulation's own numbers through `GameSession.status()`, never counted again on the side. These tests drive the REAL
 * simulation — a blow, a drink, a cast, the passing of the regeneration, a defeat — and hold what the HUD would write to it, tick by tick, so that the picture can never disagree with the game.
 */
const fresh = () => driver({ room: ROOMS.r2_hall!, entry: 'west', unlocked: ['dash'], extra: { rooms: ROOMS } }).settle();
const FRAME = 1 / 60;
/** The HUD as it would be after `d` has moved on for a moment: its numbers, and the state of its bottles. */
function hud(d: Driver, m = new HudModel()) {
  return { m, now: () => m.update(d.session.status(), FRAME) };
}
/** Lets the transients of the interface finish (the picture of a bar and the dark of a bottle take a fraction of a second). */
function settle(m: HudModel, d: Driver): void {
  for (let i = 0; i < 60; i++) m.update(d.session.status(), FRAME);
}
const QUICK = { death: { dying: 6, fadeOut: 4, hold: 4, fadeIn: 4, skipAfter: 1 } };
const dark = (m: HudModel): number[] => m.state.bottles.map((b) => Number(b.dark.toFixed(3)));

describe('a new game: 100 of life, 100 of magic and three bottles', () => {
  it('the HUD of a game that has just begun writes 100 and 100, with full bars and three bright bottles', () => {
    const d = fresh();
    const s = hud(d).now();
    expect([s.life.percent, s.magic.percent]).toEqual([100, 100]);
    expect([s.life.current, s.life.max, s.magic.current, s.magic.max]).toEqual([5, 5, 100, 100]);
    expect([s.life.fraction, s.magic.fraction, s.life.edge, s.magic.edge]).toEqual([1, 1, 1, 1]);
    expect(s.bottles.map((b) => [b.state, b.dark])).toEqual([['ready', 0], ['ready', 0], ['ready', 0]]);
  });
});

describe('the life is the hero\'s real life', () => {
  it('a blow takes the point the simulation takes: 5 → 4 is 100 → 80, in the same step, with the real numbers beside it', () => {
    const d = fresh();
    const h = hud(d);
    h.now();
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.health.current).toBe(4);
    const s = h.now();
    expect([s.life.percent, s.life.current, s.life.max]).toEqual([80, 4, 5]);
    // the picture catches up with the number in a fraction of a second, and the white rectangle lingers behind it for a moment
    expect(s.life.wear).toBeGreaterThan(s.life.fraction);
    settle(h.m, d);
    expect([h.m.state.life.edge, h.m.state.life.wear]).toEqual([0.8, 0.8]);
  });

  it('every point of life the hero has is a number: 5, 4, 3, 2, 1 and 0 are 100, 80, 60, 40, 20 and 0 — and never anything else', () => {
    const d = fresh();
    const h = hud(d);
    const seen: number[] = [];
    for (let life = 5; life >= 0; life--) {
      d.p.health.setMax(5);
      d.p.health.restore();
      d.p.health.damage(5 - life);
      seen.push(h.now().life.percent);
    }
    expect(seen).toEqual([100, 80, 60, 40, 20, 0]);
  });

  it('a bottle gives back what the simulation gives (2 points): 40 → 80, the bottle goes dark and the others keep what they had', () => {
    const d = fresh();
    d.p.health.damage(3);
    d.step(70); // the i-frames of the blow are over: nothing else is going on
    const h = hud(d);
    expect(h.now().life.percent).toBe(40);
    d.tap('bottle');
    d.step(40); // the channel (24 ticks) ends and the heal lands on its last one
    expect(d.p.health.current).toBe(4);
    settle(h.m, d);
    expect(h.m.state.life.percent).toBe(80);
    expect(h.m.state.bottles.map((b) => [b.state, Number(b.dark.toFixed(3))])).toEqual([['recharging', 1], ['ready', 0], ['ready', 0]]);
    expect(h.m.state.life.edge).toBe(0.8);
  });

  it('a heal never takes the life past its maximum, and the HUD never writes more than 100', () => {
    const d = fresh();
    const h = hud(d);
    d.p.health.damage(1);
    d.p.health.heal(9);
    expect(d.p.health.current).toBe(5);
    expect(h.now().life.percent).toBe(100);
    expect(h.now().life.fraction).toBe(1);
  });

  it('a life upgrade (a sixth point) changes the maximum and the percentages follow it: 5 of 6 is 83, 6 of 6 is 100', () => {
    const d = fresh();
    const h = hud(d);
    d.p.health.setMax(6, true);
    expect(h.now().life.percent).toBe(100);
    d.p.health.damage(1);
    expect(h.now().life.percent).toBe(83);
    expect([h.m.state.life.current, h.m.state.life.max]).toEqual([5, 6]);
  });
});

describe('the magic is the real magic of the powers', () => {
  it('a cast of the Spirit Bolt spends exactly the 30 the content says: 100 → 70, and the bar and the number say so', () => {
    const d = fresh();
    d.session.loadout.acquire('card_spirit_bolt');
    d.step(20);
    const h = hud(d);
    expect(h.now().magic.percent).toBe(100);
    d.tap('ability');
    d.step(20);
    expect(d.session.magic.current).toBe(100 - SKILLS.spirit_bolt!.cost);
    const s = h.now();
    expect([s.magic.percent, s.magic.current, s.magic.max]).toEqual([70, 70, 100]);
    expect(s.magic.wear, 'what was just spent lingers as the white rectangle').toBeGreaterThanOrEqual(s.magic.edge);
    settle(h.m, d);
    expect(h.m.state.magic.edge).toBeCloseTo(h.m.state.magic.fraction, 6);
  });

  it('with less than the cost the cast is refused and nothing is spent: the number is still the real one', () => {
    const d = fresh();
    d.session.loadout.acquire('card_spirit_bolt');
    d.step(20);
    d.session.magic.set(29.9);
    d.session.magic.spend(0); // the regeneration waits its second: the bar stays where it was put
    d.step(1);
    let denied = 0;
    d.session.bus.on('skill:denied', () => denied++);
    const h = hud(d);
    d.tap('ability');
    d.step(20);
    expect(denied, 'the game says so: the HUD shakes the bar on it').toBe(1);
    expect(h.now().magic.percent, 'the whole units there are').toBe(29);
    expect(d.session.magic.current).toBeGreaterThanOrEqual(29.9);
    expect(d.session.magic.current).toBeLessThan(31); // the regeneration is a few tenths of a unit
  });

  it('the regeneration brings it back as the simulation does — nothing for the first second, then 6 a second — and the number never passes 100 or goes under 0', () => {
    const d = fresh();
    const h = hud(d);
    d.session.magic.spend(50);
    const seen: number[] = [];
    for (let i = 0; i < 60 * 12; i++) {
      d.step(1);
      const s = h.now();
      seen.push(s.magic.percent);
      expect(s.magic.percent).toBeGreaterThanOrEqual(0);
      expect(s.magic.percent).toBeLessThanOrEqual(100);
      expect(s.magic.percent, 'the number is the simulation\'s whole units').toBe(Math.floor(d.session.magic.current + 1e-9));
    }
    expect(seen[0]).toBe(50);
    expect(seen[50], 'the first second: nothing comes back').toBe(50);
    expect(seen[60 * 2], 'one second after that: +6').toBeGreaterThanOrEqual(55);
    expect(seen[seen.length - 1]).toBe(100);
    expect(seen.every((n, i) => i === 0 || n >= (seen[i - 1] as number))).toBe(true);
  });

  it('what the cast needs and what the HUD says are the same number: at exactly the cost a cast goes, one below it is refused', () => {
    const d = fresh();
    d.session.loadout.acquire('card_spirit_bolt');
    const h = hud(d);
    d.session.magic.set(30);
    expect(h.now().magic.percent).toBe(30);
    expect(d.session.magic.canSpend(SKILLS.spirit_bolt!.cost)).toBe(true);
    d.session.magic.set(29.9);
    expect(h.now().magic.percent).toBe(29);
    expect(d.session.magic.canSpend(SKILLS.spirit_bolt!.cost)).toBe(false);
  });
});

describe('the bottles are the real inventory', () => {
  it('each drink spends one real bottle and darkens that one: one used → [dark, bright, bright]; two → [dark, dark, bright]; three → all dark', () => {
    const d = fresh();
    const h = hud(d);
    h.now();
    for (const [used, expected] of [[1, [1, 0, 0]], [2, [1, 1, 0]], [3, [1, 1, 1]]] as const) {
      d.p.health.damage(1);
      d.step(70);
      d.tap('bottle');
      d.step(40);
      settle(h.m, d);
      expect(d.session.bottles.slots.filter((s) => s.state !== 'ready'), `${used} used`).toHaveLength(used);
      expect(dark(h.m), `${used} used`).toEqual(expected);
      d.p.health.restore();
    }
    expect(h.m.state.bottles.map((b) => b.state)).toEqual(['recharging', 'empty', 'empty']);
  });

  it('a recharging bottle and one that waits for its turn are both dark; the one that finishes is bright again, and only that one', () => {
    const d = fresh();
    const h = hud(d);
    d.session.bottles.consume(0);
    d.session.bottles.consume(1);
    settle(h.m, d);
    expect(h.m.state.bottles.map((b) => b.state)).toEqual(['recharging', 'empty', 'ready']);
    expect(dark(h.m)).toEqual([1, 1, 0]);
    d.step(60 * 60 + 5); // a minute: the first is back and the next one starts its own recharge
    settle(h.m, d);
    expect(h.m.state.bottles.map((b) => b.state)).toEqual(['ready', 'recharging', 'ready']);
    expect(dark(h.m)).toEqual([0, 1, 0]);
  });

  it('a bottle fades from one picture to the other in BOTTLE_FADE_SECONDS, never jumping, and is exact once it has arrived', () => {
    const d = fresh();
    const h = hud(d);
    h.now();
    d.session.bottles.consume(1);
    const seen: number[] = [];
    for (let t = 0; t < BOTTLE_FADE_SECONDS + 0.1; t += FRAME) seen.push((h.now().bottles[1] as { dark: number }).dark);
    expect(seen[seen.length - 1]).toBe(1);
    for (let i = 1; i < seen.length; i++) expect((seen[i] as number) - (seen[i - 1] as number)).toBeLessThanOrEqual(FRAME / BOTTLE_FADE_SECONDS + 1e-9);
  });

  it('there is no hidden refill: a bottle that is spent stays dark until the simulation recharges it (the HUD invents nothing)', () => {
    const d = fresh();
    const h = hud(d);
    d.session.bottles.consume(2);
    d.step(60 * 30);
    settle(h.m, d);
    expect(h.m.state.bottles[2]?.state).toBe('recharging');
    expect(dark(h.m)).toEqual([0, 0, 1]);
    d.step(60 * 31);
    settle(h.m, d);
    expect(h.m.state.bottles[2]?.state).toBe('ready');
    expect(dark(h.m)).toEqual([0, 0, 0]);
  });

  it('a drink that cannot be done changes nothing in the inventory, and so nothing in the HUD (a full life refuses it)', () => {
    const d = fresh();
    const h = hud(d);
    h.now();
    d.tap('bottle');
    d.step(40);
    settle(h.m, d);
    expect(d.session.bottles.readyCount).toBe(3);
    expect(dark(h.m)).toEqual([0, 0, 0]);
    expect(h.m.state.life.percent).toBe(100);
  });

  it('the fourth bottle, the reward, is a fourth bright bottle; the three that were there keep their state', () => {
    const d = fresh();
    const h = hud(d);
    d.session.bottles.consume(0);
    settle(h.m, d);
    expect(d.session.bottles.addSlot('energy_bottle')).toBe(true);
    h.now();
    expect(h.m.state.bottles).toHaveLength(4);
    expect(dark(h.m)).toEqual([1, 0, 0, 0]);
  });
});

describe('the interface follows the simulation through a defeat, a rest and a change of zone', () => {
  it('after a defeat life and magic are full again (the HUD writes 100 and 100) and the bottles are NOT refilled: the one that was spent is still dark', () => {
    const d = driver({ room: ROOMS.r2_hall!, entry: 'west', unlocked: ['dash'], extra: { rooms: ROOMS, ...QUICK } }).settle();
    const h = hud(d);
    d.session.bottles.consume(0);
    d.session.magic.spend(40);
    strikeOnPlayer(d, { damage: 9 });
    d.step(1);
    d.until(() => d.session.death.active, 200);
    d.until(() => !d.session.death.active && !d.p.health.dead, 600);
    d.step(30);
    settle(h.m, d);
    const s = h.m.state;
    expect([s.life.percent, s.magic.percent]).toEqual([100, 100]);
    expect(s.bottles.map((b) => b.state)).toEqual(['recharging', 'ready', 'ready']);
    expect(dark(h.m)).toEqual([1, 0, 0]);
  });

  it('resting at a shrine refills the bottles as well, and the HUD follows: all three are bright again', () => {
    const d = fresh();
    const h = hud(d);
    d.session.bottles.consume(0);
    d.session.bottles.consume(1);
    d.p.health.damage(2);
    d.session.magic.spend(60);
    settle(h.m, d);
    expect(dark(h.m)).toEqual([1, 1, 0]);
    d.session.rest('west');
    settle(h.m, d);
    expect(dark(h.m)).toEqual([0, 0, 0]);
    expect([h.m.state.life.percent, h.m.state.magic.percent]).toEqual([100, 100]);
  });

  it('a change of zone keeps every value: what the hero had when it left is what the HUD says when it is there', () => {
    const d = fresh();
    const h = hud(d);
    d.p.health.damage(2);
    d.session.magic.spend(25);
    d.session.bottles.consume(1);
    settle(h.m, d);
    const before = [h.m.state.life.percent, h.m.state.magic.percent, ...dark(h.m)];
    d.session.loadRoom('r1_gate', 'east');
    d.step(5);
    settle(h.m, d);
    expect(d.session.room.id).toBe('r1_gate');
    expect([h.m.state.life.percent, h.m.state.magic.percent]).toEqual([before[0], before[1]]);
    expect(h.m.state.life.percent).toBe(60);
    expect(dark(h.m)).toEqual([0, 1, 0]);
  });
});

describe('the i-frames of a blow (what the status says of them)', () => {
  it('the guard is the window the player really has: it is > 0 exactly while the hero blinks, 1 when the blow lands and gone when the window ends', () => {
    const d = fresh();
    expect(d.session.status().life.guard01).toBe(0);
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.controller.blinking).toBe(true);
    expect(d.session.status().life.guard01).toBeGreaterThan(0.9);
    let was = 1;
    const t0 = d.session.now; // the simulation's own ticks: a hit-stop holds the clock, so the steps asked for are more than the ticks lived
    for (let guard = 0; d.p.controller.blinking && guard < 300; guard++) {
      const g = d.session.status().life.guard01;
      expect(g, `shown while the hero blinks (sim tick ${d.session.now - t0})`).toBeGreaterThan(0);
      expect(g, 'it only drains').toBeLessThanOrEqual(was);
      was = g;
      d.step(1);
    }
    expect(d.session.status().life.guard01).toBe(0);
    const lived = d.session.now - t0;
    expect(lived, 'the window the content gives (60 ticks)').toBeGreaterThanOrEqual(58);
    expect(lived).toBeLessThanOrEqual(62);
  });

  it('a hit-stop does not move it (the simulation holds still, and so does what the status says)', () => {
    const d = fresh();
    strikeOnPlayer(d);
    d.step(1);
    expect(d.session.frozen, 'the blow froze the world').toBe(true);
    const g = d.session.status().life.guard01;
    d.step(2);
    expect(d.session.status().life.guard01, 'held while the world is held').toBe(g);
    d.step(20);
    expect(d.session.status().life.guard01, 'and drains once it moves').toBeLessThan(g);
  });
});

describe('what the status says of the power and of the bottles that recharge', () => {
  it('the cost of the power is the cost the skill has in the content while a card is equipped, and nothing without one', () => {
    const d = fresh();
    expect(d.session.status().card.cost).toBe(0);
    d.session.loadout.acquire('card_spirit_bolt');
    expect(d.session.status().card.cost).toBe(SKILLS.spirit_bolt!.cost);
    expect(d.session.status().card.cost).toBe(30);
    d.session.loadout.equip(null);
    expect(d.session.status().card.cost).toBe(0);
  });

  it('the seconds a bottle still needs are the real recharge: 60 s for the one recharging, counted down tick by tick, and nothing for the ones that wait their turn', () => {
    const d = fresh();
    d.session.bottles.consume(0);
    d.session.bottles.consume(1);
    let st = d.session.status();
    expect(st.bottles.map((b) => b.state)).toEqual(['recharging', 'empty', 'ready']);
    expect(st.bottles.map((b) => b.secondsLeft)).toEqual([60, 0, 0]);
    d.step(60);
    st = d.session.status();
    expect(st.bottles[0]!.secondsLeft).toBeCloseTo(59, 5);
    d.step(60 * 30);
    expect(d.session.status().bottles[0]!.secondsLeft).toBeCloseTo(29, 5);
  });
});
