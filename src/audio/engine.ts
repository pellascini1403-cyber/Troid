import { categoryOfBus, type Levels } from './levels';
import type { SoundLoader } from './loader';
import type { AudioBus, AudioIndex, SoundDef } from './manifest';
import type { AudioCategory } from '@/presentation/audioMix';
import { renderImpulse, type RoomSpec } from './reverb';
import { centsToRate, dbToGain, spatialOf } from './spatial';
import { gainOf } from './volume';

/**
 * THE AUDIO ENGINE (docs/PROMPT18-LOG.md): the one place that makes a sound. It owns THE audio context (one, for the whole game), the buses everything is mixed on — effects, ambience, music, interface — the
 * general volume over them and the limiter that keeps the sum from ever clipping, and it plays the sounds the manifest names: one at a time, each with its own level, its own variation, its own place in the stereo
 * field, and under the rules that keep a fight from turning into a wall of noise (a sound may not repeat faster than its cooldown, a sound may not have more voices than it is given, the whole game may not have
 * more than `maxVoices`, and when it is full the least important voice goes first).
 *
 *   effects ─┐
 *   ambience ┼─► world gate ──┐        (the pause closes the gate: the world falls silent, the interface does not)
 *   reverb ──┘                │
 *   interface ────────────────┤
 *   music ─► duck ─► colour ──┼─► general ─► limiter ─► speakers
 *   stingers ─────────────────┘
 *
 * A browser does not let a page make sound until the person has touched it: the context is made on the first gesture (`unlock`, wired to the page by the host) and until then every request to play is let go — a sound is
 * an event, and one that could not be heard when it happened is not worth hearing late. The state that IS worth keeping (which music, which ambience) is kept by the channels and starts when the engine runs.
 */
export type EngineState = 'locked' | 'running' | 'suspended' | 'unsupported' | 'closed';

export interface PlayRequest {
  /** The logical id of the sound (`hero.slash.1`). */
  id: string;
  /** Where it happened in the world, metres: it is panned and made quieter by the distance to the listener. None: heard in the middle at full strength. */
  at?: { x: number; y: number } | null;
  /** Added to the sound's own level (dB). */
  gainDb?: number;
  /** Multiplies the speed (and so the pitch) it plays at. */
  rate?: number;
  /** Which variation, 0-based; none: one at random that is not the last one played. */
  variant?: number;
  /** Seconds from now. */
  delay?: number;
}

export type DropReason = 'locked' | 'unknown' | 'silent' | 'paused' | 'notLoaded' | 'cooldown' | 'full';

export interface EngineStats {
  state: EngineState;
  paused: boolean;
  voices: number;
  /** The most voices that were sounding at once (the limit is the manifest's and the engine's `maxVoices`). */
  peakVoices: number;
  /** The most sources there were on the graph at once, a voice that is being taken over and fades for a few milliseconds included. */
  peakSources: number;
  played: number;
  stolen: number;
  dropped: Record<DropReason, number>;
  /** How many voices of each sound are playing now. */
  active: Record<string, number>;
  /** The last sounds played, oldest first (ids), for the tests. */
  recent: string[];
}

export interface EngineOptions {
  levels: Levels;
  index: AudioIndex;
  loader: SoundLoader;
  /** Makes the context. The default asks for 48 kHz (the rate the files are made at, so that a loop is exact) and falls back to the device's. */
  createContext?: () => AudioContext;
  /** Variation and jitter. The default is `Math.random`; a test gives a seeded one. */
  random?: () => number;
  /** The most voices at once, the whole game (default 24). */
  maxVoices?: number;
  /** Adds a meter on the output, for the tests and the development build (it costs a little on every frame, so a player's game has none). */
  meter?: boolean;
  warn?: (message: string) => void;
}

interface Voice {
  id: string;
  bus: AudioBus;
  priority: number;
  startedAt: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: StereoPannerNode | null;
  send: GainNode | null;
  stopping: boolean;
}

