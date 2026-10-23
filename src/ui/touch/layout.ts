import { clamp } from '@/core/math';
import { BUTTON_DESIGN, DEFAULT_TOUCH, uiScale } from '@/input/gestures/TouchConfig';
import { TOUCH_BUTTONS, TOUCH_LIMITS, type TouchButtonId, type TouchButtonSetting } from '@/save/SettingsData';

/** Space the system takes from the screen (notch, Dynamic Island, home indicator, rounded corners), in CSS px. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Readonly<Insets> = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

/** A round control: where its centre is and the diameters of what is seen and of what reacts to a finger (px). */
export interface Disc {
  cx: number;
  cy: number;
  visual: number;
  hit: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A rectangle by its corners (px). */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type ButtonId = TouchButtonId;
/** Where the player put each button: the ones that are not here are where the design has them. */
export type ButtonPlacements = Readonly<Partial<Record<ButtonId, TouchButtonSetting>>>;

export interface TouchLayout {
  /** The side the buttons are on (where most of them are); the movement zone is the other one. */
  side: 'right' | 'left';
  /** The scale of the gestures: `uiScale` of the window (distances in dp × this = px). */
  gestureScale: number;
  /** The scale of what is drawn: `uiScale` × the player's size preference (less if the window could not hold it). */
  controlScale: number;
  insets: Insets;
  /** The invisible movement zone (a part of the screen on the side the buttons are not, the whole height). */
  zone: Box;
  attack: Disc;
  dash: Disc;
  ability: Disc;
  /** The contextual bottle chip: it hangs over the attack button. */
  chip: Disc;
  /** The window held everything as asked (the size, and clear of the HUD, the pause button, the boss's room and each other): nothing had to give way. */
  exact: boolean;
}

/**
 * The fixed controls of GAME-SPEC-2D §4.3.4 as the reference of docs/PROMPT15-LOG.md has them: the three buttons are `BUTTON_DESIGN` (the artist's plates: Dash, Attack, Magic); there is no jump button, no
 * interaction button and no bottle button: the jump is a gesture, the interaction an icon that exists only when something can be interacted with, the bottle a contextual chip that hangs over the attack
 * button (`visual` is the diameter of what is drawn, dp; `pad` how far the touch area reaches past it, dp; `gap` the room between it and the button it hangs from, dp).
 */
export const TOUCH_DESIGN = {
  ...BUTTON_DESIGN,
  chip: { visual: 52, pad: 6, gap: 16 },
} as const;

/**
 * What the HUD takes at the top left, in dp: its margin from the safe area, its height and its width (the artist's picture of the HUD: the portrait, the two bars and the row of bottles, which holds a fourth bottle
 * without growing). The numbers belong to `ui/hud/layout.ts`; they are repeated here, rounded UP to a tenth of a dp (so that the HUD is never a hair bigger than what is kept clear), so that this module does not import
 * it (a test holds the two together).
 */
export const HUD_FOOTPRINT = { margin: 25.7, height: 78.9, width: 218.4, gap: 8 } as const;
/**
 * What the boss's bar always has at the bottom of the window, in px: its least width, its height, its distance from the bottom and the gap it keeps from a button. The numbers belong to `ui/hud/bossBarLayout.ts`
 * (`BOSS_BAR`); they are repeated here so that this module does not import it, and the start of the game does not carry the function that slides the bar (a test holds the two together).
 */
const BOSS_ROOM = { minWidth: 160, height: 32, bottom: 18, gap: 8 } as const;
/** The pause button: its side (css px at scale 1) and its distance from the top of the safe area. `ui/settings/PauseButton.ts` draws it where `pauseBox` says. */
export const PAUSE_FOOTPRINT = { size: 50, margin: 8 } as const;

/** How far the touch area of a button reaches past what is drawn where there is room (dp, at the size of the button). */
const PAD = 8;
/** No touch area is narrower than a finger (css px). */
const MIN_TOUCH = 44;
/** The room kept between the plates of two buttons (dp). */
const BUTTON_GAP = 8;
/** What the system does not give back: the room kept between a keep-out area and a touch area (px). */
const KEEP_GAP = 4;
/** The movement zone never gets narrower than this fraction of the usable width, however the buttons are placed. */
const MIN_ZONE = 0.3;
/** Space kept between the movement zone and the nearest control, px. */
const ZONE_GAP = 4;
/** The smallest the buttons get when the window cannot hold them at the size asked for (the size of the 80 % setting on the smallest `uiScale`): a finger is still ≥ 44 px. */
const FIT_FLOOR = 0.72;
/** The margin that exact arithmetic is given at every limit (px): a button resting against a limit is inside it. */
const SLACK = 1e-4;

/**
 * Where the pause button's box (its `PAUSE_FOOTPRINT.size` square, before it is scaled) starts for a window `width` px wide with the given safe insets at `scale`: in the TOP RIGHT corner of what is usable,
 * `margin` from the safe area (the scaled button grows about its centre, so the box is placed by what it measures once scaled). In a window too narrow to hold the HUD and the button side by side (a phone held
 * upright with the HUD at its biggest) it stays at the right edge and goes down, under the HUD, instead of over it. The HUD counts at its widest (its box does not change when a fourth bottle is found), so the
 * button does not move when a bottle is found.
 */
export function pauseOrigin(width: number, insets: Readonly<Insets>, scale = 1, hudScale = 1): { left: number; top: number } {
  const { size, margin } = PAUSE_FOOTPRINT;
  const half = (size / 2) * scale;
  const centre = width - insets.right - margin * scale - half;
  const hud = (extent: number): number => (HUD_FOOTPRINT.margin + extent) * scale * hudScale + HUD_FOOTPRINT.gap * scale;
  // too narrow for the HUD and the button side by side: the button goes under the HUD
  const under = centre - half < insets.left + hud(HUD_FOOTPRINT.width);
  // scaling grows the button up and down by half the difference: the box starts there so that, once scaled, its top edge is the one wanted (rounded down the screen, never up into the HUD)
  return { left: Math.round(centre - size / 2), top: Math.ceil(insets.top + (under ? hud(HUD_FOOTPRINT.height) : margin * scale) + half - size / 2) };
}

/** The pause button as it is on screen: the box, scaled about its centre, in px. */
export function pauseBox(width: number, insets: Readonly<Insets>, scale = 1, hudScale = 1): Rect {
  const { left, top } = pauseOrigin(width, insets, scale, hudScale);
  const half = (PAUSE_FOOTPRINT.size / 2) * scale;
  const cx = left + PAUSE_FOOTPRINT.size / 2;
  const cy = top + PAUSE_FOOTPRINT.size / 2;
  return { x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half };
}

/** The part of the bottom of the window the boss's bar always has: its least width and a gap on each side, centred on the usable width (`ui/hud/bossBarLayout.ts` slides the bar when it must). */
function bossReserve(safe: Rect, height: number, insets: Readonly<Insets>): Rect {
  const middle = (safe.x0 + safe.x1) / 2;
  const half = BOSS_ROOM.minWidth / 2 + BOSS_ROOM.gap;
  const bottom = height - Math.max(BOSS_ROOM.bottom, insets.bottom);
  return { x0: middle - half, y0: bottom - BOSS_ROOM.height - BOSS_ROOM.gap, x1: middle + half, y1: bottom + BOSS_ROOM.gap };
}

/** The window as the buttons see it: the safe area, the scale, and what they must stay out of. Everything in px. */
export interface TouchFrame {
  /** `uiScale` of the window. */
  g: number;
  safe: Rect;
  /** The HUD (the life, the magic, the bottles), the pause button and the room of the boss's bar, each with its gap. */
  hud: Rect;
  pause: Rect;
  boss: Rect;
}

export function touchFrame(width: number, height: number, insets: Readonly<Insets> = NO_INSETS, hudScale = 1): TouchFrame {
  const g = uiScale(width, height);
  // the HUD is drawn at `uiScale` times the size the player chose for it (`ui/hud/layout.ts`): what it takes at the top is that much bigger
  const hudDrawn = g * hudScale;
  const pad = HUD_FOOTPRINT.gap * g;
  const grow = (r: Rect, by: number): Rect => ({ x0: r.x0 - by, y0: r.y0 - by, x1: r.x1 + by, y1: r.y1 + by });
  const safe: Rect = { x0: insets.left, y0: insets.top, x1: Math.max(insets.left, width - insets.right), y1: Math.max(insets.top, height - insets.bottom) };
  return {
    g,
    safe,
    hud: grow(
      {
        x0: insets.left + HUD_FOOTPRINT.margin * hudDrawn,
        y0: insets.top + HUD_FOOTPRINT.margin * hudDrawn,
        x1: insets.left + (HUD_FOOTPRINT.margin + HUD_FOOTPRINT.width) * hudDrawn,
        y1: insets.top + (HUD_FOOTPRINT.margin + HUD_FOOTPRINT.height) * hudDrawn,
      },
      pad,
    ),
    pause: grow(pauseBox(width, insets, g, hudScale), KEEP_GAP),
    boss: bossReserve(safe, height, insets),
  };
}

// ----------------------------------------------------------------------------------------------- the nearest free place

interface Point {
  x: number;
  y: number;
}
/** A circle by its centre and its radius: `[cx, cy, r]`. */
export type Circle = readonly [number, number, number];

/** Tolerance of the "is it free" test: the points are found by exact arithmetic, and one that rests against a limit is free. */
const EPS = 1e-7;

/**
 * The point nearest to `(px, py)` that is inside `bounds`, outside every circle, and at least `grow` away from every rectangle — or null when there is none. The free part of the window is bounded
 * by straight lines and arcs, and the nearest point of a region to a point is that point itself, or the foot of a perpendicular on one of those lines or arcs, or a corner where two meet: so these
 * are all the points there are to try, and none is searched for. (Exported so that its tests ask it directly, against a brute-force search of the plane.)
 */
export function nearestFree(px: number, py: number, bounds: Rect, circles: readonly Circle[], rects: readonly Rect[], grow: number): Point | null {
  const xs = [bounds.x0, bounds.x1];
  const ys = [bounds.y0, bounds.y1];
  const rounds: Circle[] = [...circles];
  for (const r of rects) {
    xs.push(r.x0 - grow, r.x1 + grow);
    ys.push(r.y0 - grow, r.y1 + grow);
    for (const y of [r.y0, r.y1]) for (const x of [r.x0, r.x1]) rounds.push([x, y, grow]);
  }
  let best: Point | null = null;
  let bestDistance = Infinity;
  /** Keeps `(x, y)` if it is free and nearer than what is kept. */
  const test = (x: number, y: number): void => {
    if (x < bounds.x0 - EPS || x > bounds.x1 + EPS || y < bounds.y0 - EPS || y > bounds.y1 + EPS) return;
    for (const [cx, cy, r] of circles) if (Math.hypot(x - cx, y - cy) < r - EPS) return;
    for (const r of rects) if (Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1)) < grow - EPS) return;
    const d = (x - px) * (x - px) + (y - py) * (y - py);
    if (d < bestDistance - 1e-12) {
      best = { x, y };
      bestDistance = d;
    }
  };
  // the point itself, its foot on every line, and the corners where two lines meet
  for (const x of [...xs, px]) for (const y of [...ys, py]) test(x, y);
  for (const [cx, cy, r] of rounds) {
    const d = Math.hypot(px - cx, py - cy);
    if (d > 0) test(cx + ((px - cx) / d) * r, cy + ((py - cy) / d) * r);
    else test(cx + r, cy);
    // where the circle meets a vertical line (`xs`), then a horizontal one (`ys`)
    for (const [lines, along, across, flip] of [[xs, cx, cy, false], [ys, cy, cx, true]] as const) {
      for (const line of lines) {
        const h = r * r - (line - along) * (line - along);
        if (h < 0) continue;
        for (const sign of [1, -1]) {
          const q = across + sign * Math.sqrt(h);
          if (flip) test(q, line);
          else test(line, q);
        }
      }
    }
  }
  for (let i = 0; i < rounds.length; i++) {
    const [ax, ay, ar] = rounds[i] as Circle;
    for (let j = i + 1; j < rounds.length; j++) {
      const [bx, by, br] = rounds[j] as Circle;
      const d = Math.hypot(bx - ax, by - ay);
      if (d === 0 || d > ar + br || d < Math.abs(ar - br)) continue;
      const along = (ar * ar - br * br + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, ar * ar - along * along));
      const mx = ax + ((bx - ax) * along) / d;
      const my = ay + ((by - ay) * along) / d;
      test(mx + ((by - ay) * h) / d, my - ((bx - ax) * h) / d);
      test(mx - ((by - ay) * h) / d, my + ((bx - ax) * h) / d);
    }
  }
  return best;
}

