import type { SoundRecipe } from '../catalog';
import { dual, type Stereo } from '../dsp/core';
import { bell } from '../dsp/inst';
import { bubble, breath, burst, click, finish, layers, ring, sparkle, swell, swoosh, thump, toMono, zip } from '../dsp/sfxlib';

/**
 * THE BLOWS (docs/PROMPT18-LOG.md): the swing of the hero's blade, what it hits, what hurts the hero, what it is to fall, and the stone that turns a blow away. The swing, the hit and the cast are told apart on purpose: a swing is
 * AIR (a swept band of noise with a thread of energy in it), a hit is a BODY (a weight, a slap, a bubble of ink) and a cast is LIGHT (a bright zip and a ring) — so that in a fight the ear knows which of the three it is hearing.
 */

const mono = (s: Stereo): Stereo => dual(toMono(s));

const swing = (id: string, note: string, o: { f0: number; f1: number; len: number; weight: number; edge: [number, number]; airy?: boolean; cloth?: [number, number] }): SoundRecipe => ({
  id,
  bus: 'sfx',
  group: 'core',
  variants: 3,
  channels: 1,
  render: (_v, rnd) =>
    mono(
      finish(
        layers(o.len + 0.1, [
          { sound: swoosh(o.len, o.f0, o.f1, { q: 1.3, rise: o.airy ? 0.4 : 0.32, shape: 1.5 }, rnd), db: 0 },
          { sound: swoosh(o.len * 1.1, o.cloth?.[0] ?? 500, o.cloth?.[1] ?? 1500, { pink: true, q: 0.9, rise: 0.4 }, rnd), db: -13 },
          { sound: zip(o.len * 0.8, o.edge[0], o.edge[1], { tau: o.len * 0.4, rise: 0.02 }), db: -23 },
          ...(o.weight > 0 ? [{ sound: thump(150, 75, 0.035, 0.12), db: -10 - (1 - o.weight) * 8, at: 0 }] : []),
          ...(o.airy ? [{ sound: sparkle(o.len * 0.6, 3, 3000, 7000, { tau: 0.04, durSec: o.len }, rnd), db: -17 }] : []),
        ]),
        { peakDb: -5, hpHz: o.weight > 0 ? 260 : 380, room: { rt60: 0.35, size: 0.5, wet: 0.08 } },
      ),
    ),
  gainDb: 0,
  pitchCents: 140,
  gainJitterDb: 1.2,
  cooldownMs: 0,
  voices: 2,
  priority: 7,
  reverb: 0.15,
  note,
});

const hit = (id: string, note: string, heavy: boolean): SoundRecipe => ({
  id,
  bus: 'sfx',
  group: 'core',
  variants: 3,
  channels: 1,
  render: (_v, rnd) =>
    mono(
      finish(
        layers(heavy ? 0.7 : 0.45, [
          { sound: click(0.02, 2200, 0.004, rnd), db: -1 },
          { sound: burst(heavy ? 0.2 : 0.1, 250, heavy ? 2600 : 2100, heavy ? 0.05 : 0.025, rnd), db: -3 },
          { sound: thump(heavy ? 112 : 140, heavy ? 48 : 70, heavy ? 0.09 : 0.045, heavy ? 0.5 : 0.25), db: heavy ? 0 : -3 },
          { sound: bubble(heavy ? 420 : 520, 0.05, 2), db: -12, at: 0.012 },
          ...(heavy
            ? [
                { sound: bubble(360, 0.06, 2.2), db: -14, at: 0.05 },
                { sound: burst(0.3, 1400, 5200, 0.09, rnd), db: -14, at: 0.01 },
                { sound: ring([1750 + rnd() * 120, 3100, 4900], 0.3, { q: 70, tau: 0.1 }, rnd), db: -26 },
              ]
            : [{ sound: ring([1900, 3300], 0.15, { q: 70, tau: 0.04 }, rnd), db: -30 }]),
        ]),
        { peakDb: heavy ? -3 : -5, hpHz: 70, room: { rt60: heavy ? 0.5 : 0.35, size: 0.5, wet: heavy ? 0.14 : 0.1 } },
      ),
    ),
  gainDb: 0,
  pitchCents: 150,
  gainJitterDb: 1.5,
  cooldownMs: 25,
  voices: 4,
  priority: 8,
  reverb: 0.2,
  duck: { db: -2.5, ms: 220 },
  note,
});

