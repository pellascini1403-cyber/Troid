import type { BottleState } from '@/abilities/BottleSet';
import type { PlayerStatus } from '@/gameplay/PlayerStatus';

/**
 * One of the two bars: the real numbers (what the simulation says), the whole number the bar writes, and where the picture of the bar is this frame. The bar is drawn as the artist's bright picture shown up to
 * `edge` and the dark one from there on, with the white rectangle where they meet; `wear` is where the white rectangle's far end trails to.
 */
export interface BarState {
  /** The simulation's own numbers (points of life, units of magic): what the bar is a picture of. */
  current: number;
  max: number;
  /** `current ÷ max`, 0 … 1: where the bar is going to be (never beyond either end). */
  fraction: number;
  /** What the bar writes, whole, 0 … 100: `fraction` as a percentage — 100 only when the bar is full, 0 only when it is empty, never 0 for a bar that still has something. */
  percent: number;
  /** 0 … 1: where the bright part of the picture ends this frame. It reaches `fraction` within a fraction of a second (it never lags behind the number for longer), and the first time it is read it is already there. */
  edge: number;
  /** 0 … 1, never below `edge`: where the picture of the bar was a moment ago. The white rectangle reaches back to it, and it comes after the picture with a slower step (`WEAR_SECONDS`): when something is lost the rectangle is
   * briefly longer than the artist drew it, and a moment later it is the size of the artist's again; when the bar grows it is never behind it. */
  wear: number;
}

/** One bottle: the real state of its slot, whether it is being drunk right now, and how dark its picture is this frame (0: the bright bottle, 1: the dark one; it fades between the two when the state changes). */
export interface BottleViewState {
  state: BottleState;
  drinking: boolean;
  dark: number;
}

/** What the HUD shows in one frame, as plain numbers: the DOM view only applies it. */
export interface HudState {
  life: BarState;
  magic: BarState & {
    /** The magic is coming back right now. */
    regenerating: boolean;
    /** Horizontal shake in dp (a refused cast). */
    shakeX: number;
  };
  bottles: BottleViewState[];
  /** Horizontal shake in dp of the whole row (a drink that was refused: nothing to drink, or the life is full). */
  bottlesShakeX: number;
}

/** The time constant of the bar's picture: it covers 95 % of a change in three of these (0.15 s) and is within the width of a pixel of it a little after. */
export const EDGE_SECONDS = 0.05;
/**
 * The time constant of the white rectangle's trail: it follows the picture of the bar at this slower pace, so that when the picture moves back the rectangle stretches behind it — by about half of what was lost at
 * the most, a twelfth of a second after the blow — and then shrinks smoothly to the size the artist drew it. It starts at nothing and ends at nothing: no jump, no hold.
 */
export const WEAR_SECONDS = 0.14;
/** How long a bottle takes to go from bright to dark (or back) when its state changes. */
export const BOTTLE_FADE_SECONDS = 0.18;
export const SHAKE_SECONDS = 0.28;
/**
 * The most time the transients take in one frame. A frame that lasted longer (a slow device, a hitch, a tab that was hidden) is shown as one of this length: the picture of a bar still goes by the places in between
 * instead of arriving at once, and the NUMBERS are not affected — they are the simulation's, this frame.
 */
export const MAX_STEP_SECONDS = 0.1;
const SHAKE_AMPLITUDE = 4; // dp
const SHAKE_CYCLES = 3;
/** The bar is "there" when it is this close (a thousandth of its length is under a pixel of the artist's canvas). */
const REST = 5e-4;

/**
 * The number a bar writes for `current` of `max`: the whole percentage. The life of the hero is 5 points and the magic 100 units; the artist's HUD writes 100 when a bar is full, so the number is the bar's fill as a
 * percentage of its maximum — which is the magic's own unit while its maximum is 100 — and it never says 100 for a bar that is not full or 0 for one that still has something.
 */
export function percentOf(current: number, max: number): number {
  if (!(max > 0) || !(current > 0)) return 0;
  if (current >= max) return 100;
  return Math.min(99, Math.max(1, Math.floor((current / max) * 100 + 1e-9)));
}

interface Track {
  /** The bar has been read once: its picture starts where it is instead of moving there. */
  seen: boolean;
}

function emptyBar(): BarState {
  return { current: 0, max: 0, fraction: 0, percent: 0, edge: 0, wear: 0 };
}

