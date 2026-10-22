import { AmbientScatter } from '@/audio/ambience';
import { AudioDirector, type CueLog } from '@/audio/AudioDirector';
import { Conductor, type AudioFrame } from '@/audio/conductor';
import { AudioEngine, type EngineStats, type PlayRequest } from '@/audio/engine';
import type { Levels } from '@/audio/levels';
import { decodeWith, fetchBytes, SoundLoader } from '@/audio/loader';
import { LoopChannel, type ChannelStats } from '@/audio/loops';
import { parseIndex, playableFormats, type AudioFormat } from '@/audio/manifest';
import type { UiSoundKind } from '@/audio/soundMap';
import type { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import type { AudioCueEvent, AudioSink } from '@/presentation/audioCues';

/**
 * THE SOUND OF THE GAME, as ONE module that is loaded after the first frame (docs/PROMPT18-LOG.md, the bundle budget): the engine, the music, the ambience and the conductor are code the first minute of play does not
 * need until the first gesture, so — like the effects, the overlays and the art — they are a chunk of their own. `Game2D` fetches it when the page is idle and feeds it exactly as it always fed the cues; until it arrives the
 * game is silent, which no rule of the game depends on.
 *
 * It makes the cue director (the one thing that listens to the simulation for sound), and gives its cues to a log (the development build and the tests look at what the sound was told) and to the conductor. With the
 * sound off (`?audio=off`, or a page with no sound files) there is no engine, no fetch and no context — only the log.
 */
export interface AudioSystem {
  readonly director: AudioDirector;
  /** `false`: no sound is made (switched off, or nothing to play). */
  readonly sounding: boolean;
  /** One frame: `dt` is the seconds the GAME ran (0 while it is paused or held), `frame` where the hero is and how they are. */
  update(dt: number, frame: AudioFrame): void;
  setPaused(paused: boolean): void;
  /** The page went to the background (or came back). */
  setHidden(hidden: boolean): void;
  /** A sound of the interface. */
  ui(kind: UiSoundKind): void;
  /** Lets the browser make sound (call it from a gesture of the person). */
  unlock(): void;
  /** Plays a sound of the manifest by id (the tests and the development tools). */
  play(request: PlayRequest): boolean;
  snapshot(): AudioSnapshot | null;
  dispose(): void;
}

export interface AudioSnapshot {
  engine: EngineStats;
  levels: ReturnType<Levels['snapshot']>;
  music: ChannelStats;
  ambience: ChannelStats;
  conductor: ReturnType<Conductor['state']>;
  loader: ReturnType<SoundLoader['stats']>;
  /** What is going out of the speakers right now (only with the meter, in a development build or under `?hooks=1`). */
  meter: { rms: number; peak: number } | null;
  formats: AudioFormat[];
  sounds: number;
  tracks: number;
}

export interface AudioOptions {
  bus: EventBus<GameEvents>;
  levels: Levels;
  /** The simulation's clock, stamped on every cue. */
  now: () => number;
  projectileSkills: ReadonlySet<string>;
  /** Where the cues are written down (a development build, `?hooks=1`). */
  cueLog: CueLog | null;
  /** Make sound. */
  enabled: boolean;
  /** The absolute URL of `index.json`, or null when the page has none. */
  indexUrl: string | null;
  /** The room the game starts in. */
  room: string;
  /** Adds the meter on the output. */
  meter: boolean;
  warn: (message: string) => void;
}

/** Any of these in the page lets the browser make sound (a key, a click, a tap; a gamepad button is not one — browsers do not count it). */
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click'] as const;

export async function createAudio(o: AudioOptions): Promise<AudioSystem> {
  let conductor: Conductor | null = null;
  const sink: AudioSink = {
    cue(event: Readonly<AudioCueEvent>) {
      o.cueLog?.cue(event);
      conductor?.cue(event);
    },
  };
  const director = new AudioDirector(o.bus, sink, { now: o.now, projectileSkills: o.projectileSkills });
  const silent: AudioSystem = {
    director,
    sounding: false,
    update: () => undefined,
    setPaused: () => undefined,
    setHidden: () => undefined,
    ui: () => undefined,
    unlock: () => undefined,
    play: () => false,
    snapshot: () => null,
    dispose: () => director.dispose(),
  };
  if (!o.enabled || o.indexUrl === null) return silent;

  let index;
  try {
    const response = await fetch(o.indexUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    index = parseIndex(await response.json());
  } catch (err) {
    o.warn(`audio: the manifest could not be read (${err instanceof Error ? err.message : String(err)}); the game plays without sound`);
    return silent;
  }
  if (!index) {
    o.warn('audio: the manifest is not one; the game plays without sound');
    return silent;
  }
  const probe = typeof document !== 'undefined' ? document.createElement('audio') : null;
  const formats = probe ? playableFormats((mime) => probe.canPlayType(mime)) : [];
  if (formats.length === 0) {
    o.warn('audio: this browser plays none of the formats of the files; the game plays without sound');
    return silent;
  }

  // The files are decoded by a context that needs no gesture (an offline one), so that the first sound after the first touch is already there; the engine's own context is made by the touch.
  const OfflineCtor = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext ?? (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  let offline: OfflineAudioContext | null = null;
  try {
    offline = OfflineCtor ? new OfflineCtor(1, 1, 48000) : null;
  } catch {
    offline = null;
  }
  let engine: AudioEngine | null = null;
  const loader = new SoundLoader({
    index,
    baseUrl: o.indexUrl,
    formats,
    warn: o.warn,
    io: {
      fetchBytes,
      decode: (bytes) => {
        const ctx = offline ?? engine?.context ?? null;
        return ctx ? decodeWith(ctx, bytes) : Promise.reject(new Error('there is no audio context to decode with'));
      },
    },
  });
  engine = new AudioEngine({ levels: o.levels, index, loader, meter: o.meter, warn: o.warn });
  const music = new LoopChannel({ engine, loader, index, levels: o.levels, bus: 'music', warn: o.warn });
  const ambience = new LoopChannel({ engine, loader, index, levels: o.levels, bus: 'ambience', warn: o.warn });
  const scatter = new AmbientScatter(engine);
  const made = new Conductor({ engine, music, ambience, scatter, bus: o.bus, room: o.room, hasTrack: (id) => Boolean(index.tracks[id]), loader });
  conductor = made;

  // the sounds of the hero, the enemies and the interface are fetched now, at idle: they are what the first minute of play needs
  void loader.retain('core');

  const unlock = (): void => engine.unlock();
  for (const g of GESTURES) window.addEventListener(g, unlock, { capture: true, passive: true });

  return {
    director,
    sounding: true,
    update: (dt, frame) => made.update(dt, frame),
    setPaused: (paused) => made.setPaused(paused),
    setHidden: (hidden) => engine.setHidden(hidden),
    ui: (kind) => made.ui(kind),
    unlock,
    play: (request) => engine.play(request),
    snapshot: () => ({
      engine: engine.stats(),
      levels: o.levels.snapshot(),
      music: music.stats(),
      ambience: ambience.stats(),
      conductor: made.state(),
      loader: loader.stats(),
      meter: engine.meter(),
      formats,
      sounds: Object.keys(index.sounds).length,
      tracks: Object.keys(index.tracks).length,
    }),
    dispose() {
      for (const g of GESTURES) window.removeEventListener(g, unlock, { capture: true });
      made.dispose();
      music.dispose();
      ambience.dispose();
      director.dispose();
      engine.dispose();
      loader.dispose();
    },
  };
}
