import { describe, expect, it } from 'vitest';
import { DEFAULT_TOUCH } from '@/input/gestures/TouchConfig';
import { BOSS_BAR, computeBossBarLayout } from '@/ui/hud/bossBarLayout';
import { computeHudLayout, HUD_DESIGN, hudBlockSize } from '@/ui/hud/layout';
import { pauseBox } from '@/ui/settings/PauseButton';
import { computeTouchLayout, HUD_FOOTPRINT, NO_INSETS, type Disc, type Insets, type Placement, type TouchLayout } from '@/ui/touch/layout';

/**
 * The GEOMETRY of the interface on every class of screen (docs/MOBILE-CALIBRATION.md, docs/PROMPT6-LOG.md S31). Pure numbers: where each piece goes for a
 * window of `width × height` CSS px and a safe area, and what must hold between the pieces — nothing outside the safe area, no two things to touch
 * that overlap, nothing in front of the HUD, a thumb area left for the movement. It says NOTHING about a hand, a thumb or a real screen: the sizes below
 * are CLASSES of window (numbers of CSS pixels), not measurements of any device, and nothing here was ever calibrated on one.
 */
type Window = readonly [name: string, width: number, height: number];
const LANDSCAPE: readonly Window[] = [
  ['small phone', 667, 375],
  ['phone', 844, 390],
  ['big phone', 932, 430],
  ['tall Android', 915, 412],
  ['21:9 phone', 1260, 540],
  ['small tablet', 1133, 744],
  ['tablet', 1180, 820],
  ['4:3 tablet', 1024, 768],
  ['desktop', 1280, 720],
];
/** A window smaller than any phone this game targets: the layout must stay sane on it (inside, apart), even where it cannot clear everything. */
const TINY: Window = ['very small phone', 568, 320];
const PORTRAIT: readonly Window[] = [
  ['phone, portrait', 390, 844],
  ['tablet, portrait', 820, 1180],
];
const NOTCH: Insets = { top: 0, right: 47, bottom: 21, left: 47 };
const ISLAND: Insets = { top: 0, right: 59, bottom: 21, left: 59 };
const ROUNDED: Insets = { top: 24, right: 24, bottom: 24, left: 24 };
const INSETS: ReadonlyArray<readonly [string, Insets]> = [['no insets', NO_INSETS], ['notch', NOTCH], ['island', ISLAND], ['rounded corners', ROUNDED]];
const SIZES = [0.8, 1, 1.4];
const SIDES = ['right', 'left'] as const;
const OFFSETS = [0, 0.5, 1];
const BUTTONS = ['attack', 'dash', 'ability', 'chip'] as const;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const discRect = (d: Disc): Rect => ({ x0: d.cx - d.hit / 2, y0: d.cy - d.hit / 2, x1: d.cx + d.hit / 2, y1: d.cy + d.hit / 2 });
const inflate = (r: Rect, by: number): Rect => ({ x0: r.x0 - by, y0: r.y0 - by, x1: r.x1 + by, y1: r.y1 + by });
const rectsOverlap = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** A round touch area against a rectangle (the round area is a circle: its corners are not there). */
function discHitsRect(d: Disc, r: Rect): boolean {
  const nx = Math.max(r.x0, Math.min(d.cx, r.x1));
  const ny = Math.max(r.y0, Math.min(d.cy, r.y1));
  return Math.hypot(d.cx - nx, d.cy - ny) < d.hit / 2 - 1e-6; // resting against it is not reaching into it
}
const inside = (r: Rect, safe: Rect, slack = 1e-6): boolean => r.x0 >= safe.x0 - slack && r.y0 >= safe.y0 - slack && r.x1 <= safe.x1 + slack && r.y1 <= safe.y1 + slack;
const safeRect = (w: number, h: number, i: Insets): Rect => ({ x0: i.left, y0: i.top, x1: w - i.right, y1: h - i.bottom });
const hudRect = (w: number, h: number, i: Insets): Rect => {
  const l = computeHudLayout(w, h, i, 1, 5, 4); // the most it ever holds in this game: five life segments and four bottles
  return { x0: l.x, y0: l.y, x1: l.x + l.width * l.scale, y1: l.y + l.height * l.scale };
};
const barRect = (w: number, h: number, i: Insets, touch: TouchLayout | null): Rect => {
  const b = computeBossBarLayout(w, h, i, touch ? BUTTONS.map((id) => discRect(touch[id])) : []);
  return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
};

