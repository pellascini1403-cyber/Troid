import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AudioDirector, CueLog, NO_AUDIO } from '@/audio/AudioDirector';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import { attackIntensity, AUDIO_CONTRACT, AUDIO_CUES, clamp01, hitIntensity, hurtIntensity, landIntensity, type AudioCueEvent } from '@/presentation/audioCues';

/**
 * THE CUES OF THE SOUND TO COME (docs/ART-PIPELINE-2D.md, part H): the moments a sound will be made for, each raised by a simulation event, with what a sound needs to
 * know. The game has no sound; these tests are what keeps its seam honest.
 */
function rig(options: { now?: () => number; skills?: string[] } = {}) {
  const bus = new EventBus<GameEvents>();
  const cues: AudioCueEvent[] = [];
  const director = new AudioDirector(bus, { cue: (e) => void cues.push({ ...e }) }, { now: options.now, projectileSkills: new Set(options.skills ?? ['spirit_bolt']) });
  return { bus, cues, director };
}

describe('the contract', () => {
  it('has a spec for every cue, and no spec for a cue that does not exist', () => {
    expect(Object.keys(AUDIO_CONTRACT).sort()).toEqual([...AUDIO_CUES].sort());
  });

  it('names the eleven moments the sound is made for: attack, hit, dash, hurt, death, the Spirit Bolt, the bottle, an interaction, the boss\'s attack and fall, a change of room', () => {
    for (const c of ['attack', 'hit', 'dash', 'hurt', 'death', 'boltCast', 'boltImpact', 'bottleStart', 'bottleDrunk', 'interact', 'bossAttack', 'bossDeath', 'roomTransition'] as const) {
      expect(AUDIO_CUES, c).toContain(c);
    }
  });

  it('names real events, and the director listens to exactly those', () => {
    const source = ['gameplay/events.ts', 'combat/CombatSystem.ts'].map((f) => readFileSync(resolve(__dirname, '../../../src', f), 'utf8')).join('\n');
    const catalogue = new Set([...source.matchAll(/'([a-z]+:[A-Za-z]+)':/g)].map((m) => m[1]!));
    const named = new Set(Object.values(AUDIO_CONTRACT).flatMap((c) => c.events));
    for (const e of named) expect(catalogue.has(e), `${e} is in the catalogue of the simulation`).toBe(true);
    const { bus } = rig();
    const listened = [...catalogue].filter((e) => bus.listenerCount(e as keyof GameEvents) > 0);
    expect(listened.sort()).toEqual([...named].sort());
  });
});

