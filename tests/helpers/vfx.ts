import { Rectangle, Texture, TextureSource } from 'pixi.js';
import type { VfxAtlas } from '@/assets/vfxAtlas';
import type { VfxShape } from '@/presentation/vfx';

const SIZES: Record<VfxShape, [number, number]> = {
  glow: [96, 96], spark: [48, 48], shard: [96, 32], ring: [128, 128], dust: [96, 96], ink: [64, 64], streak: [192, 48], arc: [256, 192],
};

/** A VFX atlas made of empty textures (no canvas, no GPU): enough to run the pooled system in Node. */
export function fakeVfxAtlas(): VfxAtlas {
  const source = new TextureSource({ width: 512, height: 256 });
  const frames = {} as Record<VfxShape, Texture>;
  const widthPx = {} as Record<VfxShape, number>;
  for (const [shape, [w, h]] of Object.entries(SIZES) as Array<[VfxShape, [number, number]]>) {
    frames[shape] = new Texture({ source, frame: new Rectangle(0, 0, w, h) });
    widthPx[shape] = w;
  }
  return { frames, widthPx, source: new Texture({ source }), destroy: () => {} };
}
