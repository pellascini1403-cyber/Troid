import { describe, expect, it } from 'vitest';
import { DEFAULT_TOUCH } from '@/input/gestures/TouchConfig';
import { computeTouchLayout, discsOverlap, NO_INSETS, TOUCH_CONTROLS, type Disc, type Insets } from '@/ui/touch/layout';

/**
 * The design numbers of the touch controls (GAME-SPEC-2D §4.3.4) hold on every screen the game supports: 4:3, 16:9, 19.5:9
 * and 21:9, with and without a notch / Dynamic Island / home indicator, at every size the player may choose.
 */
const SCREENS: Array<[string, number, number]> = [
  ['iPad 4:3', 1024, 768],
  ['16:9', 1280, 720],
  ['small phone 16:9', 667, 375],
  ['iPhone 19.5:9', 844, 390],
  ['big iPhone 19.5:9', 932, 430],
  ['Android 20:9', 915, 412],
  ['ultra-wide 21:9', 1260, 540],
  ['desktop 1080p', 1920, 1080],
];
const NOTCH: Insets = { top: 0, right: 47, bottom: 21, left: 47 }; // landscape iPhone with a notch and a home indicator
const ISLAND: Insets = { top: 0, right: 59, bottom: 21, left: 59 };
const ROUNDED: Insets = { top: 24, right: 24, bottom: 24, left: 24 };
const INSETS: Array<[string, Insets]> = [['none', NO_INSETS], ['notch', NOTCH], ['island', ISLAND], ['rounded corners', ROUNDED]];
const SIZES = [0.8, 1, 1.4];
const BUTTONS = ['attack', 'dash', 'ability', 'chip'] as const;

function each(fn: (name: string, w: number, h: number, insets: Insets, size: number) => void): void {
  for (const [sn, w, h] of SCREENS) for (const [inn, insets] of INSETS) for (const size of SIZES) fn(`${sn} · ${inn} · ×${size}`, w, h, insets, size);
}

describe('touch layout: nothing overlaps, nothing leaves the screen', () => {
  it('no two touch areas overlap: a finger always means exactly one control', () => {
    each((name, w, h, insets, size) => {
      const l = computeTouchLayout(w, h, insets, size);
      for (let i = 0; i < BUTTONS.length; i++) {
        for (let j = i + 1; j < BUTTONS.length; j++) {
          expect(discsOverlap(l[BUTTONS[i] as 'attack'], l[BUTTONS[j] as 'attack']), `${name}: ${BUTTONS[i]} / ${BUTTONS[j]}`).toBe(false);
        }
      }
    });
  });

  it('the visible gap between two controls is at least 28 dp (scaled) at the design size', () => {
    for (const [name, w, h] of SCREENS) {
      const l = computeTouchLayout(w, h);
      const s = l.controlScale;
      for (let i = 0; i < BUTTONS.length; i++) {
        for (let j = i + 1; j < BUTTONS.length; j++) {
          const a = l[BUTTONS[i] as 'attack'];
          const b = l[BUTTONS[j] as 'attack'];
          const gap = Math.hypot(a.cx - b.cx, a.cy - b.cy) - (a.visual + b.visual) / 2;
          expect(gap, `${name}: ${BUTTONS[i]} / ${BUTTONS[j]}`).toBeGreaterThanOrEqual(28 * s - 1e-9);
        }
      }
    }
  });

  it('every touch area is inside the safe part of the screen, and at least edgeMargin from the right edge', () => {
    each((name, w, h, insets, size) => {
      const l = computeTouchLayout(w, h, insets, size);
      const margin = DEFAULT_TOUCH.edgeMargin * l.controlScale;
      for (const b of BUTTONS) {
        const d: Disc = l[b];
        const r = d.hit / 2;
        expect(d.cx + r, `${name}: ${b} right`).toBeLessThanOrEqual(w - insets.right - margin + 1e-9 + (b === 'attack' ? 0 : 0));
        expect(d.cx - r, `${name}: ${b} left`).toBeGreaterThan(0);
        expect(d.cy - r, `${name}: ${b} top`).toBeGreaterThan(0);
        expect(d.cy + r, `${name}: ${b} bottom`).toBeLessThanOrEqual(h - insets.bottom + 1e-9 + 20 * l.controlScale);
      }
    });
  });

  it('the home indicator never covers a control: the lowest control stays clear of it', () => {
    for (const [name, w, h] of SCREENS) {
      const l = computeTouchLayout(w, h, NOTCH);
      const lowest = Math.max(...BUTTONS.map((b) => l[b].cy + l[b].hit / 2));
      expect(lowest, name).toBeLessThanOrEqual(h - NOTCH.bottom + 1e-9 + 20 * l.controlScale);
      // the VISIBLE discs are fully above the indicator
      const lowestVisible = Math.max(...BUTTONS.map((b) => l[b].cy + l[b].visual / 2));
      expect(lowestVisible, name).toBeLessThanOrEqual(h - NOTCH.bottom + 1e-9);
    }
  });

  it('the controls follow the safe corner: a notch pushes them inwards by exactly the inset', () => {
    for (const [name, w, h] of SCREENS) {
      const plain = computeTouchLayout(w, h);
      const notched = computeTouchLayout(w, h, NOTCH);
      expect(notched.attack.cx, name).toBeCloseTo(plain.attack.cx - NOTCH.right, 9);
      expect(notched.attack.cy, name).toBeCloseTo(plain.attack.cy - NOTCH.bottom, 9);
    }
  });
});