// ----------------------------------------------------------------------------------------------- the buttons

/** What one button takes of the window at its size: the plate, the least reach of its touch area (a finger), how far it would like to reach, and the reach it needs to keep clear of things. */
interface Size {
  visual: number;
  /** Radius of the plate. */
  r: number;
  /** The least the touch area reaches past the plate so that it is a finger across. */
  pmin: number;
  /** How far it would like to reach past the plate. */
  want: number;
  /** Radius of the touch area at its widest: what the things it must stay out of are kept at. */
  rr: number;
}

function sizeOf(designVisual: number, designPad: number, scale: number): Size {
  const visual = designVisual * scale;
  const r = visual / 2;
  const pmin = Math.max(0, MIN_TOUCH / 2 - r);
  const want = Math.max(designPad * scale, pmin);
  return { visual, r, pmin, want, rr: r + want };
}

interface Placed extends Size {
  cx: number;
  cy: number;
}

/** How much of what a button keeps clear of is let go, one step at a time, when the window cannot hold it all: the boss's room, the pause button, the HUD, the other buttons. */
const RELAX_STEPS = 5;

/**
 * The centre nearest to `desired` where a button of this size can be: inside the safe area (the plate keeps `edge` px from the sides, where the system's gestures live), clear of the
 * HUD, the pause button and the room of the boss's bar, and apart from the buttons already placed. `relax` lets the last ones go (0 = none, 4 = only the safe area). Null when there is no such place.
 */
