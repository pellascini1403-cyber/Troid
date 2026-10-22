import type { SoundRecipe } from '../catalog';
import { dual, hz, type Stereo } from '../dsp/core';
import { bell, choir } from '../dsp/inst';
import { burst, click, finish, grind, layers, ring, sparkle, swell, swoosh, thump, toMono, zip } from '../dsp/sfxlib';

/**
 * THE WORLD'S OWN SOUNDS (docs/PROMPT18-LOG.md): the things the hero touches — an object picked up, a shrine, a lever, a door of stone, the seal of ink that breaks — and the soft pass of a change of zone. Stone and
 * mechanism are heavy and low and take their time; magic is bright and rings; the shrine is the one place in the game that is allowed to be warm and human, with a voice that is not a person's.
 */

const mono = (s: Stereo): Stereo => dual(toMono(s));

export const WORLD_SOUNDS: SoundRecipe[] = [
  {
    id: 'interact.pickup',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (v, rnd) => {
      const root = v === 0 ? 587.33 : 523.25; // D5 or C5
      return mono(
        finish(
          layers(1.5, [
            { sound: bell(root, 1.1, { kind: 'glass', decaySec: 0.9, click: 0.05 }, rnd), db: -2 },
            { sound: bell(root * 1.26, 1.0, { kind: 'glass', decaySec: 0.8, click: 0.04 }, rnd), db: -4, at: 0.075 },
            { sound: bell(root * 1.5, 1.0, { kind: 'glass', decaySec: 0.8, click: 0.04 }, rnd), db: -5, at: 0.15 },
            { sound: bell(root * 2, 1.2, { kind: 'glass', decaySec: 1.0, click: 0.04 }, rnd), db: -4, at: 0.225 },
            { sound: sparkle(0.5, 8, 3000, 8000, { tau: 0.12, durSec: 1.2 }, rnd), db: -14, at: 0.1 },
          ]),
          { peakDb: -6, hpHz: 250, room: { rt60: 1.0, size: 0.9, wet: 0.26 } },
        ),
      );
    },
    cooldownMs: 300,
    voices: 1,
    priority: 8,
    reverb: 0.4,
    note: 'something is picked up: four bells going up',
  },
  {
    id: 'interact.rest',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(3.2, [
            { sound: choir(hz('D3'), 2.8, 'o', { attack: 0.9, release: 1.4 }, rnd), db: -6 },
            { sound: choir(hz('A3'), 2.8, 'o', { attack: 1.0, release: 1.4 }, rnd), db: -8, at: 0.1 },
            { sound: choir(hz('F4'), 2.6, 'a', { attack: 1.1, release: 1.4 }, rnd), db: -10, at: 0.2 },
            { sound: bell(hz('D4'), 2.4, { kind: 'bronze', decaySec: 2.2, click: 0.08 }, rnd), db: -9 },
            { sound: sparkle(1.6, 14, 1500, 6000, { tau: 0.22, durSec: 2.8 }, rnd), db: -17, at: 0.3 },
            { sound: thump(110, 55, 0.12, 0.5), db: -14 },
          ]),
          { peakDb: -5, hpHz: 60, room: { rt60: 2.2, size: 1.5, wet: 0.4 } },
        ),
      ),
    cooldownMs: 1500,
    voices: 1,
    priority: 9,
    reverb: 0.6,
    duck: { db: -3, ms: 600 },
    note: 'the hero rests at a shrine: a chord of voices that are not a person\'s and a bronze bell — the warmest moment of the game',
  },
  {
    id: 'interact.open',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.9, [
            { sound: thump(95, 50, 0.08, 0.4), db: -2 },
            { sound: click(0.02, 1500, 0.004, rnd), db: -2 },
            { sound: ring([620, 1480, 2900], 0.45, { q: 50, tau: 0.16 }, rnd), db: -12, at: 0.01 },
            { sound: grind(0.5, { lowHz: 200, raspHz: 600, knocks: 2, level: 0.8 }, rnd), db: -10, at: 0.08 },
          ]),
          { peakDb: -5, hpHz: 50, room: { rt60: 0.7, size: 0.9, wet: 0.18 } },
        ),
      ),
    pitchCents: 80,
    gainJitterDb: 1,
    cooldownMs: 300,
    voices: 1,
    priority: 7,
    reverb: 0.4,
    note: 'a lever or a latch: a heavy click, a ring of metal, a little stone dragged',
  },
  {
    id: 'interact.activate',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(1.1, [
            { sound: swell(196, 0.95, { ratios: [1, 2, 3.01, 4.2], attack: 0.3, release: 0.5 }, rnd), db: -3 },
            { sound: sparkle(0.5, 7, 1800, 5200, { tau: 0.12, durSec: 1.0 }, rnd), db: -12 },
            { sound: zip(0.5, 220, 660, { tau: 0.3, rise: 0.3 }), db: -14 },
          ]),
          { peakDb: -8, hpHz: 80, room: { rt60: 0.9, size: 0.9, wet: 0.24 } },
        ),
      ),
    cooldownMs: 400,
    voices: 1,
    priority: 6,
    reverb: 0.4,
    note: 'a thing of energy is woken: a hum that swells',
  },
  {
    id: 'gate.open',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(2.4, [
            { sound: thump(82, 40, 0.2, 0.9), db: -4 },
            { sound: grind(2.0, { lowHz: 180, raspHz: 520, knocks: 5, level: 1 }, rnd), db: -2, at: 0.1 },
            { sound: burst(0.6, 150, 3500, 0.2, rnd), db: -16, at: 0.05 },
            { sound: thump(100, 45, 0.15, 0.6), db: -3, at: 2.0 },
          ]),
          { peakDb: -3, hpHz: 35, room: { rt60: 1.4, size: 1.3, wet: 0.3 } },
        ),
      ),
    cooldownMs: 1000,
    voices: 1,
    priority: 7,
    reverb: 0.5,
    note: 'a door of stone opens: the grind of a slab and its last knock',
  },
  {
    id: 'gate.close',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(1.8, [
            { sound: grind(1.1, { lowHz: 200, raspHz: 560, knocks: 3, level: 1 }, rnd), db: -2 },
            { sound: thump(90, 38, 0.2, 0.9), db: 0, at: 1.05 },
            { sound: burst(0.5, 100, 3000, 0.16, rnd), db: -8, at: 1.05 },
            { sound: ring([140, 330, 720], 0.7, { q: 40, tau: 0.3 }, rnd), db: -16, at: 1.06 },
          ]),
          { peakDb: -2, hpHz: 35, room: { rt60: 1.4, size: 1.3, wet: 0.3 } },
        ),
      ),
    cooldownMs: 1000,
    voices: 1,
    priority: 8,
    reverb: 0.5,
    note: 'the doors of the arena close behind the hero: a slab that slides and falls into place',
  },
  {
    id: 'seal.break',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(2.8, [
            { sound: swoosh(1.0, 800, 9000, { rise: 0.85, q: 0.9 }, rnd), db: -10 },
            { sound: thump(70, 28, 0.3, 1.4), db: -1, at: 0.55 },
            { sound: sparkle(1.5, 36, 1200, 9000, { tau: 0.3, durSec: 2.4 }, rnd), db: -6, at: 0.5 },
            { sound: ring([1900, 3300, 5100, 7700], 1.4, { q: 80, tau: 0.45 }, rnd), db: -10, at: 0.55 },
            { sound: zip(1.0, 300, 1800, { harmonics: [1.5, 2], tau: 0.6, rise: 0.5 }), db: -14 },
            { sound: burst(0.5, 200, 6000, 0.12, rnd), db: -6, at: 0.55 },
          ]),
          { peakDb: -2, hpHz: 35, room: { rt60: 2.2, size: 1.5, wet: 0.4 } },
        ),
      ),
    cooldownMs: 2000,
    voices: 1,
    priority: 9,
    reverb: 0.6,
    duck: { db: -3, ms: 900 },
    note: 'the seal of ink dissolves under the bolt: a charge that rises, then a shatter of crystal over a deep boom',
  },
  {
    id: 'transition.pass',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(1.5, [
            { sound: swoosh(1.4, 180, 700, { q: 0.7, pink: true, rise: 0.5 }, rnd), db: -3 },
            { sound: thump(72, 40, 0.3, 0.9), db: -8, at: 0.2 },
            { sound: swell(110, 1.3, { ratios: [1, 1.5], attack: 0.5, release: 0.7 }, rnd), db: -14 },
          ]),
          { peakDb: -10, hpHz: 45, room: { rt60: 1.2, size: 1.2, wet: 0.2 } },
        ),
      ),
    cooldownMs: 1000,
    voices: 1,
    priority: 4,
    reverb: 0.3,
    note: 'the hero walks out of a zone into the next: a soft pass of air, low, under the fade',
  },
];

