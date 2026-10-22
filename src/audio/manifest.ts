/**
 * THE AUDIO MANIFEST (docs/PROMPT18-LOG.md): what the sound files of the game are, as DATA — written by `tools/audio` when it makes them, read by the engine when it plays them. For each sound: its files (one per
 * variation, in each format), how long they are, which bus it plays on, how loud, how much its pitch and level may vary, how often it may play, how many may play at once, how it is told from the others when the mix is
 * full, and how much of it goes to the room. The game asks for a sound by its LOGICAL ID (`hero.slash.1`, `music.ruins`); nothing outside this file knows a file name, so a sound is replaced by changing its files here.
 *
 * Pure data and pure functions: no DOM, no WebAudio.
 */

/** Where a sound plays: the effects, the world's background, the music, the interface. Each has its own volume (the interface follows the effects'). */
export type AudioBus = 'sfx' | 'ambience' | 'music' | 'ui';
export const AUDIO_BUSES: readonly AudioBus[] = ['sfx', 'ambience', 'music', 'ui'];

/** The formats the files come in, best first: Ogg Opus (small and exact, but not everywhere) and MP3 (everywhere). */
export const AUDIO_FORMATS = ['opus', 'mp3'] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

/** How a browser is asked whether it can play a format (`HTMLMediaElement.canPlayType`). */
export const FORMAT_MIME: Readonly<Record<AudioFormat, string>> = { opus: 'audio/ogg; codecs="opus"', mp3: 'audio/mpeg' };

/** One variation of a sound: the file in each format (a path relative to the index), and its length in seconds. */
export interface VariantDef {
  opus?: string;
  mp3?: string;
  seconds: number;
}

export interface SoundDef {
  bus: AudioBus;
  /** The set of sounds that are fetched and released together (`core`, `zone.r2_hall`, `music.ruins`…). */
  group: string;
  variants: VariantDef[];
  /** 1 sounds are placed in the world (panned by where they happened); 2 are not. */
  channels: 1 | 2;
  /** Trim at play time (dB). */
  gainDb: number;
  /** Each play is moved by up to ± this many cents… */
  pitchCents: number;
  /** …and ± this many dB, so that a repeated sound is never the very same twice. */
  gainJitterDb: number;
  /** The shortest time between two plays of it (ms), and the most voices of it at once. */
  cooldownMs: number;
  voices: number;
  /** 0 … 10: when the mix is full, the lowest priority goes first. */
  priority: number;
  /** How much of it goes to the room's reverberation, 0 … 1. */
  reverb: number;
  /** While it plays, the music is lowered by `db` over `ms`. */
  duck?: { db: number; ms: number };
  /** A sound that repeats: the loop runs from `start` to `end` (seconds). */
  loop?: { start: number; end: number };
}

/** A piece of music: its layers (each one a sound of the manifest, all of the same length and played in step), how long it is and its beat. */
export interface TrackDef {
  group: string;
  /** Layer name → sound id. `base` is always there. */
  layers: Record<string, string>;
  seconds: number;
  bpm: number;
  bars: number;
}

export interface AudioIndex {
  version: 1;
  sampleRate: number;
  /** Where every file comes from, in words. */
  origin: string;
  sounds: Record<string, SoundDef>;
  tracks: Record<string, TrackDef>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function parseVariant(raw: unknown): VariantDef | null {
  if (!isObject(raw)) return null;
  const opus = str(raw['opus']);
  const mp3 = str(raw['mp3']);
  if (!opus && !mp3) return null;
  const v: VariantDef = { seconds: num(raw['seconds'], 0) };
  if (opus) v.opus = opus;
  if (mp3) v.mp3 = mp3;
  return v;
}

function parseSound(raw: unknown): SoundDef | null {
  if (!isObject(raw)) return null;
  const bus = AUDIO_BUSES.find((b) => b === raw['bus']);
  const group = str(raw['group']);
  if (!bus || !group || !Array.isArray(raw['variants'])) return null;
  const variants = (raw['variants'] as unknown[]).map(parseVariant).filter((v): v is VariantDef => v !== null);
  if (variants.length === 0) return null;
  const s: SoundDef = {
    bus,
    group,
    variants,
    channels: raw['channels'] === 2 ? 2 : 1,
    gainDb: num(raw['gainDb'], 0),
    pitchCents: Math.max(0, num(raw['pitchCents'], 0)),
    gainJitterDb: Math.max(0, num(raw['gainJitterDb'], 0)),
    cooldownMs: Math.max(0, num(raw['cooldownMs'], 0)),
    voices: Math.max(1, Math.round(num(raw['voices'], 4))),
    priority: num(raw['priority'], 5),
    reverb: Math.min(1, Math.max(0, num(raw['reverb'], 0))),
  };
  const duck = raw['duck'];
  if (isObject(duck) && typeof duck['db'] === 'number' && typeof duck['ms'] === 'number') s.duck = { db: duck['db'], ms: duck['ms'] };
  const loop = raw['loop'];
  if (isObject(loop) && typeof loop['start'] === 'number' && typeof loop['end'] === 'number' && loop['end'] > loop['start']) s.loop = { start: loop['start'], end: loop['end'] };
  return s;
}

function parseTrack(raw: unknown): TrackDef | null {
  if (!isObject(raw)) return null;
  const group = str(raw['group']);
  if (!group || !isObject(raw['layers'])) return null;
  const layers: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw['layers'])) {
    const id = str(v);
    if (id) layers[k] = id;
  }
  if (!layers['base']) return null;
  return { group, layers, seconds: num(raw['seconds'], 0), bpm: num(raw['bpm'], 0), bars: num(raw['bars'], 0) };
}

/**
 * Reads the manifest, and never throws: what cannot be understood is left out (a sound with no file, a track with no base layer), and a manifest that is not one at all is `null` — the game then plays with no sound
 * instead of failing. A track whose layer names a sound that is not there is left out too.
 */
export function parseIndex(raw: unknown): AudioIndex | null {
  if (!isObject(raw) || raw['version'] !== 1 || !isObject(raw['sounds'])) return null;
  const sounds: Record<string, SoundDef> = {};
  for (const [id, v] of Object.entries(raw['sounds'])) {
    const s = parseSound(v);
    if (s) sounds[id] = s;
  }
  const tracks: Record<string, TrackDef> = {};
  if (isObject(raw['tracks'])) {
    for (const [id, v] of Object.entries(raw['tracks'])) {
      const t = parseTrack(v);
      if (t && Object.values(t.layers).every((sid) => sounds[sid])) tracks[id] = t;
    }
  }
  return { version: 1, sampleRate: num(raw['sampleRate'], 48000), origin: str(raw['origin']) ?? '', sounds, tracks };
}

/** The formats this browser can play, best first. `canPlay` is `HTMLMediaElement.canPlayType`: anything but the empty string is a yes. */
export function playableFormats(canPlay: (mime: string) => string): AudioFormat[] {
  return AUDIO_FORMATS.filter((f) => canPlay(FORMAT_MIME[f]) !== '');
}

/** The file of a variation to fetch: the first format of `order` it has, and the formats after it as the ones to fall back to. */
export function sourcesOf(v: VariantDef, order: readonly AudioFormat[]): string[] {
  const out: string[] = [];
  for (const f of order) {
    const p = v[f];
    if (p) out.push(p);
  }
  return out;
}