function placeButton(frame: TouchFrame, size: Size, edge: number, desired: Point, placed: readonly Placed[], relax: number): Point | null {
  const { safe } = frame;
  const side = Math.max(size.rr, edge + size.r);
  const span = (lo: number, hi: number): [number, number] => (lo <= hi ? [lo, hi] : [(lo + hi) / 2, (lo + hi) / 2]);
  const [bx0, bx1] = span(safe.x0 + side, safe.x1 - side);
  const [by0, by1] = span(safe.y0 + size.rr, safe.y1 - size.rr);
  // what is let go of first is first in the list: the boss's room, the pause button, the HUD
  const rects = [frame.boss, frame.pause, frame.hud].slice(relax);
  const circles: Circle[] = relax < 4 ? placed.map((p) => [p.cx, p.cy, p.r + size.r + Math.max(BUTTON_GAP * frame.g, p.pmin + size.pmin + 0.5) + SLACK]) : [];
  const found = nearestFree(desired.x, desired.y, { x0: bx0, y0: by0, x1: bx1, y1: by1 }, circles, rects, size.rr + SLACK);
  return found ?? (relax >= 4 ? { x: clamp(desired.x, bx0, bx1), y: clamp(desired.y, by0, by1) } : null);
}

/**
 * The disc of a placed button once its neighbours are known. The touch area reaches past the plate as far as it wants — but never into a neighbour's, and never less than it needs to be a finger across: the room
 * left between two plates, after each has what it needs of a finger, is shared out in equal parts.
 */
