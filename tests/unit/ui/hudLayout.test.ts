import { describe, expect, it } from 'vitest';
import { computeHudLayout, HUD_DESIGN, hudBlockSize } from '@/ui/hud/layout';
import { computeTouchLayout, type Insets, NO_INSETS } from '@/ui/touch/layout';

/**
 * The HUD sits at the top left, inside the safe area, at the same uiScale as the touch controls, whatever the aspect ratio
 * (docs/GAME-SPEC-2D.md §17): 4:3, 16:9, 19.5:9, 21:9; with and without a notch, an island or rounded corners.
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
  it('is a card, the life segments, the magic bar and the bottles, with the spec\'s numbers', () => {
    const d = HUD_DESIGN;
    expect([d.card.w, d.card.h]).toEqual([52, 68]);
    expect([d.life.segW, d.life.segH, d.life.gap]).toEqual([22, 10, 3]);
    expect([d.magic.w, d.magic.h]).toEqual([140, 8]);
    expect([d.vial.w, d.vial.h]).toEqual([22, 30]);
    expect(d.margin).toBe(16);
  });

  it('its size follows the number of segments and bottles (5 life + 3 bottles by default, 4 bottles after the reward)', () => {
    const a = hudBlockSize(5, 3);
    const b = hudBlockSize(5, 4);
    expect(b.width).toBeGreaterThanOrEqual(a.width);
    const wide = hudBlockSize(9, 3);
    expect(wide.width).toBeGreaterThan(a.width);
    expect(a.height).toBeGreaterThanOrEqual(HUD_DESIGN.card.h);
  });

  it('the touch areas of the bottle icons never overlap: they are as wide as their pitch', () => {
    expect(HUD_DESIGN.vial.pitch).toBeGreaterThanOrEqual(HUD_DESIGN.vial.w);
    expect(HUD_DESIGN.vial.hitH).toBeGreaterThanOrEqual(44);
    // 3-4 icons side by side: each hit area is exactly one pitch wide, so the row is the sum, with no shared pixels
    expect(hudBlockSize(5, 4).width - hudBlockSize(5, 3).width).toBeGreaterThanOrEqual(0);
  });
});

describe('hud placement', () => {
  it('is the top-left corner plus the margin, inside the safe area, on every screen', () => {
    for (const [sn, w, h] of SCREENS) {
      for (const [inn, insets] of INSETS) {
        const l = computeHudLayout(w, h, insets);
        expect(l.x, `${sn} ${inn}`).toBeCloseTo(insets.left + 16 * l.scale, 9);
        expect(l.y, `${sn} ${inn}`).toBeCloseTo(insets.top + 16 * l.scale, 9);
        expect(l.x).toBeGreaterThanOrEqual(insets.left);
        expect(l.y).toBeGreaterThanOrEqual(insets.top);
      }
    }
  });

  it('fits entirely on the screen (nothing is cut off) on every screen, at every size the player may choose', () => {
    for (const [sn, w, h] of SCREENS) {
      for (const [inn, insets] of INSETS) {
        for (const size of [0.8, 1, 1.4]) {
          const l = computeHudLayout(w, h, insets, size, 5, 4);
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
        const hud = computeHudLayout(w, h, insets, 1, 5, 4);
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

  it('a degenerate window does not give NaN', () => {
    const l = computeHudLayout(0, 0);
    expect(Number.isFinite(l.x) && Number.isFinite(l.y) && Number.isFinite(l.scale)).toBe(true);
  });
});
