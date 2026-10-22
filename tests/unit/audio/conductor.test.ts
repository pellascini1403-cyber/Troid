import { describe, expect, it } from 'vitest';
import { AmbientScatter } from '@/audio/ambience';
import { AudioDirector } from '@/audio/AudioDirector';
import { Conductor, FADE, LOW_LIFE, THREAT } from '@/audio/conductor';
import { LoopChannel } from '@/audio/loops';
import type { ZoneAudio } from '@/audio/zoneAudio';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import { makeRig, type Rig } from '../../helpers/audioRig';
import { FakeGain, type FakeBiquad, type FakeConvolver, type FakeSource } from '../../helpers/fakeAudio';

/** A world of four rooms that share the pieces the way the game's do: r1 and r2 the same music under different beds, r3 its own, r4 the quiet one before a boss. */
const ROOM = { rt60: 1.2, damp: 0.5, predelayMs: 10, wet: 0.3 };
const TABLE: Record<string, ZoneAudio> = {
  r1: { track: 'a', bed: 'bed.hall', surface: 'stone', room: ROOM, scatter: [{ id: 'amb.drip', gap: [2, 4], distance: [5, 10] }] },
  r2: { track: 'a', bed: 'bed.well', surface: 'earth', room: { ...ROOM, rt60: 0.8 }, scatter: [{ id: 'amb.stone', gap: [2, 4], distance: [5, 10] }] },
  r3: { track: 'b', bed: 'bed.hall', surface: 'wet', room: { ...ROOM, rt60: 2.4 }, scatter: [] },
  r4: { track: 'a', bed: 'bed.well', surface: 'stone', room: ROOM, scatter: [], groups: ['boss'] },
};
const zones = (id: string): ZoneAudio => TABLE[id] ?? { track: null, bed: null, surface: 'stone', room: ROOM, scatter: [] };

interface Setup {
  rig: Rig;
  bus: EventBus<GameEvents>;
  music: LoopChannel;
  ambience: LoopChannel;
  scatter: AmbientScatter;
  conductor: Conductor;
  cues: string[];
  /** Every sound the engine started, in order. */
  plays: string[];
  /** Runs `seconds` of game time in frames of 50 ms (the audio clock moves with it), paused or not. */
  run(seconds: number, frame?: { life?: number; dead?: boolean }, world?: boolean): void;
  /** The looped sources of the music (the beds are shorter than any piece). */
  loops(): FakeSource[];
}

async function setup(options: { room?: string; levels?: Parameters<typeof makeRig>[0] } = {}): Promise<Setup> {
  const rig = makeRig(options.levels);
  const bus = new EventBus<GameEvents>();
  bus.onError = (e) => {
    throw e;
  };
  const music = new LoopChannel({ engine: rig.engine, loader: rig.loader, index: rig.index, levels: rig.levels, bus: 'music' });
  const ambience = new LoopChannel({ engine: rig.engine, loader: rig.loader, index: rig.index, levels: rig.levels, bus: 'ambience' });
  let n = 7;
  const scatter = new AmbientScatter(rig.engine, () => ((n = (n * 16807) % 2147483647) / 2147483647));
  const conductor = new Conductor({ engine: rig.engine, music, ambience, scatter, bus, room: options.room ?? 'r1', zones, hasTrack: (id) => Boolean(rig.index.tracks[id]), loader: rig.loader });
  const cues: string[] = [];
  const plays: string[] = [];
  const play = rig.engine.play.bind(rig.engine);
  rig.engine.play = (req) => {
    const ok = play(req);
    if (ok) plays.push(req.id);
    return ok;
  };
  new AudioDirector(bus, { cue: (e) => { cues.push(e.cue); conductor.cue(e); } }, { now: () => 0 });
  rig.start();
  await rig.loader.retain('core');
  const s: Setup = {
    rig, bus, music, ambience, scatter, conductor, cues, plays,
    run(seconds, frame = {}, world = true) {
      for (let t = 0; t < seconds - 1e-9; t += 0.05) {
        rig.ctx.advance(0.05);
        conductor.update(world ? 0.05 : 0, { x: 10, y: 0, ...frame });
      }
    },
    loops: () => rig.ctx.sources.filter((x) => x.loop && !x.ended && x.startedAt !== null && x.stoppedAt === null && (x.buffer?.duration ?? 0) >= 20),
  };
  await rig.settle();
  s.run(0.1);
  return s;
}

