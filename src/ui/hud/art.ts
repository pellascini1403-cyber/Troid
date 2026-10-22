import barLifeUrl from './png/bar-life.png?no-inline';
import barLifeLostUrl from './png/bar-life-lost.png?no-inline';
import barMagicUrl from './png/bar-magic.png?no-inline';
import barMagicLostUrl from './png/bar-magic-lost.png?no-inline';
import bottleUrl from './png/bottle.png?no-inline';
import bottleUsedUrl from './png/bottle-used.png?no-inline';
import markerUrl from './png/marker.png?no-inline';
import plateLifeUrl from './png/plate-life.png?no-inline';
import plateMagicUrl from './png/plate-magic.png?no-inline';
import portraitUrl from './png/portrait.png?no-inline';

/**
 * THE ART OF THE HUD (docs/PROMPT17-LOG.md): the artist's two PNGs, cut into the pieces the game moves — and nothing else. The pieces are rectangles of the artist's files, pixel for pixel (`png/README.md`; the
 * tests hold them to the originals), shown by an `<img>` each and never drawn again: no canvas, no SVG, no filter, no recolouring. A bar is its bright picture shown up to where the life ends and its dark picture
 * shown from there on; the white rectangle sits where they meet; a bottle is its bright picture or its dark one. Where each piece goes is `artGeometry.ts`'s.
 *
 * The files are asked for with `?no-inline` so that the build never turns the small ones into text inside the code: every piece is a file of its own, with a hash in its name, that the browser can cache.
 */
export const HUD_ART = {
  portrait: portraitUrl,
  plateLife: plateLifeUrl,
  plateMagic: plateMagicUrl,
  barLife: barLifeUrl,
  barLifeLost: barLifeLostUrl,
  barMagic: barMagicUrl,
  barMagicLost: barMagicLostUrl,
  marker: markerUrl,
  bottle: bottleUrl,
  bottleUsed: bottleUsedUrl,
} as const;

export type HudPiece = keyof typeof HUD_ART;