const hurt = (id: string, note: string, heavy: boolean): SoundRecipe => ({
  id,
  bus: 'sfx',
  group: 'core',
  variants: 2,
  channels: 1,
  render: (_v, rnd) =>
    mono(
      finish(
        layers(heavy ? 0.9 : 0.6, [
          { sound: click(0.025, 2000, 0.005, rnd), db: -2 },
          { sound: zip(heavy ? 0.45 : 0.3, heavy ? 560 : 760, heavy ? 190 : 300, { harmonics: [1.06, 1.5], tau: 0.14 }), db: -5 },
          { sound: breath(heavy ? 0.4 : 0.22, 1700, 650, { rise: 0.1, voiced: 0.3, voiceHz: 390 }, rnd), db: -7 },
          { sound: thump(heavy ? 100 : 170, heavy ? 40 : 70, heavy ? 0.1 : 0.05, 0.3), db: heavy ? -1 : -6 },
          ...(heavy ? [{ sound: ring([2700, 4400, 6200], 0.3, { q: 80, tau: 0.09 }, rnd), db: -22 }] : []),
        ]),
        { peakDb: -3, hpHz: 70, room: { rt60: 0.5, size: 0.6, wet: 0.15 } },
      ),
    ),
  gainDb: 0,
  pitchCents: 60,
  gainJitterDb: 0.8,
  cooldownMs: 200,
  voices: 1,
  priority: 10,
  reverb: 0.25,
  duck: { db: -4, ms: 420 },
  note,
});