const hasBoss = { id: 'warden', defId: 'ink_warden', nameKey: 'boss.warden', health: 30, maxHealth: 30, x: 58, y: 0 };

describe('Conductor: what each cue sounds like', () => {
  it('plays the sound the table names for a cue, from where it happened', async () => {
    const s = await setup();
    s.bus.emit('player:attackActive', { attackId: 'slash_2', x: 14, y: 1, facing: 1, air: false, combo: 1, rect: { x0: 0, y0: 0, x1: 1, y1: 1 } });
    expect(s.rig.engine.stats().recent.at(-1)).toBe('hero.slash.2');
    s.bus.emit('combat:hit', { attackerId: 'p', targetId: 'e', attackId: 'slash_2', targetTeam: 'enemy', damage: 1, x: 15, y: 1, direction: 1, killed: false, hitStop: 2, shake: 0 });
    expect(s.rig.engine.stats().recent.at(-1)).toBe('hit.light');
    expect(s.cues).toEqual(['attack', 'hit']);
  });

  it('chooses the sound of the floor by the room the hero is in', async () => {
    const s = await setup();
    const walk = (room: string): string => {
      s.bus.emit('room:loaded', { roomId: room, entryId: 'west' });
      s.run(0.2);
      s.bus.emit('player:stepped', { x: 10, y: 0, speed: 8.5, crouch: false });
      return s.rig.engine.stats().recent.at(-1) as string;
    };
    expect(walk('r1')).toBe('hero.step.stone');
    expect(walk('r2')).toBe('hero.step.earth');
    expect(walk('r3')).toBe('hero.step.wet');
    expect(walk('r4')).toBe('hero.step.stone');
  });

  it('does not sound the shrine twice: the object is silent and the checkpoint is the rest', async () => {
    const s = await setup();
    s.bus.emit('interaction:performed', { id: 'shrine', kind: 'rest', verbKey: 'interact.rest', x: 12, y: 0 });
    expect(s.rig.engine.stats().played).toBe(0);
    s.bus.emit('checkpoint:set', { room: 'r2', entry: 'rest', x: 12, y: 0 });
    expect(s.rig.engine.stats().recent).toEqual(['interact.rest']);
  });

  it('plays a landing only if it is one: a step down a ledge is silent', async () => {
    const s = await setup();
    s.bus.emit('player:landed', { x: 1, y: 0, impact: 1 });
    expect(s.rig.engine.stats().played).toBe(0);
    s.bus.emit('player:landed', { x: 1, y: 0, impact: 18 });
    expect(s.rig.engine.stats().recent).toEqual(['hero.land.heavy']);
  });

  it('sounds the sounds of the interface, in a pause too', async () => {
    const s = await setup();
    s.conductor.ui('tap');
    s.conductor.setPaused(true);
    s.run(0.2);
    s.conductor.ui('slider');
    expect(s.rig.engine.stats().recent).toEqual(['ui.tap', 'ui.slider']);
  });

  it('plays only the biggest of the stingers of one moment: a card that teaches a power sounds as the power', async () => {
    const s = await setup();
    s.bus.emit('card:changed', { type: 'acquired', cardId: 'card_spirit_bolt' });
    s.bus.emit('ability:unlocked', { id: 'magic_attack' });
    s.run(0.1);
    const stingers = (): string[] => s.plays.filter((id) => id.startsWith('stinger.'));
    expect(stingers()).toEqual(['stinger.unlock']);
    s.run(6);
    s.bus.emit('card:changed', { type: 'acquired', cardId: 'other' });
    s.run(0.1);
    expect(stingers()).toEqual(['stinger.unlock', 'stinger.card']);
  });

  it('gives the boss\'s fall its victory after the fall has begun', async () => {
    const s = await setup({ room: 'r4' });
    s.bus.emit('boss:started', hasBoss);
    s.bus.emit('boss:defeated', { id: 'warden', defId: 'ink_warden', x: 58, y: 0 });
    s.run(0.1);
    expect(s.plays).toContain('boss.death');
    expect(s.plays).toContain('stinger.victory');
  });
});

