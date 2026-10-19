import type { BottleState } from '@/abilities/BottleSet';
import type { PlayerStatus } from '@/gameplay/PlayerStatus';

/** One life segment: full or empty, plus the fading "ghost" of the one that was just lost, its white flash, and the wave of light of one that has just come back. */
export interface LifeSegmentState {
  full: boolean;
  /** 1 → 0 over `GHOST_SECONDS` after the segment is lost. */
  ghost: number;
  /** 1 → 0 over `FLASH_SECONDS`, white, at the moment of the loss. */
  flash: number;
  /** 1 → 0 over `HEAL_SECONDS` when the segment is BACK (a bottle drunk, a rest): a cool light runs over it. */
  heal: number;
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
  /** Whole seconds left of the recharge that is going on in this vial (rounded UP, so it never says 0 while it is not ready); 0 when it is ready or only waiting for its turn. */
  secondsLeft: number;
}

export type CardViewState = 'empty' | 'ready' | 'noMagic' | 'cooldown';

/** What the HUD shows in one frame, as plain numbers: the DOM view only applies it. */
export interface HudState {
  life: {
    max: number;
    current: number;
    segments: LifeSegmentState[];
    /** The last segment pulses slowly. */
    critical: boolean;
    /** How much of the i-frames a blow gives are left, 1 … 0: the guard line under the life drains with them (it is the simulation's own window, shown — never a second one). */
    guard: number;
  };
  magic: {
    fraction: number;
    regenerating: boolean;
    empty: boolean;
    /** Horizontal shake in dp (a refused cast). */
    shakeX: number;
    /** Where the bar was a moment ago (≥ `fraction`): what was just spent lingers, then drains. */
    trail: number;
    /** Where the cost of the equipped skill falls on the bar, 0 … 1 (0: no skill, nothing to mark). */
    cost01: number;
    /** The equipped skill could be cast now as far as magic goes (true with no skill: nothing to pay). */
    affordable: boolean;
    /** Below the maximum and not yet regenerating: the wait that follows a spend. */
    waiting: boolean;
  };
  card: { state: CardViewState; iconId: string; nameKey: string; cooldown01: number; /** What the skill costs, in magic (0: none). */ cost: number; shakeX: number; /** 1 → 0 over `GAIN_SECONDS` when a card was just acquired (the slot arrives glowing). */ gain: number };
  bottles: BottleViewState[];
  /** Horizontal shake in dp of the whole row (a drink that was refused: nothing to drink, or the life is full). */
  bottlesShakeX: number;
}

