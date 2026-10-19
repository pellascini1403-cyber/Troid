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