describe('Conductor: the music follows the place, and does not restart', () => {
  it('plays the piece of the room the game starts in once the engine runs', async () => {
    const s = await setup();
    expect(s.music.stats().current).toBe('a');
    expect(s.loops().filter((x) => x.buffer?.duration === 30)).toHaveLength(2);
    expect(s.ambience.stats().current).toBe('bed.hall');
  });

  it('goes on through a door between two places that share a piece: no new source, no fade, only the bed changes', async () => {
    const s = await setup();
    s.run(5);
    const before = s.loops().filter((x) => x.buffer?.duration === 30);
    s.bus.emit('room:loaded', { roomId: 'r2', entryId: 'west' });
    await s.rig.settle();
    s.run(6);
    expect(s.music.stats().current).toBe('a');
    expect(s.music.stats().leaving).toEqual([]);
    expect(s.loops().filter((x) => x.buffer?.duration === 30)).toEqual(before);
    expect(s.rig.ctx.sources.filter((x) => x.loop && x.buffer?.duration === 30)).toHaveLength(2); // never a second copy
    expect(s.ambience.stats().current).toBe('bed.well');
  });

  it('crossfades to the piece of another place, and back, without ever stacking copies', async () => {
    const s = await setup();
    s.run(4);
    s.bus.emit('room:loaded', { roomId: 'r3', entryId: 'west' });
    await s.rig.settle();
    s.run(1);
    expect(s.music.stats().current).toBe('b');
    expect(s.music.stats().leaving).toEqual(['a']);
    s.run(FADE.zone + 2);
    expect(s.music.stats().leaving).toEqual([]);
    s.bus.emit('room:loaded', { roomId: 'r1', entryId: 'east' });
    await s.rig.settle();
    s.run(FADE.zone + 2);
    expect(s.music.stats().current).toBe('a');
    expect(s.loops()).toHaveLength(2);
  });

  it('does not restart when the same room is built again (a respawn, a reload): nothing changes, not even the echo', async () => {
    const s = await setup();
    s.run(3);
    const convolvers = s.rig.ctx.nodes.filter((n) => n.kind === 'convolver').length;
    const sources = s.rig.ctx.sources.length;
    for (let i = 0; i < 5; i++) {
      s.bus.emit('room:loaded', { roomId: 'r1', entryId: 'start' });
      s.run(0.2);
    }
    expect(s.rig.ctx.nodes.filter((n) => n.kind === 'convolver')).toHaveLength(convolvers);
    expect(s.rig.ctx.sources).toHaveLength(sources);
    expect(s.music.stats().leaving).toEqual([]);
  });

  it('gives each room its own echo, made for it', async () => {
    const s = await setup();
    s.bus.emit('room:loaded', { roomId: 'r3', entryId: 'west' });
    const convolvers = s.rig.ctx.nodes.filter((n): n is FakeConvolver => n.kind === 'convolver');
    expect(convolvers.at(-1)?.buffer?.duration).toBeCloseTo(2.4 * 1.15, 1);
  });

  it('is silent in a room that has no sound of its own, and plays nothing there', async () => {
    const s = await setup();
    s.bus.emit('room:loaded', { roomId: 'playground', entryId: 'start' });
    await s.rig.settle();
    s.run(FADE.silence + 2);
    expect(s.music.stats().current).toBeNull();
    expect(s.ambience.stats().current).toBeNull();
    expect(s.loops()).toHaveLength(0);
  });

  it('holds the sounds that only a place needs while the hero is in it, and lets go when they leave', async () => {
    const s = await setup();
    expect(s.rig.loader.stats().groups['boss']?.refs ?? 0).toBe(0);
    s.bus.emit('room:loaded', { roomId: 'r4', entryId: 'west' });
    await s.rig.settle();
    expect(s.rig.loader.has('boss.wake')).toBe(true);
    expect(s.rig.loader.stats().groups['boss']?.refs).toBe(1);
    s.bus.emit('room:loaded', { roomId: 'r3', entryId: 'east' });
    expect(s.rig.loader.stats().groups['boss']?.refs).toBe(0);
  });

  it('asks for no piece the manifest does not have: a zone that names a missing piece is as silent as one that names none', async () => {
    const s = await setup();
    const warnings: string[] = [];
    const music = new LoopChannel({ engine: s.rig.engine, loader: s.rig.loader, index: s.rig.index, levels: s.rig.levels, bus: 'music', warn: (m) => warnings.push(m) });
    const other = new Conductor({ engine: s.rig.engine, music, ambience: s.ambience, scatter: s.scatter, bus: new EventBus<GameEvents>(), room: 'x', zones: () => ({ ...TABLE['r1']!, track: 'missing' }), hasTrack: (id) => Boolean(s.rig.index.tracks[id]) });
    expect(music.stats().wanted).toBeNull();
    expect(warnings).toEqual([]);
    other.dispose();
  });
});

