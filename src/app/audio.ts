import { AmbientScatter } from '@/audio/ambience';
import { AudioDirector, CueLog } from '@/audio/AudioDirector';
import { Conductor } from '@/audio/conductor';
import { AudioEngine, type EngineStats, type PlayRequest } from '@/audio/engine';
import { Levels } from '@/audio/levels';
import { decodeWith, fetchBytes, SoundLoader } from '@/audio/loader';
import { LoopChannel, type ChannelStats } from '@/audio/loops';
import { parseIndex, playableFormats, type AudioFormat } from '@/audio/manifest';
import type { UiSoundKind } from '@/audio/soundMap';
import type { GameSession } from '@/gameplay/GameSession';
import type { GameOptions } from './options';
import type { AudioCueEvent, AudioSink } from '@/presentation/audioCues';
import type { AudioCategory, AudioLevels } from '@/presentation/audioMix';

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
  /** Where the cues are written down (a development build, `?hooks=1`): what the sound was told. `null` in a player's build. */
  readonly cueLog: CueLog | null;
  /** `false`: no sound is made (switched off, or nothing to play). */
  readonly sounding: boolean;
  /**
   * One frame: the simulation's clock in seconds (the sound keeps GAME time, so it hears no time at all while the world is stopped — a menu, the curtain, the black of a change of zone — and as much as the ticks that
   * ran since the last frame) and the hero, whom it follows.
   */
  update(seconds: number, hero: AudioHero): void;
  setPaused(paused: boolean): void;
  /** The menu opens or closes: the game waits (or goes on) and the menu is heard doing it. */
  menu(open: boolean): void;
  /** A sound of the interface. */
  ui(kind: UiSoundKind): void;
  /** What is going out of the speakers right now (rms and peak, linear), when the page has a meter (a development build, `?hooks=1`). */
  meter(): { rms: number; peak: number } | null;
  /** A volume slider moved: the level of a category (heard at once). */
  setLevel(category: AudioCategory, level: number): void;
  /** The four levels in force. */
  levels(): AudioLevels;
  /** Lets the browser make sound (call it from a gesture of the person). */
  unlock(): void;
  /** Plays a sound of the manifest by id (the tests and the development tools). */
  play(request: PlayRequest): boolean;
  /** Fetches and decodes groups of sounds ahead of need, and lets go of them again (they stay in memory for the grace period): a loading screen could use it; the tests do. Never rejects. */
  warm(groups: readonly string[]): Promise<void>;
  snapshot(): AudioSnapshot | null;
  dispose(): void;
}

/** What the sound needs to know of the hero: where they are and how they are. */
export interface AudioHero {
  body: { x: number; y: number };
  health: { current: number; max: number; dead: boolean };
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
  /** The simulation: its bus of events, its clock (stamped on every cue) and the room the game starts in. */
  session: Pick<GameSession, 'bus' | 'now' | 'room'>;
  /** The skills whose casts are projectiles (the cue director tells their impacts from a blow's). */
  projectileSkills: ReadonlySet<string>;
  /** The four volumes the person chose, as the page has them now: the sound makes its `Levels` of them (the code of the first frame holds only the numbers). */
  volume: AudioLevels;
  /** What the page was asked for: whether it makes sound, and whether it is a test page (it then has a meter on the output). */
  options: Pick<GameOptions, 'audio' | 'hooks'>;
  warn: (message: string) => void;
}

/**
 * Where the audio index is: the one the build found in `public/audio`, or NOWHERE — `null`, and a page that has none asks for no file and can fail on none. `base` is the page's URL.
 */
export function audioIndexUrl(built: string, base: string): string | null {
  return built === '' ? null : new URL(built, base).href;
}

/** Any of these in the page lets the browser make sound (a key, a click, a tap; a gamepad button is not one — browsers do not count it). */
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click'] as const;

