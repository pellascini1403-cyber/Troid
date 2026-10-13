import { Rectangle, Texture, TextureSource } from 'pixi.js';
import type { VfxAtlas, VfxSequence } from '@/assets/vfxAtlas';
import type { VfxShape } from '@/presentation/vfx';
import type { VfxSequenceName } from '@/presentation/vfxArt';

const SIZES: Record<VfxShape, [number, number]> = {
  glow: [96, 96], spark: [48, 48], shard: [96, 32], ring: [128, 128], rune: [128, 128], dust: [96, 96], ink: [64, 64], streak: [192, 48], arc: [256, 192], chevron: [64, 48],
};

/** The sequences a test atlas may have: the size of a frame (every frame of a sequence is one size) and its pivot, as the art's own packs say. */
const SEQUENCE_SIZES = {
  slash_body: [192, 160, 0.62, 0.5], slash_edge: [192, 160, 0.62, 0.5], impact: [128, 128, 0.5, 0.5], bolt_body: [128, 64, 0.66, 0.5], bolt_core: [128, 64, 0.66, 0.5],
  bolt_impact: [160, 160, 0.5, 0.5], ink_splash: [160, 128, 0.5, 0.52], ink_splash_gloss: [80, 64, 0.5, 0.52], ink_column: [96, 288, 0.5, 1], ink_column_glow: [48, 144, 0.5, 1],
  pillar: [48, 160, 0.5, 1], aura: [64, 96, 0.5, 1],
} as const satisfies Record<VfxSequenceName, readonly [number, number, number, number]>;

/**
 * A VFX atlas made of empty textures (no canvas, no GPU): enough to run the pooled system in Node. With `sequences` it also has the sequences of the art (`'all'`, or the names asked for), each of `frames` pictures.
 */
export function fakeVfxAtlas(sequences: readonly VfxSequenceName[] | 'all' = [], frames = 4): VfxAtlas {
  const source = new TextureSource({ width: 512, height: 256 });
  const shapes = {} as Record<VfxShape, Texture>;
  const widthPx = {} as Record<VfxShape, number>;
  const heightPx = {} as Record<VfxShape, number>;
  for (const [shape, [w, h]] of Object.entries(SIZES) as Array<[VfxShape, [number, number]]>) {
    shapes[shape] = new Texture({ source, frame: new Rectangle(0, 0, w, h) });
    widthPx[shape] = w;
    heightPx[shape] = h;
  }
  const wanted = sequences === 'all' ? (Object.keys(SEQUENCE_SIZES) as VfxSequenceName[]) : sequences;
  const made: Partial<Record<VfxSequenceName, VfxSequence>> = {};
  for (const name of wanted) {
    const [w, h, px, py] = SEQUENCE_SIZES[name];
    made[name] = { frames: Array.from({ length: frames }, (_, i) => new Texture({ source, frame: new Rectangle(i, 0, w, h) })), width: w, height: h, pivot: [px, py] };
  }
  return { frames: shapes, widthPx, heightPx, sequences: made, origin: 'procedural', source: new Texture({ source }), destroy: () => {} };
}
