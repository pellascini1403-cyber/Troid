// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../../tools/assets/png';
import { TOUCH_ART_DIR, TOUCH_ART_ORIGINALS } from '../../helpers/touchArt';
import { ART_PLATE, ART_SIZE, createButtonArt, TOUCH_ART } from '@/ui/touch/art';
import { TOUCH_BUTTONS } from '@/save/SettingsData';

/**
 * THE ART OF THE THREE BUTTONS IS THE ARTIST'S (docs/PROMPT15-LOG.md): the PNGs that were delivered are the files in the repository, byte for byte, and what the page shows of a button is
 * that file — scaled in proportion, nothing else. Nothing here looks at how a button LOOKS (that is the E2E's screenshots); it looks at what it is made of.
 */
const file = (button: (typeof TOUCH_BUTTONS)[number]): Buffer => readFileSync(resolve(__dirname, '../../..', TOUCH_ART_DIR, TOUCH_ART_ORIGINALS[button].file));

describe('the PNGs of the buttons are the originals', () => {
  for (const id of TOUCH_BUTTONS) {
    it(`${id}: the file is byte for byte what was delivered (${TOUCH_ART_ORIGINALS[id].file})`, () => {
      const bytes = file(id);
      expect(bytes.length).toBe(TOUCH_ART_ORIGINALS[id].bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(TOUCH_ART_ORIGINALS[id].sha256);
    });

    it(`${id}: a 2560 × 1440 RGBA file whose plate is where the code says (the box of everything that is not clear), white at half opacity, with its glyph cut out of it`, () => {
      const img = decodePng(file(id)) as { width: number; height: number; data: Uint8Array };
      expect([img.width, img.height]).toEqual([ART_SIZE.w, ART_SIZE.h]);
      let x0 = img.width;
      let y0 = img.height;
      let x1 = -1;
      let y1 = -1;
      const alphas = new Map<number, number>();
      let clearInside = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const a = img.data[(y * img.width + x) * 4 + 3] as number;
          if (a === 0) continue;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
          alphas.set(a, (alphas.get(a) ?? 0) + 1);
        }
      }
      expect({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, 'the plate is in the box the code crops to').toEqual(ART_PLATE);
      // the plate is white at 128/255 almost everywhere (the rest is its anti-aliased edge)…
      const total = [...alphas.values()].reduce((n, c) => n + c, 0);
      expect((alphas.get(128) ?? 0) / total, 'half opacity').toBeGreaterThan(0.95);
      // …and the glyph is a hole in it: clear pixels in the middle of the plate
      for (let y = y0 + 300; y < y1 - 300; y += 7) for (let x = x0 + 300; x < x1 - 300; x += 7) if (img.data[(y * img.width + x) * 4 + 3] === 0) clearInside++;
      expect(clearInside, 'the glyph is cut out').toBeGreaterThan(50);
    });
  }

  it('the three are different pictures, with the same plate', () => {
    expect(new Set(TOUCH_BUTTONS.map((id) => TOUCH_ART_ORIGINALS[id].sha256)).size).toBe(3);
    expect(Object.keys(TOUCH_ART).sort()).toEqual([...TOUCH_BUTTONS].sort());
    for (const id of TOUCH_BUTTONS) expect(TOUCH_ART[id], id).toMatch(/touch-(attack|dash|magic).*\.png$/);
    expect(new Set(Object.values(TOUCH_ART)).size).toBe(3);
  });

  it('the pictures of the buttons are made of nothing but the files: the code that shows them does not draw, filter, mask or recolour', () => {
    for (const name of ['art.ts', 'TouchControls.ts', 'TouchEditor.ts', 'TouchPreview.ts']) {
      const source = readFileSync(resolve(__dirname, '../../../src/ui/touch', name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
      for (const forbidden of ['<canvas', 'createElement(\'canvas\')', 'createElementNS', 'getContext', 'filter:', 'filter =', 'backdropFilter', 'mixBlendMode', 'mix-blend-mode', 'clipPath', 'mask', 'drop-shadow', 'hue-rotate', 'brightness(', 'invert(', 'grayscale(']) {
        expect(source.includes(forbidden), `${name} must not use ${forbidden}`).toBe(false);
      }
    }
  });
});

describe('what the page shows of a button', () => {
  const doc = document;

  it('is one <img> of the whole file in a box that shows the plate: nothing else in it (no second picture, no text, no glyph of its own)', () => {
    for (const id of TOUCH_BUTTONS) {
      const art = createButtonArt(doc, id);
      expect(art.root.children.length).toBe(1);
      expect(art.root.firstElementChild).toBe(art.img);
      expect(art.root.textContent).toBe('');
      expect(art.img.alt, 'decorative: the name of the button is its owner\'s').toBe('');
      expect(art.img.draggable).toBe(false);
    }
  });

  it('is scaled in proportion: the file keeps its shape (16:9: no stretching to a thousandth of a pixel) and the plate fills the box at any size', () => {
    for (const id of TOUCH_BUTTONS) {
      for (const visual of [20, 31, 68, 70.5, 112, 300]) {
        const art = createButtonArt(doc, id);
        art.size(visual);
        const px = (v: string): number => Number.parseFloat(v);
        const k = visual / ART_PLATE.h;
        expect(px(art.img.style.width) / px(art.img.style.height), `${id} @${visual}: the file is not stretched`).toBeCloseTo(ART_SIZE.w / ART_SIZE.h, 5);
        expect(px(art.img.style.width), `${id} @${visual}`).toBeCloseTo(ART_SIZE.w * k, 6);
        expect(px(art.root.style.height), `${id} @${visual}: the plate is as tall as asked`).toBeCloseTo(visual, 6);
        expect(px(art.root.style.width) / px(art.root.style.height), `${id} @${visual}: and as wide as the file has it`).toBeCloseTo(ART_PLATE.w / ART_PLATE.h, 5);
        // the file is moved so that the plate is at the box's corner
        expect(px(art.img.style.left), `${id} @${visual}`).toBeCloseTo(-ART_PLATE.x * k, 6);
        expect(px(art.img.style.top), `${id} @${visual}`).toBeCloseTo(-ART_PLATE.y * k, 6);
      }
    }
  });

  it('carries no filter, transform, blend, mask, opacity or background of its own: it is the file', () => {
    const art = createButtonArt(doc, 'attack');
    art.size(70);
    art.load();
    for (const node of [art.img, art.root]) {
      const style = node.style;
      for (const prop of ['filter', 'backdropFilter', 'mixBlendMode', 'clipPath', 'maskImage', 'webkitMaskImage', 'background', 'backgroundImage', 'transform', 'opacity', 'border', 'boxShadow', 'imageRendering', 'objectFit']) {
        expect((style as unknown as Record<string, string>)[prop] ?? '', `${node.tagName}.${prop}`).toBe('');
      }
    }
  });

  it('asks for its file once, and only when it is told to (a desktop that never shows the buttons never downloads them)', () => {
    const art = createButtonArt(doc, 'dash');
    expect(art.img.hasAttribute('src')).toBe(false);
    art.load();
    const first = art.img.getAttribute('src');
    expect(first).toBe(TOUCH_ART.dash);
    art.load();
    expect(art.img.getAttribute('src')).toBe(first);
  });
});
