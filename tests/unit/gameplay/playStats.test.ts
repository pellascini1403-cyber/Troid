import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import { PlayStats } from '@/gameplay/PlayStats';

/**
 * WHAT THE HERO HAS DONE (docs/PROMPT14-LOG.md): counted from the events the simulation already raises, so every number is something that happened — a defeat, a hostile that fell, a room built around the
 * hero, the ticks lived. Nothing the rules of the game read, so counting can never change a game.
 */
const bus = (): EventBus<GameEvents> => new EventBus<GameEvents>();
const died = (b: EventBus<GameEvents>, team: 'enemy' | 'player' | 'neutral'): void => b.emit('actor:died', { id: 'x', team, x: 0, y: 0 });

describe('PlayStats', () => {
  it('starts from nothing: no time, no defeats, no kills, and only the room the hero is already in', () => {
    const stats = new PlayStats();
    stats.attach(bus(), 'r1_gate');
    expect(stats.snapshot(0)).toEqual({ ticks: 0, deaths: 0, kills: 0, rooms: ['r1_gate'] });
  });

  it('starts from what a save had counted, and what it adds goes on top', () => {
    const b = bus();
    const stats = new PlayStats({ ticks: 3600, deaths: 2, kills: 5, rooms: ['r1_gate', 'r2_hall'] });
    stats.attach(b, 'r2_hall');
    b.emit('death:started', { x: 0, y: 0 });
    died(b, 'enemy');
    expect(stats.snapshot(120)).toEqual({ ticks: 3720, deaths: 3, kills: 6, rooms: ['r1_gate', 'r2_hall'] });
  });

  it('a defeat is `death:started`, once each: the hero\'s own `actor:died` is not a kill and not a second defeat', () => {
    const b = bus();
    const stats = new PlayStats();
    stats.attach(b, 'r1_gate');
    b.emit('death:started', { x: 0, y: 0 });
    died(b, 'player');
    b.emit('player:died', { x: 0, y: 0 });
    b.emit('death:respawned', { roomId: 'r1_gate', entryId: 'start' });
    expect(stats.snapshot(0).deaths).toBe(1);
    expect(stats.snapshot(0).kills).toBe(0);
  });

  it('a kill is a HOSTILE that fell: a seal (neutral) breaking is not one, and a boss (an enemy like any other) is', () => {
    const b = bus();
    const stats = new PlayStats();
    stats.attach(b, 'r1_gate');
    died(b, 'enemy');
    died(b, 'enemy');
    died(b, 'neutral');
    died(b, 'player');
    expect(stats.snapshot(0).kills).toBe(2);
  });

  it('every room built around the hero is a room visited, once: a way in, a defeat that brings them back, a reload', () => {
    const b = bus();
    const stats = new PlayStats();
    stats.attach(b, 'r1_gate');
    b.emit('room:loaded', { roomId: 'r2_hall', entryId: 'west' });
    b.emit('room:loaded', { roomId: 'r1_gate', entryId: 'start' });
    b.emit('room:loaded', { roomId: 'r2_hall', entryId: 'rest' });
    expect(stats.snapshot(0).rooms).toEqual(['r1_gate', 'r2_hall']);
  });

  it('the time is the session\'s own clock added to what the save had: never negative, never fractional', () => {
    const stats = new PlayStats({ ticks: 100, deaths: 0, kills: 0, rooms: [] });
    stats.attach(bus(), 'r1_gate');
    expect(stats.snapshot(60.9).ticks).toBe(160);
    expect(stats.snapshot(-5).ticks).toBe(100);
  });

  it('the snapshot is a copy: changing it changes nothing, and what the save handed over is never touched', () => {
    const saved = { ticks: 1, deaths: 0, kills: 0, rooms: ['a'] };
    const stats = new PlayStats(saved);
    stats.attach(bus(), 'b');
    stats.snapshot(0).rooms.push('hacked');
    expect(stats.snapshot(0).rooms).toEqual(['a', 'b']);
    expect(saved.rooms).toEqual(['a']);
  });

  it('stops counting when it is told to', () => {
    const b = bus();
    const stats = new PlayStats();
    const stop = stats.attach(b, 'r1_gate');
    died(b, 'enemy');
    stop();
    died(b, 'enemy');
    b.emit('death:started', { x: 0, y: 0 });
    b.emit('room:loaded', { roomId: 'r2_hall', entryId: 'west' });
    expect(stats.snapshot(0)).toEqual({ ticks: 0, deaths: 0, kills: 1, rooms: ['r1_gate'] });
  });
});

