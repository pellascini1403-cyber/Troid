import type { SoundRecipe } from '../catalog';
import { dual, type Stereo } from '../dsp/core';
import { bandpass, lowpass } from '../dsp/filter';
import { white } from '../dsp/osc';
import { bubble, burst, click, finish, layers, ring, sparkle, swoosh, thump, toMono, zip } from '../dsp/sfxlib';

/**
 * THE HERO'S MOVEMENT (docs/PROMPT18-LOG.md): the steps, the jumps, the landings and the dash of a small, quick creature of ink and light. Nothing here is a boot on a floor: the steps are the light taps of something that weighs
 * little, the air is cloth and breath, and the dash is a cut through the air with a thread of energy in it. Levels are set so that the movement is a bed under the combat, never above it.
 */

const mono = (s: Stereo): Stereo => dual(toMono(s));

type Surface = 'stone' | 'earth' | 'wet';

/** One light step on a surface: a contact, a body, a little weight — and, on stone, a ring so small that it only gives it a floor to be on. */
function step(surface: Surface, variant: number, rnd: () => number): Stereo {
  const bright = 0.88 + rnd() * 0.26;
  const weight = 0.9 + rnd() * 0.2;
  const list = [];
  if (surface === 'stone') {
    list.push({ sound: click(0.03, 1700 * bright, 0.005, rnd, 9000), db: 0 });
    list.push({ sound: burst(0.07, 500, 3400 * bright, 0.014, rnd), db: -3 });
    list.push({ sound: thump(190 * weight, 90, 0.026, 0.14), db: -7, at: 0.001 });
    list.push({ sound: ring([2400 * bright, 3850 * bright, 5600], 0.16, { q: 70, tau: 0.05 }, rnd), db: -20 });
  } else if (surface === 'earth') {
    list.push({ sound: burst(0.09, 180, 1500 * bright, 0.024, rnd), db: 0 });
    list.push({ sound: thump(150 * weight, 70, 0.034, 0.16), db: -5 });
    list.push({ sound: lowpass(white(1800, rnd), 900), db: -9, at: 0.004 });
    for (let k = 0; k < 3; k++) list.push({ sound: click(0.006, 1200 + rnd() * 1600, 0.0016, rnd), db: -13 - k * 2, at: 0.008 + rnd() * 0.035 });
  } else {
    list.push({ sound: click(0.03, 1500 * bright, 0.005, rnd, 9000), db: -1 });
    list.push({ sound: burst(0.08, 400, 3000 * bright, 0.016, rnd), db: -4 });
    list.push({ sound: thump(170 * weight, 80, 0.03, 0.14), db: -7 });
    list.push({ sound: bubble(850 + rnd() * 500, 0.05, 1.7), db: -14, at: 0.012 + rnd() * 0.02 });
    list.push({ sound: burst(0.12, 1800, 7000, 0.03, rnd), db: -16, at: 0.006 });
  }
  const room = surface === 'earth' ? { rt60: 0.3, size: 0.45, damp: 0.7, wet: 0.12 } : { rt60: surface === 'wet' ? 0.7 : 0.45, size: 0.6, damp: 0.5, wet: surface === 'wet' ? 0.2 : 0.14 };
  void variant;
  return mono(finish(layers(0.3, list), { peakDb: -9, hpHz: 110, fadeMs: 14, room }));
}

const stepRecipe = (surface: Surface, note: string): SoundRecipe => ({
  id: `hero.step.${surface}`,
  bus: 'sfx',
  group: 'core',
  variants: 4,
  channels: 1,
  render: (v, rnd) => step(surface, v, rnd),
  gainDb: -3,
  pitchCents: 90,
  gainJitterDb: 1.5,
  cooldownMs: 70,
  voices: 3,
  priority: 2,
  reverb: 0.25,
  note,
});