function eachWindow(windows: readonly Window[], fn: (name: string, w: number, h: number, insets: Insets, insetName: string) => void): void {
  for (const [wn, w, h] of windows) for (const [inn, insets] of INSETS) fn(`${wn} (${w}×${h}) · ${inn}`, w, h, insets, inn);
}
function eachPlacement(windows: readonly Window[], sizes: readonly number[], fn: (name: string, w: number, h: number, insets: Insets, l: TouchLayout, p: Placement, size: number) => void): void {
  eachWindow(windows, (name, w, h, insets) => {
    for (const size of sizes) {
      for (const side of SIDES) {
        for (const offsetX of OFFSETS) {
          for (const offsetY of OFFSETS) {
            const p: Placement = { side, offsetX, offsetY };
            fn(`${name} · ×${size} · ${side} x${offsetX} y${offsetY}`, w, h, insets, computeTouchLayout(w, h, insets, size, DEFAULT_TOUCH, p), p, size);
          }
        }
      }
    }
  });
}

describe('the touch controls, on every class of window, at every size and in every placement the menu offers', () => {
  it('every touch area is a finger: at least 44 css px across, however small the window or the size asked for', () => {
    eachPlacement([...LANDSCAPE, TINY], SIZES, (name, _w, _h, _i, l) => {
      for (const b of BUTTONS) expect(l[b].hit, `${name}: ${b}`).toBeGreaterThanOrEqual(44 - 1e-9);
    });
  });

  it('they are all inside the safe area, apart from each other, and the edge they hang from keeps its margin (the system keeps the edge)', () => {
    eachPlacement([...LANDSCAPE, TINY], SIZES, (name, w, h, insets, l, p) => {
      const safe = safeRect(w, h, insets);
      for (const b of BUTTONS) expect(inside(discRect(l[b]), safe), `${name}: ${b} is inside the safe area`).toBe(true);
      for (let i = 0; i < BUTTONS.length; i++) {
        for (let j = i + 1; j < BUTTONS.length; j++) {
          const a = l[BUTTONS[i] as 'attack'];
          const c = l[BUTTONS[j] as 'attack'];
          expect(Math.hypot(a.cx - c.cx, a.cy - c.cy), `${name}: ${BUTTONS[i]} / ${BUTTONS[j]}`).toBeGreaterThanOrEqual((a.hit + c.hit) / 2 - 1e-9);
        }
      }
      const margin = DEFAULT_TOUCH.edgeMargin * l.controlScale;
      for (const b of BUTTONS) {
        const r = discRect(l[b]);
        if (p.side === 'right') expect(r.x1, `${name}: ${b} from the right edge`).toBeLessThanOrEqual(safe.x1 - margin + 1e-9);
        else expect(r.x0, `${name}: ${b} from the left edge`).toBeGreaterThanOrEqual(safe.x0 + margin - 1e-9);
      }
    });
  });

  it('the movement zone is left a usable thumb area (≥ 25 % of the usable width) and never reaches a button', () => {
    eachPlacement([...LANDSCAPE, TINY], SIZES, (name, w, _h, insets, l) => {
      const usable = w - insets.left - insets.right;
      expect(l.zone.w, `${name}: the zone`).toBeGreaterThanOrEqual(usable * 0.25 - 1e-9);
      for (const b of BUTTONS) {
        const r = discRect(l[b]);
        expect(r.x1 <= l.zone.x + 1e-9 || r.x0 >= l.zone.x + l.zone.w - 1e-9, `${name}: ${b} is clear of the zone`).toBe(true);
      }
    });
  });

  it('the buttons never reach the life, the magic and the bottles (the HUD) — the size the player asked for gives way to what fits', () => {
    eachPlacement(LANDSCAPE, SIZES, (name, w, h, insets, l) => {
      const hud = inflate(hudRect(w, h, insets), 4);
      for (const b of BUTTONS) expect(discHitsRect(l[b], hud), `${name}: ${b} / the HUD`).toBe(false);
    });
  });

  it('…and on the smallest window too, as far as it can be: at the design size and the left the buttons still clear the HUD', () => {
    for (const [inn, insets] of INSETS.slice(0, 3)) {
      for (const side of SIDES) {
        const [, w, h] = TINY;
        const l = computeTouchLayout(w, h, insets, 1, DEFAULT_TOUCH, { side, offsetX: 0, offsetY: 0 });
        const hud = inflate(hudRect(w, h, insets), 4);
        for (const b of BUTTONS) expect(discHitsRect(l[b], hud), `${inn} · ${side}: ${b}`).toBe(false);
      }
    }
  });

  it('on the side the controls were designed for (the right) the size the player asks for is kept in every class of phone and tablet: it only gives way in the smallest window', () => {
    for (const [name, w, h] of LANDSCAPE) {
      for (const [inn, insets] of INSETS) {
        for (const size of [0.8, 1, 1.2, 1.4]) {
          for (const offsetX of OFFSETS) {
            for (const offsetY of OFFSETS) {
              const l = computeTouchLayout(w, h, insets, size, DEFAULT_TOUCH, { side: 'right', offsetX, offsetY });
              expect(l.controlScale, `${name} · ${inn} · ×${size} · x${offsetX} y${offsetY}`).toBeCloseTo(l.gestureScale * size, 9);
            }
          }
        }
      }
    }
  });

  it('on the other side the chip hangs over the HUD, so the size can give way — never below the floor, and a finger is still a finger', () => {
    let gave = 0;
    for (const [name, w, h] of [...LANDSCAPE, TINY]) {
      for (const [inn, insets] of INSETS) {
        for (const size of [0.8, 1, 1.2, 1.4]) {
          for (const offsetY of OFFSETS) {
            const l = computeTouchLayout(w, h, insets, size, DEFAULT_TOUCH, { side: 'left', offsetX: 0, offsetY });
            const asked = l.gestureScale * size;
            if (l.controlScale < asked - 1e-9) gave++;
            expect(l.controlScale, `${name} · ${inn} · ×${size} · y${offsetY}`).toBeLessThanOrEqual(asked + 1e-9);
            expect(l.controlScale, `${name} · ${inn} · ×${size} · y${offsetY}: the floor`).toBeGreaterThanOrEqual(Math.min(asked, 0.72) - 1e-9);
            expect(l.chip.hit, `${name} · ${inn} · ×${size} · y${offsetY}: the smallest area is a finger`).toBeGreaterThanOrEqual(44 - 1e-9);
          }
        }
      }
    }
    expect(gave, 'it does give way sometimes (this test would be about nothing otherwise)').toBeGreaterThan(0);
  });

  it('asking for a bigger size never gives smaller buttons (the slider goes up, the buttons do not shrink): the layout is monotonic in the size, whatever the window and the placement', () => {
    for (const [name, w, h] of [...LANDSCAPE, TINY]) {
      for (const [inn, insets] of INSETS) {
        for (const side of SIDES) {
          for (const offsetX of OFFSETS) {
            for (const offsetY of OFFSETS) {
              let last = 0;
              for (let k = 16; k <= 28; k++) {
                const size = k / 20; // 0.80 … 1.40 in exact steps of 0.05
                const l = computeTouchLayout(w, h, insets, size, DEFAULT_TOUCH, { side, offsetX, offsetY });
                // (the size is found by bisection: it is exact to a few hundred-thousandths)
                expect(l.controlScale, `${name} · ${inn} · ${side} · x${offsetX} y${offsetY} · ×${size}`).toBeGreaterThanOrEqual(last - 2e-4);
                last = l.controlScale;
              }
            }
          }
        }
      }
    }
  });

  it('the case that once broke it: the phone, buttons on the left, in and up — ×1.2 is bigger than ×1 (a rounding error at the very edge of the HUD\'s reserve made it ×0.93)', () => {
    const asked = (size: number): number => computeTouchLayout(844, 390, NO_INSETS, size, DEFAULT_TOUCH, { side: 'left', offsetX: 1, offsetY: 1 }).controlScale;
    expect(asked(1)).toBeCloseTo(0.9703, 3);
    expect(asked(1.2)).toBeGreaterThan(asked(1) * 1.15);
  });

  it('what the player asks is what they get whenever it fits: the design window gives the size and the position that were asked for', () => {
    const l = computeTouchLayout(844, 390, NO_INSETS, 1.2, DEFAULT_TOUCH, { side: 'right', offsetX: 0, offsetY: 0 });
    const design = computeTouchLayout(844, 390, NO_INSETS, 1);
    expect(l.controlScale / design.controlScale).toBeCloseTo(1.2, 9);
  });

  it('every window class, every inset, every size: the two ends of the placement are the extremes of the same layout (no jump in between)', () => {
    eachWindow(LANDSCAPE, (name, w, h, insets) => {
      let last: TouchLayout | null = null;
      for (let t = 0; t <= 1.0001; t += 0.125) {
        const l = computeTouchLayout(w, h, insets, 1, DEFAULT_TOUCH, { side: 'right', offsetX: t, offsetY: t });
        if (last) {
          expect(Math.abs(l.attack.cx - last.attack.cx), `${name}: x at ${t}`).toBeLessThan(40);
          expect(Math.abs(l.attack.cy - last.attack.cy), `${name}: y at ${t}`).toBeLessThan(40);
        }
        last = l;
      }
    });
  });
});

