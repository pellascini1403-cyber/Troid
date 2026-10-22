import type { AudioBus } from '../../src/audio/manifest';
import type { Stereo } from './dsp/core';

/**
 * THE CATALOGUE OF SOUNDS (docs/PROMPT18-LOG.md): every sound and every layer of music the game has, as a RECIPE — the code that makes it — together with what the engine needs to know to play it (its bus, its level, how much
 * it varies, how often it may play, how many at once, how important it is). `tools/audio/build.ts` renders each recipe, measures it, encodes it and writes the manifest. Nothing here is a recording and nothing is taken from anywhere:
 * the same recipe and the same seed make the same sound.
 */

export interface SoundRecipe {
  /** The logical id the game asks for. */
  id: string;
  bus: AudioBus;
  /** What is fetched and released together. */
  group: string;
  /** How many variations (files) there are. */
  variants: number;
  /** 1: one channel in the file (the engine pans it by where it happened); 2: stereo. */
  channels: 1 | 2;
  /** Renders variation `variant` (0-based) with the generator it is given. */
  render(variant: number, rnd: () => number): Stereo;
  gainDb?: number;
  pitchCents?: number;
  gainJitterDb?: number;
  cooldownMs?: number;
  voices?: number;
  priority?: number;
  reverb?: number;
  duck?: { db: number; ms: number };
  /** The sound repeats: it is made to close on itself (the build checks that it does). */
  loop?: boolean;
  /** What the sound is FOR, in a sentence: it goes to the manifest and to the log. */
  note: string;
}

/** A piece of music, as layers that are played together. */
export interface TrackRecipe {
  id: string;
  group: string;
  bpm: number;
  bars: number;
  /** Renders every layer, each exactly `frames` samples long and closing on itself. */
  render(rnd: () => number): Record<string, Stereo>;
  /** Per layer: the level it plays at when it plays (dB). */
  layerDb?: Record<string, number>;
  note: string;
}

/** How a kind of sound is encoded: what it may cost, in bits per second, for each format. */
export const BITRATE = {
  sfxMono: { opus: 48000, mp3: 64000 },
  sfxStereo: { opus: 72000, mp3: 96000 },
  ambience: { opus: 64000, mp3: 96000 },
  music: { opus: 112000, mp3: 128000 },
} as const;
