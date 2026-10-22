import { AudioEngine, type EngineOptions } from '@/audio/engine';
import { Levels } from '@/audio/levels';
import { SoundLoader, type LoaderIO, type LoaderOptions } from '@/audio/loader';
import type { AudioIndex, SoundDef, TrackDef } from '@/audio/manifest';
import type { AudioLevels } from '@/presentation/audioMix';
import { FakeContext, fakeBuffer } from './fakeAudio';

/** A sound of the manifest with the usual defaults; `files` is how many variations it has. */
export function sound(overrides: Partial<SoundDef> & { files?: number; seconds?: number; name?: string } = {}): SoundDef {
  const { files = 1, seconds = 0.4, name = 'x', ...rest } = overrides;
  return {
    bus: 'sfx',
    group: 'core',
    variants: Array.from({ length: files }, (_, k) => ({ opus: `sfx/${name}_${k + 1}.opus`, mp3: `sfx/${name}_${k + 1}.mp3`, seconds })),
    channels: 1,
    gainDb: 0,
    pitchCents: 0,
    gainJitterDb: 0,
    cooldownMs: 0,
    voices: 4,
    priority: 5,
    reverb: 0,
    ...rest,
  };
}

function loopOf(name: string, group: string, bus: 'music' | 'ambience', seconds: number, gainDb = 0): SoundDef {
  return sound({ name, group, bus, seconds, gainDb, channels: 2, voices: 1, priority: 10, loop: { start: 0, end: seconds } });
}

function track(group: string, layers: Record<string, string>, seconds: number): TrackDef {
  return { group, layers, seconds, bpm: 80, bars: 8 };
}

/** The sounds the conductor asks for by name, as the game's own manifest has them (the test manifest is smaller, so the conductor's table is exercised against these). */
function gameSounds(): Record<string, SoundDef> {
  const out: Record<string, SoundDef> = {};
  const add = (id: string, o: Partial<SoundDef> & { files?: number; seconds?: number } = {}): void => {
    out[id] = sound({ name: id.replace(/\./g, '_'), ...o });
  };
  for (const id of ['hero.slash.1', 'hero.slash.2', 'hero.slash.air', 'hero.slash.crouch']) add(id, { files: 2, voices: 2, priority: 7 });
  for (const id of ['hero.step.stone', 'hero.step.earth', 'hero.step.wet']) add(id, { files: 2, cooldownMs: 70, voices: 3, priority: 2 });
  for (const id of ['hero.jump', 'hero.jump.air', 'hero.dash.ground', 'hero.dash.air', 'hero.land.light', 'hero.land.medium', 'hero.land.heavy', 'hero.hurt.light', 'hero.hurt.heavy']) add(id, { priority: 6 });
  add('hero.death', { seconds: 2, priority: 10, voices: 1 });
  add('hero.respawn', { seconds: 2, priority: 9, voices: 1 });
  add('hero.heartbeat', { seconds: 0.6, priority: 3, voices: 1, cooldownMs: 300 });
  for (const id of ['hit.light', 'hit.bolt']) add(id, { files: 2, priority: 8 });
  for (const id of ['magic.cast.start', 'magic.cast.release', 'magic.bolt.fizzle', 'magic.denied', 'bottle.start', 'bottle.drunk', 'bottle.denied', 'bottle.interrupted', 'bottle.ready']) add(id, { priority: 5 });
  for (const id of ['interact.pickup', 'interact.open', 'interact.activate', 'interact.rest', 'gate.open', 'gate.close', 'seal.reject', 'seal.break', 'hazard.spikes', 'transition.pass']) add(id, { priority: 7 });
  for (const id of ['slime.alert', 'slime.telegraph', 'slime.lunge', 'slime.death']) add(id, { priority: 8 });
  for (const id of ['boss.wake', 'boss.phase', 'boss.death', 'boss.strike.charge', 'boss.strike.rain', 'boss.telegraph.charge', 'boss.telegraph.rain']) add(id, { group: 'boss', seconds: 1.5, priority: 10 });
  for (const id of ['stinger.card', 'stinger.unlock', 'stinger.victory']) add(id, { bus: 'music', channels: 2, seconds: 4, priority: 10, voices: 1 });
  for (const id of ['ui.pause.open', 'ui.pause.close', 'ui.slider', 'ui.toggle.on', 'ui.toggle.off', 'ui.save']) add(id, { bus: 'ui', priority: 5 });
  for (const id of ['amb.drip', 'amb.stone', 'amb.wind.gust']) add(id, { bus: 'ambience', priority: 2, files: 2 });
  return out;
}

