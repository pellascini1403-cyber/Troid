import type { ImageSource, Texture } from 'pixi.js';
import { ArtLibrary } from '@/assets/artLibrary';
import { createBrowserArtIO, pixiArtTextures } from '@/assets/artIO';
import { log } from '@/core/log';

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