describe('the pause button and the boss\'s bar', () => {
  it('the pause button is a finger, inside the safe area, at the top centre, and clear of the HUD and of every button', () => {
    eachPlacement(LANDSCAPE, [1], (name, w, h, insets, l) => {
      const p = pauseBox(w, insets, computeHudLayout(w, h, insets).scale);
      expect(p.x1 - p.x0, `${name}: pause`).toBeGreaterThanOrEqual(44);
      expect(inside(p, safeRect(w, h, insets)), `${name}: pause inside`).toBe(true);
      expect(Math.abs((p.x0 + p.x1) / 2 - (insets.left + (w - insets.left - insets.right) / 2)), `${name}: centred`).toBeLessThan(1);
      expect(rectsOverlap(p, inflate(hudRect(w, h, insets), 2)), `${name}: pause / HUD`).toBe(false);
      for (const b of BUTTONS) expect(discHitsRect(l[b], p), `${name}: pause / ${b}`).toBe(false);
    });
  });

  it('…also in portrait, where the HUD is wider than half the window: the pause button goes beside it, not over its bottles', () => {
    eachPlacement(PORTRAIT, [1], (name, w, h, insets, l) => {
      const p = pauseBox(w, insets, computeHudLayout(w, h, insets).scale);
      expect(inside(p, safeRect(w, h, insets)), `${name}: pause inside`).toBe(true);
      expect(rectsOverlap(p, inflate(hudRect(w, h, insets), 2)), `${name}: pause / HUD`).toBe(false);
      for (const b of BUTTONS) expect(discHitsRect(l[b], p), `${name}: pause / ${b}`).toBe(false);
    });
  });

  it('the boss\'s bar is inside the safe area, wide enough to read, and never under a button (it gets out of their way, it is never hidden by them)', () => {
    eachPlacement(LANDSCAPE, SIZES, (name, w, h, insets, l) => {
      const bar = barRect(w, h, insets, l);
      expect(inside(bar, safeRect(w, h, insets)), `${name}: the bar is inside the safe area (${JSON.stringify(bar)})`).toBe(true);
      expect(bar.x1 - bar.x0, `${name}: the bar is wide enough for a name and a bar`).toBeGreaterThanOrEqual(160);
      for (const b of BUTTONS) expect(discHitsRect(l[b], bar), `${name}: bar / ${b}`).toBe(false);
    });
  });

  it('where there are no buttons (a keyboard) the bar is centred, at most 46 % of the width and 440 px', () => {
    for (const [name, w, h] of LANDSCAPE) {
      const bar = barRect(w, h, NO_INSETS, null);
      expect((bar.x0 + bar.x1) / 2, name).toBeCloseTo(w / 2, 6);
      expect(bar.x1 - bar.x0, name).toBeLessThanOrEqual(Math.min(0.46 * w, 440) + 1e-9);
    }
  });

  it('with the buttons where the design puts them the bar stays centred or moves only a little (it is not pushed across the screen)', () => {
    for (const [name, w, h] of LANDSCAPE) {
      const l = computeTouchLayout(w, h, NO_INSETS, 1);
      const bar = barRect(w, h, NO_INSETS, l);
      expect(Math.abs((bar.x0 + bar.x1) / 2 - w / 2), name).toBeLessThan(0.1 * w);
    }
  });
});