describe('the intensity of a cue: how strong, 0–1, and 1 when there is no magnitude', () => {
  it('a blow that lands is its damage over 2, and full when it kills', () => {
    expect(hitIntensity(1, false)).toBe(0.5);
    expect(hitIntensity(2, false)).toBe(1);
    expect(hitIntensity(5, false)).toBe(1);
    expect(hitIntensity(0.4, true)).toBe(1);
    expect(hurtIntensity(1)).toBe(0.5);
    expect(hurtIntensity(3)).toBe(1);
  });

  it('a landing is the speed it landed at over 20 m/s; the first blow of a chain is lighter than the finisher', () => {
    expect(landIntensity(10)).toBe(0.5);
    expect(landIntensity(26)).toBe(1);
    expect(landIntensity(0)).toBe(0);
    expect(attackIntensity(0)).toBe(0.7);
    expect(attackIntensity(1)).toBe(1);
  });

  it('never leaves 0–1, whatever the simulation says', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -4, 99]) {
      expect(clamp01(bad), String(bad)).toBeGreaterThanOrEqual(0);
      expect(clamp01(bad), String(bad)).toBeLessThanOrEqual(1);
      for (const f of [hurtIntensity, landIntensity]) expect(f(bad)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('AudioDirector: simulation events → cues (the simulation never knows it exists)', () => {
  it('a blow is a cue when its hitbox appears, with the attack as its kind and the finisher stronger', () => {
    const { bus, cues } = rig();
    const rect = { x0: 0, y0: 0, x1: 1, y1: 1 };
    bus.emit('player:attackActive', { attackId: 'slash_1', x: 4, y: 1, facing: 1, air: false, combo: 0, rect });
    bus.emit('player:attackActive', { attackId: 'slash_2', x: 4, y: 1, facing: 1, air: false, combo: 1, rect });
    expect(cues.map((c) => [c.cue, c.variant, c.intensity])).toEqual([['attack', 'slash_1', 0.7], ['attack', 'slash_2', 1]]);
    expect(cues[0]).toMatchObject({ x: 4, y: 1 });
  });

  it('a hit that lands on something else is a hit; one by a projectile is a bolt impact; a hit on the hero is neither (player:hurt owns it)', () => {
    const { bus, cues } = rig();
    const hit = { attackerId: 'p', targetId: 'e', damage: 1, x: 7, y: 2, direction: 1 as const, killed: false, hitStop: 4, shake: 0.1 };
    bus.emit('combat:hit', { ...hit, attackId: 'slash_1', targetTeam: 'enemy' });
    bus.emit('combat:hit', { ...hit, attackId: 'spirit_bolt', targetTeam: 'neutral', killed: true });
    bus.emit('combat:hit', { ...hit, attackId: 'bite', targetTeam: 'player' });
    expect(cues.map((c) => [c.cue, c.variant, c.intensity])).toEqual([['hit', 'slash_1', 0.5], ['boltImpact', 'spirit_bolt', 1]]);
    expect(cues[0]).toMatchObject({ x: 7, y: 2 });
  });

  it('the hero\'s own moments: dash, jump (from the ground and in the air), landing, hurt, death', () => {
    const { bus, cues } = rig();
    bus.emit('player:dashed', { x: 1, y: 0, facing: 1, air: false });
    bus.emit('player:dashed', { x: 2, y: 3, facing: -1, air: true });
    bus.emit('player:jumped', { x: 1, y: 0, air: false });
    bus.emit('player:jumped', { x: 1, y: 2, air: true });
    bus.emit('player:landed', { x: 1, y: 0, impact: 15 });
    bus.emit('player:hurt', { x: 1, y: 1, damage: 1, direction: 1 });
    bus.emit('player:died', { x: 1, y: 0 });
    expect(cues.map((c) => [c.cue, c.variant, c.intensity])).toEqual([
      ['dash', 'ground', 1], ['dash', 'air', 1], ['jump', 'ground', 1], ['jump', 'air', 1], ['land', '', 0.75], ['hurt', '', 0.5], ['death', '', 1],
    ]);
  });

  it('the Spirit Bolt, the bottle and an interaction: where they happen and which kind', () => {
    const { bus, cues } = rig();
    bus.emit('skill:cast', { skillId: 'spirit_bolt', x: 3, y: 1, facing: 1, cost: 30 });
    bus.emit('bottle:drinkStarted', { slot: 0, x: 3, y: 0, ticks: 24 });
    bus.emit('bottle:drunk', { slot: 0, healed: 2, x: 3, y: 0 });
    bus.emit('interaction:performed', { id: 'card', kind: 'pickup', verbKey: 'interact.pickUp', x: 12, y: 1.2 });
    expect(cues.map((c) => [c.cue, c.variant, c.intensity, c.x, c.y])).toEqual([
      ['boltCast', 'spirit_bolt', 1, 3, 1], ['bottleStart', '', 1, 3, 0], ['bottleDrunk', '', 1, 3, 0], ['interact', 'pickup', 1, 12, 1.2],
    ]);
  });

  it('the boss: each strike is a cue (the rain raises one per mark on the same tick), its fall is one, and what it winds up is a telegraph', () => {
    const { bus, cues } = rig();
    for (const x of [28, 31.4, 34.8]) bus.emit('boss:strike', { id: 'b', defId: 'ink_warden', attack: 'warden_rain', x, y: 0, w: 1.7 });
    bus.emit('enemy:telegraph', { id: 'b', defId: 'ink_warden', x: 30, y: 0.45, facing: -1, ticks: 40 });
    bus.emit('boss:defeated', { id: 'b', defId: 'ink_warden', x: 30, y: 0 });
    bus.emit('actor:died', { id: 'b', team: 'enemy', x: 30, y: 0 });
    expect(cues.map((c) => [c.cue, c.variant])).toEqual([
      ['bossAttack', 'warden_rain'], ['bossAttack', 'warden_rain'], ['bossAttack', 'warden_rain'], ['enemyTelegraph', 'ink_warden'], ['bossDeath', 'ink_warden'], ['enemyDeath', ''],
    ]);
    expect(cues.slice(0, 3).map((c) => c.x)).toEqual([28, 31.4, 34.8]);
  });

  it('an enemy dying is a cue and the hero dying is not THAT one (player:died owns it)', () => {
    const { bus, cues } = rig();
    bus.emit('actor:died', { id: 'p', team: 'player', x: 0, y: 0 });
    expect(cues).toEqual([]);
    bus.emit('actor:died', { id: 's', team: 'enemy', x: 5, y: 0 });
    expect(cues.map((c) => c.cue)).toEqual(['enemyDeath']);
  });

  it('a change of room has no place: the sound of it does not come from anywhere', () => {
    const { bus, cues } = rig();
    bus.emit('transition:started', { from: 'r1_gate', exitId: 'east', to: { room: 'r2_hall', entry: 'west' }, ticks: 80 });
    expect(cues).toEqual([{ cue: 'roomTransition', tick: 0, x: null, y: null, intensity: 1, variant: 'r2_hall' }]);
  });

  it('every cue says when: the tick of the simulation it was raised on', () => {
    let tick = 41;
    const { bus, cues } = rig({ now: () => tick });
    bus.emit('player:dashed', { x: 0, y: 0, facing: 1, air: false });
    tick = 97;
    bus.emit('player:died', { x: 0, y: 0 });
    expect(cues.map((c) => c.tick)).toEqual([41, 97]);
  });

  it('stops listening when it is disposed, and leaves nothing on the bus', () => {
    const { bus, cues, director } = rig();
    expect(bus.listenerCount()).toBeGreaterThan(10);
    director.dispose();
    expect(bus.listenerCount()).toBe(0);
    bus.emit('player:died', { x: 0, y: 0 });
    expect(cues).toEqual([]);
    director.dispose(); // idempotent
  });

  it('positions are numbers where the cue says it has a place, and null where it says it has none', () => {
    const { bus, cues } = rig();
    bus.emit('player:attackActive', { attackId: 'slash_1', x: 1, y: 2, facing: 1, air: false, combo: 0, rect: { x0: 0, y0: 0, x1: 1, y1: 1 } });
    bus.emit('transition:started', { from: 'a', exitId: 'e', to: { room: 'b', entry: 'c' }, ticks: 10 });
    for (const c of cues) expect(c.x === null, c.cue).toBe(!AUDIO_CONTRACT[c.cue].positional);
  });
});

describe('CueLog: what the development build and the tests look at', () => {
  const event = (cue: AudioCueEvent['cue'], tick: number): AudioCueEvent => ({ cue, tick, x: 0, y: 0, intensity: 1, variant: '' });

  it('counts every cue and keeps the last ones, oldest first, without growing', () => {
    const log = new CueLog(3);
    for (let i = 0; i < 5; i++) log.cue(event(i % 2 ? 'hit' : 'attack', i));
    const s = log.snapshot();
    expect(s.total).toBe(5);
    expect(s.counts).toEqual({ attack: 3, hit: 2 });
    expect(s.recent.map((e) => e.tick)).toEqual([2, 3, 4]);
  });

  it('hands out copies: reading it cannot change it, and what it was given cannot change it later', () => {
    const log = new CueLog();
    const e = event('dash', 1);
    log.cue(e);
    e.cue = 'death';
    const s = log.snapshot();
    expect(s.recent[0]!.cue).toBe('dash');
    s.recent[0]!.cue = 'hurt';
    s.counts.dash = 99;
    expect(log.snapshot().recent[0]!.cue).toBe('dash');
    expect(log.snapshot().counts.dash).toBe(1);
  });

  it('forgets on `clear`', () => {
    const log = new CueLog();
    log.cue(event('dash', 1));
    log.clear();
    expect(log.snapshot()).toEqual({ total: 0, counts: {}, recent: [] });
  });

  it('a game with no sound has a sink that does nothing', () => {
    expect(() => NO_AUDIO.cue(event('dash', 1))).not.toThrow();
  });
});