export const COMBAT_SOUNDS: SoundRecipe[] = [
  swing('hero.slash.1', 'the first blow of the chain: a light, quick cut of the air', { f0: 1400, f1: 5200, len: 0.16, weight: 0, edge: [4200, 2600] }),
  swing('hero.slash.2', 'the blow that finishes the chain: lower, longer, with weight behind it', { f0: 900, f1: 3600, len: 0.22, weight: 1, edge: [3000, 1700], cloth: [350, 1100] }),
  swing('hero.slash.air', 'the blow in the air: lighter and brighter, with a few sparks', { f0: 2200, f1: 7000, len: 0.18, weight: 0, edge: [5600, 3400], airy: true }),
  swing('hero.slash.crouch', 'the blow from a crouch: short and low', { f0: 700, f1: 2400, len: 0.12, weight: 0.5, edge: [3000, 2000], cloth: [300, 800] }),
  hit('hit.light', 'a blow that lands on an ink creature: a slap, a weight, a bubble', false),
  hit('hit.heavy', 'a hard blow that lands (or the last one): the weight of it, a splash, the clink of the blade', true),
  {
    id: 'hit.bolt',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.7, [
            { sound: zip(0.14, 3200, 700, { harmonics: [1.5, 2.01], tau: 0.06 }), db: -2 },
            { sound: sparkle(0.16, 7, 2200, 8200, { tau: 0.07, durSec: 0.5 }, rnd), db: -9 },
            { sound: burst(0.12, 800, 7500, 0.035, rnd), db: -6 },
            { sound: thump(210, 60, 0.05, 0.25), db: -7 },
            { sound: ring([1320, 1980, 3960], 0.5, { q: 60, tau: 0.18 }, rnd), db: -18 },
          ]),
          { peakDb: -3, hpHz: 90, room: { rt60: 0.9, size: 0.8, wet: 0.22 } },
        ),
      ),
    pitchCents: 120,
    gainJitterDb: 1.2,
    cooldownMs: 40,
    voices: 3,
    priority: 8,
    reverb: 0.4,
    duck: { db: -2.5, ms: 260 },
    note: 'the Spirit Bolt lands on something: a bright burst of light and a ring — not a blow of the blade',
  },
  {
    id: 'seal.reject',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(1.0, [
            { sound: click(0.02, 1800, 0.004, rnd), db: -2 },
            { sound: ring([980, 1620, 2750, 4100], 0.7, { q: 90, tau: 0.24 }, rnd), db: -2 },
            { sound: thump(125, 55, 0.07, 0.35), db: -3 },
            { sound: swell(330, 0.5, { ratios: [1, 1.505], attack: 0.02, release: 0.35 }, rnd), db: -16 },
          ]),
          { peakDb: -3, hpHz: 70, room: { rt60: 1.0, size: 1.2, wet: 0.26 } },
        ),
      ),
    pitchCents: 60,
    gainJitterDb: 1,
    cooldownMs: 120,
    voices: 2,
    priority: 8,
    reverb: 0.5,
    note: 'the seal turns a blow away: the ring of a ward on stone, and a hum that says it is not hurt',
  },
  hurt('hero.hurt.light', 'the hero is hit (one point): a crack, a falling note that does not agree with itself, a gasp', false),
  hurt('hero.hurt.heavy', 'the hero is hit hard: lower, longer, with a glassy crack', true),
  {
    id: 'hazard.spikes',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.4, [
            { sound: click(0.012, 4000, 0.003, rnd), db: 0 },
            { sound: ring([3300, 5200, 7600], 0.22, { q: 80, tau: 0.05 }, rnd), db: -6 },
            { sound: burst(0.05, 1500, 9000, 0.012, rnd), db: -8 },
            { sound: thump(230, 110, 0.03, 0.12), db: -8 },
          ]),
          { peakDb: -4, hpHz: 300, room: { rt60: 0.3, size: 0.4, wet: 0.08 } },
        ),
      ),
    pitchCents: 70,
    gainJitterDb: 1,
    cooldownMs: 250,
    voices: 1,
    priority: 9,
    reverb: 0.1,
    note: 'the spikes of the ditch: a metallic stab',
  },
  {
    id: 'hazard.lava',
    bus: 'sfx',
    group: 'core',
    variants: 3,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.75, [
            // a sear, not a stab: a hiss that falls, the weight of something heavy and hot, and the crackle of what it has caught
            { sound: burst(0.42, 1300, 7800, 0.13, rnd), db: 0 },
            { sound: swoosh(0.4, 1100, 260, { q: 0.8, rise: 0.08, shape: 1.2 }, rnd), db: -5 },
            { sound: thump(120, 52, 0.07, 0.24), db: -3 },
            { sound: sparkle(0.35, 9, 1800, 7000, { tau: 0.022, durSec: 0.55 }, rnd), db: -9, at: 0.03 },
            { sound: bubble(360, 0.06, 2), db: -12, at: 0.09 },
          ]),
          { peakDb: -4, hpHz: 140, room: { rt60: 0.4, size: 0.45, wet: 0.1 } },
        ),
      ),
    pitchCents: 90,
    gainJitterDb: 1,
    cooldownMs: 250,
    voices: 2,
    priority: 9,
    reverb: 0.12,
    note: 'the hero touches lava: a sear — a hiss that falls, a heavy hot weight and the crackle of what caught',
  },
  {
    id: 'hero.death',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(2.6, [
            { sound: zip(1.4, 900, 150, { harmonics: [2.01, 3.02], tau: 0.5 }), db: -8 },
            { sound: breath(1.5, 1200, 200, { rise: 0.1, voiced: 0.4, voiceHz: 300 }, rnd), db: -10 },
            { sound: sparkle(1.3, 14, 900, 4500, { tau: 0.25, durSec: 2.2 }, rnd), db: -14 },
            { sound: thump(92, 34, 0.25, 1.2), db: -3 },
            { sound: swell(110, 2.2, { ratios: [1, 1.5, 2.01], attack: 0.1, release: 1.6 }, rnd), db: -13 },
            { sound: swoosh(1.8, 4500, 300, { pink: true, rise: 0.08, q: 0.8 }, rnd), db: -12 },
          ]),
          { peakDb: -3, hpHz: 40, room: { rt60: 1.7, size: 1.2, wet: 0.34 } },
        ),
      ),
    cooldownMs: 1500,
    voices: 1,
    priority: 10,
    reverb: 0.4,
    note: 'the hero falls: a note that falls with them, a breath going out, light scattering — then silence',
  },
  {
    id: 'hero.respawn',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(1.7, [
            { sound: swell(330, 1.4, { ratios: [1, 2, 3, 5], attack: 0.5, release: 0.8 }, rnd), db: -8 },
            { sound: sparkle(1.0, 10, 1500, 6000, { tau: 0.18, durSec: 1.6 }, rnd), db: -11 },
            { sound: zip(0.7, 300, 1400, { harmonics: [2], tau: 0.4, rise: 0.4 }), db: -14 },
            { sound: thump(150, 70, 0.1, 0.4), db: -14, at: 0.45 },
            { sound: bell(660, 1.2, { kind: 'glass', decaySec: 1.2, click: 0.05 }, rnd), db: -12, at: 0.4 },
          ]),
          { peakDb: -6, hpHz: 90, room: { rt60: 1.4, size: 1.1, wet: 0.3 } },
        ),
      ),
    cooldownMs: 1500,
    voices: 1,
    priority: 9,
    reverb: 0.4,
    note: 'the hero comes back at the shrine: the light that fell, gathering itself',
  },
];

