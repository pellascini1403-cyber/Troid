import type { SoundRecipe } from '../catalog';
import { dual, type Stereo } from '../dsp/core';
import { lowpass } from '../dsp/filter';
import { bell } from '../dsp/inst';
import { bubble, breath, burst, click, finish, layers, ring, sparkle, swell, swoosh, thump, toMono, zip } from '../dsp/sfxlib';

/**
 * THE POWERS AND THE BOTTLES (docs/PROMPT18-LOG.md). Magic here is LIGHT: bright, airy, ringing — gathered (a rising shimmer), released (a zip and a ring), spent (a spark), refused (a dull buzz that says no). The bottle is the
 * opposite, the warmest thing in the game: a cork, a few bubbles, and a chime that rises as the life comes back.
 */

const mono = (s: Stereo): Stereo => dual(toMono(s));

export const MAGIC_SOUNDS: SoundRecipe[] = [
  {
    id: 'magic.cast.start',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.22, [
            { sound: swoosh(0.14, 700, 3600, { q: 1.6, rise: 0.95, pink: true }, rnd), db: -2 },
            { sound: sparkle(0.08, 4, 2200, 7000, { tau: 0.04, durSec: 0.2 }, rnd), db: -9, at: 0.03 },
            { sound: zip(0.14, 420, 1300, { harmonics: [2, 3.01], tau: 0.2, rise: 0.5 }), db: -12 },
          ]),
          { peakDb: -11, hpHz: 250, room: { rt60: 0.4, size: 0.5, wet: 0.1 } },
        ),
      ),
    cooldownMs: 100,
    voices: 1,
    priority: 5,
    reverb: 0.2,
    note: 'the hero gathers the Spirit Bolt: a short rising shimmer, as long as the preparation (a tenth of a second) and quiet — the release is what is heard',
  },
  {
    id: 'magic.cast.release',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.9, [
            { sound: click(0.012, 3000, 0.003, rnd), db: -6 },
            { sound: zip(0.26, 3000, 500, { harmonics: [1.5, 2.01], tau: 0.09 }), db: -1 },
            { sound: swoosh(0.32, 6000, 900, { q: 0.9, rise: 0.1 }, rnd), db: -4 },
            { sound: burst(0.05, 2000, 9000, 0.014, rnd), db: -8 },
            { sound: ring([880, 1320, 2640], 0.6, { q: 60, tau: 0.2 }, rnd), db: -16 },
          ]),
          { peakDb: -3, hpHz: 150, room: { rt60: 0.9, size: 0.8, wet: 0.24 } },
        ),
      ),
    pitchCents: 150,
    gainJitterDb: 1,
    cooldownMs: 120,
    voices: 2,
    priority: 8,
    reverb: 0.4,
    duck: { db: -2, ms: 240 },
    note: 'the Spirit Bolt leaves the hero: a bright zip falling away and a ring',
  },
  {
    id: 'magic.bolt.fizzle',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.4, [
            { sound: sparkle(0.12, 5, 2500, 8000, { tau: 0.04, durSec: 0.3 }, rnd), db: -2 },
            { sound: swoosh(0.22, 5000, 1500, { q: 1, rise: 0.1 }, rnd), db: -10 },
            { sound: zip(0.16, 2600, 1200, { tau: 0.06 }), db: -12 },
          ]),
          { peakDb: -10, hpHz: 600, room: { rt60: 0.5, size: 0.6, wet: 0.14 } },
        ),
      ),
    pitchCents: 200,
    gainJitterDb: 1.5,
    cooldownMs: 80,
    voices: 2,
    priority: 3,
    reverb: 0.3,
    note: 'the bolt ends on a wall or at the end of its reach: a small spark and nothing more',
  },
  {
    id: 'magic.denied',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.32, [
            { sound: lowpass(zip(0.22, 190, 78, { harmonics: [2, 3], tau: 0.09 }), 900), db: -2 },
            { sound: click(0.012, 600, 0.004, rnd, 3000), db: -6 },
            { sound: breath(0.14, 800, 300, { rise: 0.1 }, rnd), db: -14 },
          ]),
          { peakDb: -7, hpHz: 60, room: { rt60: 0.25, size: 0.4, wet: 0.06 } },
        ),
      ),
    cooldownMs: 150,
    voices: 1,
    priority: 5,
    reverb: 0.1,
    note: 'not enough magic: a dull buzz that falls — the power does not leave',
  },
  {
    id: 'bottle.start',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.6, [
            { sound: thump(320, 200, 0.03, 0.1), db: -10 },
            { sound: click(0.02, 900, 0.006, rnd, 5000), db: -10 },
            { sound: bubble(380, 0.06, 1.6), db: -8, at: 0.06 },
            { sound: bubble(330, 0.07, 1.7), db: -9, at: 0.18 },
            { sound: bubble(420, 0.06, 1.5), db: -10, at: 0.3 },
            { sound: breath(0.4, 600, 1200, { rise: 0.4 }, rnd), db: -20, at: 0.05 },
          ]),
          { peakDb: -9, hpHz: 140, room: { rt60: 0.35, size: 0.5, wet: 0.08 } },
        ),
      ),
    cooldownMs: 200,
    voices: 1,
    priority: 5,
    reverb: 0.15,
    note: 'the hero uncorks a bottle and drinks: a cork and a few bubbles',
  },
  {
    id: 'bottle.drunk',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(1.9, [
            { sound: bell(880, 1.6, { kind: 'glass', decaySec: 1.3, click: 0.06 }, rnd), db: -2 },
            { sound: bell(1318.5, 1.5, { kind: 'glass', decaySec: 1.2, click: 0.04 }, rnd), db: -5, at: 0.12 },
            { sound: swell(440, 1.5, { ratios: [1, 2, 3], attack: 0.3, release: 0.9 }, rnd), db: -10 },
            { sound: sparkle(0.9, 8, 2500, 7500, { tau: 0.16, durSec: 1.6 }, rnd), db: -13, at: 0.1 },
            { sound: breath(0.35, 900, 400, { rise: 0.2 }, rnd), db: -18, at: 0.05 },
          ]),
          { peakDb: -5, hpHz: 120, room: { rt60: 1.3, size: 1.0, wet: 0.3 } },
        ),
      ),
    cooldownMs: 300,
    voices: 1,
    priority: 8,
    reverb: 0.4,
    note: 'the life comes back: a warm chime that rises — the most welcome sound in the game',
  },
  {
    id: 'bottle.interrupted',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.5, [
            { sound: burst(0.3, 400, 4000, 0.09, rnd), db: -3 },
            { sound: bubble(520, 0.05, 1.5), db: -10, at: 0.03 },
            { sound: bubble(440, 0.05, 1.5), db: -11, at: 0.11 },
            { sound: thump(200, 100, 0.04, 0.12), db: -8 },
            { sound: click(0.012, 1200, 0.004, rnd), db: -8 },
          ]),
          { peakDb: -8, hpHz: 120, room: { rt60: 0.3, size: 0.4, wet: 0.06 } },
        ),
      ),
    cooldownMs: 200,
    voices: 1,
    priority: 5,
    reverb: 0.1,
    note: 'the drink is broken: the liquid spills',
  },
  {
    id: 'bottle.denied',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) => mono(finish(layers(0.18, [{ sound: thump(300, 180, 0.03, 0.12), db: -2 }, { sound: click(0.012, 900, 0.003, rnd, 4000), db: -6 }]), { peakDb: -10, hpHz: 100, room: { rt60: 0.2, size: 0.3, wet: 0.04 } })),
    cooldownMs: 250,
    voices: 1,
    priority: 4,
    reverb: 0.05,
    note: 'there is nothing to drink (or the life is full): a dull tap on wood',
  },
  {
    id: 'bottle.ready',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(finish(layers(0.8, [{ sound: bell(1760, 0.7, { kind: 'glass', decaySec: 0.5, click: 0.03 }, rnd), db: -2 }, { sound: sparkle(0.1, 3, 3000, 6000, { tau: 0.08, durSec: 0.5 }, rnd), db: -14 }]), { peakDb: -14, hpHz: 400, room: { rt60: 0.8, size: 0.8, wet: 0.2 } })),
    cooldownMs: 500,
    voices: 1,
    priority: 3,
    reverb: 0.3,
    note: 'a bottle has filled again: a soft glass chime, quiet on purpose',
  },
];
