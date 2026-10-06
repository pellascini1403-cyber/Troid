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

export interface TouchLayout {
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

/**
 * Where everything goes for a window of `width × height` px with the given safe insets. A pure function of its inputs, so the
 * design numbers (no overlaps, margins from the edges, every aspect ratio from 4:3 to 21:9) are tested without a browser.
 * The controls hang from the bottom-right corner (they never depend on the aspect ratio); the zone is a fraction of the
 * usable width.
 */
export function computeTouchLayout(
  width: number,
  height: number,
  insets: Readonly<Insets> = NO_INSETS,
  sizePreference = 1,
  cfg: Readonly<TouchConfig> = DEFAULT_TOUCH,
): TouchLayout {
  const gestureScale = uiScale(width, height);
  const s = gestureScale * sizePreference;
  const cornerX = width - insets.right;
  const cornerY = height - insets.bottom;
  const disc = (c: (typeof TOUCH_CONTROLS)[keyof typeof TOUCH_CONTROLS]): Disc => ({
    cx: cornerX + c.dx * s,
    cy: cornerY + c.dy * s,
    visual: c.visual * s,
    hit: c.hit * s,
  });
  const attack = disc(TOUCH_CONTROLS.attack);
  const dash = disc(TOUCH_CONTROLS.dash);
  const ability = disc(TOUCH_CONTROLS.ability);
  const chip = disc(TOUCH_CONTROLS.chip);
  // the zone is the left part of the usable width, but it never reaches a control (a very small window with big controls
  // would otherwise make them overlap: the zone yields)
  const usable = Math.max(0, width - insets.left - insets.right);
  const leftmost = Math.min(...[attack, dash, ability, chip].map((d) => d.cx - d.hit / 2));
  const zoneW = Math.max(0, Math.min(usable * cfg.leftZoneWidth, leftmost - ZONE_GAP - insets.left));
  return {
    gestureScale,
    controlScale: s,
    insets: { ...insets },
    zone: { x: insets.left, y: 0, w: zoneW, h: height },
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