interface Nodes {
  master: GainNode;
  limiter: DynamicsCompressorNode;
  makeup: GainNode;
  worldGate: GainNode;
  sfx: GainNode;
  ui: GainNode;
  ambience: GainNode;
  music: GainNode;
  stinger: GainNode;
  duck: GainNode;
  colour: BiquadFilterNode;
  /** What the sounds of each category send to the room's echo goes through that category's level first: an echo is part of the sound, and the slider of the effects (or of the ambience) turns it down with the rest. */
  reverbSfx: GainNode;
  reverbAmbience: GainNode;
  reverbIn: GainNode;
  reverbOut: GainNode;
  analyser: AnalyserNode | null;
}

/**
 * Moves a gain to `target` over `seconds`, from wherever it is: a straight ramp from its present value. Not `setTargetAtTime`, which is what a level would be moved with — in Chromium the FIRST such change to a parameter
 * whose node has been idle (nothing has been playing through it) is not applied until sound reaches the node, so the first sound after the slider of the effects was moved played at the old level for a moment, and the
 * first sounds after the menu closed started muffled (measured: a sound that should have peaked at −29 dB came out at −24 dB). A ramp has no such delay.
 */
export function glide(param: AudioParam, target: number, now: number, seconds: number): void {
  const from = param.value; // (before what is scheduled is taken away)
  param.cancelScheduledValues(now);
  param.setValueAtTime(from, now);
  param.linearRampToValueAtTime(target, now + seconds);
}

/** How long a level takes to go to its new value (s): fast enough to be answered at once, slow enough not to be heard as a click. */
const LEVEL_GLIDE = 0.04;

/** How many sources, over the limit of voices, may be on the graph while the ones that were taken over fade out. */
const FADING_ROOM = 12;

const DROP_REASONS: readonly DropReason[] = ['locked', 'unknown', 'silent', 'paused', 'notLoaded', 'cooldown', 'full'];
const RECENT = 24;

/**
 * The limiter: the compressor of the highest ratio Web Audio allows, from −2.5 dBFS up. It limits the way a mixer's does — it holds a pile of sound to a few decibels — and is not a wall: above the threshold the output climbs one
 * decibel for every twenty that go in (−2.4 dBFS for an input at full scale, −1.2 for two dozen voices struck on the same instant). The make-up (`LIMITER_MAKEUP`) takes back the gain a browser's compressor adds on its own.
 */
export const LIMITER = { threshold: -2.5, knee: 0, ratio: 20, attack: 0.002, release: 0.14 } as const;

