import { ImageSource, type Texture } from 'pixi.js';
import type { ArtImage, ArtIO, ArtTextures } from './artLibrary';
import { texturesFromFrames } from './spriteLoader';

/**
 * The browser's half of the art library (docs/ART-PIPELINE-2D.md, part C): files come with `fetch`, images are decoded off the main thread by
 * `createImageBitmap` and handed to Pixi as one texture source per atlas page. It deliberately does NOT use Pixi's `Assets` loader — that is a tenth of the
 * first download and the game needs none of its resolvers, caches or parsers: one URL, one image, one upload.
 *
 * Premultiplied-alpha on upload, as everything else in the game is (`Texture.from(canvas)`, Pixi's own image loader): the soft edge of a sprite never
 * leaves a dark halo.
 */

/** A request that has not answered after this long is given up (a phone on a bad network must not hold a room's art for ever). */
const TIMEOUT_MS = 20_000;

async function get(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  // an old WebView without `createImageBitmap`: decode with an <img> (still off the main thread in `decode()`)
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function createBrowserArtIO(): ArtIO<ImageSource> {
  return {
    async json(url) {
      return (await get(url)).json() as Promise<unknown>;
    },
    async image(url): Promise<ArtImage<ImageSource>> {
      const bitmap = await decode(await (await get(url)).blob());
      const source = new ImageSource({ resource: bitmap, alphaMode: 'premultiply-alpha-on-upload' });
      let freed = false;
      return {
        source,
        width: 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width,
        height: 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height,
        dispose: () => {
          if (freed) return;
          freed = true;
          source.destroy();
          // Pixi forgets the bitmap but does not close it: its decoded pixels stay in memory until something does
          if ('close' in bitmap) bitmap.close();
        },
      };
    },
  };
}

/** One texture per frame over the page's source; destroying one never frees the page (the library does, with its last set). */
export const pixiArtTextures: ArtTextures<ImageSource, Texture> = {
  make: (source, frames) => texturesFromFrames(source, frames),
  destroy: (texture) => texture.destroy(false),
};
