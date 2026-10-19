import { describe, expect, it } from 'vitest';
import { createPlayerStatus, type PlayerStatus } from '@/gameplay/PlayerStatus';
import { FLASH_SECONDS, GAIN_SECONDS, GHOST_SECONDS, HEAL_SECONDS, HudModel, POP_SECONDS, SHAKE_SECONDS, TRAIL_DRAIN_PER_SECOND, TRAIL_HOLD_SECONDS } from '@/ui/hud/HudModel';

/**
 * The HUD as a pure model: a PlayerStatus in, a HudState out, with the short real-time transients of the interface (the ghost
 * of a lost life segment, the shake of a refused cast, the pop of a drunk bottle). No DOM, no simulation.
 */
function status(patch: (s: PlayerStatus) => void = () => {}): PlayerStatus {
  const s = createPlayerStatus();
  s.life.current = 5;
  s.life.max = 5;
  s.magic.current = 100;
  s.magic.max = 100;
  s.bottles = [0, 1, 2].map(() => ({ state: 'ready' as const, fill01: 1, iconId: 'bottle', secondsLeft: 0 }));
  patch(s);
  return s;
}
const FRAME = 1 / 60;
/** A status with the Spirit Bolt equipped (it costs 30 of the 100 the bar holds). */
const withCard = (patch: (s: PlayerStatus) => void = () => {}): PlayerStatus =>
  status((s) => {
    s.card = { equipped: true, id: 'card_spirit_bolt', nameKey: 'card.spiritBolt.name', iconId: 'spirit_bolt', state: 'ready', cooldown01: 0, cost: 30 };
    patch(s);
  });

describe('life: five segments, a ghost for the one that was lost', () => {
  it('one segment per point, all full at the start', () => {
    const m = new HudModel();
    const s = m.update(status(), FRAME);
    expect(s.life.segments).toHaveLength(5);
    expect(s.life.segments.every((x) => x.full && x.ghost === 0 && x.flash === 0)).toBe(true);
    expect(s.life.critical).toBe(false);
  });

  it('losing a point empties the LAST full segment and leaves a ghost + flash on it, not on the others', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    const s = m.update(status((x) => (x.life.current = 4)), FRAME);
    expect(s.life.segments.map((x) => x.full)).toEqual([true, true, true, true, false]);
    const lost = s.life.segments[4]!;
    expect(lost.ghost).toBeGreaterThan(0.9);
    expect(lost.flash).toBeGreaterThan(0.8);
    expect(s.life.segments.slice(0, 4).every((x) => x.ghost === 0)).toBe(true);
  });

  it('losing several points at once ghosts every one of them', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    const s = m.update(status((x) => (x.life.current = 2)), FRAME);
    expect(s.life.segments.map((x) => x.ghost > 0)).toEqual([false, false, true, true, true]);
  });

  it('the ghost fades over 0.4 s and the flash over 0.15 s of REAL time', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    m.update(status((x) => (x.life.current = 4)), 0);
    let s = m.update(status((x) => (x.life.current = 4)), FLASH_SECONDS);
    expect(s.life.segments[4]!.flash).toBe(0);
    expect(s.life.segments[4]!.ghost).toBeGreaterThan(0.5);
    s = m.update(status((x) => (x.life.current = 4)), GHOST_SECONDS);
    expect(s.life.segments[4]!.ghost).toBe(0);
  });

  it('a heal fills the segments again and leaves no ghost on them', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    m.update(status((x) => (x.life.current = 3)), FRAME);
    const s = m.update(status((x) => (x.life.current = 5)), FRAME);
    expect(s.life.segments.every((x) => x.full && x.ghost === 0 && x.flash === 0)).toBe(true);
  });

  it('with ONE point left the life is critical (the first segment pulses); at 0 it is not', () => {
    const m = new HudModel();
    expect(m.update(status((x) => (x.life.current = 1)), FRAME).life.critical).toBe(true);
    expect(m.update(status((x) => (x.life.current = 2)), FRAME).life.critical).toBe(false);
    expect(m.update(status((x) => (x.life.current = 0)), FRAME).life.critical).toBe(false);
  });

  it('a life upgrade adds a segment (the number of segments is the maximum, not a constant 5)', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    const s = m.update(status((x) => ((x.life.max = 6), (x.life.current = 6))), FRAME);
    expect(s.life.segments).toHaveLength(6);
    expect(s.life.max).toBe(6);
  });

  it('nothing is ghosted on the very first frame (there is no previous life to compare with)', () => {
    const m = new HudModel();
    const s = m.update(status((x) => (x.life.current = 2)), FRAME);
    expect(s.life.segments.every((x) => x.ghost === 0 && x.flash === 0)).toBe(true);
  });
});