function discOf(p: Placed, all: readonly Placed[]): Disc {
  const { visual, r, pmin, want } = p;
  let pad = want;
  for (const o of all) {
    if (o === p) continue;
    const slack = Math.hypot(p.cx - o.cx, p.cy - o.cy) - r - o.r - SLACK;
    const room = slack - pmin - o.pmin;
    const total = pmin + o.pmin;
    // (no room even for the least — the places were let go of: the least is shared in proportion, and nothing reaches into a neighbour)
    pad = Math.min(pad, room >= 0 ? pmin + Math.min(want - pmin, room / 2) : (Math.max(0, slack) * pmin) / (total || 1));
  }
  return { cx: p.cx, cy: p.cy, visual, hit: visual + 2 * pad };
}

export interface ResolveOptions {
  /** The size of all the buttons together (settings): 1 = the design. */
  scale?: number;
  /** Where the player put each button. */
  buttons?: ButtonPlacements;
  /** The order the buttons are placed in: the first is never moved for the others. The editor puts the one in the player's hand last. */
  order?: readonly ButtonId[];
}

export interface Resolved {
  attack: Disc;
  dash: Disc;
  ability: Disc;
  chip: Disc;
  /** `uiScale` × the size asked for × the reduction the window needed (1 when it held what was asked). */
  controlScale: number;
  /** Did everything fit exactly as asked: the size, and clear of the HUD, the pause button, the boss's room and each other? */
  exact: boolean;
}