export async function createAudio(o: AudioOptions): Promise<AudioSystem> {
  const levels = new Levels(o.volume);
  const cueLog = o.options.hooks || import.meta.env.DEV ? new CueLog() : null;
  let conductor: Conductor | null = null;
  const sink: AudioSink = {
    cue(event: Readonly<AudioCueEvent>) {
      cueLog?.cue(event);
      conductor?.cue(event);
    },
  };
  const director = new AudioDirector(o.session.bus, sink, { now: () => o.session.now, projectileSkills: o.projectileSkills });
  const silent: AudioSystem = {
    director,
    cueLog,
    sounding: false,
    update: () => undefined,
    setPaused: () => undefined,
    menu: () => undefined,
    ui: () => undefined,
    meter: () => null,
    setLevel: (category, level) => void levels.set(category, level),
    levels: () => levels.snapshot(),
    unlock: () => undefined,
    play: () => false,
    warm: () => Promise.resolve(),
    snapshot: () => null,
    dispose: () => director.dispose(),
  };
  const indexUrl = audioIndexUrl(__TROID_AUDIO_INDEX__, document.baseURI);
  if (o.options.audio !== 'on' || indexUrl === null) return silent;

  let index;
  try {
    const response = await fetch(indexUrl);
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
    baseUrl: indexUrl,
    formats,
    warn: o.warn,
    // a decoded piece of music or bed is many MiB: it is let go a few seconds after the hero has left it (the crossfade is over by then), the small sounds of a place and the boss's are kept longer
    graceFor: (group) => (group.startsWith('music.') || group.startsWith('amb.') ? 4000 : 20_000),
    io: {
      fetchBytes,
      decode: (bytes) => {
        const ctx = offline ?? engine?.context ?? null;
        return ctx ? decodeWith(ctx, bytes) : Promise.reject(new Error('there is no audio context to decode with'));
      },
    },
  });
  engine = new AudioEngine({ levels, index, loader, meter: o.options.hooks || import.meta.env.DEV, warn: o.warn });
  const music = new LoopChannel({ engine, loader, index, levels, bus: 'music', warn: o.warn });
  const ambience = new LoopChannel({ engine, loader, index, levels, bus: 'ambience', warn: o.warn });
  const scatter = new AmbientScatter(engine);
  const made = new Conductor({ engine, music, ambience, scatter, bus: o.session.bus, room: o.session.room.id, hasTrack: (id) => Boolean(index.tracks[id]), loader });
  conductor = made;

  // the sounds of the hero, the enemies and the interface are fetched now, at idle: they are what the first minute of play needs
  void loader.retain('core');

  const unlock = (): void => engine.unlock();
  for (const g of GESTURES) window.addEventListener(g, unlock, { capture: true, passive: true });
  // a page in the background freezes the sound, and wakes it when it returns
  const hide = (): void => engine.setHidden(document.hidden);
  document.addEventListener('visibilitychange', hide);
  let last = -1;

  return {
    director,
    cueLog,
    sounding: true,
    update: (seconds, hero) => {
      made.update(last < 0 ? 0 : Math.max(0, seconds - last), {
        x: hero.body.x,
        y: hero.body.y,
        life: hero.health.max > 0 ? hero.health.current / hero.health.max : undefined,
        dead: hero.health.dead,
      });
      last = seconds;
    },
    setPaused: (paused) => made.setPaused(paused),
    menu: (open) => {
      made.setPaused(open);
      made.ui(open ? 'open' : 'close');
    },
    ui: (kind) => made.ui(kind),
    meter: () => engine.meter(),
    setLevel: (category, level) => void levels.set(category, level),
    levels: () => levels.snapshot(),
    unlock,
    play: (request) => engine.play(request),
    warm: async (groups) => {
      await Promise.all(groups.map(async (g) => (await loader.retain(g), loader.release(g))));
    },
    snapshot: () => ({
      engine: engine.stats(),
      levels: levels.snapshot(),
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
      document.removeEventListener('visibilitychange', hide);
      made.dispose();
      music.dispose();
      ambience.dispose();
      director.dispose();
      engine.dispose();
      loader.dispose();
    },
  };
}
