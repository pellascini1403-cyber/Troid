import { describe, expect, it } from 'vitest';
import { ROOMS } from '@/content';
import { SKILLS } from '@/content/skills';
import { HudModel } from '@/ui/hud/HudModel';
import { strikeOnPlayer } from '../helpers/combat';
import { driver } from '../helpers/sim';

/**
 * WHAT THE HUD IS TOLD (docs/PROMPT14-LOG.md): every new thing it shows — the i-frames of a blow, the cost of the power, the seconds a bottle still needs — is read from the simulation's own numbers
 * through `GameSession.status()`, never counted again on the side. These tests hold the status to the simulation tick by tick, so the picture can never disagree with the game.
 */
const fresh = () => driver({ room: ROOMS.r2_hall!, entry: 'west', unlocked: ['dash'], extra: { rooms: ROOMS } }).settle();

describe('the i-frames of a blow', () => {
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

  it('a dash\'s own i-frames are not the blow\'s: the guard line does not show them (the hero does not blink for them either)', () => {
    const d = fresh();
    d.press('dash').step(1);
    d.release('dash');
    expect(d.p.controller.isInvulnerable, 'the dash is invulnerable').toBe(true);
    expect(d.p.controller.blinking).toBe(false);
    expect(d.session.status().life.guard01).toBe(0);
  });

  it('a hit-stop does not move it (the simulation holds still, and so does what the HUD is told)', () => {
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

describe('the cost of the power', () => {
  it('is the cost the skill has in the content while a card is equipped, and nothing without one', () => {
    const d = fresh();
    expect(d.session.status().card.cost).toBe(0);
    d.session.loadout.acquire('card_spirit_bolt');
    expect(d.session.status().card.cost).toBe(SKILLS.spirit_bolt!.cost);
    expect(d.session.status().card.cost).toBe(30);
    d.session.loadout.equip(null);
    expect(d.session.status().card.cost).toBe(0);
  });

  it('what the HUD marks and what the cast needs are the same number: a cast at exactly the cost goes, one below it is refused', () => {
    const d = fresh();
    d.session.loadout.acquire('card_spirit_bolt');
    const model = new HudModel();
    d.session.magic.set(30);
    let s = model.update(d.session.status(), 1 / 60);
    expect(s.magic.affordable).toBe(true);
    expect(d.session.magic.canSpend(SKILLS.spirit_bolt!.cost)).toBe(true);
    d.session.magic.set(29.9);
    s = model.update(d.session.status(), 1 / 60);
    expect(s.magic.affordable).toBe(false);
    expect(d.session.magic.canSpend(SKILLS.spirit_bolt!.cost)).toBe(false);
    expect(s.card.state).toBe('noMagic');
  });
});

describe('the seconds a bottle still needs', () => {
  it('are the real recharge: 60 s for the one recharging, counted down tick by tick, and nothing for the ones that wait their turn', () => {
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

  it('when one finishes the next one starts its own 60 s, and the HUD never shows 0 for a bottle that is not ready', () => {
    const d = fresh();
    const model = new HudModel();
    d.session.bottles.consume(0);
    d.session.bottles.consume(1);
    for (let i = 0; i < 60 * 60 + 30; i++) {
      d.step(1);
      const s = model.update(d.session.status(), 1 / 60);
      for (const b of s.bottles) if (b.state === 'recharging') expect(b.secondsLeft).toBeGreaterThanOrEqual(1);
    }
    const st = d.session.status();
    expect(st.bottles.map((b) => b.state)).toEqual(['ready', 'recharging', 'ready']);
    expect(st.bottles[1]!.secondsLeft).toBeGreaterThan(58);
  });
});

describe('a heal is answered by the segments that really came back', () => {
  it('drinking a bottle brings back exactly the points it heals, and the HUD marks those segments', () => {
    const d = fresh();
    d.p.health.damage(3);
    d.step(70); // the i-frames of the blow are over: nothing else is going on
    const model = new HudModel();
    model.update(d.session.status(), 1 / 60);
    const before = d.p.health.current;
    d.session.bottles.consume(0);
    d.p.health.heal(2);
    const s = model.update(d.session.status(), 1 / 60);
    expect(d.p.health.current).toBe(before + 2);
    expect(s.life.segments.map((x) => x.heal > 0.9).filter(Boolean)).toHaveLength(2);
    expect(s.life.segments.filter((x) => x.heal > 0.9).map((x) => x.full)).toEqual([true, true]);
  });
});
