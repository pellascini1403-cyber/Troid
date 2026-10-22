import type { SoundRecipe } from '../catalog';
import { dual, hz, type Stereo } from '../dsp/core';
import { choir, drone, gong, riser } from '../dsp/inst';
import { bubble, breath, burst, finish, layers, ring, sparkle, squelch, swell, swoosh, thump, toMono, zip, type Layer } from '../dsp/sfxlib';

/**
 * THE ENEMIES (docs/PROMPT18-LOG.md): the Ink Slime is a wet, low, slow thing — bubbles, squelches, a surge — whose one danger is a lunge it ANNOUNCES, so its wind-up has the clearest sound of the small ones: a hiss that rises
 * for as long as the wind-up lasts and ends where the lunge begins. The Ink Warden is the opposite of small: stone, a gong, a voice that is not a voice, and every attack it makes is announced by a sound that is different for each.
 */

const mono = (s: Stereo): Stereo => dual(toMono(s));

const cascade = (count: number, from: number, to: number, spread: number, rnd: () => number, db: number): Layer[] =>
  Array.from({ length: count }, (_, k) => {
    const f = from * (to / from) ** (k / Math.max(1, count - 1));
    return { sound: bubble(f * (0.9 + rnd() * 0.2), 0.05 + rnd() * 0.04, 1.4 + rnd() * 0.8), db: db - k * 0.6, at: (k / count) * spread + rnd() * 0.03 };
  });

