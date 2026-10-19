import { describe, expect, it } from 'vitest';
import { ARRIVAL, ArrivalGate, PREFETCH, roomAhead } from '@/presentation/arrival';

/**
 * THE ARRIVAL (docs/PROMPT13-LOG.md): a change of zone holds the WORLD at the black until the room it arrives in can be shown whole. The state machine is pure — the caller tells it what happened and what
 * time it is — so every way a wait can end is played here, with an explicit clock.
 */
const make = (over: Partial<{ maxWaitMs: number; warmFrames: number }> = {}) => new ArrivalGate({ maxWaitMs: 1000, warmFrames: 2, ...over });

describe('preparing the room a way out leads to', () => {
  it('is one preparation per room however many times it is asked for: the second ask (the swap announcing the same room) starts nothing', () => {
    const g = make();
    const a = g.prepare('r2');
    expect(a.fresh).toBe(true);
    expect(g.prepare('r2')).toEqual({ serial: a.serial, fresh: false });
    expect(g.preparing).toBe('r2');
  });

  it('a newer preparation makes the answer of an older one harmless: the room that was left for another one is not "ready" because the first finished late', () => {
    const g = make();
    const first = g.prepare('r2');
    const second = g.prepare('r3');
    expect(second.serial).toBeGreaterThan(first.serial);
    g.close('r3', 0);
    g.settle(first.serial, true);
    expect(g.ready(10), 'the late answer for r2 says nothing about r3').toBeNull();
    g.settle(second.serial, true);
    expect(g.ready(10)).toBe('ready');
  });

  it('a preparation that failed is tried again the next time the room is asked for (a failure is not remembered)', () => {
    const g = make();
    const a = g.prepare('r2');
    g.settle(a.serial, false);
    const b = g.prepare('r2');
    expect(b.fresh).toBe(true);
    expect(b.serial).toBeGreaterThan(a.serial);
  });
});

describe('the world is held at the swap, and the room is built only when it can be shown', () => {
  it('is not held until the swap; from it, the world is held and the view may not be built while the art is on its way', () => {
    const g = make();
    g.prepare('r2');
    expect(g.blocking).toBe(false);
    expect(g.snapshot(0)).toMatchObject({ blocking: false, room: null, stage: 'idle', waited: 0 });
    g.close('r2', 100);
    expect(g.blocking).toBe(true);
    expect(g.ready(150)).toBeNull();
    expect(g.snapshot(150)).toMatchObject({ blocking: true, room: 'r2', stage: 'loading', outcome: null, waited: 50 });
  });

  it('the art being in is what lets the view be built — not a time: the same state gives the same answer however long it waits', () => {
    const g = make();
    const p = g.prepare('r2');
    g.close('r2', 0);
    for (const t of [10, 200, 900]) expect(g.ready(t), `at ${t} ms`).toBeNull();
    g.settle(p.serial, true);
    expect(g.ready(901)).toBe('ready');
    expect(g.ready(5000), 'and it keeps saying so').toBe('ready');
  });

  it('an art that was ready before the swap needs no wait at all', () => {
    const g = make();
    const p = g.prepare('r2');
    g.settle(p.serial, true); // the fade out was long enough
    g.close('r2', 0);
    expect(g.ready(0)).toBe('ready');
  });

  it('a failure lets the room be built at once, as it can be: the player is never kept at the black by an art that will not come', () => {
    const g = make();
    const p = g.prepare('r2');
    g.close('r2', 0);
    g.settle(p.serial, false);
    expect(g.ready(1)).toBe('failed');
  });

  it('an art that does not come is given up on after the longest wait, and the room is built as it can be', () => {
    const g = make({ maxWaitMs: 1000 });
    g.prepare('r2');
    g.close('r2', 500);
    expect(g.ready(1499)).toBeNull();
    expect(g.ready(1500)).toBe('timeout');
    // …and the answer does not change if the art turns up afterwards
    expect(g.ready(1600)).toBe('timeout');
  });

  it('a room nothing was prepared for (a defeat that brings the hero back) has nothing to wait for', () => {
    const g = make();
    g.close('r1', 0);
    expect(g.ready(0)).toBe('ready');
  });

  it('asking while the world is not held answers nothing', () => {
    expect(make().ready(1e9)).toBeNull();
  });
});

describe('the first frames of the room are drawn out of sight', () => {
  it('the world goes on after the configured number of frames drawn WITH the room on the stage — not before, and not on frames drawn without it', () => {
    const g = make({ warmFrames: 2 });
    const p = g.prepare('r2');
    g.close('r2', 0);
    g.settle(p.serial, true);
    expect(g.rendered(), 'frames drawn before the room is built count for nothing').toBe(false);
    expect(g.rendered()).toBe(false);
    g.ready(1);
    g.built();
    expect(g.snapshot(2).stage).toBe('warming');
    expect(g.rendered()).toBe(false);
    expect(g.blocking).toBe(true);
    expect(g.rendered(), 'the second one lets it go').toBe(true);
    expect(g.blocking).toBe(false);
    expect(g.snapshot(3)).toMatchObject({ blocking: false, stage: 'idle', room: null });
  });

  it('what was prepared is forgotten once the room is shown: the next visit to it prepares again (its art may have gone in between)', () => {
    const g = make({ warmFrames: 1 });
    const p = g.prepare('r2');
    g.settle(p.serial, true);
    g.close('r2', 0);
    g.ready(0);
    g.built();
    expect(g.rendered()).toBe(true);
    expect(g.preparing).toBeNull();
    expect(g.prepare('r2').fresh).toBe(true);
  });

  it('building twice, or letting go twice, does nothing the second time', () => {
    const g = make({ warmFrames: 1 });
    g.close('r2', 0);
    g.ready(0);
    g.built();
    g.built();
    expect(g.rendered()).toBe(true);
    expect(g.rendered()).toBe(false);
  });
});