describe('magic: a bar that follows the number, a glow while it regenerates, a shake when refused', () => {
  it('the fraction is current / max, continuous', () => {
    const m = new HudModel();
    expect(m.update(status(), FRAME).magic.fraction).toBe(1);
    expect(m.update(status((x) => (x.magic.current = 70)), FRAME).magic.fraction).toBeCloseTo(0.7, 9);
    expect(m.update(status((x) => (x.magic.current = 70.1)), FRAME).magic.fraction).toBeCloseTo(0.701, 9);
    const empty = m.update(status((x) => (x.magic.current = 0)), FRAME).magic;
    expect([empty.fraction, empty.empty]).toEqual([0, true]);
  });

  it('shows the regeneration glow only while it regenerates', () => {
    const m = new HudModel();
    expect(m.update(status(), FRAME).magic.regenerating).toBe(false);
    expect(m.update(status((x) => ((x.magic.current = 50), (x.magic.regenerating = true))), FRAME).magic.regenerating).toBe(true);
  });

  it('a refused cast shakes the bar and the card for 0.28 s, then they are still', () => {
    const m = new HudModel();
    m.magicDenied();
    let s = m.update(status(), 0.03);
    expect(Math.abs(s.magic.shakeX) + Math.abs(s.card.shakeX)).toBeGreaterThan(0);
    const xs: number[] = [];
    for (let t = 0; t < SHAKE_SECONDS; t += FRAME) xs.push(m.update(status(), FRAME).magic.shakeX);
    expect(Math.max(...xs)).toBeGreaterThan(0.5);
    expect(Math.min(...xs)).toBeLessThan(-0.5); // it wiggles both ways
    s = m.update(status(), 0.1);
    expect([s.magic.shakeX, s.card.shakeX]).toEqual([0, 0]);
  });

  it('the shake dies down: the last wiggles are smaller than the first', () => {
    const m = new HudModel();
    m.magicDenied();
    const xs: number[] = [];
    for (let t = 0; t < SHAKE_SECONDS; t += FRAME) xs.push(Math.abs(m.update(status(), FRAME).magic.shakeX));
    const early = Math.max(...xs.slice(0, 6));
    const late = Math.max(...xs.slice(-4));
    expect(late).toBeLessThan(early);
  });
});

