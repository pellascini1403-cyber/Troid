import { clamp01, easeInOutCubic, easeOutCubic, lerp } from '@/core/math';
import type { AnimPhase, AnimState } from './vocabulary';

/**
 * WHAT THE SECOND BLOW ADDS TO THE FRAMES THE HERO ALREADY HAS (docs/PROMPT25-LOG.md, P2-1). The second blow of the combo had its own clip, its own arc of light, more hit-stop, more shake and more push — and still read as the same
 * thrust twice: its clip is the first one with the sword pushed forward, so on screen the BODY did the same thing both times, and the first blow has a step forward of its own (`lunge`, in the simulation) that the second has not.
 * This is the body's share, drawn and not simulated: a coil, a drive and a settling of the picture the hero already is — a shift along his facing, a lean about the feet and a squash and stretch — so that the first blow is a cut
 * and the second is the blow that carries the weight. Nothing is drawn that was not drawn: the frames, the proportions and the colours are the approved ones, only moved.
 *
 * It is a pure function of what the simulation already says (`anim`, `phase`, how far through the phase it is): the same tick gives the same accent, the simulation does not know it exists and no hitbox, hurtbox, collision
 * body or anchor of the hero moves by a hair (a few centimetres of picture against a hitbox 1,6 m wide, and the first blow's own step forward is 20 cm). Only the second blow has one: every other state of the hero returns the identity, exactly.
 */
export interface SwingAccent {
  /** Metres the picture is carried along the way the hero faces (+ forward, − pulled back). */
  shift: number;
  /** Radians the picture tips about the feet (+ forward, toward the facing, − back). */
  lean: number;
  /** Width and height of the picture as multiples of the frame's own (about the feet). */
  stretchX: number;
  stretchY: number;
}

export function createSwingAccent(): SwingAccent {
  return { shift: 0, lean: 0, stretchX: 1, stretchY: 1 };
}

/** The body at rest (the identity), at the end of the wind-up (coiled back) and at the end of the blow (driven forward). */
const REST: Readonly<SwingAccent> = { shift: 0, lean: 0, stretchX: 1, stretchY: 1 };
const COIL: Readonly<SwingAccent> = { shift: -0.05, lean: -0.06, stretchX: 0.96, stretchY: 1.03 };
const DRIVE: Readonly<SwingAccent> = { shift: 0.14, lean: 0.12, stretchX: 1.06, stretchY: 0.97 };

/** Fast at the start and gentler than the cubic at the end: the drive of the blow reaches most of its travel in the first tick of its phase and the rest in the next two, not all of it at once. */
const easeOutQuad = (t: number): number => t * (2 - t);

/** The bounds of the accent: the tests hold every state of the blow to them, so nobody makes it look like something else by turning a number up. */
export const SWING_LIMITS = { shift: 0.16, lean: 0.14, stretch: 0.08 } as const;

function between(a: Readonly<SwingAccent>, b: Readonly<SwingAccent>, t: number, out: SwingAccent): SwingAccent {
  out.shift = lerp(a.shift, b.shift, t);
  out.lean = lerp(a.lean, b.lean, t);
  out.stretchX = lerp(a.stretchX, b.stretchX, t);
  out.stretchY = lerp(a.stretchY, b.stretchY, t);
  return out;
}

/**
 * Writes into `out` the accent of the hero's picture for this state. Outside the second blow it is the identity; inside it, the three parts of the blow (the clip's own phases):
 *  - `startup`  the coil: the hero gathers back (easing out: the gathering is quick);
 *  - `active`   the drive: the body goes through the blow, forward and stretched (easing out: it is the fast part, and the clip's three ticks of it carry about 55 %, 33 % and 11 % of the travel);
 *  - `recovery` the weight settles: held at first and then let go (easing in and out), so the blow has its follow-through.
 */
export function swingAccent(anim: AnimState, phase: AnimPhase, phaseT: number, out: SwingAccent = createSwingAccent()): SwingAccent {
  if (anim !== 'attack2') return between(REST, REST, 0, out);
  const t = clamp01(phaseT);
  switch (phase) {
    case 'startup':
      return between(REST, COIL, easeOutCubic(t), out);
    case 'active':
      return between(COIL, DRIVE, easeOutQuad(t), out);
    case 'recovery':
      return between(DRIVE, REST, easeInOutCubic(t), out);
    default:
      return between(REST, REST, 0, out);
  }
}

/** True when the accent moves the picture at all (the sprite writes its transform only then, and once more when it stops). */
export function isAccented(a: Readonly<SwingAccent>): boolean {
  return a.shift !== 0 || a.lean !== 0 || a.stretchX !== 1 || a.stretchY !== 1;
}
