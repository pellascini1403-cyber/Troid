import type { SoundRecipe } from '../catalog';
import { dual, hz, secs, times, type Stereo } from '../dsp/core';
import { envelope } from '../dsp/env';
import { bandpass, lowpass } from '../dsp/filter';
import { bell, choir, fmBell, gong, shimmer } from '../dsp/inst';
import { expLine, saw, vibrato } from '../dsp/osc';
import { burst, click, finish, layers, ring, sparkle, swell, swoosh, thump, toMono, zip, bubble } from '../dsp/sfxlib';

/**
 * THE SMALL SOUNDS OF THE PLACES, THE HERO'S HEART AND THE STINGERS (docs/PROMPT18-LOG.md).
 *
 * The scattered sounds of the ambience — a drop, a stone, a gust, a creak of wood, a far resonance, a pulse of the seal, the breath of the sanctum — are the things that HAPPEN in a place, now and then, at a distance;
 * they are quiet, far, and wet with the echo of the room they are in. Played often they would be a tic, so each is a short event with a long tail and nothing in it that asks to be listened to.
 *
 * The heart is the one danger the hero carries inside them: low and dull, a pulse to be felt more than heard (a phone's speaker has nothing under 100 Hz, so there is a knock of the chest in it that it can play).
 *
 * The stingers are the music of a moment: a card won, a power returned, a guardian fallen. They are short pieces for bells, voices and a gong — made of the same instruments as the score, so that they belong to it.
 */

const mono = (s: Stereo): Stereo => dual(toMono(s));