describe('a transition that is called off drops everything', () => {
  it('the world is not held, nothing is being prepared, and the answers that arrive later change nothing', () => {
    const g = make();
    const p = g.prepare('r2');
    g.close('r2', 0);
    expect(g.cancel()).toBe(true);
    expect(g.blocking).toBe(false);
    expect(g.preparing).toBeNull();
    g.settle(p.serial, true);
    expect(g.ready(5)).toBeNull();
    expect(g.cancel(), 'and cancelling what is not held says so').toBe(false);
  });
});

describe('the numbers of the arrival', () => {
  it('are the ones the design states: a wait of ten seconds at most, a grace before anything is shown, a couple of frames out of sight', () => {
    expect(ARRIVAL).toEqual({ maxWaitMs: 10_000, graceMs: 450, warmFrames: 2 });
  });
});

describe('walking toward a way out (the art beyond it starts coming in)', () => {
  const room = {
    exits: [
      { rect: { x0: 0, y0: 0, x1: 2.4, y1: 4 }, to: { room: 'back' } },
      { rect: { x0: 88, y0: 0, x1: 91, y1: 4 }, to: { room: 'on' }, requires: 'door' },
      { rect: { x0: 40, y0: 0, x1: 42, y1: 4 } }, // an exit that leads nowhere (an event only)
    ],
  };
  const none = (): boolean => false;
  const all = (): boolean => true;
  const known = (r: string): boolean => r === 'back' || r === 'on';

  it('only a hero who is close enough AND walking toward the way out brings in what lies beyond it', () => {
    expect(roomAhead(room, 30, 6, all, known, null), 'far from it').toBeNull();
    expect(roomAhead(room, 88 - PREFETCH.nearM - 1, 6, all, known, null), 'just beyond the limit').toBeNull();
    expect(roomAhead(room, 88 - PREFETCH.nearM + 1, 6, all, known, null), 'inside the limit, running toward it').toBe('on');
    expect(roomAhead(room, 70, 0, all, known, null), 'standing still is not walking toward it').toBeNull();
    expect(roomAhead(room, 70, -6, all, known, null), 'nor is walking away').toBeNull();
    expect(roomAhead(room, 70, PREFETCH.minSpeed - 0.01, all, known, null), 'nor is a drift').toBeNull();
  });

  it('a hero who has just come in through a way and stands beside it, walking on, does not bring back what they left', () => {
    expect(roomAhead(room, 4, 6, all, known, null)).toBeNull();
    // …but turning back toward it does
    expect(roomAhead(room, 4, -6, all, known, null)).toBe('back');
  });

  it('a way shut by a flag the hero does not have is not prepared; one that leads nowhere, or to a room that does not exist, neither', () => {
    expect(roomAhead(room, 80, 6, none, known, null)).toBeNull();
    expect(roomAhead(room, 80, 6, all, () => false, null)).toBeNull();
    expect(roomAhead(room, 41, 6, all, known, null), 'an exit with no destination').toBeNull();
  });

  it('chooses the nearest way when two are within reach', () => {
    const close = { exits: [{ rect: { x0: 0, y0: 0, x1: 2, y1: 4 }, to: { room: 'back' } }, { rect: { x0: 50, y0: 0, x1: 52, y1: 4 }, to: { room: 'on' } }] };
    expect(roomAhead(close, 30, 6, all, known, null)).toBe('on');
    expect(roomAhead(close, 20, -6, all, known, null)).toBe('back');
  });

  it('keeps what it is bringing in until the hero is far away, whichever way they move — a hero pacing at the limit does not make the art come and go', () => {
    const one = { exits: [{ rect: { x0: 88, y0: 0, x1: 91, y1: 4 }, to: { room: 'on' } }] };
    const at = (x: number, vx: number, current: string | null) => roomAhead(one, x, vx, all, known, current);
    expect(at(88 - PREFETCH.nearM - 5, 0, null)).toBeNull();
    expect(at(88 - PREFETCH.nearM - 5, 0, 'on'), 'already coming in: it stays while within the far limit').toBe('on');
    expect(at(88 - PREFETCH.nearM - 5, -6, 'on'), 'even if they turn away').toBe('on');
    expect(at(88 - PREFETCH.farM - 1, -6, 'on'), 'and goes when they are far').toBeNull();
  });

  it('a hero inside the zone of a way is as near as can be', () => {
    expect(roomAhead(room, 89, 0, all, known, null)).toBe('on');
  });
});