describe('Conductor: the drive of the music follows the danger', () => {
  it('brings the drive layer in when an enemy notices the hero, and lets it go after the danger has been over for a while', async () => {
    const s = await setup();
    s.run(2);
    expect(s.music.stats().layers['drive']).toBe(0);
    s.bus.emit('enemy:alerted', { id: 's', defId: 'ink_slime', x: 20, y: 0 });
    s.run(0.1);
    expect(s.music.stats().layers['drive']).toBe(1);
    s.run(THREAT.hold - 0.5);
    expect(s.music.stats().layers['drive']).toBe(1);
    s.run(1);
    expect(s.music.stats().layers['drive']).toBe(0);
  });

  it('keeps the danger up as long as things keep happening, and ends it soon after the last enemy dies', async () => {
    const s = await setup();
    s.bus.emit('enemy:alerted', { id: 's', defId: 'ink_slime', x: 20, y: 0 });
    s.run(5);
    s.bus.emit('enemy:telegraph', { id: 's', defId: 'ink_slime', x: 20, y: 0, facing: -1, ticks: 24, attack: 'slime_lunge' });
    s.run(5);
    expect(s.music.stats().layers['drive']).toBe(1);
    s.bus.emit('actor:died', { id: 's', team: 'enemy', x: 20, y: 0 });
    s.run(THREAT.afterKill + 0.3);
    expect(s.music.stats().layers['drive']).toBe(0);
  });

  it('is a threat that belongs to the room it was met in, and a hero who is down brings none', async () => {
    const s = await setup();
    s.bus.emit('enemy:alerted', { id: 's', defId: 'ink_slime', x: 20, y: 0 });
    s.run(0.1);
    s.bus.emit('room:loaded', { roomId: 'r2', entryId: 'west' });
    s.run(0.1);
    expect(s.music.stats().layers['drive']).toBe(0);
    s.bus.emit('death:started', { x: 1, y: 0 });
    s.bus.emit('enemy:alerted', { id: 's', defId: 'ink_slime', x: 20, y: 0 });
    s.run(0.1);
    expect(s.music.stats().layers['drive']).toBe(0);
  });

  it('keeps game time: nothing of it moves while the game is paused', async () => {
    const s = await setup();
    s.bus.emit('enemy:alerted', { id: 's', defId: 'ink_slime', x: 20, y: 0 });
    s.run(0.1);
    s.conductor.setPaused(true);
    s.run(60, {}, false);
    expect(s.music.stats().layers['drive']).toBe(1);
    s.conductor.setPaused(false);
    s.run(THREAT.hold + 0.3);
    expect(s.music.stats().layers['drive']).toBe(0);
  });
});