/**
 * The HUD as a PURE model (docs/ARCHITECTURE-2D.md §8): `PlayerStatus` (what the simulation says) in, `HudState` (what to draw) out. It owns the short transients of the interface — where the picture of a bar is on its
 * way to the number, the white rectangle of what was just lost, the dark of a bottle that was drunk, the shake of a refused cast — in the `dt` it is given (the frame's, and 0 while the game waits: they wait with it).
 * It knows no DOM, no pixi and no entity, and the NUMBERS in it are never animated: `current`, `max` and `percent` are the simulation's, this frame.
 *
 * Things that happen are told to it (`magicDenied`, `bottlesDenied`) by whoever listens to the gameplay events: the model never subscribes to the simulation itself.
 */
export class HudModel {
  readonly state: HudState = {
    life: emptyBar(),
    magic: { ...emptyBar(), regenerating: false, shakeX: 0 },
    bottles: [],
    bottlesShakeX: 0,
  };
  private readonly lifeTrack: Track = { seen: false };
  private readonly magicTrack: Track = { seen: false };
  /** How many bottles the last update showed: those are already where they are; one that is new is bright. */
  private bottlesSeen = 0;
  private magicShake = 0;
  private bottleShake = 0;

  /** A cast was refused for lack of magic: the bar shakes. */
  magicDenied(): void {
    this.magicShake = SHAKE_SECONDS;
  }

  /** A drink was refused (no bottle ready, or the life is already full): the row of bottles shakes. */
  bottlesDenied(): void {
    this.bottleShake = SHAKE_SECONDS;
  }

  /** Brings the state up to date with the simulation's status; `dt` is the time since the last call, in seconds (0 while the game waits). */
  update(status: Readonly<PlayerStatus>, dt: number): Readonly<HudState> {
    const s = this.state;
    const dtc = Math.min(Math.max(dt, 0), MAX_STEP_SECONDS); // a long frame moves the transients as far as MAX_STEP_SECONDS and no further: the next ones finish them

    stepBar(s.life, this.lifeTrack, status.life.current, status.life.max, dtc);
    stepBar(s.magic, this.magicTrack, status.magic.current, status.magic.max, dtc);
    s.magic.regenerating = status.magic.regenerating;
    this.magicShake = Math.max(0, this.magicShake - dtc);
    this.bottleShake = Math.max(0, this.bottleShake - dtc);
    s.magic.shakeX = shake(this.magicShake);
    s.bottlesShakeX = shake(this.bottleShake);

    const bs = s.bottles;
    while (bs.length < status.bottles.length) bs.push({ state: 'ready', drinking: false, dark: 0 });
    bs.length = status.bottles.length;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i] as BottleViewState;
      const src = status.bottles[i] as (typeof status.bottles)[number];
      b.state = src.state;
      b.drinking = status.drink.slot === i;
      const dark = src.state === 'ready' ? 0 : 1;
      if (i >= this.bottlesSeen) b.dark = dark;
      else b.dark = dark > b.dark ? Math.min(dark, b.dark + dtc / BOTTLE_FADE_SECONDS) : Math.max(dark, b.dark - dtc / BOTTLE_FADE_SECONDS);
    }
    this.bottlesSeen = bs.length;
    return s;
  }
}

/** One bar of the HUD for `current` of `max`, `dt` seconds after the last frame. */
function stepBar(bar: BarState, track: Track, current: number, max: number, dt: number): void {
  const fraction = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
  bar.current = current;
  bar.max = max;
  bar.fraction = fraction;
  bar.percent = percentOf(current, max);
  if (!track.seen) {
    track.seen = true;
    bar.edge = bar.wear = fraction;
    return;
  }
  if (dt > 0) {
    bar.edge += (fraction - bar.edge) * (1 - Math.exp(-dt / EDGE_SECONDS));
    // the white rectangle trails the picture: it is where the picture was drawn a moment ago, and comes after it with a slower step
    bar.wear += (bar.edge - bar.wear) * (1 - Math.exp(-dt / WEAR_SECONDS));
  }
  if (Math.abs(fraction - bar.edge) < REST) bar.edge = fraction;
  // never behind the bar itself (nothing is lost when the bar grows), and at rest it is the bar
  if (bar.wear - bar.edge < REST) bar.wear = bar.edge;
}

/** A short damped wiggle: `remaining` seconds of shake left → dp of horizontal offset. */
function shake(remaining: number): number {
  if (remaining <= 0) return 0;
  const t = remaining / SHAKE_SECONDS; // 1 → 0
  return Math.sin((1 - t) * SHAKE_CYCLES * Math.PI * 2) * SHAKE_AMPLITUDE * t;
}
