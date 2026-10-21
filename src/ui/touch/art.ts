import attackUrl from './buttons/touch-attack.png';
import dashUrl from './buttons/touch-dash.png';
import magicUrl from './buttons/touch-magic.png';
import type { ButtonId } from './layout';

/**
 * THE ART OF THE THREE BUTTONS (docs/PROMPT15-LOG.md): three PNGs the artist delivered — a white plate, half see-through, with the glyph cut out of it — and nothing else. They are in `src/ui/touch/buttons/`
 * byte for byte as they arrived (`tests/unit/ui/touchArt.test.ts` holds their hashes, their size and where the plate is in them), they are shown by an `<img>` and never drawn again: no canvas, no SVG,
 * no filter, no recolouring. Each button is its PNG scaled in proportion; the only things done to what is seen are the ones CSS does to ANY element — it is moved, it is made a little smaller while a
 * finger is on it, it is made fainter when it cannot be used, and the player's own opacity setting is applied to the whole layer.
 */
export const TOUCH_ART: Readonly<Record<ButtonId, string>> = { attack: attackUrl, dash: dashUrl, ability: magicUrl };

/** The size of every file, in the pixels of the file. */
export const ART_SIZE = { w: 2560, h: 1440 } as const;
/**
 * Where the plate is inside the file (the box of everything that is not clear: all three share it), in the pixels of the file. The rest of the canvas is air: the button is the plate, so that is what is put
 * in the button's box; the file itself is shown whole, only the part outside the box is not seen.
 */
export const ART_PLATE = { x: 717, y: 131, w: 1182, h: 1222 } as const;

export interface ButtonArt {
  /** The box the plate shows through; its pixel size is the plate's, its centre is where the button is. */
  readonly root: HTMLDivElement;
  readonly img: HTMLImageElement;
  /** Scales the picture so that the plate is `visual` px tall (the width follows: nothing is stretched). */
  size(visual: number): void;
  /** Asks for the picture (once): a page that never shows the buttons never downloads them. */
  load(): void;
}

/**
 * The picture of one button: an `<img>` of the whole PNG, scaled by `visual / ART_PLATE.h` and moved so that the plate fills a box that hides the rest. The picture takes no input (and the layers it is in cannot be selected), cannot be dragged, and has no text: the name of the button is its owner's `aria-label`.
 */
export function createButtonArt(doc: Document, id: ButtonId): ButtonArt {
  const root = doc.createElement('div');
  root.dataset['art'] = id;
  Object.assign(root.style, { position: 'relative', overflow: 'hidden', flex: 'none', pointerEvents: 'none' });
  const img = doc.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  Object.assign(img.style, { position: 'absolute', display: 'block', maxWidth: 'none', maxHeight: 'none', pointerEvents: 'none' });
  root.appendChild(img);
  return {
    root,
    img,
    size(visual) {
      const k = visual / ART_PLATE.h;
      Object.assign(root.style, { width: `${ART_PLATE.w * k}px`, height: `${ART_PLATE.h * k}px` });
      Object.assign(img.style, { left: `${-ART_PLATE.x * k}px`, top: `${-ART_PLATE.y * k}px`, width: `${ART_SIZE.w * k}px`, height: `${ART_SIZE.h * k}px` });
    },
    load() {
      if (!img.hasAttribute('src')) img.src = TOUCH_ART[id];
    },
  };
}