describe('Conductor: the boss', () => {
  it('has a piece of its own that comes in fast, with part of the drive, and all of it when the boss turns', async () => {
    const s = await setup({ room: 'r4' });
    s.run(3);
    expect(s.music.stats().current).toBe('a');
    s.bus.emit('boss:started', hasBoss);
    await s.rig.settle();
    s.run(0.5);
    expect(s.music.stats().current).toBe('warden');
    expect(s.music.stats().layers['drive']).toBeCloseTo(0.45, 6);
    s.bus.emit('boss:phase', { id: 'warden', defId: 'ink_warden', phase: 2, x: 50, y: 0 });
    expect(s.music.stats().layers['drive']).toBe(1);
    s.run(FADE.bossIn + 2);
    expect(s.music.stats().leaving).toEqual([]);
    expect(s.loops()).toHaveLength(2);
  });

  it('goes quiet for the fall, and the calm comes back after it, slowly', async () => {
    const s = await setup({ room: 'r4' });
    s.bus.emit('boss:started', hasBoss);
    await s.rig.settle();
    s.run(3);
    s.bus.emit('boss:defeated', { id: 'warden', defId: 'ink_warden', x: 58, y: 0 });
    s.run(0.2);
    expect(s.music.stats().wanted).toBeNull();
    s.run(2.5);
    await s.rig.settle();
    s.run(0.2);
    expect(s.music.stats().current).toBe('a');
    expect(s.music.stats().layers['drive']).toBe(0);
  });

  it('is back to the calm of the room when the hero falls in the fight and returns, whatever the order of the events', async () => {
    const s = await setup({ room: 'r4' });
    s.bus.emit('boss:started', hasBoss);
    await s.rig.settle();
    s.run(2);
    s.bus.emit('death:started', { x: 40, y: 0 });
    s.run(0.2);
    expect(s.rig.ctx.nodes.length).toBeGreaterThan(0);
    s.bus.emit('death:respawned', { roomId: 'r4', entryId: 'rest' });
    s.bus.emit('room:loaded', { roomId: 'r4', entryId: 'rest' });
    await s.rig.settle();
    s.run(FADE.bossOut + 2);
    expect(s.music.stats().current).toBe('a');
    expect(s.conductor.state()).toMatchObject({ boss: 'none', dead: false });
    expect(s.loops()).toHaveLength(2);
  });

  it('dims and dulls the music while the hero is down and gives it back when they return', async () => {
    const s = await setup();
    const colour = s.rig.ctx.nodes.find((n): n is FakeBiquad => n.kind === 'biquad') as FakeBiquad;
    const duck = s.rig.ctx.nodes.find((n): n is FakeGain => n instanceof FakeGain && n.outputs.includes(colour)) as FakeGain;
    s.bus.emit('death:started', { x: 1, y: 0 });
    expect(s.conductor.state().dead).toBe(true);
    const t = s.rig.ctx.currentTime;
    expect(duck.gain.valueAt(t + 3)).toBeCloseTo(10 ** (-13 / 20), 2);
    expect(Math.abs(colour.frequency.valueAt(t + 3) - 800)).toBeLessThan(5);
    s.run(1);
    s.bus.emit('death:respawned', { roomId: 'r1', entryId: 'start' });
    expect(s.conductor.state().dead).toBe(false);
    const t2 = s.rig.ctx.currentTime;
    expect(duck.gain.valueAt(t2 + 4)).toBeCloseTo(1, 2);
    expect(colour.frequency.valueAt(t2 + 4)).toBeGreaterThan(20000);
  });

  it('keeps the music dimmed through a pause as well, and does not mix the two up', async () => {
    const s = await setup();
    const colour = s.rig.ctx.nodes.find((n): n is FakeBiquad => n.kind === 'biquad') as FakeBiquad;
    const duck = s.rig.ctx.nodes.find((n): n is FakeGain => n instanceof FakeGain && n.outputs.includes(colour)) as FakeGain;
    s.conductor.setPaused(true);
    s.bus.emit('death:started', { x: 1, y: 0 });
    s.bus.emit('death:respawned', { roomId: 'r1', entryId: 'start' }); // the hero is back, the menu is still open
    expect(duck.gain.valueAt(s.rig.ctx.currentTime + 4)).toBeCloseTo(10 ** (-8 / 20), 2);
    s.conductor.setPaused(false);
    expect(duck.gain.valueAt(s.rig.ctx.currentTime + 4)).toBeCloseTo(1, 2);
  });
});

