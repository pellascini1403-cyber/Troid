/**
 * THE GAMEPAD IN THE MENUS (docs/PROMPT20-LOG.md): the pure half. A pad has a stick, a D-pad and four buttons and no pointer, so the menus are crossed the way a console's are: a direction steps to the nearest control in that
 * direction (the screen's own controls are laid out in rows and in two panels, and "nearest" follows them without a list of what is next to what), a held direction repeats. This file
 * knows nothing of the DOM: boxes in, the one to go to out. `PauseMenu.pad` is the half that touches the page.
 */

export type PadDirection = 'up' | 'down' | 'left' | 'right';

/** What a pad does in the menu, as a frame of the game's input has it (`InputFrame` is structurally this): the stick or the D-pad as `move` (+y UP), and the four face buttons by the actions they are bound to. */
export interface PadReading {
  readonly move: { readonly x: number; readonly y: number };
  readonly device: string;
  /** A: presses what has the focus. */
  readonly jumpPressed: boolean;
  /** B (and RB): one step back. */
  readonly dashPressed: boolean;
  /** X: closer, on the map. */
  readonly attackPressed: boolean;
  /** Y: farther, on the map. */
  readonly abilityPressed: boolean;
}

/** A direction is meant when the stick (or the D-pad: it reads 1) is past this… */
export const PAD_TILT = 0.55;
/** …and holds until it is back inside this (a stick that wobbles around the first value is not a flurry of steps). */
export const PAD_REST = 0.3;
/** A direction that is held steps again after this (ms) and then every `PAD_REPEAT`. */
export const PAD_FIRST = 420;
export const PAD_REPEAT = 130;
/** The menu ignores the pad for this long (ms) after it opens: a press made for the game a moment before must not press the first thing in the menu. */
export const PAD_SETTLE = 250;

/** Turns what a pad reads into steps: the first one at once, the next ones while the direction is held. */
export class PadStepper {
  private held: PadDirection | null = null;
  private due = 0;

  /** The direction to step in now, or `null`. `now` is in milliseconds. */
  step(x: number, y: number, now: number): PadDirection | null {
    const dir = this.read(x, y);
    if (dir === null) {
      this.held = null;
      return null;
    }
    if (dir !== this.held) {
      this.held = dir;
      this.due = now + PAD_FIRST;
      return dir;
    }
    if (now < this.due) return null;
    // counted from now, not from when it was due: a frame that comes late is one step, never two
    this.due = now + PAD_REPEAT;
    return dir;
  }

  /** Forgets a direction that was being held (the menu opened or changed screen under it). */
  reset(): void {
    this.held = null;
  }

  private read(x: number, y: number): PadDirection | null {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (Math.max(ax, ay) < (this.held === null ? PAD_TILT : PAD_REST)) return null;
    return ax >= ay ? (x > 0 ? 'right' : 'left') : y > 0 ? 'up' : 'down';
  }
}

/** A rectangle on the screen (CSS px, y grows downwards: what `getBoundingClientRect` gives). */
export interface PadBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface PadTarget<T> {
  readonly item: T;
  readonly box: PadBox;
}

/** How much a control that lies off to the side counts against it, against one straight ahead. */
const SIDE_WEIGHT = 2.5;
/** Boxes that overlap by this much (px) along the direction still count as one beyond the other: borders and rounding, not a layout. */
const SLACK = 2;
/** Along a row, a control may lie this far (px) off to the side of the way, plus as far as it is ahead: a cone of about 45°, so the column of options is reached from the bottom of a screen as well as from its top. */
const CONE = 24;
/** Along a column the control has to be under (or over) the one it comes from, give or take this: a panel's bottom does not lead into the top of the panel beside it — that is what left and right are for. */
const UNDER = 8;

/**
 * Where a direction leads from `from`: the nearest of `targets` that lies wholly beyond the edge of `from` that faces that way and in line with it — loosely when it is to the side, closely when it is above or below.
 * The distance is that between the two edges along the direction, plus the gap between the boxes across it (nothing if they overlap, as two buttons in a row or in a column do) weighed a little more, so a control
 * straight ahead wins over a nearer one off to the side. To the side, where nothing is in line at all, the closest in height is still the way (a screen with one button, far below the options beside it, is reached from
 * all of them). `null` where there is nothing that way. A box with no size (a control that is not on the screen) is never a way.
 */
export function neighbour<T>(from: PadBox, targets: ReadonlyArray<PadTarget<T>>, dir: PadDirection): T | null {
  const horizontal = dir === 'left' || dir === 'right';
  const pick = (inLine: boolean): T | null => {
    let best: T | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const { item, box } of targets) {
      if (box.right <= box.left || box.bottom <= box.top) continue;
      const ahead = dir === 'right' ? box.left - from.right : dir === 'left' ? from.left - box.right : dir === 'down' ? box.top - from.bottom : from.top - box.bottom;
      if (ahead < -SLACK) continue; // beside it, or behind
      const gap = horizontal ? span(from.top, from.bottom, box.top, box.bottom) : span(from.left, from.right, box.left, box.right);
      if (inLine && gap > (horizontal ? Math.max(0, ahead) + CONE : UNDER)) continue;
      const off = horizontal ? Math.abs(box.top + box.bottom - from.top - from.bottom) / 2 : Math.abs(box.left + box.right - from.left - from.right) / 2;
      const score = Math.max(0, ahead) + SIDE_WEIGHT * gap + 0.05 * off;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return best;
  };
  return pick(true) ?? (horizontal ? pick(false) : null);
}

/** The distance between two intervals on a line: nothing where they overlap or touch. */
function span(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
}

/**
 * A slider moved one of its steps in a direction, kept inside its limits: the value it takes, or `null` where it already is at that end. (The browser has `stepUp`, but the page this runs in may not: the value is worked out
 * here, on the slider's own `min`, `max` and `step`, and written to the same number of decimals as the step — 0.1 + 0.2 is not 0.3.)
 */
export function sliderStep(value: number, min: number, max: number, step: number, dir: 'left' | 'right'): number | null {
  const unit = step > 0 && Number.isFinite(step) ? step : 1;
  const decimals = Math.min(8, (String(unit).split('.')[1] ?? '').length);
  const next = Number(Math.min(max, Math.max(min, value + (dir === 'right' ? unit : -unit))).toFixed(decimals));
  return next === value ? null : next;
}