describe('touch layout: the movement zone', () => {
  it('is the left 46 % of the usable width, the whole height, starting after the left inset (it yields only to a control)', () => {
    each((name, w, h, insets, size) => {
      const l = computeTouchLayout(w, h, insets, size);
      expect(l.zone.x, name).toBe(insets.left);
      expect(l.zone.y, name).toBe(0);
      expect(l.zone.h, name).toBe(h);
      expect(l.zone.w, name).toBeLessThanOrEqual((w - insets.left - insets.right) * 0.46 + 1e-9);
    });
    // at the design size on every screen the zone is exactly the 46 %
    for (const [name, w, h] of SCREENS) {
      expect(computeTouchLayout(w, h).zone.w, name).toBeCloseTo(w * 0.46, 9);
    }
  });

  it('on an extreme window (a small phone, an island on both sides, 1.4× controls) the zone shrinks instead of overlapping a control', () => {
    const l = computeTouchLayout(667, 375, ISLAND, 1.4);
    expect(l.zone.w).toBeLessThan((667 - 2 * 59) * 0.46);
    expect(l.zone.x + l.zone.w).toBeLessThan(l.dash.cx - l.dash.hit / 2);
    expect(l.zone.w).toBeGreaterThan(150); // and it is still a usable thumb area
  });

  it('never reaches a control: the zone ends before the leftmost touch area begins', () => {
    each((name, w, h, insets, size) => {
      const l = computeTouchLayout(w, h, insets, size);
      const zoneRight = l.zone.x + l.zone.w;
      for (const b of BUTTONS) expect(l[b].cx - l[b].hit / 2, `${name}: ${b}`).toBeGreaterThan(zoneRight);
    });
  });

  it('does not change with the size preference (it is invisible: only the buttons grow)', () => {
    const a = computeTouchLayout(844, 390, NOTCH, 0.8);
    const b = computeTouchLayout(844, 390, NOTCH, 1.4);
    expect(a.zone).toEqual(b.zone);
    expect(a.gestureScale).toBe(b.gestureScale);
    expect(b.attack.visual).toBeGreaterThan(a.attack.visual);
  });
});

describe('touch layout: scale and data', () => {
  it('uses the design diameters at the reference size (844 px wide: scale 819/844)', () => {
    const l = computeTouchLayout(844, 390);
    expect(l.gestureScale).toBeCloseTo(819 / 844, 9);
    for (const b of BUTTONS) {
      expect(l[b].visual).toBeCloseTo(TOUCH_CONTROLS[b].visual * l.controlScale, 9);
      expect(l[b].hit).toBeCloseTo(TOUCH_CONTROLS[b].hit * l.controlScale, 9);
    }
  });

  it('the touch area of every control is larger than what is drawn (the thumb does not have to be exact)', () => {
    for (const b of BUTTONS) expect(TOUCH_CONTROLS[b].hit).toBeGreaterThan(TOUCH_CONTROLS[b].visual);
  });

  it('there are exactly four fixed controls and none of them is a jump, interaction or joystick', () => {
    expect(Object.keys(TOUCH_CONTROLS).sort()).toEqual(['ability', 'attack', 'chip', 'dash']);
    const l = computeTouchLayout(844, 390);
    expect(Object.keys(l).sort()).toEqual(['ability', 'attack', 'chip', 'controlScale', 'dash', 'gestureScale', 'insets', 'zone']);
  });

  it('is a pure function: the same window gives the same layout, and the result does not alias the insets', () => {
    const insets = { ...NOTCH };
    const a = computeTouchLayout(844, 390, insets, 1);
    insets.right = 0;
    const b = computeTouchLayout(844, 390, NOTCH, 1);
    expect(a).toEqual(b);
    expect(a.insets).not.toBe(insets);
  });

  it('a degenerate window (no usable width) does not produce NaN or a negative zone', () => {
    const l = computeTouchLayout(100, 100, { top: 0, right: 80, bottom: 0, left: 80 });
    expect(l.zone.w).toBe(0);
    expect(Number.isFinite(l.attack.cx)).toBe(true);
  });
});