/** What the music is dimmed and dulled to while the game waits at a menu, and while the hero is down. */
export const MUSIC_MOODS = {
  pause: { cutoff: 1100, dipDb: -8 },
  death: { cutoff: 800, dipDb: -13 },
} as const;
export type MusicMood = keyof typeof MUSIC_MOODS;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private nodes: Nodes | null = null;
  private _state: EngineState = 'locked';
  private paused = false;
  private disposed = false;
  private readonly voices: Voice[] = [];
  /** When each sound last started (ms of the context's clock), for its cooldown. */
  private readonly lastStart = new Map<string, number>();
  private readonly lastVariant = new Map<string, number>();
  private readonly listener = { x: 0, y: 0 };
  private readonly random: () => number;
  private readonly maxVoices: number;
  private readonly moods = new Set<MusicMood>();
  private ducks: Array<{ db: number; until: number }> = [];
  private lastDip = 0;
  private room: RoomSpec | null = null;
  private roomSerial = 0;
  private roomNode: { convolver: ConvolverNode; out: GainNode } | null = null;
  private retired: Array<{ until: number; nodes: AudioNode[] }> = [];
  private readonly runningListeners = new Set<() => void>();
  private readonly stateListeners = new Set<(state: EngineState) => void>();
  private readonly tickListeners = new Set<() => void>();
  private readonly offLevels: () => void;
  private readonly stats_: { played: number; stolen: number; peak: number; peakSources: number; dropped: Record<DropReason, number>; recent: string[] };
  private meterBuffer: Float32Array<ArrayBuffer> | null = null;

  constructor(private readonly opts: EngineOptions) {
    this.random = opts.random ?? Math.random;
    this.maxVoices = opts.maxVoices ?? 24;
    this.stats_ = { played: 0, stolen: 0, peak: 0, peakSources: 0, dropped: Object.fromEntries(DROP_REASONS.map((r) => [r, 0])) as Record<DropReason, number>, recent: [] };
    this.offLevels = opts.levels.onChange((category) => this.applyLevel(category));
  }

  // ------------------------------------------------------------------------------------------------ the context

  get state(): EngineState {
    return this._state;
  }

  get running(): boolean {
    return this._state === 'running';
  }

  /** The context, once there is one (the channels connect their sources to it). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** The time of the audio clock, seconds (0 before there is a context). */
  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** The node a bus is played into (null while there is no context). */
  input(bus: AudioBus | 'stinger'): AudioNode | null {
    const n = this.nodes;
    if (!n) return null;
    return bus === 'sfx' ? n.sfx : bus === 'ui' ? n.ui : bus === 'ambience' ? n.ambience : bus === 'music' ? n.music : n.stinger;
  }

  /** `cb` is called each time the engine comes to run (the first gesture, a return from the background). Returns the way to stop. */
  onRunning(cb: () => void): () => void {
    this.runningListeners.add(cb);
    return () => this.runningListeners.delete(cb);
  }

  /** `cb` is called on every `tick` (once per frame): the channels let their fading pieces go with it. */
  onTick(cb: () => void): () => void {
    this.tickListeners.add(cb);
    return () => this.tickListeners.delete(cb);
  }

  onState(cb: (state: EngineState) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  /**
   * To be called from a gesture of the person (a key, a click, a tap): makes the context if there is none and asks it to run. Safe to call again and again — from then on it is how a context that the system put to
   * sleep (a call, a locked phone) is woken.
   */
  unlock(): void {
    if (this.disposed || this._state === 'unsupported' || this._state === 'closed') return;
    if (!this.ctx && !this.build()) return;
    const ctx = this.ctx as AudioContext;
    if (ctx.state !== 'running') {
      // (an iOS context can be `interrupted`; it is woken the same way)
      ctx.resume().then(() => this.sync(), () => this.sync());
    }
    this.sync();
  }

  /** The page went to the background (or came back): the context is frozen, with every sound where it was, and thawed. */
  setHidden(hidden: boolean): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    if (hidden) ctx.suspend().then(() => this.sync(), () => this.sync());
    else if (this._state !== 'locked') ctx.resume().then(() => this.sync(), () => this.sync());
  }

  private build(): boolean {
    let ctx: AudioContext;
    try {
      ctx = (this.opts.createContext ?? defaultContext)();
    } catch (err) {
      this.opts.warn?.(`audio: the audio context could not be made (${err instanceof Error ? err.message : String(err)})`);
      this.setState('unsupported');
      return false;
    }
    this.ctx = ctx;
    try {
      this.nodes = this.buildGraph(ctx);
    } catch (err) {
      this.opts.warn?.(`audio: the audio graph could not be built (${err instanceof Error ? err.message : String(err)})`);
      this.nodes = null;
      this.ctx = null;
      this.setState('unsupported');
      return false;
    }
    ctx.addEventListener?.('statechange', () => this.sync());
    // iOS keeps a context silent until something has been played in a gesture; a silent sample does it
    try {
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = silent;
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      // not needed anywhere else
    }
    // a phone's silent switch mutes web audio unless the page says it is playing a game / media
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
    } catch {
      // not a browser that has it
    }
    if (this.room) this.applyRoom();
    this.setMusicMood('pause', this.paused);
    return true;
  }

  private buildGraph(ctx: AudioContext): Nodes {
    const gain = (v: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const lv = this.opts.levels;
    const master = gain(lv.gain('master'));
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = LIMITER.threshold;
    limiter.knee.value = LIMITER.knee;
    limiter.ratio.value = LIMITER.ratio;
    limiter.attack.value = LIMITER.attack;
    limiter.release.value = LIMITER.release;
    const makeup = gain(LIMITER_MAKEUP);
    const worldGate = gain(this.paused ? 0 : 1);
    const sfx = gain(lv.gain('sfx'));
    const ui = gain(lv.gain('sfx'));
    const ambience = gain(lv.gain('ambience'));
    const music = gain(lv.gain('music'));
    const stinger = gain(lv.gain('music'));
    const duck = gain(1);
    const colour = ctx.createBiquadFilter();
    colour.type = 'lowpass';
    colour.frequency.value = 22050;
    colour.Q.value = 0.5;
    const reverbSfx = gain(lv.gain('sfx'));
    const reverbAmbience = gain(lv.gain('ambience'));
    const reverbIn = gain(1);
    const reverbOut = gain(1);
    const analyser = this.opts.meter ? ctx.createAnalyser() : null;
    if (analyser) analyser.fftSize = 2048;

    sfx.connect(worldGate);
    ambience.connect(worldGate);
    reverbSfx.connect(reverbIn);
    reverbAmbience.connect(reverbIn);
    reverbIn.connect(reverbOut);
    reverbOut.connect(worldGate);
    worldGate.connect(master);
    ui.connect(master);
    music.connect(duck);
    duck.connect(colour);
    colour.connect(master);
    stinger.connect(master);
    master.connect(limiter);
    limiter.connect(makeup);
    makeup.connect(ctx.destination);
    if (analyser) makeup.connect(analyser);
    return { master, limiter, makeup, worldGate, sfx, ui, ambience, music, stinger, duck, colour, reverbSfx, reverbAmbience, reverbIn, reverbOut, analyser };
  }

  /** Mirrors the context's own state into the engine's, and tells those who wait for it to run. */
  private sync(): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    const next: EngineState = ctx.state === 'running' ? 'running' : ctx.state === 'closed' ? 'closed' : this._state === 'locked' && ctx.state === 'suspended' && !this.everRan ? 'locked' : 'suspended';
    if (next === 'running') this.everRan = true;
    this.setState(next);
  }

  private everRan = false;

  private setState(next: EngineState): void {
    if (next === this._state) return;
    this._state = next;
    for (const cb of [...this.stateListeners]) cb(next);
    if (next === 'running') for (const cb of [...this.runningListeners]) cb();
  }

  // ------------------------------------------------------------------------------------------------ levels

  private applyLevel(category: AudioCategory): void {
    const n = this.nodes;
    const ctx = this.ctx;
    if (!n || !ctx) return;
    const t = ctx.currentTime;
    const lv = this.opts.levels;
    const set = (node: GainNode, level: number): void => glide(node.gain, gainOf(level), t, LEVEL_GLIDE);
    if (category === 'master') glide(n.master.gain, lv.gain('master'), t, LEVEL_GLIDE);
    if (category === 'sfx') {
      set(n.sfx, lv.level('sfx'));
      set(n.ui, lv.level('sfx'));
      set(n.reverbSfx, lv.level('sfx'));
    }
    if (category === 'ambience') {
      set(n.ambience, lv.level('ambience'));
      set(n.reverbAmbience, lv.level('ambience'));
    }
    if (category === 'music') {
      set(n.music, lv.level('music'));
      set(n.stinger, lv.level('music'));
    }
    // what is silent is not left running at zero: its voices are let go
    for (const v of [...this.voices]) if (!lv.audible(categoryOfBus(v.bus))) this.stopVoice(v, 0.03);
  }

  // ------------------------------------------------------------------------------------------------ playing

  /** Where the listener is (the hero's place, metres): positional sounds are panned and attenuated against it. */
  setListener(x: number, y: number): void {
    this.listener.x = x;
    this.listener.y = y;
  }

  get listenerPosition(): Readonly<{ x: number; y: number }> {
    return this.listener;
  }

  /** The game is waiting at a menu: the world falls silent (its voices are stopped, the ambience and the echo muted), the music dims and dulls, the interface still sounds. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    const n = this.nodes;
    const ctx = this.ctx;
    if (!n || !ctx) return;
    const t = ctx.currentTime;
    glide(n.worldGate.gain, paused ? 0 : 1, t, paused ? 0.06 : 0.25);
    if (paused) for (const v of [...this.voices]) if (v.bus !== 'ui') this.stopVoice(v, 0.05);
    this.setMusicMood('pause', paused);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Dims and dulls the music for a moment of the game (the menu, the hero down) until the same mood is turned off. */
  setMusicMood(mood: MusicMood, on: boolean): void {
    if (on) this.moods.add(mood);
    else this.moods.delete(mood);
    this.applyMusicColour('mood');
  }

  /** Lowers the music by `db` for about `ms` (what a loud sound does to the music so that it is heard). */
  duckMusic(db: number, ms: number): void {
    const ctx = this.ctx;
    if (!ctx || db >= 0) return;
    this.ducks.push({ db, until: ctx.currentTime + ms / 1000 });
    this.applyMusicColour('duck');
  }

  /** Puts the music where the moods and the ducks say. A duck comes in fast (the sound that causes it must be heard) and goes slowly; a mood (the menu, the hero down) changes the music gently both ways. */
  private applyMusicColour(kind: 'duck' | 'mood' | 'release'): void {
    const n = this.nodes;
    const ctx = this.ctx;
    if (!n || !ctx) return;
    const t = ctx.currentTime;
    this.ducks = this.ducks.filter((d) => d.until > t);
    let dip = 0;
    let cutoff = 22050;
    for (const m of this.moods) {
      dip = Math.min(dip, MUSIC_MOODS[m].dipDb);
      cutoff = Math.min(cutoff, MUSIC_MOODS[m].cutoff);
    }
    for (const d of this.ducks) dip = Math.min(dip, d.db);
    const tau = dip < this.lastDip ? (kind === 'duck' ? 0.03 : 0.12) : kind === 'release' ? 0.3 : 0.25;
    this.lastDip = dip;
    n.duck.gain.setTargetAtTime(dbToGain(dip), t, tau);
    n.colour.frequency.setTargetAtTime(cutoff, t, 0.1);
  }

  /** To be called once per frame, paused or not: lets the ducks end and the nodes of an echo that was replaced go. */
  tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.ducks.some((d) => d.until <= t)) this.applyMusicColour('release');
    if (this.retired.length > 0) {
      const keep: typeof this.retired = [];
      for (const r of this.retired) {
        if (r.until > t) keep.push(r);
        else for (const node of r.nodes) node.disconnect();
      }
      this.retired = keep;
    }
    for (const cb of [...this.tickListeners]) cb();
  }

  /** Plays a sound. Returns whether it started. A sound that is not played is counted by the reason (`stats().dropped`), never reported as an error: the game goes on without it. */
  play(req: PlayRequest): boolean {
    const drop = (reason: DropReason): false => {
      this.stats_.dropped[reason]++;
      return false;
    };
    const ctx = this.ctx;
    const n = this.nodes;
    if (!ctx || !n || this._state !== 'running') return drop('locked');
    const def = this.opts.index.sounds[req.id];
    if (!def) return drop('unknown');
    if (!this.opts.levels.audible(categoryOfBus(def.bus))) return drop('silent');
    if (this.paused && def.bus !== 'ui') return drop('paused');
    const buffers = this.opts.loader.get(req.id);
    if (buffers.length === 0) return drop('notLoaded');

    const nowMs = ctx.currentTime * 1000;
    const last = this.lastStart.get(req.id);
    if (last !== undefined && nowMs - last < def.cooldownMs) return drop('cooldown');

    if (!this.makeRoomFor(req.id, def)) return drop('full');

    // which variation: asked for, or one that is not the one before
    let k = req.variant !== undefined ? Math.max(0, Math.min(buffers.length - 1, Math.floor(req.variant))) : Math.floor(this.random() * buffers.length);
    if (req.variant === undefined && buffers.length > 1 && k === this.lastVariant.get(req.id)) k = (k + 1 + Math.floor(this.random() * (buffers.length - 1))) % buffers.length;
    this.lastVariant.set(req.id, k);

    const source = ctx.createBufferSource();
    source.buffer = buffers[k] as AudioBuffer;
    const cents = (this.random() * 2 - 1) * def.pitchCents;
    source.playbackRate.value = centsToRate(cents) * (req.rate ?? 1);
    const g = ctx.createGain();
    const where = req.at && def.channels === 1 ? spatialOf(req.at.x - this.listener.x, req.at.y - this.listener.y) : { pan: 0, gain: 1 };
    const jitter = (this.random() * 2 - 1) * def.gainJitterDb;
    g.gain.value = dbToGain(def.gainDb + (req.gainDb ?? 0) + jitter) * where.gain;
    source.connect(g);
    let tail: AudioNode = g;
    let panner: StereoPannerNode | null = null;
    if (where.pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.value = where.pan;
      g.connect(panner);
      tail = panner;
    }
    tail.connect(this.busInput(n, def.bus));
    let send: GainNode | null = null;
    if (def.reverb > 0 && def.bus !== 'ui' && def.bus !== 'music' && this.roomNode) {
      send = ctx.createGain();
      send.gain.value = def.reverb;
      tail.connect(send);
      send.connect(def.bus === 'ambience' ? n.reverbAmbience : n.reverbSfx);
    }
    const when = ctx.currentTime + Math.max(0, req.delay ?? 0);
    const voice: Voice = { id: req.id, bus: def.bus, priority: def.priority, startedAt: when, source, gain: g, panner, send, stopping: false };
    source.onended = () => this.finish(voice);
    source.start(when);
    this.voices.push(voice);
    this.lastStart.set(req.id, nowMs);
    this.stats_.played++;
    this.stats_.recent.push(req.id);
    if (this.stats_.recent.length > RECENT) this.stats_.recent.shift();
    const sounding = this.voices.reduce((n, v) => n + (v.stopping ? 0 : 1), 0);
    if (sounding > this.stats_.peak) this.stats_.peak = sounding;
    if (this.voices.length > this.stats_.peakSources) this.stats_.peakSources = this.voices.length;
    if (def.duck) this.duckMusic(def.duck.db, def.duck.ms);
    return true;
  }

  private busInput(n: Nodes, bus: AudioBus): AudioNode {
    // a sound of the music bus that does not loop is a stinger: it must not be ducked by itself
    return bus === 'sfx' ? n.sfx : bus === 'ui' ? n.ui : bus === 'ambience' ? n.ambience : n.stinger;
  }

  /** Makes room for a voice of this sound: its own limit first, then the game's. False when the mix is full of sounds that matter more. */
  private makeRoomFor(id: string, def: SoundDef): boolean {
    const mine = this.voices.filter((v) => v.id === id && !v.stopping);
    if (mine.length >= def.voices) {
      const oldest = mine.reduce((a, b) => (a.startedAt <= b.startedAt ? a : b));
      this.stopVoice(oldest, 0.025);
      this.stats_.stolen++;
    }
    // a voice that was taken over is still on the graph for the few milliseconds of its fade: a burst of requests in one frame would pile them up, so the sources there may be only so many more than the voices
    if (this.voices.length >= this.maxVoices + FADING_ROOM) return false;
    const live = this.voices.filter((v) => !v.stopping);
    if (live.length < this.maxVoices) return true;
    // the least important voice (the oldest of them) goes, if it is not more important than the newcomer
    const weakest = live.reduce((a, b) => (a.priority < b.priority || (a.priority === b.priority && a.startedAt <= b.startedAt) ? a : b));
    if (weakest.priority > def.priority) return false;
    this.stopVoice(weakest, 0.025);
    this.stats_.stolen++;
    return true;
  }

  private stopVoice(v: Voice, fadeSec: number): void {
    if (v.stopping) return;
    v.stopping = true;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    v.gain.gain.setTargetAtTime(0, t, fadeSec / 4);
    try {
      v.source.stop(t + fadeSec);
    } catch {
      // never started or already stopped
    }
  }

  private finish(v: Voice): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    v.source.onended = null;
    v.source.disconnect();
    v.gain.disconnect();
    v.panner?.disconnect();
    v.send?.disconnect();
  }

  /** Stops every voice that is playing (a fade of a few milliseconds each), or those of one bus. */
  stopAll(bus?: AudioBus): void {
    for (const v of [...this.voices]) if (!bus || v.bus === bus) this.stopVoice(v, 0.04);
  }

  // ------------------------------------------------------------------------------------------------ the room

  /** The echo of the place the hero is in. `null`: none. The new one fades in as the old one fades out. */
  setRoom(room: RoomSpec | null): void {
    this.room = room;
    if (this.nodes && this.ctx) this.applyRoom();
  }

  private applyRoom(): void {
    const ctx = this.ctx;
    const n = this.nodes;
    if (!ctx || !n) return;
    const t = ctx.currentTime;
    const old = this.roomNode;
    if (old) {
      old.out.gain.setTargetAtTime(0, t, 0.2);
      this.retired.push({ until: t + 1.5, nodes: [old.convolver, old.out] });
      this.roomNode = null;
    }
    const spec = this.room;
    if (!spec || spec.wet <= 0) return;
    const serial = ++this.roomSerial;
    const [l, r] = renderImpulse(spec, ctx.sampleRate, lcg(serial * 7919 + Math.round(spec.rt60 * 1000)));
    const buffer = ctx.createBuffer(2, l.length, ctx.sampleRate);
    buffer.copyToChannel(l, 0);
    buffer.copyToChannel(r, 1);
    const convolver = ctx.createConvolver();
    convolver.normalize = false;
    convolver.buffer = buffer;
    const out = ctx.createGain();
    out.gain.value = 0;
    n.reverbIn.connect(convolver);
    convolver.connect(out);
    out.connect(n.reverbOut);
    out.gain.setTargetAtTime(spec.wet, t, 0.25);
    this.roomNode = { convolver, out };
  }

  // ------------------------------------------------------------------------------------------------ observation

  stats(): EngineStats {
    const active: Record<string, number> = {};
    for (const v of this.voices) if (!v.stopping) active[v.id] = (active[v.id] ?? 0) + 1;
    return {
      state: this._state,
      paused: this.paused,
      voices: this.voices.filter((v) => !v.stopping).length,
      peakVoices: this.stats_.peak,
      peakSources: this.stats_.peakSources,
      played: this.stats_.played,
      stolen: this.stats_.stolen,
      dropped: { ...this.stats_.dropped },
      active,
      recent: [...this.stats_.recent],
    };
  }

  /** The loudness of what is going out right now (the last 2048 samples of the output): `rms` and `peak`, linear 0 … 1, or null when the engine has no meter. */
  meter(): { rms: number; peak: number } | null {
    const a = this.nodes?.analyser;
    if (!a) return null;
    if (!this.meterBuffer || this.meterBuffer.length !== a.fftSize) this.meterBuffer = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(this.meterBuffer);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < this.meterBuffer.length; i++) {
      const v = this.meterBuffer[i] as number;
      sum += v * v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    return { rms: Math.sqrt(sum / this.meterBuffer.length), peak };
  }

  /** The live nodes of the graph (the tests look for a leak here: after everything has ended there are none left but the ones the graph is made of). */
  get liveVoices(): number {
    return this.voices.length;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.offLevels();
    for (const v of [...this.voices]) {
      try {
        v.source.stop();
      } catch {
        // already ended
      }
      this.finish(v);
    }
    this.runningListeners.clear();
    this.stateListeners.clear();
    this.tickListeners.clear();
    const ctx = this.ctx;
    this.ctx = null;
    this.nodes = null;
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => undefined);
    this._state = 'closed';
  }
}

/**
 * The make-up gain that undoes what a browser's compressor adds by itself when it is set as the limiter is. The Web Audio spec has the compressor add a make-up of its own, `(1 / the gain of its curve at full scale) ^ 0.6`,
 * which for a threshold of −2.5 dB and a ratio of 20 is ×1.178 (+1.42 dB) at every level below the threshold: measured in Chromium 141, a burst at −20 dBFS that went in with a peak of 0.0630 came out at 0.0742. Taken back
 * here, the chain is unity under the threshold, and over it the output is the curve's: −2.4 dBFS for an input at full scale and one decibel more for every twenty above it (`LIMITER`). (The spec fixes the formula, so a browser that follows it does
 * the same.)
 */
export const LIMITER_MAKEUP = 0.849;

/** 48 kHz if the browser lets the page ask for it (so that the files need no resampling and a loop stays exact), the device's rate if not. */
function defaultContext(): AudioContext {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('this browser has no Web Audio');
  try {
    return new Ctor({ latencyHint: 'interactive', sampleRate: 48000 });
  } catch {
    return new Ctor();
  }
}

/** A small deterministic generator for the impulse of a room (the same room is always the same echo). */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