export const ENEMY_SOUNDS: SoundRecipe[] = [
  {
    id: 'slime.alert',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.45, [
            { sound: bubble(220, 0.09, 1.5), db: -2 },
            { sound: bubble(180, 0.08, 1.6), db: -4, at: 0.09 },
            { sound: squelch(0.24, { f: 130, wobble: 0.5, glide: 0.5 }, rnd), db: -4 },
            { sound: breath(0.22, 300, 600, { rise: 0.3, voiced: 0.5, voiceHz: 110 }, rnd), db: -12 },
          ]),
          { peakDb: -8, hpHz: 70, room: { rt60: 0.4, size: 0.5, wet: 0.1 } },
        ),
      ),
    pitchCents: 200,
    gainJitterDb: 1.5,
    cooldownMs: 300,
    voices: 2,
    priority: 6,
    reverb: 0.25,
    note: 'an Ink Slime notices the hero: a gurgle',
  },
  {
    id: 'slime.telegraph',
    bus: 'sfx',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.5, [
            { sound: swoosh(0.42, 700, 3200, { q: 1.8, rise: 0.92, pink: true }, rnd), db: -1 },
            { sound: zip(0.42, 1100, 2000, { tau: 0.5, rise: 0.5 }), db: -15 },
            { sound: bubble(300, 0.05, 1.8), db: -8, at: 0.04 },
            { sound: bubble(340, 0.05, 1.8), db: -8, at: 0.14 },
            { sound: bubble(390, 0.05, 1.8), db: -8, at: 0.23 },
            { sound: bubble(450, 0.04, 1.8), db: -8, at: 0.3 },
            { sound: bubble(520, 0.04, 1.8), db: -7, at: 0.35 },
            { sound: swell(90, 0.42, { ratios: [1, 1.5], attack: 0.3, release: 0.1 }, rnd), db: -10 },
          ]),
          { peakDb: -5, hpHz: 70, room: { rt60: 0.4, size: 0.5, wet: 0.1 } },
        ),
      ),
    cooldownMs: 250,
    voices: 2,
    priority: 9,
    reverb: 0.2,
    note: 'the Ink Slime winds up to lunge: a hiss that rises for as long as the wind-up lasts (0.4 s) — the warning of the fight',
  },
  {
    id: 'slime.lunge',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.4, [
            { sound: squelch(0.28, { f: 140, wobble: 0.7, glide: 1.0 }, rnd), db: -2 },
            { sound: swoosh(0.2, 400, 1800, { pink: true, rise: 0.2 }, rnd), db: -8 },
            { sound: thump(150, 60, 0.05, 0.2), db: -6 },
            { sound: burst(0.1, 500, 3000, 0.03, rnd), db: -8 },
          ]),
          { peakDb: -5, hpHz: 70, room: { rt60: 0.35, size: 0.5, wet: 0.08 } },
        ),
      ),
    pitchCents: 150,
    gainJitterDb: 1.2,
    cooldownMs: 200,
    voices: 2,
    priority: 8,
    reverb: 0.2,
    note: 'the Ink Slime lunges: a wet surge',
  },
  {
    id: 'slime.death',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(1.1, [
            { sound: burst(0.5, 300, 5000, 0.14, rnd), db: -2 },
            ...cascade(8, 900, 220, 0.7, rnd, -8),
            { sound: thump(220, 45, 0.2, 0.9), db: -3 },
            { sound: squelch(0.6, { f: 100, wobble: 0.6, glide: 1.5 }, rnd), db: -8, at: 0.05 },
          ]),
          { peakDb: -3, hpHz: 60, room: { rt60: 0.7, size: 0.7, wet: 0.16 } },
        ),
      ),
    pitchCents: 150,
    gainJitterDb: 1.2,
    cooldownMs: 100,
    voices: 3,
    priority: 8,
    reverb: 0.3,
    note: 'an Ink Slime falls apart: a splash and a cascade of bubbles that falls',
  },
  // ------------------------------------------------------------------------------------------------ the Ink Warden
  {
    id: 'boss.wake',
    bus: 'sfx',
    group: 'boss',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(3.6, [
            { sound: gong(hz('D2'), 3.4, { decaySec: 3.6 }, rnd), db: -3 },
            { sound: drone(hz('D2'), 3.4, { attack: 1.2, release: 1.6 }, rnd), db: -8 },
            { sound: choir(hz('D3'), 3.2, 'o', { attack: 1.6, release: 1.2 }, rnd), db: -9 },
            { sound: choir(hz('A3'), 3.0, 'o', { attack: 1.8, release: 1.2 }, rnd), db: -12 },
            { sound: riser(2.5, { from: 120, to: 1800, tone: 0.3, level: 1 }, rnd), db: -12 },
          ]),
          { peakDb: -2, hpHz: 30, room: { rt60: 2.2, size: 1.6, wet: 0.38 } },
        ),
      ),
    cooldownMs: 5000,
    voices: 1,
    priority: 10,
    reverb: 0.6,
    duck: { db: -5, ms: 1200 },
    note: 'the Ink Warden wakes: a gong, a drone and a voice that rises — the arena becomes a fight',
  },
  {
    id: 'boss.telegraph.charge',
    bus: 'sfx',
    group: 'boss',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.8, [
            { sound: drone(hz('D1'), 0.75, { attack: 0.3, release: 0.2, cutoff: 260, movement: 0.4 }, rnd), db: -4 },
            { sound: swoosh(0.7, 150, 700, { pink: true, rise: 0.85, q: 0.9 }, rnd), db: -2 },
            { sound: ring([180, 420, 880], 0.7, { q: 40, tau: 0.3 }, rnd), db: -22, at: 0.1 },
          ]),
          { peakDb: -3, hpHz: 30, room: { rt60: 1.0, size: 1.2, wet: 0.2 } },
        ),
      ),
    cooldownMs: 400,
    voices: 1,
    priority: 10,
    reverb: 0.4,
    note: 'the Warden sinks to charge: a low growl that rises (the wind-up is 0.7 s)',
  },
  {
    id: 'boss.telegraph.rain',
    bus: 'sfx',
    group: 'boss',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.8, [
            { sound: sparkle(0.5, 9, 1500, 5000, { tau: 0.15, durSec: 0.75 }, rnd), db: -3 },
            { sound: swell(587.33, 0.7, { ratios: [1, 1.5, 2.01], attack: 0.4, release: 0.2 }, rnd), db: -8 },
            { sound: burst(0.7, 50, 300, 0.5, rnd), db: -8 },
          ]),
          { peakDb: -5, hpHz: 40, room: { rt60: 1.2, size: 1.2, wet: 0.26 } },
        ),
      ),
    cooldownMs: 400,
    voices: 1,
    priority: 10,
    reverb: 0.5,
    note: 'the Warden raises its crest and marks the floor: a crystalline shiver over a low rumble',
  },
  {
    id: 'boss.strike.charge',
    bus: 'sfx',
    group: 'boss',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(1.2, [
            { sound: swoosh(0.9, 300, 1800, { pink: true, rise: 0.25, q: 0.8 }, rnd), db: -3 },
            { sound: thump(90, 35, 0.2, 0.9), db: 0 },
            { sound: burst(0.4, 60, 2000, 0.15, rnd), db: -4 },
            { sound: ring([180, 420, 880], 0.6, { q: 40, tau: 0.3 }, rnd), db: -14 },
          ]),
          { peakDb: -1, hpHz: 30, room: { rt60: 1.0, size: 1.2, wet: 0.2 } },
        ),
      ),
    cooldownMs: 400,
    voices: 1,
    priority: 10,
    reverb: 0.4,
    note: 'the Warden charges: a slab of ink slides along the floor',
  },
  {
    id: 'boss.strike.rain',
    bus: 'sfx',
    group: 'boss',
    variants: 3,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.7, [
            { sound: thump(120, 50, 0.12, 0.5), db: -1 },
            { sound: burst(0.4, 200, 4000, 0.1, rnd), db: -3 },
            ...cascade(3, 700, 300, 0.2, rnd, -10),
            { sound: ring([220, 530, 1100], 0.4, { q: 40, tau: 0.2 }, rnd), db: -16 },
          ]),
          { peakDb: -3, hpHz: 40, room: { rt60: 0.9, size: 1.0, wet: 0.2 } },
        ),
      ),
    pitchCents: 300,
    gainJitterDb: 1.5,
    cooldownMs: 40,
    voices: 4,
    priority: 9,
    reverb: 0.3,
    note: 'a column of ink erupts from a mark of the rain (up to four at once, each a little different)',
  },
  {
    id: 'boss.phase',
    bus: 'sfx',
    group: 'boss',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(2.8, [
            { sound: drone(hz('D2'), 2.6, { attack: 0.4, release: 1.4, cutoff: 900, movement: 1 }, rnd), db: -4 },
            { sound: choir(hz('D3'), 2.4, 'a', { attack: 0.6, release: 1.0 }, rnd), db: -8 },
            { sound: gong(hz('A1'), 2.6, { decaySec: 2.8 }, rnd), db: -6 },
            { sound: riser(1.8, { from: 200, to: 3500, tone: 0.4 }, rnd), db: -10 },
            { sound: thump(70, 30, 0.4, 1.4), db: -1 },
          ]),
          { peakDb: -2, hpHz: 30, room: { rt60: 2.0, size: 1.5, wet: 0.34 } },
        ),
      ),
    cooldownMs: 3000,
    voices: 1,
    priority: 10,
    reverb: 0.6,
    duck: { db: -4, ms: 1000 },
    note: 'the Warden is enraged (half its life): a roar of low voices and a gong',
  },
  {
    id: 'boss.death',
    bus: 'sfx',
    group: 'boss',
    variants: 1,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(5.4, [
            { sound: gong(hz('D2'), 5.0, { decaySec: 5.0 }, rnd), db: -2 },
            { sound: thump(60, 22, 0.6, 2.4), db: 0 },
            { sound: swoosh(2.5, 3000, 80, { pink: true, rise: 0.05, q: 0.8 }, rnd), db: -6 },
            ...cascade(20, 1100, 200, 2.6, rnd, -13),
            { sound: sparkle(3.0, 24, 800, 5000, { tau: 0.35, durSec: 4.6 }, rnd), db: -14, at: 0.3 },
            { sound: swell(147, 4.2, { ratios: [1, 1.5, 2], attack: 0.5, release: 2.8 }, rnd), db: -12 },
          ]),
          { peakDb: -1, hpHz: 25, room: { rt60: 3.0, size: 2.0, wet: 0.44 } },
        ),
      ),
    cooldownMs: 6000,
    voices: 1,
    priority: 10,
    reverb: 0.7,
    duck: { db: -6, ms: 1400 },
    note: 'the Ink Warden falls: a long collapse — a gong, a wash of ink falling away, a cascade of bubbles',
  },
];

