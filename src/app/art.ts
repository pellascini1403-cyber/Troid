import type { ImageSource, Texture } from 'pixi.js';
import { ArtLibrary } from '@/assets/artLibrary';
import { createBrowserArtIO, pixiArtTextures } from '@/assets/artIO';
import type { VfxAtlas } from '@/assets/vfxAtlas';
import { createArtVfxAtlas, type ArtVfx } from '@/assets/vfxArtAtlas';
import { log } from '@/core/log';
import type { Layers } from '@/render/layers';
import { RoomArtView } from '@/render/RoomArtView';

/**
 * THE ART, as the game starts it (docs/ART-PIPELINE-2D.md, part C): a chunk of its own that a page WITHOUT art never downloads. `Game2D` imports it only
 * when there is an art index to read (`?art=` or the one the build found in `public/art`), after the first frame, and keeps what it returns as `art`.
 * It holds no policy of its own: what is loaded, when and for how long is the library's and the index's.
 */
export interface ArtHost {
  /** Absolute URL of `index.json`. */
  indexUrl: string;
  /** Pixels per metre the screen draws now (`ppm × resolution`): what picks the variant of each sprite set. */
  drawnPxPerMetre: () => number;
  /** A development build says what is wrong with the art; a player's build keeps it to the log's quiet level (never a warning, never an error). */
  dev: boolean;
  /** Where the notes go instead (a lab shows them in its panel). */
  note?: (message: string) => void;
}

export type Art = ArtLibrary<ImageSource, Texture>;

export function createArt(host: ArtHost): Art {
  const scope = log.scope('art');
  return new ArtLibrary<ImageSource, Texture>({
    indexUrl: host.indexUrl,
    io: createBrowserArtIO(),
    textures: pixiArtTextures,
    drawnPxPerMetre: host.drawnPxPerMetre,
    now: () => performance.now(),
    note: host.note ?? ((message) => (host.dev ? scope.warn(message) : scope.debug(message))),
  });
}

/**
 * The view that dresses a room with the art of the zone (`render/RoomArtView`): it lives in this chunk too, so a page with no art never downloads it and the cold
 * start does not grow by a byte of it.
 */
export function createRoomArt(layers: Layers, art: Art): RoomArtView {
  return new RoomArtView(layers, art);
}

/**
 * The light the art painted, as the effects take it (`assets/vfxArtAtlas`): the shapes and the sequences of the `vfx` packs the library holds, over the game's own atlas — or `null` when the art painted none of it.
 * It lives in this chunk too: a page with no art never downloads it.
 */
export function createVfxArt(art: Art, base: VfxAtlas): ArtVfx | null {
  return createArtVfxAtlas(art, base);
}