/**
 * WHERE THE TIME WENT (docs/PROMPT22-LOG.md §8): the time played by ZONE, the falls by zone, and how long it took to get to each guardian — the measurements a person's playthrough is read from (nothing a rule of the game reads).
 */
describe('PlayStats by zone', () => {
  const zoneOf = (room: string): string => (room.startsWith('rt_') ? 'sunken_roots' : room.startsWith('mr_') ? 'glowmire' : 'ruins');
  const make = (initial?: ConstructorParameters<typeof PlayStats>[0]) => {
    let now = 0;
    const b = bus();
    const stats = new PlayStats(initial);
    stats.attach(b, 'r1_gate', { zoneOf, clock: () => now });
    return { b, stats, at: (t: number): void => void (now = t), room: (id: string): void => b.emit('room:loaded', { roomId: id, entryId: 'west' }) };
  };

  it('counts the ticks lived in each zone: from the moment the hero comes in until they go to another, and the stretch they are in now', () => {
    const w = make();
    w.at(600);
    w.room('rt_mouth');
    w.at(1500);
    w.room('rt_tangle'); // the same zone: no new stretch
    w.at(2100);
    w.room('mr_edge');
    w.at(2400);
    expect(w.stats.snapshot(2400).zones).toEqual({ glowmire: 300, ruins: 600, sunken_roots: 1500 });
  });

  it('the zones add up to the time played, to the tick (for a game that was counted from its first tick)', () => {
    const w = make();
    for (const [t, r] of [[100, 'rt_a'], [350, 'mr_b'], [900, 'r1_gate'], [901, 'rt_c']] as const) {
      w.at(t);
      w.room(r);
    }
    const s = w.stats.snapshot(2000);
    expect(Object.values(s.zones!).reduce((a, b) => a + b, 0)).toBe(s.ticks);
  });

  it('what a save had counted is kept and added to, and a game saved before the time was counted by zone starts counting from here', () => {
    const w = make({ ticks: 5000, deaths: 0, kills: 0, rooms: [], zones: { sunken_roots: 4000 } });
    w.at(100);
    w.room('rt_mouth');
    w.at(400);
    const s = w.stats.snapshot(400);
    expect(s.ticks).toBe(5400);
    expect(s.zones).toEqual({ ruins: 100, sunken_roots: 4300 });
    const old = make({ ticks: 5000, deaths: 0, kills: 0, rooms: [] });
    old.at(60);
    expect(old.stats.snapshot(60).zones, 'the minute of this session, and nothing invented for the past').toEqual({ ruins: 60 });
  });

  it('counts the falls in the zone they happened in, and the time at which each guardian first fell, on top of the time already played', () => {
    const w = make({ ticks: 1000, deaths: 1, kills: 0, rooms: [], falls: { ruins: 1 } });
    w.at(100);
    w.room('rt_mouth');
    w.at(200);
    w.b.emit('death:started', { x: 0, y: 0 });
    w.b.emit('death:started', { x: 0, y: 0 });
    w.at(900);
    w.b.emit('boss:defeated', { id: 'b1', defId: 'boss_root_tyrant', x: 0, y: 0 });
    w.at(950);
    w.b.emit('boss:defeated', { id: 'b1', defId: 'boss_root_tyrant', x: 0, y: 0 }); // (the same one again: the first time stands)
    const s = w.stats.snapshot(1000);
    expect(s.falls).toEqual({ ruins: 1, sunken_roots: 2 });
    expect(s.guardians).toEqual({ boss_root_tyrant: 1900 });
  });

  it('without the means to tell a zone it counts what it always did and nothing else (the snapshot has no tables)', () => {
    const stats = new PlayStats();
    stats.attach(bus(), 'r1_gate');
    expect(Object.keys(stats.snapshot(60)).sort()).toEqual(['deaths', 'kills', 'rooms', 'ticks']);
  });
});