export const GHOST_SECONDS = 0.4;
export const FLASH_SECONDS = 0.15;
export const HEAL_SECONDS = 0.7;
/** What was just spent lingers on the magic bar this long before it drains, and drains at this share of the bar per second. */
export const TRAIL_HOLD_SECONDS = 0.25;
export const TRAIL_DRAIN_PER_SECOND = 1.1;
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
    life: { max: 0, current: 0, segments: [], critical: false, guard: 0 },
    magic: { fraction: 0, regenerating: false, empty: false, shakeX: 0, trail: 0, cost01: 0, affordable: true, waiting: false },
    card: { state: 'empty', iconId: '', nameKey: '', cooldown01: 0, cost: 0, shakeX: 0, gain: 0 },
    bottles: [],
    bottlesShakeX: 0,
  };
  private lastLife = -1;
  /** Where the magic bar was on the last update (−1: none yet), and how long what was just spent still lingers. */
  private lastMagic = -1;
  private trailHold = 0;
  /** The card the last update showed (`''`: none; `null`: no update yet, so a game that LOADS with the card does not announce it). */
  private lastCard: string | null = null;
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
    while (segs.length < life.max) segs.push({ full: false, ghost: 0, flash: 0, heal: 0 });
    segs.length = life.max;
    if (this.lastLife >= 0 && life.current < this.lastLife) {
      for (let i = Math.max(0, life.current); i < Math.min(this.lastLife, life.max); i++) {
        const seg = segs[i] as LifeSegmentState;
        seg.ghost = 1;
        seg.flash = 1;
      }
    }
    // the points that came back since the last update: a heal, answered with a wave of light over exactly those segments
    const healedFrom = this.lastLife >= 0 && life.current > this.lastLife ? this.lastLife : -1;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i] as LifeSegmentState;
      seg.full = i < life.current;
      if (seg.full) {
        seg.ghost = seg.flash = 0; // a segment that is back (a heal) has no ghost
        if (healedFrom >= 0 && i >= healedFrom) seg.heal = 1;
        else seg.heal = Math.max(0, seg.heal - dtc / HEAL_SECONDS);
      } else {
        seg.heal = 0;
        seg.ghost = Math.max(0, seg.ghost - dtc / GHOST_SECONDS);
        seg.flash = Math.max(0, seg.flash - dtc / FLASH_SECONDS);
      }
    }
    s.life.max = life.max;
    s.life.current = life.current;
    s.life.critical = life.current === 1;
    s.life.guard = Math.min(1, Math.max(0, life.guard01));
    this.lastLife = life.current;

    // ---- magic ----
    this.magicShake = Math.max(0, this.magicShake - dtc);
    this.cardShake = Math.max(0, this.cardShake - dtc);
    this.bottleShake = Math.max(0, this.bottleShake - dtc);
    const fraction = status.magic.max > 0 ? status.magic.current / status.magic.max : 0;
    s.magic.fraction = fraction;
    s.magic.regenerating = status.magic.regenerating;
    s.magic.empty = status.magic.current <= 0;
    s.magic.shakeX = shake(this.magicShake);
    // what was just spent lingers on the bar a moment, then drains to where the bar is (the bar itself never lags: this is only the memory of where it was)
    if (this.lastMagic >= 0 && fraction < this.lastMagic - 1e-9) {
      s.magic.trail = Math.max(s.magic.trail, this.lastMagic);
      this.trailHold = TRAIL_HOLD_SECONDS;
    }
    if (fraction >= s.magic.trail) s.magic.trail = fraction;
    else {
      const held = Math.min(this.trailHold, dtc); // the hold is spent first; what is left of the frame already drains
      this.trailHold -= held;
      s.magic.trail = Math.max(fraction, s.magic.trail - TRAIL_DRAIN_PER_SECOND * (dtc - held));
    }
    this.lastMagic = fraction;
    const cost = status.card.equipped ? status.card.cost : 0;
    s.magic.cost01 = cost > 0 && status.magic.max > 0 ? Math.min(1, cost / status.magic.max) : 0;
    s.magic.affordable = cost <= 0 || status.magic.current >= cost;
    s.magic.waiting = fraction < 1 && !status.magic.regenerating;

    // ---- card: the slot is always there; with no card it is the empty slot ----
    const c = status.card;
    s.card.state = c.equipped ? c.state : 'empty';
    s.card.iconId = c.equipped ? c.iconId : '';
    s.card.nameKey = c.equipped ? c.nameKey : '';
    s.card.cooldown01 = c.equipped ? c.cooldown01 : 0;
    s.card.cost = c.equipped ? c.cost : 0;
    s.card.shakeX = shake(this.cardShake);
    // a card that was not there a moment ago (the Spirit Bolt of R3) arrives with a glow
    if (this.lastCard === '' && s.card.iconId !== '') s.card.gain = 1;
    this.lastCard = s.card.iconId;
    s.card.gain = Math.max(0, s.card.gain - dtc / GAIN_SECONDS);

    // ---- bottles ----
    const bs = s.bottles;
    while (bs.length < status.bottles.length) bs.push({ state: 'ready', fill01: 1, iconId: '', pop: 0, gain: 0, drinking: false, secondsLeft: 0 });
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
      b.secondsLeft = src.state === 'recharging' ? Math.ceil(src.secondsLeft - 1e-9) : 0;
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