describe('card: the slot is always there', () => {
  it('with no card the slot is empty (and has no icon)', () => {
    const m = new HudModel();
    const c = m.update(status(), FRAME).card;
    expect([c.state, c.iconId, c.nameKey, c.cooldown01]).toEqual(['empty', '', '', 0]);
  });

  it('with a card it shows its icon in the state the simulation reports: ready, no magic (dim), cooldown (sweep)', () => {
    const m = new HudModel();
    const equip = (x: PlayerStatus, state: 'ready' | 'noMagic' | 'cooldown', cd = 0): void => {
      x.card.equipped = true;
      x.card.id = 'card_spirit_bolt';
      x.card.iconId = 'spirit_bolt';
      x.card.nameKey = 'card.spiritBolt.name';
      x.card.state = state;
      x.card.cooldown01 = cd;
    };
    let c = m.update(status((x) => equip(x, 'ready')), FRAME).card;
    expect([c.state, c.iconId, c.nameKey]).toEqual(['ready', 'spirit_bolt', 'card.spiritBolt.name']);
    c = m.update(status((x) => equip(x, 'noMagic')), FRAME).card;
    expect(c.state).toBe('noMagic');
    c = m.update(status((x) => equip(x, 'cooldown', 0.6)), FRAME).card;
    expect([c.state, c.cooldown01]).toEqual(['cooldown', 0.6]);
  });

  it('a card that was not there a moment ago (the Spirit Bolt of R3) arrives glowing, and the glow fades in 0.9 s', () => {
    const m = new HudModel();
    const bolt = (x: PlayerStatus): void => {
      x.card.equipped = true;
      x.card.iconId = 'spirit_bolt';
      x.card.state = 'ready';
    };
    expect(m.update(status(), FRAME).card.gain).toBe(0);
    expect(m.update(status(bolt), 0).card.gain).toBe(1);
    expect(m.update(status(bolt), GAIN_SECONDS / 2).card.gain).toBeCloseTo(0.5, 6);
    expect(m.update(status(bolt), GAIN_SECONDS).card.gain).toBe(0);
  });

  it('a game that LOADS with the card does not announce it: the first frame shows no glow, and neither does any later one', () => {
    const bolt = (x: PlayerStatus): void => {
      x.card.equipped = true;
      x.card.iconId = 'spirit_bolt';
      x.card.state = 'ready';
    };
    const loaded = new HudModel();
    expect(loaded.update(status(bolt), FRAME).card.gain).toBe(0);
    expect(loaded.update(status(bolt), FRAME).card.gain).toBe(0);
  });

  it('taking the card off empties the slot again', () => {
    const m = new HudModel();
    m.update(status((x) => ((x.card.equipped = true), (x.card.iconId = 'spirit_bolt'))), FRAME);
    expect(m.update(status(), FRAME).card.state).toBe('empty');
  });
});