describe('the HUD, the prompt and the window itself', () => {
  it('the HUD is inside the safe area at the top left on every class of window, and its bottle icons are a finger tall', () => {
    eachWindow(LANDSCAPE, (name, w, h, insets) => {
      const hud = hudRect(w, h, insets);
      expect(inside(hud, safeRect(w, h, insets)), `${name}: the HUD`).toBe(true);
      expect(hud.x0 - insets.left, `${name}: margin`).toBeGreaterThan(0);
      const l = computeHudLayout(w, h, insets);
      expect(HUD_DESIGN.vial.hitH * l.scale, `${name}: a bottle icon is at least 44 css px tall`).toBeGreaterThanOrEqual(44 - 1e-9);
    });
  });

  it('the numbers the touch layout keeps clear of the HUD and of the boss\'s bar are the ones those two really take (a change to either must come here)', () => {
    const block = hudBlockSize(5, 4);
    expect(HUD_FOOTPRINT.margin).toBe(HUD_DESIGN.margin);
    expect(HUD_FOOTPRINT.height).toBe(block.height);
    expect(HUD_FOOTPRINT.width).toBe(block.width);
    // the room the layout leaves at the bottom, even with the buttons moved in as far as they go, is the least width of the bar plus its gap on each side
    for (const [name, w, h] of LANDSCAPE) {
      for (const side of SIDES) {
        const l = computeTouchLayout(w, h, NO_INSETS, 1.4, DEFAULT_TOUCH, { side, offsetX: 1, offsetY: 1 });
        const rects = BUTTONS.map((b) => discRect(l[b]));
        const farthest = side === 'right' ? Math.min(...rects.map((r) => r.x0)) : Math.max(...rects.map((r) => r.x1));
        const room = side === 'right' ? farthest : w - farthest;
        expect(room, `${name} · ${side}: the buttons leave room for the least bar and its gaps`).toBeGreaterThanOrEqual(BOSS_BAR.minWidth + 2 * BOSS_BAR.gap - 1e-9);
      }
    }
  });

  it('in portrait nothing falls out of the window or overlaps a button (the game is meant to be played sideways: this is only the safety net)', () => {
    eachPlacement(PORTRAIT, [0.8, 1], (name, w, h, insets, l) => {
      const safe = safeRect(w, h, insets);
      for (const b of BUTTONS) expect(inside(discRect(l[b]), safe), `${name}: ${b}`).toBe(true);
      for (let i = 0; i < BUTTONS.length; i++) {
        for (let j = i + 1; j < BUTTONS.length; j++) {
          const a = l[BUTTONS[i] as 'attack'];
          const c = l[BUTTONS[j] as 'attack'];
          expect(Math.hypot(a.cx - c.cx, a.cy - c.cy), `${name}: ${BUTTONS[i]} / ${BUTTONS[j]}`).toBeGreaterThanOrEqual((a.hit + c.hit) / 2 - 1e-9);
        }
      }
      expect(l.zone.w, `${name}: the zone`).toBeGreaterThan(0);
    });
  });

  it('every number is finite on every class of window (no NaN, no infinity, no negative size)', () => {
    eachPlacement([...LANDSCAPE, TINY, ...PORTRAIT], [0.8, 1.4], (name, w, h, insets, l) => {
      for (const b of BUTTONS) {
        for (const v of [l[b].cx, l[b].cy, l[b].hit, l[b].visual]) expect(Number.isFinite(v), `${name}: ${b}`).toBe(true);
        expect(l[b].hit).toBeGreaterThan(0);
      }
      for (const v of [l.zone.x, l.zone.w, l.zone.h]) expect(Number.isFinite(v) && v >= 0, `${name}: zone`).toBe(true);
      const bar = computeBossBarLayout(w, h, insets, BUTTONS.map((id) => discRect(l[id])));
      for (const v of [bar.x, bar.y, bar.width, bar.height]) expect(Number.isFinite(v), `${name}: bar`).toBe(true);
    });
  });
});
