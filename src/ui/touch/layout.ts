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
/**
 * What the HUD takes at the top left, in dp: its margin from the safe area, its height and the widest it gets in this game (five life segments and four
 * bottles). The numbers belong to `ui/hud/layout.ts`; they are repeated here so that this module does not import it (a test holds the two together).
 */
export const HUD_FOOTPRINT = { margin: 16, height: 77, width: 206, gap: 8 } as const;
/** The height of the interface at the top that the buttons are never lifted into: the HUD and a gap, dp. */
const TOP_RESERVE = HUD_FOOTPRINT.margin + HUD_FOOTPRINT.height + HUD_FOOTPRINT.gap;
/** The movement zone never gets narrower than this fraction of the usable width, however far in the buttons are moved. */
const MIN_ZONE = 0.3;
/** The room the boss's bar always has at the bottom, between the buttons and the other edge (`ui/hud/bossBarLayout.ts`: its least width and its gap on each side). */
const BAR_ROOM = 160 + 2 * 8;
/** The smallest the buttons get when the HUD asks them to make room (the size of the 80 % setting on the smallest `uiScale`): a finger is still ≥ 44 px. */
const SMALLEST = 0.72;
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
 * the window allows: they never leave the safe area, never reach into the interface at the top, never take more than 70 % of the width and
 * always leave the bottom of the window room for the boss's bar. If the size asked for would put them on the HUD, they are as big as can be without
 * it (never below what a finger needs): the size in the settings is a preference, the window decides what fits.
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
  const mirrored = placement.side === 'left';
  const usable = Math.max(0, width - insets.left - insets.right);
  const cornerX = mirrored ? insets.left : width - insets.right;
  const cornerY = height - insets.bottom;
  const unit = (v: number): number => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  // the HUD, with a gap around it, as a box
  const hudPad = HUD_FOOTPRINT.gap * gestureScale;
  const hud = {
    x0: insets.left + HUD_FOOTPRINT.margin * gestureScale - hudPad,
    y0: insets.top + HUD_FOOTPRINT.margin * gestureScale - hudPad,
    x1: insets.left + (HUD_FOOTPRINT.margin + HUD_FOOTPRINT.width) * gestureScale + hudPad,
    y1: insets.top + (HUD_FOOTPRINT.margin + HUD_FOOTPRINT.height) * gestureScale + hudPad,
  };
  /** The four touch areas for the buttons at scale `s`, with the player's position limited to what THIS window allows at that scale. */
  const discsAt = (s: number): Disc[] => {
    const maxIn = Math.max(0, usable * (1 - MIN_ZONE) - CLUSTER.farX * s, 0);
    const room = Math.max(0, usable - CLUSTER.farX * s - BAR_ROOM);
    const maxUp = Math.max(0, cornerY - CLUSTER.topY * s - (insets.top + TOP_RESERVE * gestureScale));
    const inward = unit(placement.offsetX) * Math.min(PLACEMENT_RANGE.x * s, maxIn, room);
    const upward = unit(placement.offsetY) * Math.min(PLACEMENT_RANGE.y * s, maxUp);
    return [TOUCH_CONTROLS.attack, TOUCH_CONTROLS.dash, TOUCH_CONTROLS.ability, TOUCH_CONTROLS.chip].map((c) => ({
      cx: mirrored ? cornerX - c.dx * s + inward : cornerX + c.dx * s - inward,
      cy: cornerY + c.dy * s - upward,
      visual: c.visual * s,
      hit: c.hit * s,
    }));
  };
  const safe = { x0: insets.left, y0: insets.top, x1: width - insets.right, y1: height - insets.bottom };
  /**
   * Do the buttons fit: all inside the safe area and none on the HUD? Touching is fitting (to a millionth of a px): the lift of the buttons is limited by the very
   * edge of the HUD's reserve, so a button resting against it is the normal case, and a rounding error must not decide whether it "fits".
   */
  const fits = (discs: readonly Disc[]): boolean =>
    discs.every((d) => {
      if (d.cx - d.hit / 2 < safe.x0 - 1e-6 || d.cx + d.hit / 2 > safe.x1 + 1e-6 || d.cy - d.hit / 2 < safe.y0 - 1e-6 || d.cy + d.hit / 2 > safe.y1 + 1e-6) return false;
      const nx = Math.max(hud.x0, Math.min(d.cx, hud.x1));
      const ny = Math.max(hud.y0, Math.min(d.cy, hud.y1));
      return Math.hypot(d.cx - nx, d.cy - ny) >= d.hit / 2 - 1e-6;
    });
  let s = gestureScale * sizePreference;
  if (!fits(discsAt(s))) {
    // as big as fits: the largest scale (down to the floor) at which the buttons are inside the safe area and off the HUD — smaller is never worse, so a bisection finds it
    let lo = Math.min(s, SMALLEST);
    let hi = s;
    if (!fits(discsAt(lo))) s = lo;
    else {
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (fits(discsAt(mid))) lo = mid;
        else hi = mid;
      }
      s = lo;
    }
  }
  const [attack, dash, ability, chip] = discsAt(s) as [Disc, Disc, Disc, Disc];
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
