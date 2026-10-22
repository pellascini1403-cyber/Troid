import { describe, expect, it } from 'vitest';
import { DEFAULT_TOUCH } from '@/input/gestures/TouchConfig';
import { BOSS_BAR, computeBossBarLayout } from '@/ui/hud/bossBarLayout';
import { computeHudLayout, HUD_DESIGN, hudBlockSize } from '@/ui/hud/layout';
import { HUD_SCALE_LIMITS } from '@/save/SettingsData';
import { pauseBox } from '@/ui/settings/PauseButton';
import { computeTouchLayout, HUD_FOOTPRINT, NO_INSETS, type ButtonPlacements, type Disc, type Insets, type TouchLayout } from '@/ui/touch/layout';

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
/** Smaller than any window the game is played in: where the size the player asked for really cannot be held (a window this small is only a test of the safety net). */
const SMALLEST: Window = ['smallest window', 400, 225];
const PORTRAIT: readonly Window[] = [
  ['phone, portrait', 390, 844],
  ['tablet, portrait', 820, 1180],
];
const NOTCH: Insets = { top: 0, right: 47, bottom: 21, left: 47 };
const ISLAND: Insets = { top: 0, right: 59, bottom: 21, left: 59 };
const ROUNDED: Insets = { top: 24, right: 24, bottom: 24, left: 24 };
const INSETS: ReadonlyArray<readonly [string, Insets]> = [['no insets', NO_INSETS], ['notch', NOTCH], ['island', ISLAND], ['rounded corners', ROUNDED]];
const SIZES = [0.8, 1, 1.4];
const BUTTONS = ['attack', 'dash', 'ability', 'chip'] as const;
/** The places the player may put the buttons in (docs/PROMPT15-LOG.md), each a way of holding the phone: as designed, for the left hand, raised and further in, and spread over the screen (some of them big, one small). */
interface Scenario {
  name: string;
  buttons: ButtonPlacements;
}
const SCENARIOS: readonly Scenario[] = [
  { name: 'as designed', buttons: {} },
  { name: 'left hand', buttons: { attack: { x: 0.15, y: 0.7, scale: 1 }, dash: { x: 0.28, y: 0.82, scale: 1 }, ability: { x: 0.22, y: 0.62, scale: 1 } } },
  { name: 'raised and in', buttons: { attack: { x: 0.72, y: 0.5, scale: 1 }, dash: { x: 0.6, y: 0.62, scale: 1 }, ability: { x: 0.66, y: 0.4, scale: 1 } } },
  { name: 'spread', buttons: { attack: { x: 0.95, y: 0.55, scale: 1.3 }, dash: { x: 0.05, y: 0.85, scale: 0.8 }, ability: { x: 0.5, y: 0.2, scale: 1.5 } } },
];

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
const hudRect = (w: number, h: number, i: Insets, size = 1): Rect => {
  const l = computeHudLayout(w, h, i, size); // its box does not change with the fourth bottle: the row of the artist's bottles holds it
  return { x0: l.x, y0: l.y, x1: l.x + l.width * l.scale, y1: l.y + l.height * l.scale };
};
const barRect = (w: number, h: number, i: Insets, touch: TouchLayout | null): Rect => {
  const b = computeBossBarLayout(w, h, i, touch ? BUTTONS.map((id) => discRect(touch[id])) : []);
  return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
};

function eachWindow(windows: readonly Window[], fn: (name: string, w: number, h: number, insets: Insets, insetName: string) => void): void {
  for (const [wn, w, h] of windows) for (const [inn, insets] of INSETS) fn(`${wn} (${w}×${h}) · ${inn}`, w, h, insets, inn);
}
function eachPlacement(windows: readonly Window[], sizes: readonly number[], fn: (name: string, w: number, h: number, insets: Insets, l: TouchLayout, p: Scenario, size: number) => void): void {
  eachWindow(windows, (name, w, h, insets) => {
    for (const size of sizes) {
      for (const p of SCENARIOS) fn(`${name} · ×${size} · ${p.name}`, w, h, insets, computeTouchLayout(w, h, insets, { scale: size, buttons: p.buttons }), p, size);
    }
  });
}

