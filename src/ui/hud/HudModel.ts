import type { BottleState } from '@/abilities/BottleSet';
import type { PlayerStatus } from '@/gameplay/PlayerStatus';

/** One life segment: full or empty, plus the fading "ghost" of the one that was just lost and its white flash. */
export interface LifeSegmentState {
  full: boolean;
  /** 1 → 0 over `GHOST_SECONDS` after the segment is lost. */
  ghost: number;
  /** 1 → 0 over `FLASH_SECONDS`, white, at the moment of the loss. */
  flash: number;
}

export interface BottleViewState {
  state: BottleState;
  fill01: number;
  iconId: string;
  /** 1 → 0 over `POP_SECONDS` when the bottle is drunk (the vial "pops"). */
  pop: number;
  /** 1 → 0 over `GAIN_SECONDS` when the vial is NEW (the fourth bottle was just picked up): it arrives glowing. */
  gain: number;
  /** This vial is being drunk right now: its liquid drains over the channel and the glass glows. */
  drinking: boolean;
}

export type CardViewState = 'empty' | 'ready' | 'noMagic' | 'cooldown';

/** What the HUD shows in one frame, as plain numbers: the DOM view only applies it. */
export interface HudState {
  life: { max: number; current: number; segments: LifeSegmentState[]; /** The last segment pulses slowly. */ critical: boolean };
  magic: { fraction: number; regenerating: boolean; empty: boolean; /** Horizontal shake in dp (a refused cast). */ shakeX: number };
  card: { state: CardViewState; iconId: string; nameKey: string; cooldown01: number; shakeX: number };
  bottles: BottleViewState[];
  /** Horizontal shake in dp of the whole row (a drink that was refused: nothing to drink, or the life is full). */
  bottlesShakeX: number;
}

export const GHOST_SECONDS = 0.4;
export const FLASH_SECONDS = 0.15;
export const POP_SECONDS = 0.25;
export const GAIN_SECONDS = 0.9;
export const SHAKE_SECONDS = 0.28;
const SHAKE_AMPLITUDE = 4; // dp
const SHAKE_CYCLES = 3;

/**
 * The HUD as a PURE model (docs/ARCHITECTURE-2D.md §8): `PlayerStatus` (what the simulation says) in, `HudState` (what to draw)
 * out. It owns the short transients of the interface — the ghost of a lost life segment, the shake of a refused cast, the pop of
 * a drunk bottle — in REAL time (`dt` is the frame's), so they play through a hit-stop. It knows no DOM, no pixi and no entity.
 *
 * Things that happen are told to it (`magicDenied`, `bottlesDenied`, `bottleUsed`) by whoever listens to the gameplay events: the model never
 * subscribes to the simulation itself.
 */
export class HudModel {
  readonly state: HudState = {
    life: { max: 0, current: 0, segments: [], critical: false },
    magic: { fraction: 0, regenerating: false, empty: false, shakeX: 0 },
    card: { state: 'empty', iconId: '', nameKey: '', cooldown01: 0, shakeX: 0 },
    bottles: [],
    bottlesShakeX: 0,
  };
  private lastLife = -1;
  /** How many vials the last update showed (−1: none yet, so a game that LOADS with four does not announce the fourth). */
  private lastBottles = -1;
  private magicShake = 0;
  private cardShake = 0;
  private bottleShake = 0;

  /** A cast was refused for lack of magic: the bar and the card shake. */
  magicDenied(): void {
    this.magicShake = SHAKE_SECONDS;
    this.cardShake = SHAKE_SECONDS;
  }

  /** A drink was refused (no bottle ready, or the life is already full): the row of bottles shakes. */
  bottlesDenied(): void {
    this.bottleShake = SHAKE_SECONDS;
  }

  /** A bottle was drunk: its vial pops. */
  bottleUsed(slot: number): void {
    const b = this.state.bottles[slot];
    if (b) b.pop = 1;
  }