describe('bottles: ready, empty, recharging; a pop when one is drunk', () => {
  it('mirrors the status of every slot (and grows to four)', () => {
    const m = new HudModel();
    let s = m.update(status((x) => (x.bottles[0]!.state = 'recharging')), FRAME);
    expect(s.bottles.map((b) => b.state)).toEqual(['recharging', 'ready', 'ready']);
    s = m.update(status((x) => x.bottles.push({ state: 'ready', fill01: 1, iconId: 'bottle', secondsLeft: 0 })), FRAME);
    expect(s.bottles).toHaveLength(4);
  });

  it('carries the recharge progress for the filling animation', () => {
    const m = new HudModel();
    const s = m.update(status((x) => ((x.bottles[1]!.state = 'recharging'), (x.bottles[1]!.fill01 = 0.4))), FRAME);
    expect(s.bottles[1]!.fill01).toBe(0.4);
  });

  it('drinking pops the vial and the pop fades in 0.25 s', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    m.bottleUsed(1);
    let s = m.update(status(), 0);
    expect(s.bottles[1]!.pop).toBe(1);
    expect(s.bottles[0]!.pop).toBe(0);
    s = m.update(status(), POP_SECONDS);
    expect(s.bottles[1]!.pop).toBe(0);
  });

  it('a vial that was not there a moment ago (the fourth bottle) arrives glowing, and the glow fades in 0.9 s; the others never glow', () => {
    const m = new HudModel();
    const four = status((x) => x.bottles.push({ state: 'ready', fill01: 1, iconId: 'bottle', secondsLeft: 0 }));
    let s = m.update(status(), FRAME);
    expect(s.bottles.map((b) => b.gain)).toEqual([0, 0, 0]);
    s = m.update(four, 0);
    expect(s.bottles.map((b) => b.gain)).toEqual([0, 0, 0, 1]);
    s = m.update(four, GAIN_SECONDS / 2);
    expect(s.bottles[3]!.gain).toBeCloseTo(0.5, 6);
    s = m.update(four, GAIN_SECONDS);
    expect(s.bottles.map((b) => b.gain)).toEqual([0, 0, 0, 0]);
  });

  it('a game that LOADS with four bottles does not announce the fourth: its first frame shows no glow, and neither does any later one', () => {
    const m = new HudModel();
    const four = status((x) => x.bottles.push({ state: 'ready', fill01: 1, iconId: 'bottle', secondsLeft: 0 }));
    let s = m.update(four, FRAME);
    expect(s.bottles).toHaveLength(4);
    expect(s.bottles.every((b) => b.gain === 0)).toBe(true);
    s = m.update(four, FRAME);
    expect(s.bottles.every((b) => b.gain === 0)).toBe(true);
  });

  it('drinking is not gaining: a drunk vial pops and does not glow, a new one glows and does not pop', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    m.bottleUsed(0);
    let s = m.update(status((x) => x.bottles.push({ state: 'ready', fill01: 1, iconId: 'bottle', secondsLeft: 0 })), 0);
    expect(s.bottles.map((b) => [b.pop, b.gain])).toEqual([[1, 0], [0, 0], [0, 0], [0, 1]]);
    s = m.update(status((x) => x.bottles.push({ state: 'ready', fill01: 1, iconId: 'bottle', secondsLeft: 0 })), POP_SECONDS);
    expect(s.bottles[0]!.pop).toBe(0);
    expect(s.bottles[3]!.gain).toBeGreaterThan(0);
  });

  it('popping a slot that does not exist is harmless', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    expect(() => m.bottleUsed(9)).not.toThrow();
  });

  it('the vial being drunk drains over the channel and the others stay full', () => {
    const m = new HudModel();
    let s = m.update(status((x) => (x.drink = { slot: 1, progress01: 0.25 })), FRAME);
    expect(s.bottles.map((b) => b.drinking)).toEqual([false, true, false]);
    expect(s.bottles.map((b) => b.fill01)).toEqual([1, 0.75, 1]);
    s = m.update(status((x) => (x.drink = { slot: 1, progress01: 1 })), FRAME);
    expect(s.bottles[1]!.fill01).toBe(0);
    s = m.update(status(), FRAME); // the channel ended or was interrupted: nothing drains any more
    expect(s.bottles.map((b) => [b.drinking, b.fill01])).toEqual([[false, 1], [false, 1], [false, 1]]);
  });

  it('a refused drink shakes the whole row of bottles, and it settles in 0.28 s; the bar and the card do not move', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    expect(m.state.bottlesShakeX).toBe(0);
    m.bottlesDenied();
    const s = m.update(status(), 0.03);
    expect(s.bottlesShakeX).not.toBe(0);
    expect(s.magic.shakeX).toBe(0);
    expect(s.card.shakeX).toBe(0);
    expect(m.update(status(), SHAKE_SECONDS).bottlesShakeX).toBe(0);
  });
});

describe('time and reuse', () => {
  it('a huge dt (a tab that was hidden) finishes every transient at once; a negative one changes nothing', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    m.update(status((x) => (x.life.current = 4)), FRAME);
    m.magicDenied();
    m.bottleUsed(0);
    const s = m.update(status((x) => (x.life.current = 4)), 60);
    expect(s.life.segments[4]!.ghost).toBe(0);
    expect([s.magic.shakeX, s.bottles[0]!.pop]).toEqual([0, 0]);
    m.update(status((x) => (x.life.current = 3)), FRAME);
    const before = m.state.life.segments[3]!.ghost;
    m.update(status((x) => (x.life.current = 3)), -5);
    expect(m.state.life.segments[3]!.ghost).toBe(before);
  });

  it('the state is one reused object: no allocation per frame in steady state', () => {
    const m = new HudModel();
    const a = m.update(status(), FRAME);
    const segs = a.life.segments;
    const b0 = a.bottles[0];
    const b = m.update(status(), FRAME);
    expect(b).toBe(a);
    expect(b.life.segments).toBe(segs);
    expect(b.bottles[0]).toBe(b0);
  });

  it('is a pure function of the same inputs: the same statuses give the same states', () => {
    const play = (): string => {
      const m = new HudModel();
      const out: unknown[] = [];
      for (let i = 0; i < 120; i++) {
        if (i === 30) m.magicDenied();
        if (i === 50) m.bottleUsed(0);
        const s = m.update(status((x) => ((x.life.current = i < 40 ? 5 : 3), (x.magic.current = 100 - i / 2))), FRAME);
        out.push(JSON.stringify(s));
      }
      return out.join('|');
    };
    expect(play()).toBe(play());
  });
});

