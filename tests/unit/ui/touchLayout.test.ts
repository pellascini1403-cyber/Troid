import { describe, expect, it } from 'vitest';
import { BUTTON_DESIGN, DEFAULT_TOUCH } from '@/input/gestures/TouchConfig';
import { TOUCH_BUTTONS, TOUCH_LIMITS } from '@/save/SettingsData';
import { BOSS_BAR } from '@/ui/hud/bossBarLayout';
import { computeTouchLayout, discsOverlap, HUD_FOOTPRINT, NO_INSETS, nearestFree, pointOf, resolveButtons, TOUCH_DESIGN, touchFrame, type ButtonId, type Circle, type TouchFrame, type ButtonPlacements, type Disc, type Insets, type Rect, type TouchLayout } from '@/ui/touch/layout';

/**
 * The geometry of the touch buttons (GAME-SPEC-2D §4.3.4, docs/PROMPT15-LOG.md): where each of the three buttons is by design — the reference screen the player gave — and what holds wherever the
 * player puts them, on every screen the game supports: 4:3, 16:9, 19.5:9 and 21:9, with and without a notch / Dynamic Island / home indicator. A pure function, tested without a browser.
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
const THREE = TOUCH_BUTTONS;
const FOUR = [...TOUCH_BUTTONS, 'chip'] as const;
const EPS = 1e-6;

const rectOf = (d: Disc): Rect => ({ x0: d.cx - d.hit / 2, y0: d.cy - d.hit / 2, x1: d.cx + d.hit / 2, y1: d.cy + d.hit / 2 });
/** A round touch area against a rectangle: does the circle reach into it? (Resting against it is not.) */
function reaches(d: Disc, r: Rect): boolean {
  const nx = Math.max(r.x0, Math.min(d.cx, r.x1));
  const ny = Math.max(r.y0, Math.min(d.cy, r.y1));
  return Math.hypot(d.cx - nx, d.cy - ny) < d.hit / 2 - EPS;
}
const safeOf = (w: number, h: number, i: Insets): Rect => ({ x0: i.left, y0: i.top, x1: w - i.right, y1: h - i.bottom });