  /** Brings the state up to date with the simulation's status; `dt` is the real time since the last call, in seconds. */
  update(status: Readonly<PlayerStatus>, dt: number): Readonly<HudState> {
    const s = this.state;
    const dtc = Math.max(dt, 0); // a long frame (a tab that was hidden) simply finishes every transient at once

    // ---- life: one segment per point; a lost one leaves a ghost that fades ----
    const life = status.life;
    const segs = s.life.segments;
    while (segs.length < life.max) segs.push({ full: false, ghost: 0, flash: 0 });
    segs.length = life.max;
    if (this.lastLife >= 0 && life.current < this.lastLife) {
      for (let i = Math.max(0, life.current); i < Math.min(this.lastLife, life.max); i++) {
        const seg = segs[i] as LifeSegmentState;
        seg.ghost = 1;
        seg.flash = 1;
      }
    }
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i] as LifeSegmentState;
      seg.full = i < life.current;
      if (seg.full) seg.ghost = seg.flash = 0; // a segment that is back (a heal) has no ghost
      else {
        seg.ghost = Math.max(0, seg.ghost - dtc / GHOST_SECONDS);
        seg.flash = Math.max(0, seg.flash - dtc / FLASH_SECONDS);
      }
    }
    s.life.max = life.max;
    s.life.current = life.current;
    s.life.critical = life.current === 1;
    this.lastLife = life.current;

    // ---- magic ----
    this.magicShake = Math.max(0, this.magicShake - dtc);
    this.cardShake = Math.max(0, this.cardShake - dtc);
    this.bottleShake = Math.max(0, this.bottleShake - dtc);
    s.magic.fraction = status.magic.max > 0 ? status.magic.current / status.magic.max : 0;
    s.magic.regenerating = status.magic.regenerating;
    s.magic.empty = status.magic.current <= 0;
    s.magic.shakeX = shake(this.magicShake);

    // ---- card: the slot is always there; with no card it is the empty slot ----
    const c = status.card;
    s.card.state = c.equipped ? c.state : 'empty';
    s.card.iconId = c.equipped ? c.iconId : '';
    s.card.nameKey = c.equipped ? c.nameKey : '';
    s.card.cooldown01 = c.equipped ? c.cooldown01 : 0;
    s.card.shakeX = shake(this.cardShake);

    // ---- bottles ----
    const bs = s.bottles;
    while (bs.length < status.bottles.length) bs.push({ state: 'ready', fill01: 1, iconId: '', pop: 0, gain: 0, drinking: false });
    bs.length = status.bottles.length;
    // a vial that was not there a moment ago (the fourth bottle is a reward) arrives with a glow
    if (this.lastBottles >= 0) for (let i = this.lastBottles; i < bs.length; i++) (bs[i] as BottleViewState).gain = 1;
    this.lastBottles = bs.length;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i] as BottleViewState;
      const src = status.bottles[i] as (typeof status.bottles)[number];
      b.state = src.state;
      // the vial being drunk drains over the channel (it is spent on the last tick, so it never jumps)
      b.drinking = status.drink.slot === i;
      b.fill01 = b.drinking ? Math.max(0, 1 - status.drink.progress01) : src.fill01;
      b.iconId = src.iconId;
      b.pop = Math.max(0, b.pop - dtc / POP_SECONDS);
      b.gain = Math.max(0, b.gain - dtc / GAIN_SECONDS);
    }
    s.bottlesShakeX = shake(this.bottleShake);
    return s;
  }
}

/** A short damped wiggle: `remaining` seconds of shake left → dp of horizontal offset. */
function shake(remaining: number): number {
  if (remaining <= 0) return 0;
  const t = remaining / SHAKE_SECONDS; // 1 → 0
  return Math.sin((1 - t) * SHAKE_CYCLES * Math.PI * 2) * SHAKE_AMPLITUDE * t;
}