describe('the touch controls, on every class of window, at every size and in every place the editor can leave them', () => {
  it('every touch area is a finger: at least 44 css px across, however small the window, the size asked for or the button (the small one included)', () => {
    eachPlacement([...LANDSCAPE, TINY], SIZES, (name, _w, _h, _i, l) => {
      for (const b of BUTTONS) expect(l[b].hit, `${name}: ${b}`).toBeGreaterThanOrEqual(44 - 1e-9);
    });
  });

  it('they are all inside the safe area and apart from each other, and the plates keep the margin of the sides (the system keeps the edge)', () => {
    eachPlacement([...LANDSCAPE, TINY], SIZES, (name, w, h, insets, l) => {
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
        expect(l[b].cx + l[b].visual / 2, `${name}: ${b} from the right edge`).toBeLessThanOrEqual(safe.x1 - margin + 1e-9);
        expect(l[b].cx - l[b].visual / 2, `${name}: ${b} from the left edge`).toBeGreaterThanOrEqual(safe.x0 + margin - 1e-9);
      }
    });
  });

  it('the movement zone is left a usable thumb area (≥ 25 % of the usable width), and where the buttons are as designed or for the other hand it never reaches one', () => {
    eachPlacement([...LANDSCAPE, TINY], SIZES, (name, w, _h, insets, l, p) => {
      const usable = w - insets.left - insets.right;
      expect(l.zone.w, `${name}: the zone`).toBeGreaterThanOrEqual(usable * 0.25 - 1e-9);
      if (p.name !== 'as designed' && p.name !== 'left hand') return;
      for (const b of BUTTONS) {
        const r = discRect(l[b]);
        expect(r.x1 <= l.zone.x + 1e-9 || r.x0 >= l.zone.x + l.zone.w - 1e-9, `${name}: ${b} is clear of the zone`).toBe(true);
      }
    });
  });

  it('the buttons never reach the life, the magic and the bottles (the HUD) — in any place the player can put them, at any size', () => {
    eachPlacement(LANDSCAPE, SIZES, (name, w, h, insets, l) => {
      const hud = inflate(hudRect(w, h, insets), 4);
      for (const b of BUTTONS) expect(discHitsRect(l[b], hud), `${name}: ${b} / the HUD`).toBe(false);
    });
  });

  it('…and on the smallest window too, as far as it can be: at the design size, as designed or for the left hand, the buttons still clear the HUD', () => {
    for (const [inn, insets] of INSETS.slice(0, 3)) {
      for (const p of SCENARIOS.slice(0, 2)) {
        const [, w, h] = TINY;
        const l = computeTouchLayout(w, h, insets, { buttons: p.buttons });
        const hud = inflate(hudRect(w, h, insets), 4);
        for (const b of BUTTONS) expect(discHitsRect(l[b], hud), `${inn} · ${p.name}: ${b}`).toBe(false);
      }
    }
  });

  it('where the buttons are as designed the size the player asks for is kept in every class of phone and tablet (the window holds it): it only gives way in the smallest', () => {
    for (const [name, w, h] of LANDSCAPE) {
      for (const [inn, insets] of INSETS) {
        for (const size of [0.8, 1, 1.2, 1.4]) {
          const l = computeTouchLayout(w, h, insets, { scale: size });
          expect(l.controlScale, `${name} · ${inn} · ×${size}`).toBeCloseTo(l.gestureScale * size, 9);
          expect(l.exact, `${name} · ${inn} · ×${size}`).toBe(true);
        }
      }
    }
  });

  it('when the window cannot hold what was asked the size gives way — never below the floor, and a finger is still a finger', () => {
    let gave = 0;
    for (const [name, w, h] of [...LANDSCAPE, TINY, SMALLEST]) {
      for (const [inn, insets] of INSETS) {
        for (const size of [0.8, 1, 1.2, 1.4]) {
          for (const p of SCENARIOS) {
            const l = computeTouchLayout(w, h, insets, { scale: size, buttons: p.buttons });
            const asked = l.gestureScale * size;
            if (l.controlScale < asked - 1e-9) gave++;
            expect(l.controlScale, `${name} · ${inn} · ×${size} · ${p.name}`).toBeLessThanOrEqual(asked + 1e-9);
            expect(l.controlScale, `${name} · ${inn} · ×${size} · ${p.name}: the floor`).toBeGreaterThanOrEqual(Math.min(asked, 0.72 * asked) - 1e-9);
            expect(l.chip.hit, `${name} · ${inn} · ×${size} · ${p.name}: the smallest area is a finger`).toBeGreaterThanOrEqual(44 - 1e-9);
          }
        }
      }
    }
    expect(gave, 'it does give way sometimes (this test would be about nothing otherwise)').toBeGreaterThan(0);
    // …and in the windows the game is played in it never needs to, wherever the player puts the buttons: moving them is enough
    for (const [name, w, h] of LANDSCAPE) for (const [inn, insets] of INSETS) for (const p of SCENARIOS) expect(computeTouchLayout(w, h, insets, { buttons: p.buttons }).exact, `${name} · ${inn} · ${p.name}`).toBe(true);
  });

  it('asking for a bigger size never gives smaller buttons (the slider goes up, the buttons do not shrink): the layout is monotonic in the size, whatever the window and the places', () => {
    for (const [name, w, h] of [...LANDSCAPE, TINY]) {
      for (const [inn, insets] of INSETS) {
        for (const p of SCENARIOS) {
          let last = 0;
          for (let k = 16; k <= 28; k++) {
            const size = k / 20; // 0.80 … 1.40 in exact steps of 0.05
            const l = computeTouchLayout(w, h, insets, { scale: size, buttons: p.buttons });
            // (the size is found by bisection: it is exact to a few hundred-thousandths)
            expect(l.controlScale, `${name} · ${inn} · ${p.name} · ×${size}`).toBeGreaterThanOrEqual(last - 2e-4);
            last = l.controlScale;
          }
        }
      }
    }
  });

  it('what the player asks is what they get whenever it fits: the design window gives the size and the places that were asked for', () => {
    const l = computeTouchLayout(844, 390, NO_INSETS, { scale: 1.2 });
    const design = computeTouchLayout(844, 390, NO_INSETS);
    expect(l.controlScale / design.controlScale).toBeCloseTo(1.2, 9);
    const placed = computeTouchLayout(844, 390, NO_INSETS, { buttons: { attack: { x: 0.3, y: 0.7, scale: 1 } } });
    expect(placed.attack.cx).toBeCloseTo(0.3 * 844, 6);
    expect(placed.attack.cy).toBeCloseTo(0.7 * 390, 6);
  });

  it('a button dragged across the screen moves smoothly: no jump bigger than the drag (no place the nearest-place search can leap from)', () => {
    eachWindow(LANDSCAPE, (name, w, h, insets) => {
      let last: TouchLayout | null = null;
      for (let t = 0.1; t <= 0.9001; t += 0.025) {
        const l = computeTouchLayout(w, h, insets, { buttons: { attack: { x: t, y: 0.6, scale: 1 } } });
        if (last) {
          // one step of the drag is 2.5 % of the width: the button moves with it, or slides along what blocks it, never further than a few steps
          expect(Math.abs(l.attack.cx - last.attack.cx), `${name}: x at ${t.toFixed(3)}`).toBeLessThan(0.025 * w * 3 + 40);
          expect(Math.abs(l.attack.cy - last.attack.cy), `${name}: y at ${t.toFixed(3)}`).toBeLessThan(0.025 * w * 3 + 40);
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
      const l = computeTouchLayout(w, h, NO_INSETS);
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
      expect(HUD_DESIGN.vial.hitH * l.scale, `${name}: a bottle is at least 44 css px tall to a finger`).toBeGreaterThanOrEqual(44 - 1e-9);
    });
  });

  it('the numbers the touch layout keeps clear of the HUD and of the boss\'s bar are the ones those two really take (a change to either must come here)', () => {
    const block = hudBlockSize();
    expect(HUD_FOOTPRINT.margin).toBe(HUD_DESIGN.margin);
    // repeated, rounded up to a tenth of a dp, so that the touch layout does not import the HUD and never keeps clear of less than the HUD takes
    expect(HUD_FOOTPRINT.height).toBeGreaterThanOrEqual(block.height);
    expect(HUD_FOOTPRINT.height - block.height).toBeLessThan(0.1);
    expect(HUD_FOOTPRINT.width).toBeGreaterThanOrEqual(block.width);
    expect(HUD_FOOTPRINT.width - block.width).toBeLessThan(0.1);
    // the room the layout leaves the bar at the bottom, wherever the player puts the buttons, is the least width of the bar plus its gap on each side: nothing is in the middle of the bottom of the window
    for (const [name, w, h] of LANDSCAPE) {
      for (const p of SCENARIOS) {
        const l = computeTouchLayout(w, h, NO_INSETS, { scale: 1.4, buttons: p.buttons });
        const band = { y0: h - BOSS_BAR.bottom - BOSS_BAR.height - BOSS_BAR.gap, y1: h - BOSS_BAR.bottom + BOSS_BAR.gap };
        const half = BOSS_BAR.minWidth / 2 + BOSS_BAR.gap;
        for (const b of BUTTONS) {
          const r = discRect(l[b]);
          const inTheBand = r.y1 > band.y0 && r.y0 < band.y1;
          expect(!inTheBand || r.x1 <= w / 2 - half + 1e-9 || r.x0 >= w / 2 + half - 1e-9, `${name} · ${p.name}: ${b} leaves room for the least bar and its gaps`).toBe(true);
        }
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

describe('the size of the interface the player chose (accessibility: 85 % to 135 %)', () => {
  const SIZES_OF_HUD = [HUD_SCALE_LIMITS.min, 1, 1.2, HUD_SCALE_LIMITS.max];

  it('the HUD the touch layout keeps clear of is the HUD as drawn at that size (the numbers of the two modules agree at every size)', () => {
    for (const [name, w, h] of LANDSCAPE) {
      for (const size of SIZES_OF_HUD) {
        const hud = hudRect(w, h, NO_INSETS, size);
        const scale = computeHudLayout(w, h, NO_INSETS, size).scale;
        expect(HUD_FOOTPRINT.width * scale - (hud.x1 - hud.x0), `${name} ×${size}: the width (kept clear of: the HUD's, to a tenth of a dp more)`).toBeGreaterThanOrEqual(-1e-9);
        expect(HUD_FOOTPRINT.width * scale - (hud.x1 - hud.x0), `${name} ×${size}: the width`).toBeLessThan(0.1 * scale);
        expect(HUD_FOOTPRINT.height * scale - (hud.y1 - hud.y0), `${name} ×${size}: the height (kept clear of: the HUD's, to a tenth of a dp more)`).toBeGreaterThanOrEqual(-1e-9);
        expect(HUD_FOOTPRINT.height * scale - (hud.y1 - hud.y0), `${name} ×${size}: the height`).toBeLessThan(0.1 * scale);
        expect(hud.x0, `${name} ×${size}: the margin`).toBeCloseTo(HUD_FOOTPRINT.margin * scale, 6);
      }
    }
  });

  it('the buttons stay inside the safe area and off the HUD at every size of it, in every window class, every inset and every place', () => {
    for (const [wn, w, h] of LANDSCAPE) {
      for (const [inn, insets] of INSETS) {
        for (const size of SIZES_OF_HUD) {
          for (const p of SCENARIOS) {
            const l = computeTouchLayout(w, h, insets, { buttons: p.buttons, hudScale: size });
            const name = `${wn} · ${inn} · HUD ×${size} · ${p.name}`;
            const hud = inflate(hudRect(w, h, insets, size), 4);
            for (const b of BUTTONS) {
              expect(inside(discRect(l[b]), safeRect(w, h, insets)), `${name}: ${b} inside`).toBe(true);
              expect(discHitsRect(l[b], hud), `${name}: ${b} / the HUD`).toBe(false);
              expect(l[b].hit, `${name}: ${b} is a finger`).toBeGreaterThanOrEqual(44 - 1e-9);
            }
          }
        }
      }
    }
  });

  it('a bigger HUD takes room from the buttons only when it must: at its design size nothing changes, and a button placed under where it grows to is moved out of its way', () => {
    for (const [name, w, h] of LANDSCAPE) {
      for (const [inn, insets] of INSETS) {
        const before = computeTouchLayout(w, h, insets, { buttons: SCENARIOS[1]!.buttons });
        const same = computeTouchLayout(w, h, insets, { buttons: SCENARIOS[1]!.buttons, hudScale: 1 });
        expect(same, `${name} · ${inn}`).toEqual(before);
        // a button put just below the HUD at its design size: the biggest HUD pushes it down (it is never left under it)
        const under = computeTouchLayout(w, h, insets, { buttons: { dash: { x: 0.12, y: 0.3, scale: 1 } }, hudScale: HUD_SCALE_LIMITS.max });
        const hudBig = inflate(hudRect(w, h, insets, HUD_SCALE_LIMITS.max), 4);
        expect(discHitsRect(under.dash, hudBig), `${name} · ${inn}: moved out of the way`).toBe(false);
      }
    }
  });

  it('the pause button stays inside the safe area, a finger, clear of the HUD and of every button, at every size of the HUD', () => {
    for (const [wn, w, h] of [...LANDSCAPE, ...PORTRAIT]) {
      for (const [inn, insets] of INSETS) {
        for (const size of SIZES_OF_HUD) {
          const l = computeTouchLayout(w, h, insets, { hudScale: size });
          const scale = computeHudLayout(w, h, insets, 1).scale;
          const p = pauseBox(w, insets, scale, size);
          const name = `${wn} · ${inn} · HUD ×${size}`;
          expect(p.x1 - p.x0, `${name}: a finger`).toBeGreaterThanOrEqual(44);
          expect(inside(p, safeRect(w, h, insets)), `${name}: inside`).toBe(true);
          // (a window narrower than the HUD at this size cannot give the button a place beside it: it is then in the middle, over nothing it can avoid — only where the HUD reaches that far)
          const hud = inflate(hudRect(w, h, insets, size), 2);
          if (hud.x1 + (p.x1 - p.x0) <= w - insets.right) expect(rectsOverlap(p, hud), `${name}: pause / HUD`).toBe(false);
          for (const b of BUTTONS) expect(discHitsRect(l[b], p), `${name}: pause / ${b}`).toBe(false);
        }
      }
    }
  });
});