describe('life: a heal is answered, and the i-frames of a blow are shown', () => {
  it('the segments that come back get a wave of light — exactly those — and it fades over HEAL_SECONDS of real time', () => {
    const m = new HudModel();
    m.update(status((x) => (x.life.current = 2)), FRAME);
    let s = m.update(status((x) => (x.life.current = 4)), FRAME);
    expect(s.life.segments.map((x) => x.heal > 0.9)).toEqual([false, false, true, true, false]);
    s = m.update(status((x) => (x.life.current = 4)), HEAL_SECONDS / 2);
    expect(s.life.segments[2]!.heal).toBeCloseTo(0.5, 1);
    s = m.update(status((x) => (x.life.current = 4)), HEAL_SECONDS);
    expect(s.life.segments.every((x) => x.heal === 0)).toBe(true);
  });

  it('a game that LOADS with some life lost shows no heal on its first frame, and neither does a segment that was never lost', () => {
    const m = new HudModel();
    const s = m.update(status((x) => (x.life.current = 3)), FRAME);
    expect(s.life.segments.every((x) => x.heal === 0)).toBe(true);
    expect(m.update(status(), FRAME).life.segments.filter((x) => x.heal > 0)).toHaveLength(2);
  });

  it('losing a segment while its wave is still running ends the wave (an empty segment shines for nothing)', () => {
    const m = new HudModel();
    m.update(status((x) => (x.life.current = 2)), FRAME);
    m.update(status((x) => (x.life.current = 4)), FRAME);
    const s = m.update(status((x) => (x.life.current = 3)), FRAME);
    expect(s.life.segments[3]!.heal).toBe(0);
    expect(s.life.segments[3]!.ghost).toBeGreaterThan(0.9);
  });

  it('the guard line is the simulation\'s own i-frame window, as a share (never a second timer): 1 when a blow lands, draining to 0, and held to 0 … 1', () => {
    const m = new HudModel();
    expect(m.update(status(), FRAME).life.guard).toBe(0);
    expect(m.update(status((x) => (x.life.guard01 = 1)), FRAME).life.guard).toBe(1);
    expect(m.update(status((x) => (x.life.guard01 = 0.4)), FRAME).life.guard).toBeCloseTo(0.4, 5);
    expect(m.update(status((x) => (x.life.guard01 = 7)), FRAME).life.guard).toBe(1);
    expect(m.update(status((x) => (x.life.guard01 = -3)), FRAME).life.guard).toBe(0);
  });
});

