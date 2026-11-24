import type { Container } from 'pixi.js';
import type { AnimPhase, AnimState } from '@/presentation/vocabulary';
import type { Kit } from './kit/kit';

/**
 * A rig (docs/PROMPT24-LOG.md) is a creature drawn as ARTICULATED PARTS and animated by code: each species has its own anatomy — a bat has wings and a spider has legs — and no two have to share a part. What the simulation says
 * reaches it as a `RigFrame` (the same logical vocabulary as everything else, `anim` / `phase` / `phaseT`, plus the feelings derived from it); what it does with it is its own business, and it can never change what the creature DOES.
 */
export interface RigFrame {
  /** The creature's own animation clock, seconds (frozen by hit-stop and pause, offset by its seed so two of a kind are never in step). */
  t: number;
  /** Seconds since the last frame (0 while time is frozen). */
  dt: number;
  anim: AnimState;
  phase: AnimPhase;
  /** Progress 0 → 1 through the current timed state (`phaseT`). */
  p: number;
  /** Seconds since the state it is in began. */
  since: number;
  /** Speed along the way it faces (m/s; negative: backing away) and vertically (m/s, up is positive). */
  vx: number;
  vy: number;
  /** The warning building: 0 → 1 through a `telegraph`, held while it strikes, easing off after. */
  heat: number;
  /** The blow itself: 0 → 1 → 0 across the `attack` state. */
  strike: number;
  /** 1 at the moment of a hit, falling to 0 in about a third of a second. */
  hurt: number;
  /** 0 → 1 along the death. */
  dying: number;
  /** The opening: it has just attacked and is spent (`recovery`), which is when it can be hurt. For a boss, its weak point is showing. */
  open: boolean;
  /** Which way it is looking at the hero: reserved (a boss knows it). */
  flash: number;
  opacity: number;
  /** A number in [0, 1) that belongs to this one creature and never changes. */
  seed: number;
  /** Bosses only: the remaining share of its health, the id of the attack in progress, the phase it is in. */
  hpFrac: number;
  attackKey: string | null;
  enraged: boolean;
  /** Bosses only: the weak point is open (the simulation says so, it is not guessed from the animation). */
  exposed: boolean;
  /** Bosses only: awake. */
  awake: boolean;
}

export function createRigFrame(seed: number): RigFrame {
  return {
    t: 0, dt: 0, anim: 'idle', phase: 'none', p: 0, since: 0, vx: 0, vy: 0, heat: 0, strike: 0, hurt: 0, dying: 0, open: false, flash: 0, opacity: 1, seed,
    hpFrac: 1, attackKey: null, enraged: false, exposed: false, awake: true,
  };
}

/** The drawn creature: its parts, in one container (in centimetres, x forward, y up from the feet — the actor scales and flips it), and what to do with a frame. */
export interface RigBody {
  readonly root: Container;
  /** Poses every part for this frame. Allocates nothing. */
  update(f: RigFrame): void;
}

/** One species' drawing, and the numbers the actor needs around it. */
export interface RigDef {
  /** The id of the look it replaces (`PROCEDURAL_LOOKS` key): `cave_bat`, `boss_behemoth`… */
  id: string;
  /** The creature at rest, in metres: the size of its aura and of the contact shadow, and the box a review draws round it. */
  width: number;
  height: number;
  /** Contact shadow under the feet, cm wide (omit for a flyer). */
  shadow?: number;
  /** The halo behind it: colour, where it is centred (cm, from the feet) and how big (cm). It swells with the warning. */
  aura?: { color: number; at: readonly [number, number]; size: number; base?: number };
  /** The species animates its own death (it falls apart, melts, shatters): the actor then leaves the fade to it, and only takes the last tenth of the death to let go of it. */
  ownsDeath?: boolean;
  /** Builds one creature. Called once per enemy; the geometry is shared between all of the same species through the kit's cache. */
  build(k: Kit): RigBody;
}