export const ATMOSPHERE_SOUNDS: SoundRecipe[] = [
  {
    id: 'hero.heartbeat',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.7, [
            { sound: thump(96, 52, 0.05, 0.3), db: -5 },
            { sound: burst(0.07, 110, 420, 0.024, rnd), db: -2 },
            { sound: click(0.012, 700, 0.004, rnd, 3000), db: -14 },
            { sound: thump(84, 46, 0.06, 0.32), db: -9, at: 0.19 },
            { sound: burst(0.07, 100, 360, 0.024, rnd), db: -7, at: 0.19 },
          ]),
          { peakDb: -11, hpHz: 60, room: { rt60: 0.5, size: 0.5, wet: 0.06 } },
        ),
      ),
    cooldownMs: 300,
    voices: 1,
    priority: 3,
    reverb: 0.05,
    note: 'the hero\'s heart when their life is low: a lub-dub to be felt more than heard',
  },

  {
    id: 'amb.drip',
    bus: 'ambience',
    group: 'amb',
    variants: 3,
    channels: 1,
    render: (v, rnd) => {
      const f = [1180, 1480, 960][v] as number;
      return mono(
        finish(
          layers(0.4, [
            { sound: bubble(f, 0.05, 2.1), db: 0 },
            { sound: ring([f * 2.02, f * 3.1, f * 4.7], 0.35, { q: 55, tau: 0.09 }, rnd), db: -16, at: 0.005 },
            { sound: click(0.01, 2400, 0.002, rnd), db: -14 },
          ]),
          { peakDb: -17, hpHz: 420, room: { rt60: 2.6, size: 1.6, damp: 0.45, wet: 0.62 }, trimDb: -50 },
        ),
      );
    },
    pitchCents: 160,
    gainJitterDb: 2.5,
    cooldownMs: 700,
    voices: 2,
    priority: 2,
    reverb: 0.2,
    note: 'a drop of water falling into a pool in a large dark space, far away',
  },
  {
    id: 'amb.stone',
    bus: 'ambience',
    group: 'amb',
    variants: 2,
    channels: 1,
    render: (v, rnd) =>
      mono(
        finish(
          layers(0.9, [
            { sound: click(0.012, 1300, 0.003, rnd, 8000), db: -1 },
            { sound: thump(150 + v * 40, 80, 0.03, 0.14), db: -6, at: 0.004 },
            { sound: burst(0.35, 600, 2800, 0.12, rnd), db: -12, at: 0.015 },
            { sound: click(0.01, 1700, 0.002, rnd), db: -9, at: 0.11 },
            { sound: click(0.008, 2000, 0.002, rnd), db: -13, at: 0.19 + v * 0.05 },
          ]),
          { peakDb: -17, hpHz: 140, room: { rt60: 1.9, size: 1.3, damp: 0.5, wet: 0.45 } },
        ),
      ),
    pitchCents: 220,
    gainJitterDb: 2,
    cooldownMs: 1500,
    voices: 1,
    priority: 2,
    reverb: 0.2,
    note: 'a stone settling somewhere in the ruins: a knock, a short fall of dust and two small clicks',
  },
  {
    id: 'amb.wind.gust',
    bus: 'ambience',
    group: 'amb',
    variants: 2,
    channels: 1,
    render: (v, rnd) =>
      mono(
        finish(
          layers(3.4, [
            { sound: swoosh(3.0, 220 + v * 80, 760 + v * 120, { pink: true, q: 1.5, rise: 0.4, shape: 1.6 }, rnd), db: 0 },
            { sound: swoosh(2.6, 900, 1700, { pink: true, q: 4, rise: 0.5, shape: 2 }, rnd), db: -13, at: 0.2 },
            { sound: zip(2.4, 420 + v * 60, 560 + v * 60, { tau: 1.1, rise: 0.4 }), db: -30, at: 0.3 },
          ]),
          { peakDb: -18, hpHz: 100, fadeMs: 80, room: { rt60: 1.4, size: 1.2, wet: 0.25 } },
        ),
      ),
    pitchCents: 200,
    gainJitterDb: 2,
    cooldownMs: 6000,
    voices: 1,
    priority: 1,
    reverb: 0.1,
    note: 'a gust of wind through a gap in the masonry, in the distance',
  },
  {
    id: 'amb.roots.creak',
    bus: 'ambience',
    group: 'amb',
    variants: 2,
    channels: 1,
    render: (v, rnd) => {
      const n = secs(1.3);
      const glide = expLine(n, 180 + v * 50, 118 + v * 30);
      const wobble = vibrato(n, 9 + rnd() * 4, 60, 0.05, 0.1, rnd());
      for (let i = 0; i < n; i++) glide[i] = (glide[i] as number) * (wobble[i] as number);
      const wood = bandpass(saw(n, glide, rnd()), expLine(n, 900, 520), 4.5);
      const body = times(wood, envelope(n, [[0, 0], [0.12, 1], [0.5, 0.7], [1.3, 0]]));
      return mono(
        finish(
          layers(1.4, [
            { sound: body, db: 0 },
            { sound: thump(110, 60, 0.05, 0.2), db: -10, at: 0.02 },
            { sound: burst(0.5, 300, 1500, 0.2, rnd), db: -20, at: 0.05 },
          ]),
          { peakDb: -18, hpHz: 110, room: { rt60: 1.1, size: 0.9, damp: 0.7, wet: 0.3 } },
        ),
      );
    },
    pitchCents: 260,
    gainJitterDb: 2,
    cooldownMs: 5000,
    voices: 1,
    priority: 1,
    reverb: 0.15,
    note: 'old wood and roots creaking under their own weight',
  },
  {
    id: 'amb.echo.far',
    bus: 'ambience',
    group: 'amb',
    variants: 2,
    channels: 1,
    render: (v, rnd) => {
      const root = [hz('D2'), hz('Eb2')][v] as number;
      const g = lowpass(gong(root, 4.2, { decaySec: 4 }, rnd), 1100, 0.8);
      return mono(
        finish(
          layers(4.4, [
            { sound: g, db: 0 },
            { sound: bell(root * 3.01, 3.4, { kind: 'bronze', decaySec: 2.6, click: 0 }, rnd), db: -16, at: 0.04 },
          ]),
          { peakDb: -19, hpHz: 60, fadeMs: 100, room: { rt60: 3.2, size: 1.8, damp: 0.5, wet: 0.5 } },
        ),
      );
    },
    gainJitterDb: 2,
    cooldownMs: 12000,
    voices: 1,
    priority: 1,
    reverb: 0.25,
    note: 'something far below rings once, very low, and is gone: a resonance in the dark that tells the chamber is deep',
  },
  {
    id: 'amb.magic.pulse',
    bus: 'ambience',
    group: 'amb',
    variants: 2,
    channels: 1,
    render: (v, rnd) => {
      const f = [hz('F#4'), hz('A4')][v] as number;
      return mono(
        finish(
          layers(2.4, [
            { sound: swell(f, 1.9, { ratios: [1, 2, 3, 4.01], attack: 0.7, release: 1.1, shimmerHz: 6 }, rnd), db: 0 },
            { sound: thump(75, 42, 0.18, 0.7), db: -7, at: 0.3 },
            { sound: sparkle(1.1, 7, 2200, 6500, { tau: 0.2, durSec: 2.0 }, rnd), db: -16, at: 0.5 },
          ]),
          { peakDb: -18, hpHz: 70, fadeMs: 60, room: { rt60: 2.4, size: 1.4, wet: 0.4 } },
        ),
      );
    },
    pitchCents: 120,
    gainJitterDb: 2,
    cooldownMs: 6000,
    voices: 1,
    priority: 2,
    reverb: 0.2,
    note: 'the seal\'s magic stirs: a soft swell of tones and a low pulse under them — the energy of the place breathing',
  },
  {
    id: 'amb.sanctum.breath',
    bus: 'ambience',
    group: 'amb',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(6.2, [
            { sound: choir(hz('A2'), 5.4, 'o', { attack: 2.2, release: 2.6 }, rnd), db: 0 },
            { sound: choir(hz('E3'), 5.2, 'o', { attack: 2.4, release: 2.6 }, rnd), db: -3, at: 0.3 },
            { sound: shimmer(hz('A5'), 5.0, { partials: 4, level: 0.7 }, rnd), db: -17, at: 0.8 },
          ]),
          { peakDb: -19, hpHz: 70, fadeMs: 120, room: { rt60: 3.4, size: 2.0, damp: 0.4, wet: 0.5 } },
        ),
      ),
    cooldownMs: 20000,
    voices: 1,
    priority: 2,
    reverb: 0.2,
    note: 'the sanctum breathes: two voices that are no person\'s hold an open fifth and let it go',
  },

  // ------------------------------------------------------------------------------------------ the stingers
  {
    id: 'stinger.card',
    bus: 'music',
    group: 'core',
    variants: 1,
    channels: 2,
    render: (_v, rnd) =>
      finish(
        layers(2.8, [
          { sound: fmBell(hz('D5'), 1.8, { ratio: 3.5, index: 3, decaySec: 1.2, indexDecaySec: 0.3 }, rnd), db: -4, pan: -0.35 },
          { sound: fmBell(hz('F#5'), 1.7, { ratio: 3.5, index: 3, decaySec: 1.1, indexDecaySec: 0.3 }, rnd), db: -5, at: 0.16, pan: 0.2 },
          { sound: fmBell(hz('A5'), 1.7, { ratio: 3.5, index: 2.6, decaySec: 1.1, indexDecaySec: 0.3 }, rnd), db: -5, at: 0.32, pan: -0.15 },
          { sound: fmBell(hz('D6'), 2.0, { ratio: 3.5, index: 2.2, decaySec: 1.4, indexDecaySec: 0.3 }, rnd), db: -6, at: 0.5, pan: 0.35 },
          { sound: swell(hz('D4'), 2.2, { ratios: [1, 2, 3], attack: 0.5, release: 1.2 }, rnd), db: -14, at: 0.3 },
          { sound: sparkle(1.3, 12, 2500, 8000, { tau: 0.16, durSec: 2.2 }, rnd), db: -18, at: 0.4 },
          { sound: thump(98, 49, 0.12, 0.6), db: -14 },
        ]),
        { peakDb: -7, hpHz: 90, room: { rt60: 2.4, size: 1.3, wet: 0.38 } },
      ),
    cooldownMs: 1500,
    voices: 1,
    priority: 10,
    reverb: 0,
    duck: { db: -4, ms: 1800 },
    note: 'a card is won: four glass bells going up, a swell under them',
  },
  {
    id: 'stinger.unlock',
    bus: 'music',
    group: 'core',
    variants: 1,
    channels: 2,
    render: (_v, rnd) =>
      finish(
        layers(4.8, [
          { sound: gong(hz('D2'), 4.4, { decaySec: 4.2 }, rnd), db: -6, pan: -0.1 },
          { sound: choir(hz('D3'), 4.0, 'a', { attack: 1.0, release: 2.0 }, rnd), db: -6, at: 0.3, pan: -0.3 },
          { sound: choir(hz('A3'), 4.0, 'a', { attack: 1.1, release: 2.0 }, rnd), db: -7, at: 0.35, pan: 0.3 },
          { sound: choir(hz('F#4'), 3.8, 'o', { attack: 1.2, release: 2.0 }, rnd), db: -9, at: 0.45, pan: -0.15 },
          { sound: choir(hz('D4'), 3.8, 'a', { attack: 1.3, release: 2.0 }, rnd), db: -10, at: 0.5, pan: 0.15 },
          { sound: fmBell(hz('A5'), 2.4, { ratio: 3.5, index: 3.2, decaySec: 1.6, indexDecaySec: 0.4 }, rnd), db: -8, at: 0.9, pan: 0.3 },
          { sound: fmBell(hz('D6'), 2.6, { ratio: 3.5, index: 3, decaySec: 1.8, indexDecaySec: 0.4 }, rnd), db: -8, at: 1.15, pan: -0.3 },
          { sound: fmBell(hz('F#6'), 2.6, { ratio: 3.5, index: 2.4, decaySec: 1.8, indexDecaySec: 0.4 }, rnd), db: -10, at: 1.4 },
          { sound: sparkle(2.4, 20, 2000, 9000, { tau: 0.2, durSec: 3.8 }, rnd), db: -17, at: 0.8 },
        ]),
        { peakDb: -6, hpHz: 55, room: { rt60: 3.0, size: 1.8, wet: 0.42 } },
      ),
    cooldownMs: 3000,
    voices: 1,
    priority: 10,
    reverb: 0,
    duck: { db: -6, ms: 3200 },
    note: 'a power returns to the hero: a gong, a chord of voices that are no person\'s that opens upward, bells on top',
  },
  {
    id: 'stinger.victory',
    bus: 'music',
    group: 'boss',
    variants: 1,
    channels: 2,
    render: (_v, rnd) => {
      const toll = (at: number, note: string, db: number): { sound: Float32Array; at: number; db: number; pan: number } => ({
        sound: bell(hz(note), 3.2, { kind: 'bronze', decaySec: 3.0, click: 0.06 }, rnd),
        at,
        db,
        pan: at < 1 ? -0.2 : 0.2,
      });
      return finish(
        layers(7.2, [
          { sound: gong(hz('D2'), 6.4, { decaySec: 6 }, rnd), db: -4 },
          toll(0.9, 'D4', -7),
          toll(2.1, 'A4', -8),
          toll(3.3, 'D5', -9),
          { sound: choir(hz('D3'), 5.4, 'o', { attack: 1.4, release: 2.6 }, rnd), db: -9, at: 1.2, pan: -0.3 },
          { sound: choir(hz('A3'), 5.4, 'o', { attack: 1.5, release: 2.6 }, rnd), db: -10, at: 1.3, pan: 0.3 },
          { sound: choir(hz('F#4'), 5.0, 'a', { attack: 1.8, release: 2.6 }, rnd), db: -12, at: 2.2 },
          { sound: shimmer(hz('A5'), 5.2, { partials: 5, level: 1 }, rnd), db: -17, at: 1.6 },
          { sound: sparkle(3.2, 18, 1800, 7000, { tau: 0.26, durSec: 5.8 }, rnd), db: -19, at: 2.2 },
        ]),
        { peakDb: -6, hpHz: 50, fadeMs: 160, room: { rt60: 3.8, size: 2.0, wet: 0.45 } },
      );
    },
    cooldownMs: 8000,
    voices: 1,
    priority: 10,
    reverb: 0,
    duck: { db: -7, ms: 4500 },
    note: 'a guardian has fallen: a gong, three tolls of a bronze bell going up an open fifth, and the voices settling on D major — grief and relief in one',
  },
];