describe('magic: what was spent lingers, the cost of the skill is marked, and the wait is told apart', () => {
  it('a spend leaves a trail at the old level that holds for TRAIL_HOLD_SECONDS and then drains to the bar; the bar itself never lags', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    let s = m.update(status((x) => (x.magic.current = 70)), FRAME);
    expect(s.magic.fraction).toBeCloseTo(0.7, 5);
    expect(s.magic.trail).toBeCloseTo(1, 5);
    s = m.update(status((x) => (x.magic.current = 70)), TRAIL_HOLD_SECONDS / 2);
    expect(s.magic.trail, 'still held').toBeCloseTo(1, 5);
    s = m.update(status((x) => (x.magic.current = 70)), TRAIL_HOLD_SECONDS);
    expect(s.magic.trail, 'draining now').toBeLessThan(1);
    s = m.update(status((x) => (x.magic.current = 70)), 5);
    expect(s.magic.trail).toBeCloseTo(0.7, 5);
    expect(TRAIL_DRAIN_PER_SECOND * 0.3).toBeLessThan(1);
  });

  it('regaining magic never leaves a trail: the memory is only of what was spent', () => {
    const m = new HudModel();
    m.update(status((x) => (x.magic.current = 10)), FRAME);
    for (let i = 1; i <= 30; i++) {
      const s = m.update(status((x) => (x.magic.current = 10 + i)), FRAME);
      expect(s.magic.trail).toBeCloseTo(s.magic.fraction, 9);
    }
  });

  it('two spends in a row keep the older, higher level in the trail until it drains', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    m.update(status((x) => (x.magic.current = 70)), FRAME);
    const s = m.update(status((x) => (x.magic.current = 40)), FRAME);
    expect(s.magic.trail).toBeCloseTo(1, 5);
    expect(s.magic.fraction).toBeCloseTo(0.4, 5);
  });

  it('a game that LOADS with a half-empty bar has no trail on its first frame', () => {
    expect(new HudModel().update(status((x) => (x.magic.current = 50)), FRAME).magic.trail).toBeCloseTo(0.5, 5);
  });

  it('marks where the equipped skill\'s cost falls on the bar, and whether it can be paid now; with no skill there is nothing to mark', () => {
    const m = new HudModel();
    let s = m.update(withCard(), FRAME);
    expect(s.magic.cost01).toBeCloseTo(0.3, 5);
    expect(s.magic.affordable).toBe(true);
    expect(s.card.cost).toBe(30);
    s = m.update(withCard((x) => (x.magic.current = 29.9)), FRAME);
    expect(s.magic.affordable).toBe(false);
    s = m.update(withCard((x) => (x.magic.current = 30)), FRAME);
    expect(s.magic.affordable, 'exactly the cost is enough (the simulation says so too)').toBe(true);
    s = m.update(status(), FRAME);
    expect([s.magic.cost01, s.magic.affordable, s.card.cost]).toEqual([0, true, 0]);
  });

  it('the cost is a share of the bar, whatever the bar holds, and never past its end', () => {
    const m = new HudModel();
    expect(m.update(withCard((x) => (x.magic.max = 60)), FRAME).magic.cost01).toBeCloseTo(0.5, 5);
    expect(m.update(withCard((x) => ((x.magic.max = 20), (x.magic.current = 20))), FRAME).magic.cost01).toBe(1);
    expect(m.update(withCard((x) => ((x.magic.max = 0), (x.magic.current = 0))), FRAME).magic.cost01).toBe(0);
  });

  it('the wait after a spend is told apart from the regeneration: below the maximum and not regenerating', () => {
    const m = new HudModel();
    expect(m.update(status(), FRAME).magic.waiting, 'full: nothing to wait for').toBe(false);
    expect(m.update(status((x) => ((x.magic.current = 70), (x.magic.regenerating = false))), FRAME).magic.waiting).toBe(true);
    expect(m.update(status((x) => ((x.magic.current = 70), (x.magic.regenerating = true))), FRAME).magic.waiting).toBe(false);
  });
});

describe('bottles: the seconds left of the one that is recharging', () => {
  it('whole seconds rounded UP — it never says 0 while the bottle is not ready — and only for the one that is recharging', () => {
    const m = new HudModel();
    const bottles = (patch: (b: PlayerStatus['bottles']) => void) =>
      status((x) => {
        patch(x.bottles);
      });
    const s = m.update(
      bottles((b) => {
        b[0] = { state: 'empty', fill01: 0, iconId: 'bottle', secondsLeft: 0 };
        b[1] = { state: 'recharging', fill01: 0.31, iconId: 'bottle', secondsLeft: 41.2 };
      }),
      FRAME,
    );
    expect(s.bottles.map((b) => b.secondsLeft)).toEqual([0, 42, 0]);
    const next = m.update(bottles((b) => (b[1] = { state: 'recharging', fill01: 0.999, iconId: 'bottle', secondsLeft: 0.02 })), FRAME);
    expect(next.bottles[1]!.secondsLeft).toBe(1);
    const done = m.update(bottles(() => {}), FRAME);
    expect(done.bottles[1]!.secondsLeft).toBe(0);
  });

  it('a ready bottle says nothing even if the status carries a stale number', () => {
    const m = new HudModel();
    const s = m.update(status((x) => (x.bottles[0] = { state: 'ready', fill01: 1, iconId: 'bottle', secondsLeft: 12 })), FRAME);
    expect(s.bottles[0]!.secondsLeft).toBe(0);
  });
});