/** The point of the window a placement of `x, y` (0 … 1) is: a fraction of the safe area. */
export function pointOf(frame: TouchFrame, x: number, y: number): Point {
  const { x0, y0, x1, y1 } = frame.safe;
  return { x: x0 + x * (x1 - x0), y: y0 + y * (y1 - y0) };
}

/**
 * Where the three buttons and the chip go. Each button is where the player put it (a fraction of the safe area) or, if they have not, where the design has it (an offset from the bottom-right corner of
 * the safe area); then it is moved as little as possible to a place where it is inside the safe area, clear of the HUD, the pause button and the boss's room, and apart from the buttons placed before it. If the
 * window cannot hold them at the size asked for, they are as big as can be (never below `FIT_FLOOR`), and only then does anything else give way. Pure: the same window, settings and order give the same
 * places, and a place this function gave, when it is given back, is where the button stays.
 */
export function resolveButtons(frame: TouchFrame, options: ResolveOptions = {}): Resolved {
  const scale = Number.isFinite(options.scale) ? clamp(options.scale as number, TOUCH_LIMITS.scale.min, TOUCH_LIMITS.scale.max) : 1;
  // every button is placed, once: the order asked for first, then the ones it left out
  const order = [...new Set([...(options.order ?? []), ...TOUCH_BUTTONS])];
  const chosen = options.buttons ?? {};
  const { safe, g } = frame;
  const cornerX = safe.x1;
  const cornerY = safe.y1;

  /** Places every button for a reduction `fit` of the size asked for, letting go of `relax` of the things they keep clear of. Null when one finds no place. */
  const attempt = (fit: number, relax: number): { placed: Record<ButtonId, Placed>; chip: Placed } | null => {
    const cluster = g * scale * fit;
    const edge = DEFAULT_TOUCH.edgeMargin * cluster;
    const byId = {} as Record<ButtonId, Placed>;
    for (const id of order) {
      const d = TOUCH_DESIGN[id];
      const own = chosen[id];
      const size = sizeOf(d.visual, PAD, cluster * (own ? clamp(own.scale, TOUCH_LIMITS.button.min, TOUCH_LIMITS.button.max) : 1));
      const want: Point = own ? pointOf(frame, own.x, own.y) : { x: cornerX + d.dx * cluster, y: cornerY + d.dy * cluster };
      const at = placeButton(frame, size, edge, want, Object.values(byId), relax);
      if (!at) return null;
      byId[id] = { ...size, cx: at.x, cy: at.y };
    }
    // the chip hangs over the attack button (it is contextual: it never decides where anything else goes)
    const c = TOUCH_DESIGN.chip;
    const chipSize = sizeOf(c.visual, c.pad, cluster);
    const attack = byId.attack;
    const above = { x: attack.cx, y: attack.cy - (attack.r + chipSize.r + c.gap * cluster) };
    const at = placeButton(frame, chipSize, edge, above, Object.values(byId), relax);
    if (!at) return null;
    return { placed: byId, chip: { ...chipSize, cx: at.x, cy: at.y } };
  };

  let fit = 1;
  let result = attempt(1, 0);
  const exact = result !== null;
  // not as asked: as big as fits, one thing given up at a time (the size comes first: it is a preference; where the buttons may be is a promise). The last step lets go of everything but the safe
  // area, and there is always a place in that, so the loop always ends with an answer
  for (let step = 0; result === null && step < RELAX_STEPS; step++) {
    const smallest = attempt(FIT_FLOOR, step);
    if (!smallest) continue;
    let lo = FIT_FLOOR;
    let hi = 1;
    result = smallest;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      const t = attempt(mid, step);
      if (t) {
        lo = mid;
        result = t;
      } else hi = mid;
    }
    fit = lo;
  }
  const done = result as NonNullable<typeof result>;
  const all = [...Object.values(done.placed), done.chip];
  return {
    attack: discOf(done.placed.attack, all),
    dash: discOf(done.placed.dash, all),
    ability: discOf(done.placed.ability, all),
    chip: discOf(done.chip, all),
    controlScale: g * scale * fit,
    exact,
  };
}

