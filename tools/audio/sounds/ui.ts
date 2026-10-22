import type { SoundRecipe } from '../catalog';
import { dual, type Stereo } from '../dsp/core';
import { bell } from '../dsp/inst';
import { click, finish, layers, sparkle, swoosh, thump, toMono, zip } from '../dsp/sfxlib';

/**
 * THE INTERFACE (docs/PROMPT18-LOG.md): the sounds of the pause menu and of the settings. They are the quietest sounds of the game and the shortest, and they belong to no place: soft, a little wooden, with a faint bell —
 * nothing that could be mistaken for the world.
 */

const mono = (s: Stereo): Stereo => dual(toMono(s));

const tone = (id: string, note: string, hzs: number[], gap: number, peakDb: number, extra: Partial<SoundRecipe> = {}): SoundRecipe => ({
  id,
  bus: 'ui',
  group: 'core',
  variants: 1,
  channels: 1,
  render: (_v, rnd) =>
    mono(
      finish(
        layers(gap * hzs.length + 0.2, hzs.map((f, k) => ({ sound: bell(f, 0.2, { kind: 'chime', decaySec: 0.12, click: 0.1 }, rnd), db: -k * 2, at: k * gap }))),
        { peakDb, hpHz: 300, room: { rt60: 0.3, size: 0.4, wet: 0.08 } },
      ),
    ),
  cooldownMs: 60,
  voices: 2,
  priority: 5,
  reverb: 0.1,
  note,
  ...extra,
});

export const UI_SOUNDS: SoundRecipe[] = [
  {
    id: 'ui.pause.open',
    bus: 'ui',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) => mono(finish(layers(0.4, [{ sound: swoosh(0.3, 250, 900, { pink: true, rise: 0.5, q: 0.8 }, rnd), db: -2 }, { sound: thump(200, 110, 0.06, 0.2), db: -6 }, { sound: click(0.012, 1800, 0.004, rnd), db: -9 }]), { peakDb: -11, hpHz: 90, room: { rt60: 0.4, size: 0.6, wet: 0.1 } })),
    cooldownMs: 200,
    voices: 1,
    priority: 6,
    reverb: 0.15,
    note: 'the game is paused: a soft swell that closes the world',
  },
  {
    id: 'ui.pause.close',
    bus: 'ui',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) => mono(finish(layers(0.35, [{ sound: swoosh(0.26, 900, 250, { pink: true, rise: 0.25, q: 0.8 }, rnd), db: -2 }, { sound: click(0.012, 1500, 0.004, rnd), db: -9 }, { sound: zip(0.14, 500, 900, { tau: 0.1 }), db: -18 }]), { peakDb: -11, hpHz: 90, room: { rt60: 0.4, size: 0.6, wet: 0.1 } })),
    cooldownMs: 200,
    voices: 1,
    priority: 6,
    reverb: 0.15,
    note: 'the game goes on: the swell goes back',
  },
  tone('ui.tap', 'a button of the menu is pressed: a small wooden bell', [1480], 0, -14),
  tone('ui.toggle.on', 'a switch is turned on: two notes going up', [1175, 1568], 0.06, -14),
  tone('ui.toggle.off', 'a switch is turned off: two notes going down', [1568, 1175], 0.06, -14),
  tone('ui.slider', 'a slider moves one step: the smallest tick', [1760], 0, -20, { cooldownMs: 45 }),
  {
    id: 'ui.save',
    bus: 'ui',
    group: 'core',
    variants: 1,
    channels: 1,
    render: (_v, rnd) => mono(finish(layers(0.9, [{ sound: bell(1318.5, 0.8, { kind: 'glass', decaySec: 0.55, click: 0.03 }, rnd), db: -2 }, { sound: sparkle(0.1, 3, 3500, 6500, { tau: 0.09, durSec: 0.6 }, rnd), db: -16 }]), { peakDb: -16, hpHz: 400, room: { rt60: 0.9, size: 0.8, wet: 0.22 } })),
    cooldownMs: 800,
    voices: 1,
    priority: 3,
    reverb: 0.3,
    note: 'the game was saved: one soft bell, quiet on purpose',
  },
];
