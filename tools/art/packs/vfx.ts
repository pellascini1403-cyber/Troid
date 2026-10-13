import type { PackSpec, SpriteSpec } from '../spec';

/**
 * THE LIGHT OF THE GAME (docs/PROMPT8-LOG.md phase H, docs/ART-PIPELINE-2D.md §M.14): the pictures every effect is made of, in two packs of the `vfx` category that the game fetches AT THE START (a blow lands on the first
 * minute). White masks: alpha is the light and the colour is added at runtime from the palette slot (cyan for the hero, violet for the enemies, black for ink), so one picture serves both and the identity stays whatever
 * is in the image. Painted by the generator, not by a person: provisional until an artist reviews or replaces it.
 *
 *   · `vfx-shapes` — the ten shapes of the particles and the flashes, all on ONE page (the particle container of the effects shares one texture source);
 *   · `vfx-flipbooks` — the sequences of the big moments: the slash that sweeps, the blow that lands, the Spirit Bolt in flight and where it lands, the ink that bursts and the column the boss throws up, the pillar of
 *     light of a place that awakens and the flame of a hero who is armed.
 */
const SEED = 7;

const shape = (name: string, piece: string, w: number, h: number): SpriteSpec => ({
  id: `shape_${name}`,
  tags: ['vfx:shape', `shape:${name}`, 'blend:add'],
  piece,
  params: { w, h, seed: SEED + 200 + name.length },
  pivot: [0.5, 0.5],
});

/**
 * The density the sequences are kept at: they are painted at full size (every number of the painter is tuned for it) and resampled to this fraction, because they are light and ink that is soft anyway and the
 * smallest memory is the pixels that are not there. The effects are sized in metres, not in pixels, so nothing else knows. At 0.75 the biggest sequence is still drawn about 1:1 on a phone (≈ 50 px/m).
 */
const SEQUENCE_SCALE = 0.75;

/** A sequence: `frames` cells of `w × h` side by side, played over an effect's life by its own data (not by a rate of the art). */
const seq = (name: string, piece: string, w: number, h: number, frames: number, pivot: [number, number], blend: 'add' | 'normal' = 'add', params: Record<string, unknown> = {}): SpriteSpec => ({
  id: `seq_${name}`,
  tags: ['vfx:seq', `seq:${name}`, `blend:${blend}`],
  piece,
  params: { w, h, seed: SEED + 300 + name.length, ...params },
  cols: frames,
  rows: 1,
  scale: SEQUENCE_SCALE,
  pivot,
});

export const VFX_SHAPES: PackSpec = {
  id: 'vfx-shapes',
  category: 'vfx',
  load: 'boot',
  tags: ['vfx'],
  zones: [],
  ppm: 100,
  comment:
    'THE SHAPES OF THE LIGHT: glow, flare, shard, ring, rune, smoke, ink, streak, crescent and chevron — white masks that the game tints (cyan for the hero, violet for the enemies). One page: the particles of the effects share one texture. ' +
    'Painted by the generator in tools/art (npm run art:build), not by a person: provisional until an artist reviews or replaces it.',
  sprites: [
    shape('glow', 'vfxGlow', 96, 96),
    shape('spark', 'vfxSpark', 64, 64),
    shape('shard', 'vfxShard', 96, 32),
    shape('ring', 'vfxRing', 128, 128),
    shape('rune', 'vfxRune', 128, 128),
    shape('dust', 'vfxDust', 96, 96),
    shape('ink', 'vfxInk', 64, 64),
    shape('streak', 'vfxStreak', 192, 48),
    shape('arc', 'vfxArc', 256, 192),
    shape('chevron', 'vfxChevron', 64, 48),
  ],
};

export const VFX_FLIPBOOKS: PackSpec = {
  id: 'vfx-flipbooks',
  category: 'vfx',
  load: 'boot',
  tags: ['vfx'],
  zones: [],
  ppm: 100,
  comment:
    'THE SEQUENCES OF THE LIGHT: the slash that sweeps (body and edge), the blow that lands, the Spirit Bolt in flight (body and core) and where it lands, the ink that bursts from a creature that falls and the column the boss throws up ' +
    '(each with the rim of light apart), the pillar of light of a place that awakens and the flame of a hero who is armed. White masks that the game tints. ' +
    'Painted by the generator in tools/art (npm run art:build), not by a person: provisional until an artist reviews or replaces it.',
  sprites: [
    seq('slash_body', 'vfxSlashBody', 192, 160, 6, [0.62, 0.5]),
    seq('slash_edge', 'vfxSlashEdge', 192, 160, 6, [0.62, 0.5]),
    seq('impact', 'vfxImpact', 128, 128, 6, [0.5, 0.5]),
    seq('bolt_body', 'vfxBoltBody', 128, 64, 4, [0.66, 0.5]),
    seq('bolt_core', 'vfxBoltCore', 128, 64, 4, [0.66, 0.5]),
    seq('bolt_impact', 'vfxBoltImpact', 160, 160, 7, [0.5, 0.5]),
    seq('ink_splash', 'vfxInkSplashBody', 160, 128, 6, [0.5, 0.52], 'normal'),
    seq('ink_splash_gloss', 'vfxInkSplashGloss', 80, 64, 6, [0.5, 0.52]),
    seq('ink_column', 'vfxInkColumnBody', 96, 288, 8, [0.5, 1], 'normal'),
    seq('ink_column_glow', 'vfxInkColumnGlow', 48, 144, 8, [0.5, 1]),
    seq('pillar', 'vfxPillar', 48, 160, 6, [0.5, 1]),
    seq('aura', 'vfxAura', 64, 96, 6, [0.5, 1]),
  ],
};
export const VFX_PACKS: readonly PackSpec[] = [VFX_SHAPES, VFX_FLIPBOOKS];
