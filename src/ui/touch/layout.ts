import { DEFAULT_TOUCH, uiScale, type TouchConfig } from '@/input/gestures/TouchConfig';

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

/** Where the player put the buttons (the settings screen): which side of the screen, and how far in and up from the corner they hang. */
export interface Placement {
  side: 'right' | 'left';
  /** 0 (as designed) … 1 (the farthest in the window allows). */
  offsetX: number;
  /** 0 … 1: how far up (never into the interface at the top). */
  offsetY: number;
}

export const DEFAULT_PLACEMENT: Readonly<Placement> = Object.freeze({ side: 'right', offsetX: 0, offsetY: 0 });

export interface TouchLayout {
  /** The side the buttons are on; the movement zone is the other one. */
  side: Placement['side'];
  /** The scale of the gestures: `uiScale` of the window (distances in dp × this = px). */
  gestureScale: number;
  /** The scale of what is drawn: `uiScale` × the player's size preference. */
  controlScale: number;
  insets: Insets;
  /** The invisible movement zone (the left part of the screen, the whole height). */
  zone: Box;
  attack: Disc;
  dash: Disc;
  ability: Disc;
  /** The contextual bottle chip. */
  chip: Disc;
}

/**
 * The fixed controls of GAME-SPEC-2D §4.3.4: the centre as an offset from the bottom-right SAFE corner (dp) and the diameters
 * (visible disc / touch area). There is no jump button, no interaction button and no bottle button: the jump is a gesture, the
 * interaction an icon that exists only when something can be interacted with, the bottle a contextual chip.
 */
export const TOUCH_CONTROLS = {
  attack: { dx: -96, dy: -96, visual: 88, hit: 104 },
  dash: { dx: -196, dy: -60, visual: 68, hit: 84 },
  ability: { dx: -184, dy: -164, visual: 68, hit: 84 },
  chip: { dx: -64, dy: -196, visual: 52, hit: 64 },
} as const;

/** How far the player may move the buttons in from their side and up from the bottom (dp, at most: the window may allow less). */
export const PLACEMENT_RANGE = { x: 120, y: 90 } as const;
/** The height of the interface at the top that the buttons are never lifted into (the life, the magic and the bottles), dp. */
const TOP_RESERVE = 96;
/** The movement zone never gets narrower than this fraction of the usable width, however far in the buttons are moved. */
const MIN_ZONE = 0.3;
/** The block of the four controls, as offsets from the corner of the screen they hang from (dp): its width and its distance from the bottom edge. */
const CLUSTER = (() => {
  const all = Object.values(TOUCH_CONTROLS);
  return {
    farX: Math.max(...all.map((c) => Math.abs(c.dx) + c.hit / 2)),
    topY: Math.max(...all.map((c) => Math.abs(c.dy) + c.hit / 2)),
  };
})();

/**
 * Where everything goes for a window of `width × height` px with the given safe insets. A pure function of its inputs, so the
 * design numbers (no overlaps, margins from the edges, every aspect ratio from 4:3 to 21:9) are tested without a browser.
 * The controls hang from the bottom corner of the side the player chose (they never depend on the aspect ratio); the zone is a
 * fraction of the usable width, on the other side. `placement` moves the buttons in and up by what the player asked for, but only as far as
 * the window allows: they never leave the safe area, never reach into the interface at the top and never take more than 70 % of the width.
 */
export function computeTouchLayout(
  width: number,
  height: number,
  insets: Readonly<Insets> = NO_INSETS,
  sizePreference = 1,
  cfg: Readonly<TouchConfig> = DEFAULT_TOUCH,
  placement: Readonly<Placement> = DEFAULT_PLACEMENT,
): TouchLayout {
  const gestureScale = uiScale(width, height);
  const s = gestureScale * sizePreference;
  const mirrored = placement.side === 'left';
  const usable = Math.max(0, width - insets.left - insets.right);
  const cornerX = mirrored ? insets.left : width - insets.right;
  const cornerY = height - insets.bottom;
  // how far in and up the player's choice may actually go in THIS window
  const maxIn = Math.max(0, usable * (1 - MIN_ZONE) - CLUSTER.farX * s);
  const maxUp = Math.max(0, cornerY - CLUSTER.topY * s - (insets.top + TOP_RESERVE * s));
  const unit = (v: number): number => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const inward = unit(placement.offsetX) * Math.min(PLACEMENT_RANGE.x * s, maxIn);
  const upward = unit(placement.offsetY) * Math.min(PLACEMENT_RANGE.y * s, maxUp);
  const disc = (c: (typeof TOUCH_CONTROLS)[keyof typeof TOUCH_CONTROLS]): Disc => ({
    cx: mirrored ? cornerX - c.dx * s + inward : cornerX + c.dx * s - inward,
    cy: cornerY + c.dy * s - upward,
    visual: c.visual * s,
    hit: c.hit * s,
  });
  const attack = disc(TOUCH_CONTROLS.attack);
  const dash = disc(TOUCH_CONTROLS.dash);
  const ability = disc(TOUCH_CONTROLS.ability);
  const chip = disc(TOUCH_CONTROLS.chip);
  // the zone is the part of the usable width on the side the buttons are not, but it never reaches a control (a very small window with big
  // controls would otherwise make them overlap: the zone yields)
  const all = [attack, dash, ability, chip];
  let zone: Box;
  if (mirrored) {
    const rightmost = Math.max(...all.map((d) => d.cx + d.hit / 2));
    const w = Math.max(0, Math.min(usable * cfg.leftZoneWidth, width - insets.right - rightmost - ZONE_GAP));
    zone = { x: width - insets.right - w, y: 0, w, h: height };
  } else {
    const leftmost = Math.min(...all.map((d) => d.cx - d.hit / 2));
    zone = { x: insets.left, y: 0, w: Math.max(0, Math.min(usable * cfg.leftZoneWidth, leftmost - ZONE_GAP - insets.left)), h: height };
  }
  return {
    side: placement.side,
    gestureScale,
    controlScale: s,
    insets: { ...insets },
    zone,
    attack,
    dash,
    ability,
    chip,
  };
}

/** Space kept between the movement zone and the nearest control, px. */
const ZONE_GAP = 4;

/** Do two touch areas overlap? (Used by the tests: a finger must never be ambiguous.) */
export function discsOverlap(a: Disc, b: Disc): boolean {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) < (a.hit + b.hit) / 2;
}
