import { PALETTE } from '@/presentation/palette';
import type { ProceduralLook } from '@/presentation/proceduralPose';

/**
 * Procedural looks: creatures drawn from shapes and deformed by their state (docs/ARCHITECTURE-2D.md §7.5), no art.
 * The Ink Slime is a low blob of black ink with a violet rim, two white eyes and a violet aura that only wakes up when
 * it is about to strike (docs/GAME-SPEC-2D.md §3.4, §15.1). Colours come from palette tokens, never from hex here.
 *
 * Every pose is `[from, to]` over the progress of its state, so the squash that BUILDS during the 24-tick wind-up is
 * what the player reads: the body flattens and widens, the eyes go white-hot, the aura grows. Retune by looking.
 */

export const INK_SLIME_LOOK: ProceduralLook = {
  id: 'ink_slime',
  width: 1.1,
  height: 0.9,
  colors: {
    fill: PALETTE.enemyInk,
    rim: PALETTE.violetDeep,
    sheen: PALETTE.violetDeep,
    eye: PALETTE.enemyEye,
    eyeGlow: PALETTE.violetGlow,
    aura: PALETTE.violetCore,
    flash: PALETTE.whiteHot,
  },
  eyes: { width: 0.15, height: 0.24, y: 0.6, forward: 0.14, spread: 0.3 },
  poses: {
    // resting: a slow breath, dim eyes
    idle: { scaleX: [1, 1], scaleY: [1, 1], eyeGlow: [0.3, 0.3], wobble: { amp: 0.035, hz: 0.6 } },
    // patrol: a lazy wobble as it slides
    walk: { scaleX: [1.05, 1.05], scaleY: [0.95, 0.95], eyeGlow: [0.4, 0.4], wobble: { amp: 0.07, hz: 1.5 } },
    // chase: low, long and fast, leaning forward
    run: { scaleX: [1.13, 1.13], scaleY: [0.89, 0.89], lean: [0.12, 0.12], eyeGlow: [0.6, 0.6], wobble: { amp: 0.06, hz: 3.2 } },
    // "I saw you": pops up, eyes flare
    alert: { scaleX: [0.9, 1], scaleY: [1.22, 1], eyeGlow: [1.3, 0.7], aura: [0.35, 0], ease: 'out' },
    // the warning: squashes and widens, the eyes go white-hot, the violet aura grows, a held tremble
    telegraph: {
      scaleX: [1, 1.32], scaleY: [1, 0.58], eyeGlow: [0.5, 1.7], aura: [0, 0.95], auraScale: [1, 1.6], ease: 'in', tremble: 0.025,
    },
    // the lunge: stretched long and flat
    attack: { scaleX: [1.55, 1.28], scaleY: [0.66, 0.84], lean: [0.28, 0.2], eyeGlow: [1.7, 1.4], aura: [0.8, 0.3], auraScale: [1.6, 1.3], ease: 'out' },
    hurt: { scaleX: [1.28, 1], scaleY: [0.74, 1], lean: [-0.22, 0], eyeGlow: [0.15, 0.3], squint: [1, 0.2], ease: 'out' },
    // it comes apart: spreads flat into a puddle of ink
    death: { scaleX: [1, 1.75], scaleY: [1, 0.07], eyeGlow: [0.5, 0], squint: [0.2, 1], ease: 'out' },
  },
  phases: {
    // spent after the lunge: slumped, eyes dim, recovering its shape over the 36 ticks of the punish window
    recovery: { scaleX: [1.22, 1], scaleY: [0.76, 1], eyeGlow: [0.2, 0.3], ease: 'out' },
  },
};

export const PROCEDURAL_LOOKS: Readonly<Record<string, ProceduralLook>> = {
  [INK_SLIME_LOOK.id]: INK_SLIME_LOOK,
};