/** A small deterministic generator: the same "random" placements on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randomPlacements = (rnd: () => number): ButtonPlacements => {
  const out: Partial<Record<ButtonId, { x: number; y: number; scale: number }>> = {};
  for (const id of THREE) if (rnd() < 0.8) out[id] = { x: rnd(), y: rnd(), scale: TOUCH_LIMITS.button.min + rnd() * (TOUCH_LIMITS.button.max - TOUCH_LIMITS.button.min) };
  return out;
};

describe('the design: the reference screen of image 4 (an 844 × 390 phone)', () => {
  const l = computeTouchLayout(844, 390);

  it('the three buttons are where the reference has them, to within half a pixel: Dash at the bottom, Attack at the right, Magic small, between them and above', () => {
    expect(l.attack.cx).toBeCloseTo(781, 0);
    expect(l.attack.cy).toBeCloseTo(293, 0);
    expect(l.dash.cx).toBeCloseTo(683, 0);
    expect(l.dash.cy).toBeCloseTo(329, 0);
    expect(l.ability.cx).toBeCloseTo(721.5, 0);
    expect(l.ability.cy).toBeCloseTo(284, 0);
  });

  it('…and the size they have there: the two big plates 68 px tall, the small one 30', () => {
    expect(l.attack.visual).toBeCloseTo(68, 0);
    expect(l.dash.visual).toBeCloseTo(68, 0);
    expect(l.ability.visual).toBeCloseTo(30, 0);
    // the proportions of the design are exact: the small one is 31/70 of the big ones, and the two big ones are the same size
    expect(l.ability.visual / l.attack.visual).toBeCloseTo(BUTTON_DESIGN.ability.visual / BUTTON_DESIGN.attack.visual, 9);
    expect(l.dash.visual).toBe(l.attack.visual);
  });

  it('the arrangement: from left to right Dash, Magic, Attack; from top to bottom Magic, Attack, Dash; all of them in the bottom right quarter of the screen', () => {
    expect(l.dash.cx).toBeLessThan(l.ability.cx);
    expect(l.ability.cx).toBeLessThan(l.attack.cx);
    expect(l.ability.cy).toBeLessThan(l.attack.cy);
    expect(l.attack.cy).toBeLessThan(l.dash.cy);
    expect(l.side).toBe('right');
    for (const id of THREE) {
      expect(l[id].cx, id).toBeGreaterThan(844 / 2);
      expect(l[id].cy, id).toBeGreaterThan(390 / 2);
    }
  });

  it('are the numbers of the design, in dp from the bottom-right corner of the safe area: the centres and the diameter of each plate', () => {
    expect(TOUCH_DESIGN.attack).toEqual({ dx: -65, dy: -100, visual: 70 });
    expect(TOUCH_DESIGN.dash).toEqual({ dx: -166, dy: -63, visual: 70 });
    expect(TOUCH_DESIGN.ability).toEqual({ dx: -126, dy: -109, visual: 31 });
    for (const id of THREE) {
      const g = l.gestureScale;
      expect(l[id].cx, id).toBeCloseTo(844 + TOUCH_DESIGN[id].dx * g, 9);
      expect(l[id].cy, id).toBeCloseTo(390 + TOUCH_DESIGN[id].dy * g, 9);
      expect(l[id].visual, id).toBeCloseTo(TOUCH_DESIGN[id].visual * g, 9);
    }
  });

  it('nothing overlaps: every touch area is a finger (≥ 44 px), covers its plate, and shares no pixel with another — the small button included', () => {
    for (const id of FOUR) {
      expect(l[id].hit, id).toBeGreaterThanOrEqual(44 - EPS);
      expect(l[id].hit, id).toBeGreaterThanOrEqual(l[id].visual - EPS);
    }
    for (let i = 0; i < FOUR.length; i++) for (let j = i + 1; j < FOUR.length; j++) expect(discsOverlap(l[FOUR[i] as 'attack'], l[FOUR[j] as 'attack']), `${FOUR[i]} / ${FOUR[j]}`).toBe(false);
    // the plates have a gap between them (the plate is what the eye sees)
    for (let i = 0; i < THREE.length; i++) {
      for (let j = i + 1; j < THREE.length; j++) {
        const a = l[THREE[i] as 'attack'];
        const b = l[THREE[j] as 'attack'];
        expect(Math.hypot(a.cx - b.cx, a.cy - b.cy) - (a.visual + b.visual) / 2, `${THREE[i]} / ${THREE[j]}`).toBeGreaterThan(8 * l.gestureScale - EPS);
      }
    }
  });

  it('the chip (the contextual bottle) hangs right over the attack button, and is the only thing that is not one of the three', () => {
    expect(l.chip.cx).toBeCloseTo(l.attack.cx, 6);
    expect(l.chip.cy).toBeLessThan(l.attack.cy - l.attack.visual / 2);
    expect(Object.keys(l).sort()).toEqual(['ability', 'attack', 'chip', 'controlScale', 'dash', 'exact', 'gestureScale', 'insets', 'side', 'zone']);
    expect(l.exact).toBe(true);
  });

  it('on a bigger window the whole design is scaled by uiScale (a phone and a tablet share one design) and keeps hanging from the corner', () => {
    for (const [name, w, h] of SCREENS) {
      const b = computeTouchLayout(w, h);
      for (const id of THREE) {
        expect(b[id].cx - w, `${name}: ${id}`).toBeCloseTo(TOUCH_DESIGN[id].dx * b.gestureScale, 6);
        expect(b[id].cy - h, `${name}: ${id}`).toBeCloseTo(TOUCH_DESIGN[id].dy * b.gestureScale, 6);
      }
    }
  });

  it('follows the safe corner: a notch pushes the buttons in by exactly the inset', () => {
    for (const [name, w, h] of SCREENS) {
      const plain = computeTouchLayout(w, h);
      const notched = computeTouchLayout(w, h, NOTCH);
      if (w < 800) continue; // (the smallest windows keep the bar's room by moving a button: see below)
      for (const id of THREE) {
        expect(notched[id].cx, `${name}: ${id}`).toBeCloseTo(plain[id].cx - NOTCH.right, 6);
        expect(notched[id].cy, `${name}: ${id}`).toBeCloseTo(plain[id].cy - NOTCH.bottom, 6);
      }
    }
  });

  it('the size of all the buttons together grows them about the corner they hang from: ×1.4 is 40 % bigger and 40 % further from it', () => {
    const big = computeTouchLayout(1280, 720, NO_INSETS, { scale: 1.4 });
    const one = computeTouchLayout(1280, 720);
    for (const id of THREE) {
      expect(big[id].visual / one[id].visual, id).toBeCloseTo(1.4, 6);
      expect((1280 - big[id].cx) / (1280 - one[id].cx), id).toBeCloseTo(1.4, 6);
    }
    expect(big.controlScale / one.controlScale).toBeCloseTo(1.4, 9);
  });
});

describe('every window, every inset, every size: what always holds', () => {
  function each(fn: (name: string, w: number, h: number, insets: Insets, scale: number, l: TouchLayout) => void): void {
    for (const [sn, w, h] of SCREENS) for (const [inn, insets] of INSETS) for (const scale of SIZES) fn(`${sn} · ${inn} · ×${scale}`, w, h, insets, scale, computeTouchLayout(w, h, insets, { scale }));
  }

  it('every touch area is inside the safe area, and the plates keep their distance from the edges the system keeps (the sides)', () => {
    each((name, w, h, insets, _scale, l) => {
      const safe = safeOf(w, h, insets);
      const margin = DEFAULT_TOUCH.edgeMargin * l.controlScale;
      for (const id of FOUR) {
        const r = rectOf(l[id]);
        expect(r.x0, `${name}: ${id} left`).toBeGreaterThanOrEqual(safe.x0 - EPS);
        expect(r.x1, `${name}: ${id} right`).toBeLessThanOrEqual(safe.x1 + EPS);
        expect(r.y0, `${name}: ${id} top`).toBeGreaterThanOrEqual(safe.y0 - EPS);
        expect(r.y1, `${name}: ${id} bottom`).toBeLessThanOrEqual(safe.y1 + EPS);
        expect(l[id].cx + l[id].visual / 2, `${name}: ${id}'s plate from the right edge`).toBeLessThanOrEqual(safe.x1 - margin + EPS);
        expect(l[id].cx - l[id].visual / 2, `${name}: ${id}'s plate from the left edge`).toBeGreaterThanOrEqual(safe.x0 + margin - EPS);
      }
    });
  });

  it('no two touch areas overlap and every one is at least a finger', () => {
    each((name, _w, _h, _i, _s, l) => {
      for (const id of FOUR) expect(l[id].hit, `${name}: ${id}`).toBeGreaterThanOrEqual(44 - EPS);
      for (let i = 0; i < FOUR.length; i++) for (let j = i + 1; j < FOUR.length; j++) expect(discsOverlap(l[FOUR[i] as 'attack'], l[FOUR[j] as 'attack']), `${name}: ${FOUR[i]} / ${FOUR[j]}`).toBe(false);
    });
  });

  it('the buttons keep clear of the HUD, the pause button and the room of the boss\'s bar', () => {
    each((name, w, h, insets, _scale, l) => {
      if (w < 800) return;
      const frame = touchFrame(w, h, insets);
      for (const id of FOUR) for (const [what, r] of [['the HUD', frame.hud], ['the pause button', frame.pause], ['the boss\'s bar', frame.boss]] as const) expect(reaches(l[id], r), `${name}: ${id} / ${what}`).toBe(false);
    });
  });

  it('the movement zone is a usable thumb area on the side the buttons are not, and never reaches a control', () => {
    each((name, w, _h, insets, _scale, l) => {
      const usable = w - insets.left - insets.right;
      expect(l.zone.x, name).toBe(insets.left);
      expect(l.zone.y, name).toBe(0);
      expect(l.zone.w, name).toBeGreaterThanOrEqual(usable * 0.3 - EPS);
      expect(l.zone.w, name).toBeLessThanOrEqual(usable * DEFAULT_TOUCH.leftZoneWidth + EPS);
      for (const id of FOUR) expect(l[id].cx - l[id].hit / 2, `${name}: ${id}`).toBeGreaterThan(l.zone.x + l.zone.w);
    });
    // at the design size on every window the zone is exactly the 46 % the design says
    for (const [name, w, h] of SCREENS) expect(computeTouchLayout(w, h).zone.w, name).toBeCloseTo(w * 0.46, 9);
  });

  it('on an extreme window (a small phone, an island on both sides, 1.4× buttons) the zone shrinks instead of overlapping a control — and is still a usable thumb area; the other way round too', () => {
    const l = computeTouchLayout(568, 320, ISLAND, { scale: 1.4 });
    const usable = 568 - 2 * 59;
    expect(l.zone.w).toBeLessThan(usable * 0.46);
    expect(l.zone.x + l.zone.w).toBeLessThanOrEqual(Math.min(...FOUR.map((id) => l[id].cx - l[id].hit / 2)) - 4 + EPS);
    expect(l.zone.w).toBeGreaterThan(usable * 0.3 - EPS);
    // the buttons on the left: the zone is on the right and yields to the rightmost of them
    const mirrored = computeTouchLayout(568, 320, ISLAND, { scale: 1.4, buttons: { attack: { x: 0.45, y: 0.7, scale: 1 }, dash: { x: 0.3, y: 0.8, scale: 1 }, ability: { x: 0.38, y: 0.62, scale: 1 } } });
    expect(mirrored.side).toBe('left');
    expect(mirrored.zone.x + mirrored.zone.w).toBeCloseTo(568 - 59, 6);
    expect(mirrored.zone.w).toBeGreaterThanOrEqual(usable * 0.3 - EPS);
    expect(mirrored.zone.w, 'and it yields to them').toBeLessThan(usable * 0.46);
    expect(mirrored.zone.x).toBeGreaterThanOrEqual(Math.max(...FOUR.map((id) => mirrored[id].cx + mirrored[id].hit / 2)) + 4 - EPS);
    // with buttons far out of the way it is the design's 46 %
    expect(computeTouchLayout(1280, 720, ISLAND).zone.w).toBeCloseTo((1280 - 2 * 59) * 0.46, 9);
  });

  it('on the smallest windows the HUD keeps its room and the buttons make way for the boss\'s bar by moving, never by leaving the safe area', () => {
    for (const [w, h] of [[568, 320], [640, 300], [480, 270]] as const) {
      for (const [inn, insets] of INSETS) {
        const l = computeTouchLayout(w, h, insets);
        const safe = safeOf(w, h, insets);
        for (const id of FOUR) {
          const r = rectOf(l[id]);
          expect(r.x0 >= safe.x0 - EPS && r.x1 <= safe.x1 + EPS && r.y0 >= safe.y0 - EPS && r.y1 <= safe.y1 + EPS, `${w}×${h} ${inn}: ${id} is inside`).toBe(true);
          expect(l[id].hit, `${w}×${h} ${inn}: ${id}`).toBeGreaterThanOrEqual(44 - EPS);
        }
        for (let i = 0; i < FOUR.length; i++) for (let j = i + 1; j < FOUR.length; j++) expect(discsOverlap(l[FOUR[i] as 'attack'], l[FOUR[j] as 'attack']), `${w}×${h} ${inn}: ${FOUR[i]} / ${FOUR[j]}`).toBe(false);
      }
    }
  });

  it('is a pure function: the same window gives the same layout, and the result does not alias the insets', () => {
    const insets = { ...NOTCH };
    const a = computeTouchLayout(844, 390, insets);
    insets.right = 0;
    const b = computeTouchLayout(844, 390, NOTCH);
    expect(a).toEqual(b);
    expect(a.insets).not.toBe(insets);
  });

  it('a degenerate window (no usable width, no height, nothing) does not produce NaN, infinity or a negative zone', () => {
    for (const [w, h, i] of [[100, 100, { top: 0, right: 80, bottom: 0, left: 80 }], [0, 0, NO_INSETS], [10, 10, ROUNDED], [300, 100, { top: 90, right: 0, bottom: 90, left: 0 }]] as const) {
      const l = computeTouchLayout(w, h, i);
      for (const id of FOUR) for (const v of [l[id].cx, l[id].cy, l[id].visual, l[id].hit]) expect(Number.isFinite(v), `${w}×${h}: ${id}`).toBe(true);
      expect(Number.isFinite(l.zone.w) && l.zone.w >= 0).toBe(true);
    }
  });
});

describe('where the player put the buttons', () => {
  const W = 844;
  const H = 390;
  const frame = touchFrame(W, H);

  it('a button is where it was put (a fraction of the safe area) when that place is free, and the other two stay where the design has them', () => {
    const at = pointOf(frame, 0.2, 0.7);
    const l = computeTouchLayout(W, H, NO_INSETS, { buttons: { attack: { x: 0.2, y: 0.7, scale: 1 } } });
    expect(l.attack.cx).toBeCloseTo(at.x, 6);
    expect(l.attack.cy).toBeCloseTo(at.y, 6);
    const design = computeTouchLayout(W, H);
    for (const id of ['dash', 'ability'] as const) {
      expect(l[id].cx, id).toBeCloseTo(design[id].cx, 6);
      expect(l[id].cy, id).toBeCloseTo(design[id].cy, 6);
    }
    expect(l.exact).toBe(true);
  });

  it('a button that is placed follows the SCREEN (the same fraction on another window); one that is not follows the CORNER (the same distance from it)', () => {
    const a = computeTouchLayout(844, 390, NO_INSETS, { buttons: { dash: { x: 0.3, y: 0.75, scale: 1 } } });
    const b = computeTouchLayout(1280, 720, NO_INSETS, { buttons: { dash: { x: 0.3, y: 0.75, scale: 1 } } });
    expect(a.dash.cx / 844).toBeCloseTo(0.3, 3);
    expect(b.dash.cx / 1280).toBeCloseTo(0.3, 3);
    expect(b.dash.cy / 720).toBeCloseTo(0.75, 3);
    expect(1280 - b.attack.cx).toBeCloseTo(-TOUCH_DESIGN.attack.dx * b.gestureScale, 6);
  });

  it('the size of one button is its own: 70 % … 150 % of the design on top of the size of all of them, and no touch area is ever under a finger', () => {
    for (const own of [TOUCH_LIMITS.button.min, 1, 1.25, TOUCH_LIMITS.button.max]) {
      const l = computeTouchLayout(1280, 720, NO_INSETS, { buttons: { ability: { x: 0.8, y: 0.3, scale: own } } });
      const one = computeTouchLayout(1280, 720);
      expect(l.ability.visual / one.ability.visual, `×${own}`).toBeCloseTo(own, 6);
      expect(l.ability.hit, `×${own}`).toBeGreaterThanOrEqual(44 - EPS);
      expect(l.attack.visual, 'the others are not touched').toBeCloseTo(one.attack.visual, 9);
    }
    // a size outside the limits is held to them (the settings repair them too: this is the layout's own safety)
    expect(computeTouchLayout(1280, 720, NO_INSETS, { buttons: { attack: { x: 0.5, y: 0.5, scale: 9 } } }).attack.visual).toBeCloseTo(computeTouchLayout(1280, 720).attack.visual * 1.5, 6);
  });

  it('a place that is taken is not given: the button goes to the nearest place that is free — off the HUD, the pause button and the boss\'s room', () => {
    for (const [what, want] of [
      ['the HUD', { x: 0.1, y: 0.1 }],
      ['the pause button', { x: 0.5, y: 0.05 }],
      ['the room of the boss\'s bar', { x: 0.5, y: 0.93 }],
    ] as const) {
      const l = computeTouchLayout(W, H, NO_INSETS, { buttons: { attack: { ...want, scale: 1 } } });
      const asked = pointOf(frame, want.x, want.y);
      for (const r of [frame.hud, frame.pause, frame.boss]) expect(reaches(l.attack, r), `${what}: not on ${JSON.stringify(r)}`).toBe(false);
      expect(l.exact).toBe(true);
      // …and it is near: it moved only as far as it had to (never to the other side of the screen)
      expect(Math.hypot(l.attack.cx - asked.x, l.attack.cy - asked.y), what).toBeLessThan(120);
    }
  });

  it('the nearest place: a button put in the middle of the HUD is pushed out through the nearest side of it, and one put beside it stays', () => {
    const hud = frame.hud;
    const inside = computeTouchLayout(W, H, NO_INSETS, { buttons: { dash: { x: ((hud.x0 + hud.x1) / 2 + 30) / W, y: ((hud.y0 + hud.y1) / 2) / H, scale: 1 } } });
    // the nearest side is the bottom one (the HUD is wider than it is tall): the button is under the HUD, at the same x
    expect(inside.dash.cy - inside.dash.hit / 2).toBeGreaterThanOrEqual(hud.y1 - EPS);
    const beside = computeTouchLayout(W, H, NO_INSETS, { buttons: { dash: { x: 0.5, y: 0.5, scale: 1 } } });
    expect(beside.dash.cx).toBeCloseTo(0.5 * W, 6);
    expect(beside.dash.cy).toBeCloseTo(0.5 * H, 6);
  });

  it('the order decides who gives way: the button placed first is never moved for the ones after it', () => {
    const same = { attack: { x: 0.5, y: 0.5, scale: 1 }, dash: { x: 0.5, y: 0.5, scale: 1 } };
    const first = computeTouchLayout(W, H, NO_INSETS, { buttons: same, order: ['attack', 'dash', 'ability'] });
    const second = computeTouchLayout(W, H, NO_INSETS, { buttons: same, order: ['dash', 'attack', 'ability'] });
    expect([first.attack.cx, first.attack.cy]).toEqual([0.5 * W, 0.5 * H]);
    expect([second.dash.cx, second.dash.cy]).toEqual([0.5 * W, 0.5 * H]);
    expect(discsOverlap(first.attack, first.dash)).toBe(false);
    expect(discsOverlap(second.attack, second.dash)).toBe(false);
    expect(first.dash.cx !== 0.5 * W || first.dash.cy !== 0.5 * H, 'the second one moved').toBe(true);
    // an order that leaves a button out still places it (the editor names only the one in the player's hand)
    const partial = computeTouchLayout(W, H, NO_INSETS, { buttons: same, order: ['dash'] });
    expect([partial.dash.cx, partial.dash.cy]).toEqual([0.5 * W, 0.5 * H]);
    expect(Number.isFinite(partial.ability.cx)).toBe(true);
  });

  it('the buttons can be anywhere: the left side, the top, spread over the screen — and the movement zone goes to the side where there are fewer', () => {
    const left = computeTouchLayout(W, H, NO_INSETS, { buttons: { attack: { x: 0.25, y: 0.55, scale: 1 }, dash: { x: 0.12, y: 0.8, scale: 1 }, ability: { x: 0.2, y: 0.7, scale: 1 } } });
    expect(left.side).toBe('left');
    expect(left.zone.x + left.zone.w).toBeCloseTo(W, 6);
    expect(left.zone.w).toBeGreaterThanOrEqual(W * 0.3 - EPS);
    const right = computeTouchLayout(W, H);
    expect(right.side).toBe('right');
    expect(right.zone.x).toBe(0);
    // one button on the other side of the screen does not make it the zone's: it is where most of them are that counts
    const mixed = computeTouchLayout(W, H, NO_INSETS, { buttons: { ability: { x: 0.1, y: 0.6, scale: 1 } } });
    expect(mixed.side).toBe('right');
  });

  it('whatever the player asked for, on every window, inset and size: inside the safe area, clear of everything, apart, a finger — and what the layout gave is a place it keeps when it is asked for again', () => {
    const rnd = rng(15);
    let checked = 0;
    for (const [sn, w, h] of SCREENS) {
      for (const [inn, insets] of INSETS) {
        for (const scale of SIZES) {
          for (let k = 0; k < 6; k++) {
            const buttons = randomPlacements(rnd);
            const name = `${sn} · ${inn} · ×${scale} · ${JSON.stringify(buttons)}`;
            const l = computeTouchLayout(w, h, insets, { scale, buttons });
            const f = touchFrame(w, h, insets);
            const safe = safeOf(w, h, insets);
            for (const id of FOUR) {
              const r = rectOf(l[id]);
              expect(r.x0 >= safe.x0 - EPS && r.x1 <= safe.x1 + EPS && r.y0 >= safe.y0 - EPS && r.y1 <= safe.y1 + EPS, `${name}: ${id} is inside the safe area`).toBe(true);
              expect(l[id].hit, `${name}: ${id} is a finger`).toBeGreaterThanOrEqual(44 - EPS);
              expect(l[id].hit, `${name}: ${id} covers its plate`).toBeGreaterThanOrEqual(l[id].visual - EPS);
              const margin = DEFAULT_TOUCH.edgeMargin * l.controlScale;
              expect(l[id].cx + l[id].visual / 2, `${name}: ${id}'s plate keeps the margin of the right edge`).toBeLessThanOrEqual(safe.x1 - margin + EPS);
              expect(l[id].cx - l[id].visual / 2, `${name}: ${id}'s plate keeps the margin of the left edge`).toBeGreaterThanOrEqual(safe.x0 + margin - EPS);
              if (w >= 800) for (const kept of [f.hud, f.pause, f.boss]) expect(reaches(l[id], kept), `${name}: ${id} is clear of ${JSON.stringify(kept)}`).toBe(false);
            }
            for (let i = 0; i < FOUR.length; i++) for (let j = i + 1; j < FOUR.length; j++) expect(discsOverlap(l[FOUR[i] as 'attack'], l[FOUR[j] as 'attack']), `${name}: ${FOUR[i]} / ${FOUR[j]}`).toBe(false);
            expect(l.zone.w, `${name}: the zone`).toBeGreaterThanOrEqual((w - insets.left - insets.right) * 0.3 - EPS);
            // asked for again where they are, they stay (to the tenth of a pixel the settings keep): a saved layout is a place the buttons keep
            if (l.exact) {
              const again: Partial<Record<ButtonId, { x: number; y: number; scale: number }>> = {};
              for (const id of THREE) again[id] = { x: Math.round(((l[id].cx - safe.x0) / (safe.x1 - safe.x0)) * 1e4) / 1e4, y: Math.round(((l[id].cy - safe.y0) / (safe.y1 - safe.y0)) * 1e4) / 1e4, scale: buttons[id]?.scale ?? 1 };
              const m = computeTouchLayout(w, h, insets, { scale, buttons: again });
              for (const id of THREE) expect(Math.hypot(m[id].cx - l[id].cx, m[id].cy - l[id].cy), `${name}: ${id} stays`).toBeLessThan(0.5);
            }
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('a window that cannot hold the size asked for gives the biggest that fits, never below the floor — and says so', () => {
    const crowded = computeTouchLayout(568, 320, ROUNDED, { scale: 1.4, buttons: { attack: { x: 0.5, y: 0.5, scale: 1.5 }, dash: { x: 0.5, y: 0.52, scale: 1.5 }, ability: { x: 0.5, y: 0.55, scale: 1.5 } } });
    expect(crowded.controlScale).toBeLessThanOrEqual(crowded.gestureScale * 1.4 + EPS);
    expect(crowded.controlScale).toBeGreaterThanOrEqual(crowded.gestureScale * 1.4 * 0.72 - 1e-3);
    for (let i = 0; i < FOUR.length; i++) for (let j = i + 1; j < FOUR.length; j++) expect(discsOverlap(crowded[FOUR[i] as 'attack'], crowded[FOUR[j] as 'attack'])).toBe(false);
    expect(computeTouchLayout(844, 390).exact).toBe(true);
  });

  it('the chip hangs from the attack button wherever it is: right over it when there is room, and out of the way of everything else when there is not', () => {
    const middle = computeTouchLayout(W, H, NO_INSETS, { buttons: { attack: { x: 0.5, y: 0.7, scale: 1 } } });
    expect(middle.chip.cx).toBeCloseTo(middle.attack.cx, 6);
    expect(middle.chip.cy).toBeLessThan(middle.attack.cy);
    const top = computeTouchLayout(W, H, NO_INSETS, { buttons: { attack: { x: 0.8, y: 0.05, scale: 1 } } });
    for (const id of THREE) expect(discsOverlap(top.chip, top[id]), `chip / ${id}`).toBe(false);
    const f = touchFrame(W, H);
    expect(reaches(top.chip, f.pause) || reaches(top.chip, f.hud)).toBe(false);
  });
});

describe('the keep-outs are the real ones', () => {
  it('the HUD footprint, the pause button and the room of the boss\'s bar the buttons keep clear of are the numbers those pieces use (a change to any of them must come here)', () => {
    expect(HUD_FOOTPRINT).toEqual({ margin: 16, height: 77, width: 206, gap: 8 });
    const f = touchFrame(844, 390, NO_INSETS);
    expect(f.boss.x1 - f.boss.x0).toBe(BOSS_BAR.minWidth + 2 * BOSS_BAR.gap);
    expect((f.boss.x0 + f.boss.x1) / 2).toBe(422);
    // the room is the band the bar lives in (the bar's own rectangle and a gap above and below it)
    expect(f.boss.y1 - f.boss.y0).toBe(BOSS_BAR.height + 2 * BOSS_BAR.gap);
    expect(f.boss.y1).toBe(390 - BOSS_BAR.bottom + BOSS_BAR.gap);
  });

  it('the HUD the buttons keep out of grows with the size the player chose for it', () => {
    const small = touchFrame(844, 390, NO_INSETS, 0.85);
    const big = touchFrame(844, 390, NO_INSETS, 1.35);
    expect(big.hud.x1).toBeGreaterThan(small.hud.x1);
    expect(big.hud.y1).toBeGreaterThan(small.hud.y1);
    const l = computeTouchLayout(844, 390, NO_INSETS, { hudScale: 1.35, buttons: { dash: { x: 0.2, y: 0.2, scale: 1 } } });
    expect(reaches(l.dash, big.hud)).toBe(false);
  });
});

describe('the nearest free place is the NEAREST one (a brute-force search of the plane says so)', () => {
  /** Is `(x, y)` inside the bounds, outside every circle and at least `grow` from every rectangle? (The same question the solver asks, written again.) */
  const free = (x: number, y: number, bounds: Rect, circles: readonly Circle[], rects: readonly Rect[], grow: number): boolean =>
    x >= bounds.x0 - 1e-7 &&
    x <= bounds.x1 + 1e-7 &&
    y >= bounds.y0 - 1e-7 &&
    y <= bounds.y1 + 1e-7 &&
    circles.every(([cx, cy, r]) => Math.hypot(x - cx, y - cy) >= r - 1e-7) &&
    rects.every((r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1)) >= grow - 1e-7);

  it('against random windows with circles (the buttons already placed) and rectangles (the HUD, the pause button, the boss\'s room): what it gives is free, and nothing free is nearer', () => {
    const rnd = rng(2026);
    const between = (lo: number, hi: number): number => lo + rnd() * (hi - lo);
    const STEP = 0.5;
    let compared = 0;
    let nowhere = 0;
    for (let n = 0; n < 220; n++) {
      const bounds: Rect = { x0: 0, y0: 0, x1: between(60, 140), y1: between(50, 110) };
      const circles: Circle[] = Array.from({ length: Math.floor(rnd() * 4) }, () => [between(-10, bounds.x1 + 10), between(-10, bounds.y1 + 10), between(8, 40)] as const);
      const rects: Rect[] = Array.from({ length: Math.floor(rnd() * 4) }, () => {
        const x0 = between(-10, bounds.x1);
        const y0 = between(-10, bounds.y1);
        return { x0, y0, x1: x0 + between(5, 60), y1: y0 + between(5, 50) };
      });
      const grow = between(2, 20);
      const px = between(-10, bounds.x1 + 10);
      const py = between(-10, bounds.y1 + 10);
      const got = nearestFree(px, py, bounds, circles, rects, grow);
      // the plane, to half a pixel
      let best = Number.POSITIVE_INFINITY;
      for (let x = bounds.x0; x <= bounds.x1 + 1e-9; x += STEP) {
        for (let y = bounds.y0; y <= bounds.y1 + 1e-9; y += STEP) if (free(x, y, bounds, circles, rects, grow)) best = Math.min(best, Math.hypot(x - px, y - py));
      }
      if (got === null) {
        // there is nowhere: the search finds nothing either (a sliver of free space thinner than the step may escape it)
        nowhere++;
        expect(best, `case ${n}: it said there is nowhere, and the plane has a place at ${best}`).toBeGreaterThan(5);
        continue;
      }
      expect(free(got.x, got.y, bounds, circles, rects, grow), `case ${n}: what it gives is a free place`).toBe(true);
      const d = Math.hypot(got.x - px, got.y - py);
      expect(d, `case ${n}: nothing free is nearer (it gave ${d.toFixed(3)}, the plane has ${best.toFixed(3)})`).toBeLessThanOrEqual(best + 1e-9 + STEP * 0.75);
      compared++;
    }
    expect(compared, 'the cases are about something').toBeGreaterThan(150);
    expect(nowhere).toBeLessThan(60);
  });
});