export const HERO_SOUNDS: SoundRecipe[] = [
  stepRecipe('stone', 'a step on stone: R1, R3 and R4 (the ruins, the sunken chamber, the sanctum)'),
  stepRecipe('earth', 'a step on earth and roots: R2'),
  stepRecipe('wet', 'a step on wet stone'),
  {
    id: 'hero.jump',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.22, [
            { sound: swoosh(0.12, 480, 1700, { q: 1.4, rise: 0.25 }, rnd), db: -4 },
            { sound: thump(170, 75, 0.03, 0.12), db: -8 },
            { sound: zip(0.08, 700, 1150, { tau: 0.04 }), db: -22 },
            { sound: click(0.012, 2500, 0.003, rnd), db: -16 },
          ]),
          { peakDb: -8, hpHz: 130, room: { rt60: 0.3, size: 0.45, wet: 0.1 } },
        ),
      ),
    gainDb: 0,
    pitchCents: 120,
    gainJitterDb: 1.2,
    cooldownMs: 90,
    voices: 2,
    priority: 4,
    reverb: 0.2,
    note: 'the jump from the ground: a push and a breath of cloth',
  },
  {
    id: 'hero.jump.air',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.4, [
            { sound: swoosh(0.2, 900, 3600, { q: 1.1, rise: 0.3 }, rnd), db: -5 },
            { sound: sparkle(0.12, 4, 1800, 5200, { tau: 0.05, durSec: 0.35 }, rnd), db: -13 },
            { sound: bubble(1100, 0.05, 2), db: -12, at: 0.01 },
          ]),
          { peakDb: -8, hpHz: 200, room: { rt60: 0.5, size: 0.7, wet: 0.16 } },
        ),
      ),
    pitchCents: 150,
    gainJitterDb: 1,
    cooldownMs: 110,
    voices: 2,
    priority: 4,
    reverb: 0.3,
    note: 'the jump in the air: lighter, with a flutter of energy — not the push of the ground',
  },
  {
    id: 'hero.land.light',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(finish(layers(0.25, [{ sound: click(0.03, 1500, 0.006, rnd), db: -2 }, { sound: thump(135, 70, 0.04, 0.16), db: -3 }, { sound: burst(0.08, 100, 1000, 0.03, rnd), db: -6 }]), { peakDb: -8, hpHz: 90, room: { rt60: 0.4, size: 0.5, wet: 0.12 } })),
    pitchCents: 100,
    gainJitterDb: 1.5,
    cooldownMs: 120,
    voices: 2,
    priority: 4,
    reverb: 0.25,
    note: 'a soft landing',
  },
  {
    id: 'hero.land.medium',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.35, [
            { sound: click(0.03, 1200, 0.007, rnd), db: -2 },
            { sound: thump(120, 55, 0.06, 0.25), db: 0 },
            { sound: burst(0.12, 90, 1800, 0.045, rnd), db: -4 },
            { sound: swoosh(0.18, 400, 900, { pink: true, q: 0.9, rise: 0.15 }, rnd), db: -12, at: 0.01 },
          ]),
          { peakDb: -5, hpHz: 70, room: { rt60: 0.5, size: 0.6, wet: 0.14 } },
        ),
      ),
    pitchCents: 90,
    gainJitterDb: 1.2,
    cooldownMs: 120,
    voices: 2,
    priority: 5,
    reverb: 0.3,
    note: 'a landing from a jump',
  },
  {
    id: 'hero.land.heavy',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.6, [
            { sound: click(0.04, 900, 0.01, rnd), db: -2 },
            { sound: thump(105, 42, 0.11, 0.5), db: 0 },
            { sound: burst(0.25, 70, 2400, 0.08, rnd), db: -3 },
            { sound: lowpass(bandpass(white(14000, rnd), 600, 0.7), 700), db: -14, at: 0.02 },
            { sound: ring([3100, 4700, 6900], 0.35, { q: 60, tau: 0.12 }, rnd), db: -22, at: 0.005 },
          ]),
          { peakDb: -3, hpHz: 45, room: { rt60: 0.65, size: 0.8, wet: 0.2 } },
        ),
      ),
    pitchCents: 70,
    gainJitterDb: 1,
    cooldownMs: 150,
    voices: 1,
    priority: 6,
    reverb: 0.4,
    note: 'a landing from a long fall: weight, dust, a little rattle of cloth and metal',
  },
  {
    id: 'hero.dash.ground',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.4, [
            { sound: swoosh(0.24, 520, 4300, { q: 1.0, rise: 0.16, shape: 1.3 }, rnd), db: -1 },
            { sound: thump(210, 85, 0.04, 0.16), db: -7 },
            { sound: swoosh(0.3, 3200, 9500, { q: 0.8, rise: 0.12 }, rnd), db: -13 },
            { sound: zip(0.16, 950, 320, { tau: 0.08 }), db: -22 },
          ]),
          { peakDb: -4, hpHz: 150, room: { rt60: 0.4, size: 0.5, wet: 0.1 } },
        ),
      ),
    pitchCents: 110,
    gainJitterDb: 1,
    cooldownMs: 200,
    voices: 1,
    priority: 6,
    reverb: 0.2,
    note: 'the dash on the ground: a cut through the air with a thread of energy',
  },
  {
    id: 'hero.dash.air',
    bus: 'sfx',
    group: 'core',
    variants: 2,
    channels: 1,
    render: (_v, rnd) =>
      mono(
        finish(
          layers(0.5, [
            { sound: swoosh(0.28, 800, 6200, { q: 0.9, rise: 0.15, shape: 1.3 }, rnd), db: -2 },
            { sound: sparkle(0.18, 5, 2400, 7000, { tau: 0.06, durSec: 0.45 }, rnd), db: -14 },
            { sound: zip(0.2, 1500, 500, { tau: 0.09 }), db: -20 },
            { sound: thump(260, 110, 0.03, 0.1), db: -12 },
          ]),
          { peakDb: -4, hpHz: 200, room: { rt60: 0.6, size: 0.8, wet: 0.16 } },
        ),
      ),
    pitchCents: 110,
    gainJitterDb: 1,
    cooldownMs: 200,
    voices: 1,
    priority: 6,
    reverb: 0.3,
    note: 'the dash in the air: higher, with sparks',
  },
];