/** A small manifest with every kind of sound the engine meets: effects (one, several variations, a short cooldown, a duck), a stinger, two pieces of music with a drive layer and a bed of ambience. */
export function makeIndex(): AudioIndex {
  return {
    version: 1,
    sampleRate: 48000,
    origin: 'test',
    sounds: {
      ...gameSounds(),
      'hero.slash': sound({ name: 'slash', files: 3, voices: 2, priority: 7, pitchCents: 100, gainJitterDb: 1 }),
      'hero.step': sound({ name: 'step', files: 4, cooldownMs: 70, voices: 3, priority: 2, reverb: 0.25 }),
      'hit.heavy': sound({ name: 'hit', files: 2, priority: 8, reverb: 0.2, duck: { db: -3, ms: 200 } }),
      'boss.roar': sound({ name: 'roar', group: 'solo', seconds: 2, priority: 10, voices: 1, cooldownMs: 3000, duck: { db: -6, ms: 1000 } }),
      'ui.tap': sound({ name: 'tap', bus: 'ui', priority: 5, cooldownMs: 60 }),
      'stinger.win': sound({ name: 'win', bus: 'music', channels: 2, seconds: 3, priority: 10, voices: 1 }),
      'wide.thing': sound({ name: 'wide', channels: 2 }),
      'music.a.base': loopOf('a_base', 'music.a', 'music', 30),
      'music.a.drive': loopOf('a_drive', 'music.a', 'music', 30, -2),
      'music.b.base': loopOf('b_base', 'music.b', 'music', 24),
      'music.b.drive': loopOf('b_drive', 'music.b', 'music', 24),
      'music.w.base': loopOf('w_base', 'music.w', 'music', 20),
      'music.w.drive': loopOf('w_drive', 'music.w', 'music', 20),
      'amb.hall': loopOf('hall', 'amb.hall', 'ambience', 16, -3),
      'amb.well': loopOf('well', 'amb.well', 'ambience', 18),
    },
    tracks: {
      a: track('music.a', { base: 'music.a.base', drive: 'music.a.drive' }, 30),
      b: track('music.b', { base: 'music.b.base', drive: 'music.b.drive' }, 24),
      warden: track('music.w', { base: 'music.w.base', drive: 'music.w.drive' }, 20),
      'bed.hall': track('amb.hall', { base: 'amb.hall' }, 16),
      'bed.well': track('amb.well', { base: 'amb.well' }, 18),
    },
  };
}

export interface RigOptions {
  levels?: Partial<AudioLevels>;
  context?: { running?: boolean; blocked?: boolean };
  index?: AudioIndex;
  engine?: Partial<EngineOptions>;
  loader?: Partial<LoaderOptions>;
  /** Paths (substrings) whose fetch fails; or a function. */
  failing?: string[] | ((url: string) => boolean);
}

export interface Rig {
  ctx: FakeContext;
  levels: Levels;
  index: AudioIndex;
  engine: AudioEngine;
  loader: SoundLoader;
  /** Every URL asked for, in order. */
  fetched: string[];
  /** Fetches in flight at the same time right now, and the most there ever were. */
  inFlight: { now: number; max: number };
  /** The fake clock timers of the loader (grace periods): `fire()` runs the ones due. */
  timers: { pending: Array<{ fn: () => void; ms: number; handle: number }>; fire(): void };
  /** Gets a context that can run and brings the engine to run. */
  start(): void;
  settle(): Promise<void>;
}

/** Everything the engine needs, wired to a fake context and a fake network, with a seeded random source. */
export function makeRig(o: RigOptions = {}): Rig {
  const index = o.index ?? makeIndex();
  const ctx = new FakeContext(o.context);
  const levels = new Levels(o.levels);
  const fetched: string[] = [];
  const inFlight = { now: 0, max: 0 };
  const seconds = new Map<string, number>();
  for (const s of Object.values(index.sounds)) for (const v of s.variants) for (const p of [v.opus, v.mp3]) if (p) seconds.set(p, v.seconds);
  const failing = o.failing;
  const fails = typeof failing === 'function' ? failing : (url: string): boolean => (failing ?? []).some((f) => url.includes(f));
  const io: LoaderIO = {
    async fetchBytes(url, signal) {
      fetched.push(url);
      inFlight.now++;
      inFlight.max = Math.max(inFlight.max, inFlight.now);
      try {
        await new Promise((r) => setTimeout(r, 1));
        if (signal.aborted) throw new Error('aborted');
        if (fails(url)) throw new Error('HTTP 404');
        const path = url.replace('https://t.test/audio/', '');
        const bytes = new ArrayBuffer(8);
        new Float32Array(bytes)[0] = seconds.get(path) ?? 0.3;
        return bytes;
      } finally {
        inFlight.now--;
      }
    },
    async decode(bytes) {
      const secs = new Float32Array(bytes)[0] ?? 0.3;
      return fakeBuffer(secs, 1);
    },
  };
  const timers = {
    pending: [] as Array<{ fn: () => void; ms: number; handle: number }>,
    fire(): void {
      const due = this.pending.splice(0);
      for (const t of due) t.fn();
    },
  };
  let handles = 0;
  const loader = new SoundLoader({
    index,
    baseUrl: 'https://t.test/audio/index.json',
    io,
    formats: ['opus', 'mp3'],
    timers: { set: (fn, ms) => { const handle = ++handles; timers.pending.push({ fn, ms, handle }); return handle; }, clear: (h) => { const i = timers.pending.findIndex((t) => t.handle === h); if (i >= 0) timers.pending.splice(i, 1); } },
    ...o.loader,
  });
  let n = 0;
  const engine = new AudioEngine({
    levels,
    index,
    loader,
    createContext: () => ctx.asAudioContext(),
    random: () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff),
    meter: true,
    ...o.engine,
  });
  return {
    ctx,
    levels,
    index,
    engine,
    loader,
    fetched,
    inFlight,
    timers,
    start() {
      ctx.allow();
      engine.unlock();
    },
    async settle() {
      for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 2));
    },
  };
}