/**
 * Where everything goes for a window of `width × height` px with the given safe insets. A pure function of its inputs, so the design numbers (no overlaps, margins from the edges, every aspect ratio
 * from 4:3 to 21:9) are tested without a browser. The buttons are the player's (`options.buttons`, each a fraction of the safe area and a size of its own) or the design's, moved the least that keeps them
 * inside the safe area, clear of the HUD, the pause button and the boss's bar, and apart (`resolveButtons`); the movement zone is a part of the usable width on the side the buttons are not.
 */
export function computeTouchLayout(width: number, height: number, insets: Readonly<Insets> = NO_INSETS, options: ResolveOptions & { hudScale?: number } = {}): TouchLayout {
  const frame = touchFrame(width, height, insets, options.hudScale ?? 1);
  const r = resolveButtons(frame, options);
  const { safe } = frame;
  const usable = safe.x1 - safe.x0;
  const all = [r.attack, r.dash, r.ability, r.chip];
  // the buttons are on the side where most of them are; the movement zone is the other one, but it never reaches a control (a very small window with big controls would otherwise make them overlap: the zone yields)
  const mean = (r.attack.cx + r.dash.cx + r.ability.cx) / 3;
  const side: TouchLayout['side'] = mean >= safe.x0 + usable / 2 ? 'right' : 'left';
  const full = usable * DEFAULT_TOUCH.leftZoneWidth;
  const least = Math.min(full, usable * MIN_ZONE);
  const free = side === 'right' ? Math.min(...all.map((d) => d.cx - d.hit / 2)) - ZONE_GAP - safe.x0 : safe.x1 - Math.max(...all.map((d) => d.cx + d.hit / 2)) - ZONE_GAP;
  const w = Math.min(full, Math.max(least, free));
  const zone: Box = { x: side === 'right' ? safe.x0 : safe.x1 - w, y: 0, w, h: height };
  return { ...r, side, gestureScale: frame.g, insets: { ...insets }, zone };
}

/** Do two touch areas overlap? (Used by the tests: a finger must never be ambiguous.) */
export function discsOverlap(a: Disc, b: Disc): boolean {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) < (a.hit + b.hit) / 2;
}
