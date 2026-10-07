import { Rectangle, Texture, TextureSource } from 'pixi.js';
import type { LoadedSpriteSet } from '@/assets/SpriteAssetManager';
import { PLAYER_PLACEHOLDER } from '@/content/placeholders/playerPlaceholder';
import { clipFrameNames, type AtlasMeta, type SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';

export type FakeSet = LoadedSpriteSet<Texture> & { disposed: number };

/** A loaded sprite set with empty GPU-less textures, one per frame of every clip: enough to drive `ActorSprite` in Node. */
export function fakeSet(def: SpriteSetDefinition = PLAYER_PLACEHOLDER.def, meta: AtlasMeta = PLAYER_PLACEHOLDER.meta, frame: readonly [number, number] = [16, 16]): FakeSet {
  const source = new TextureSource({ width: Math.max(64, frame[0]), height: Math.max(64, frame[1]) });
  const textures = new Map<string, Texture>();
  for (const clip of Object.values(def.clips)) {
    if (!clip) continue;
    for (const name of clipFrameNames(clip)) textures.set(name, new Texture({ source, frame: new Rectangle(0, 0, frame[0], frame[1]) }));
  }
  const set: FakeSet = {
    def,
    meta,
    textures,
    disposed: 0,
    dispose() {
      set.disposed++;
    },
  };
  return set;
}