describe('Conductor: the heart of a hero who is nearly dead', () => {
  it('beats now and then while their life is low, faster the lower it is, and never otherwise', async () => {
    const s = await setup();
    const beats = (): number => s.plays.filter((id) => id === 'hero.heartbeat').length;
    s.run(5, { life: 1 });
    expect(beats()).toBe(0);
    s.run(5, { life: LOW_LIFE + 0.01 });
    expect(beats()).toBe(0);
    s.run(1.2, { life: 0.3 });
    expect(beats()).toBe(1); // the first beat comes after a moment, not on top of the blow
    s.run(10, { life: 0.3 });
    const slow = beats();
    expect(slow).toBeGreaterThan(5);
    s.run(10, { life: 0.05 });
    expect(beats() - slow).toBeGreaterThan(slow);
  });

  it('stops when they are healed, when they are down and when the game is paused', async () => {
    const s = await setup();
    const beats = (): number => s.plays.filter((id) => id === 'hero.heartbeat').length;
    s.run(4, { life: 0.2 });
    const n = beats();
    expect(n).toBeGreaterThan(0);
    s.run(4, { life: 0.9 });
    expect(beats()).toBe(n);
    s.run(3, { life: 0.1, dead: true });
    expect(beats()).toBe(n);
    s.conductor.setPaused(true);
    s.run(5, { life: 0.1 }, false);
    expect(beats()).toBe(n);
  });
});

describe('Conductor: the small sounds of a place', () => {
  it('plays them now and then from either side, in game time, and none of them while paused', async () => {
    const s = await setup({ levels: { levels: { ambience: 1 } } });
    s.run(60);
    const played = s.rig.engine.stats().recent.filter((id) => id === 'amb.drip').length;
    expect(played).toBeGreaterThan(5);
    expect(played).toBeLessThan(40); // not constantly
    const count = s.scatter.count;
    s.conductor.setPaused(true);
    s.run(120, {}, false);
    expect(s.scatter.count).toBe(count);
  });

  it('changes with the room', async () => {
    const s = await setup();
    expect(s.scatter.ids).toEqual(['amb.drip']);
    s.bus.emit('room:loaded', { roomId: 'r2', entryId: 'west' });
    expect(s.scatter.ids).toEqual(['amb.stone']);
    s.bus.emit('room:loaded', { roomId: 'r3', entryId: 'west' });
    expect(s.scatter.ids).toEqual([]);
  });
});

describe('Conductor: being put away', () => {
  it('leaves nothing listening on the bus and holds no group', async () => {
    const s = await setup({ room: 'r4' });
    await s.rig.settle();
    const bus = s.bus;
    const withConductor = bus.listenerCount();
    s.conductor.dispose();
    expect(bus.listenerCount()).toBeLessThan(withConductor);
    expect(s.rig.loader.stats().groups['boss']?.refs).toBe(0);
    bus.emit('boss:started', hasBoss);
    expect(s.music.stats().wanted).toBe('a'); // it heard nothing
  });
});
