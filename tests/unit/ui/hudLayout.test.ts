import { describe, expect, it } from 'vitest';
import { uiScale } from '@/input/gestures/TouchConfig';
import { HUD_BLOCK_DP, HUD_DP_PER_PX, HUD_PX } from '@/ui/hud/artGeometry';
import { computeHudLayout, HUD_DESIGN, hudBlockSize } from '@/ui/hud/layout';
import { computeTouchLayout, type Insets, NO_INSETS } from '@/ui/touch/layout';

/**
 * The HUD sits at the top left, inside the safe area, at the same uiScale as the touch controls, whatever the aspect ratio (docs/GAME-SPEC-2D.md §17, docs/PROMPT17-LOG.md): 4:3, 16:9, 19.5:9, 21:9; with and without a
 * notch, an island or rounded corners.
 */
const SCREENS: Array<[string, number, number]> = [
  ['iPad 4:3', 1024, 768],
  ['16:9', 1280, 720],
  ['small phone 16:9', 667, 375],
  ['iPhone 19.5:9', 844, 390],
  ['big iPhone 19.5:9', 932, 430],
  ['ultra-wide 21:9', 1260, 540],
  ['desktop 1080p', 1920, 1080],
];
const INSETS: Array<[string, Insets]> = [
  ['none', NO_INSETS],
  ['notch', { top: 0, right: 47, bottom: 21, left: 47 }],
  ['island', { top: 0, right: 59, bottom: 21, left: 59 }],
  ['portrait notch', { top: 47, right: 0, bottom: 34, left: 0 }],
  ['rounded', { top: 24, right: 24, bottom: 24, left: 24 }],
];

describe('hud block', () => {
  it('is the artist\'s picture: the box of everything drawn in the 2560 × 1440 canvases at 0.0865 dp per pixel, 218.3 × 78.9 dp', () => {
    expect(HUD_PX.block).toEqual({ x: 10, y: 258, w: 2524, h: 912 });
    expect(HUD_DP_PER_PX).toBe(0.0865);
    expect(HUD_BLOCK_DP.w).toBeCloseTo(218.3, 1);
    expect(HUD_BLOCK_DP.h).toBeCloseTo(78.9, 1);
    expect(hudBlockSize()).toEqual({ width: HUD_BLOCK_DP.w, height: HUD_BLOCK_DP.h });
  });

  it('is where the artist\'s own picture of the HUD in the game has it: 25.7 dp from the safe area (the 25.0 and 24.8 px of the 844 × 390 picture, at its 819/844 scale)', () => {
    expect(HUD_DESIGN.margin).toBe(25.7);
    const s = uiScale(844, 390);
    expect(25.04 / s).toBeCloseTo(25.8, 1);
    expect(24.81 / s).toBeCloseTo(25.6, 1);
  });

  it('the bottle is 16.9 × 11.7 dp and its touch area is as wide as its pitch (19.8 dp) and a finger tall (49 dp): the areas of neighbours never share a pixel', () => {
    const v = HUD_DESIGN.vial;
    expect([v.w, v.h, v.pitch].map((n) => Number(n.toFixed(1)))).toEqual([16.9, 11.7, 19.8]);
    expect(v.pitch).toBeGreaterThanOrEqual(v.w);
    expect(v.hitH).toBeGreaterThanOrEqual(44);
    // four of them (the reward) are inside the box of the HUD: its row has room
    const row = HUD_PX.bottle.x - HUD_PX.block.x + 3 * HUD_PX.bottle.pitch + HUD_PX.bottle.w;
    expect(row).toBeLessThan(HUD_PX.block.w);
  });
});

describe('hud placement', () => {
  it('is the top-left corner plus the margin, inside the safe area, on every screen', () => {
    for (const [sn, w, h] of SCREENS) {
      for (const [inn, insets] of INSETS) {
        const l = computeHudLayout(w, h, insets);
        expect(l.x, `${sn} ${inn}`).toBeCloseTo(insets.left + HUD_DESIGN.margin * l.scale, 9);
        expect(l.y, `${sn} ${inn}`).toBeCloseTo(insets.top + HUD_DESIGN.margin * l.scale, 9);
        expect(l.x).toBeGreaterThanOrEqual(insets.left);
        expect(l.y).toBeGreaterThanOrEqual(insets.top);
      }
    }
  });

  it('fits entirely on the screen (nothing is cut off) on every screen, at every size the player may choose', () => {
    for (const [sn, w, h] of SCREENS) {
      for (const [inn, insets] of INSETS) {
        for (const size of [0.8, 1, 1.4]) {
          const l = computeHudLayout(w, h, insets, size);
          expect(l.x + l.width * l.scale, `${sn} ${inn} ×${size} right`).toBeLessThan(w - insets.right);
          expect(l.y + l.height * l.scale, `${sn} ${inn} ×${size} bottom`).toBeLessThan(h - insets.bottom);
        }
      }
    }
  });

  it('is scaled as one block with the same uiScale as the touch controls', () => {
    for (const [sn, w, h] of SCREENS) {
      expect(computeHudLayout(w, h).scale, sn).toBe(computeTouchLayout(w, h).gestureScale);
    }
  });

  it('never meets a touch control: the bottom of the HUD is far above the controls and its right end far left of them', () => {
    for (const [sn, w, h] of SCREENS) {
      for (const [inn, insets] of INSETS) {
        const hud = computeHudLayout(w, h, insets, 1);
        const t = computeTouchLayout(w, h, insets);
        const hudRight = hud.x + hud.width * hud.scale;
        const hudBottom = hud.y + hud.height * hud.scale;
        const controlsLeft = Math.min(...[t.attack, t.dash, t.ability, t.chip].map((d) => d.cx - d.hit / 2));
        const controlsTop = Math.min(...[t.attack, t.dash, t.ability, t.chip].map((d) => d.cy - d.hit / 2));
        expect(hudRight < controlsLeft || hudBottom < controlsTop, `${sn} ${inn}`).toBe(true);
      }
    }
  });

  it('is a pure function that follows the player\'s size preference and the window, nothing else', () => {
    const a = computeHudLayout(844, 390, NO_INSETS, 1);
    const b = computeHudLayout(844, 390, NO_INSETS, 1.4);
    expect(b.scale / a.scale).toBeCloseTo(1.4, 9);
    expect(computeHudLayout(844, 390)).toEqual(computeHudLayout(844, 390));
  });

  it('on the phone of the artist\'s picture it is where the picture has it: the hexagon at 25.0 / 24.8 px, 74.7 px across, and the bars end 236.9 px from the left', () => {
    const l = computeHudLayout(844, 390);
    const px = HUD_DP_PER_PX * l.scale; // screen px per pixel of the canvas
    expect(l.x).toBeCloseTo(25.0, 0);
    expect(l.y).toBeCloseTo(24.9, 0);
    expect(HUD_PX.portrait.w * px).toBeCloseTo(74.7, 0);
    expect(l.x + l.width * l.scale).toBeCloseTo(236.9, 0);
  });

  it('a degenerate window does not give NaN', () => {
    const l = computeHudLayout(0, 0);
    expect(Number.isFinite(l.x) && Number.isFinite(l.y) && Number.isFinite(l.scale)).toBe(true);
  });
});