describe('what gives way, one thing at a time, and in the order the design says', () => {
  const base = touchFrame(844, 390);
  /** Everything of the window there is: no place is free of it. */
  const all = (f: TouchFrame): Rect => ({ x0: f.safe.x0 - 1, y0: f.safe.y0 - 1, x1: f.safe.x1 + 1, y1: f.safe.y1 + 1 });
  const placed = (r: ReturnType<typeof resolveButtons>): Disc[] => [r.attack, r.dash, r.ability, r.chip];
  const apart = (ds: Disc[]): boolean => ds.every((a, i) => ds.every((b, j) => j <= i || !discsOverlap(a, b)));
  const centreOfRect = (r: Rect): { x: number; y: number } => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
  /** A button asked for at the middle of a rectangle (as a fraction of the safe area, where the player's places are kept). */
  const askedAt = (f: TouchFrame, r: Rect): { x: number; y: number; scale: number } => {
    const c = centreOfRect(r);
    return { x: (c.x - f.safe.x0) / (f.safe.x1 - f.safe.x0), y: (c.y - f.safe.y0) / (f.safe.y1 - f.safe.y0), scale: 1 };
  };
  // the player asked for Attack and Magic on the HUD and for Dash on the pause button: the three things the window keeps clear, one after another
  const buttons = { attack: askedAt(base, base.hud), ability: askedAt(base, base.hud), dash: askedAt(base, base.pause) };

  it('asked as it is, with places that are free, nothing gives way', () => {
    const r = resolveButtons(base, { buttons });
    expect(r.exact).toBe(true);
    for (const d of placed(r)) expect(reaches(d, base.pause) || reaches(d, base.hud) || reaches(d, base.boss)).toBe(false);
    expect(apart(placed(r))).toBe(true);
  });

  it('the room of the boss\'s bar is the first to be given up: with no place clear of it, the buttons still keep clear of the pause button, of the HUD and of each other', () => {
    const r = resolveButtons({ ...base, boss: all(base) }, { buttons });
    expect(r.exact, 'it did not fit as asked').toBe(false);
    for (const d of placed(r)) {
      expect(reaches(d, base.pause), 'clear of the pause button').toBe(false);
      expect(reaches(d, base.hud), 'clear of the HUD').toBe(false);
    }
    expect(apart(placed(r)), 'and apart').toBe(true);
  });

  it('then the pause button: with no place clear of it either, the buttons still keep clear of the HUD and of each other — and Dash stays on the pause button, where it was asked for', () => {
    const r = resolveButtons({ ...base, boss: all(base), pause: all(base) }, { buttons });
    expect(r.exact).toBe(false);
    for (const d of placed(r)) expect(reaches(d, base.hud), 'clear of the HUD').toBe(false);
    expect(apart(placed(r)), 'and apart').toBe(true);
    expect(reaches(r.dash, base.pause), 'the pause button is no longer kept clear of: Dash stays over it, where it was asked').toBe(true);
  });

  it('then the HUD: with nothing clear of any of the three, the buttons are still apart from each other — and Attack stays on the HUD, where it was asked for', () => {
    const r = resolveButtons({ ...base, boss: all(base), pause: all(base), hud: all(base) }, { buttons });
    expect(r.exact).toBe(false);
    expect(apart(placed(r)), 'apart').toBe(true);
    for (const d of placed(r)) expect(d.hit, 'a finger').toBeGreaterThanOrEqual(44 - EPS);
    expect(reaches(r.attack, base.hud), 'the HUD is no longer kept clear of: the first button stays over it, where it was asked').toBe(true);
  });

  it('and last of all, each other: in a window with no room for them to be apart they are still inside the safe area — there is always an answer', () => {
    const tiny = touchFrame(120, 90);
    const r = resolveButtons({ ...tiny, boss: all(tiny), pause: all(tiny), hud: all(tiny) });
    expect(r.exact).toBe(false);
    for (const d of placed(r)) {
      expect(d.cx >= tiny.safe.x0 - EPS && d.cx <= tiny.safe.x1 + EPS && d.cy >= tiny.safe.y0 - EPS && d.cy <= tiny.safe.y1 + EPS, `(${d.cx}, ${d.cy}) is inside the window`).toBe(true);
      expect(Number.isFinite(d.hit) && d.hit > 0).toBe(true);
    }
  });
});
