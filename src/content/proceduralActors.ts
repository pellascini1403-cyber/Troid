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

// ---------------------------------------------------------------------------------------------------- the creatures of the world

type Colors = ProceduralLook['colors'];
const colors = (fill: number, rim: number, sheen: number, aura: number, eyeGlow: number = PALETTE.violetGlow): Colors => ({ fill, rim, sheen, eye: PALETTE.enemyEye, eyeGlow, aura, flash: PALETTE.whiteHot });

/** How a creature winds up: `squash` flattens and widens (it will spring), `rise` stands tall (it will drop or swing), `swell` grows (it will burst). */
type Windup = 'squash' | 'rise' | 'swell';

/**
 * A look for a creature of the world, made of the knobs that tell one from another — its size, its colours, its eyes, how it winds up — over the poses that every creature shares (a breath, a walk, a start, a hurt, a
 * dissolving): the same vocabulary of states the brains publish, so each state reads the same way on every body.
 */
function creature(o: { id: string; width: number; height: number; colors: Colors; eyes: ProceduralLook['eyes']; windup: Windup; shape?: 'dome' | 'orb'; spikes?: number; wobble?: number }): ProceduralLook {
  const [wx, wy, ax, ay]: [number, number, number, number] = o.windup === 'squash' ? [1.32, 0.58, 1.5, 0.66] : o.windup === 'rise' ? [0.84, 1.34, 0.78, 1.5] : [1.5, 1.5, 1.8, 1.8];
  const w = o.wobble ?? 1;
  return {
    id: o.id,
    width: o.width,
    height: o.height,
    ...(o.shape ? { shape: o.shape } : {}),
    ...(o.spikes ? { spikes: o.spikes } : {}),
    colors: o.colors,
    eyes: o.eyes,
    poses: {
      idle: { scaleX: [1, 1], scaleY: [1, 1], eyeGlow: [0.3, 0.3], wobble: { amp: 0.035 * w, hz: 0.6 } },
      walk: { scaleX: [1.05, 1.05], scaleY: [0.95, 0.95], eyeGlow: [0.4, 0.4], wobble: { amp: 0.07 * w, hz: 1.5 } },
      run: { scaleX: [1.12, 1.12], scaleY: [0.9, 0.9], lean: [0.12, 0.12], eyeGlow: [0.6, 0.6], wobble: { amp: 0.06 * w, hz: 3.2 } },
      alert: { scaleX: [0.92, 1], scaleY: [1.2, 1], eyeGlow: [1.3, 0.7], aura: [0.35, 0], ease: 'out' },
      telegraph: { scaleX: [1, wx], scaleY: [1, wy], eyeGlow: [0.5, 1.7], aura: [0, 0.95], auraScale: [1, 1.6], ease: 'in', tremble: 0.025 },
      attack: { scaleX: [ax, (ax + 1) / 2 + 0.1], scaleY: [ay, (ay + 1) / 2 - 0.05], lean: [0.28, 0.2], eyeGlow: [1.7, 1.4], aura: [0.8, 0.3], auraScale: [1.6, 1.3], ease: 'out' },
      hurt: { scaleX: [1.25, 1], scaleY: [0.76, 1], lean: [-0.2, 0], eyeGlow: [0.15, 0.3], squint: [1, 0.2], ease: 'out' },
      // stunned, landed: flat on the ground, the eyes dim
      land: { scaleX: [1.4, 1.2], scaleY: [0.6, 0.78], eyeGlow: [0.2, 0.3], squint: [0.6, 0.3], ease: 'out' },
      // asleep as a puddle / sinking into one
      crouch: { scaleX: [1.5, 1.6], scaleY: [0.2, 0.14], eyeGlow: [0.1, 0.1], squint: [1, 1] },
      death: { scaleX: [1, 1.7], scaleY: [1, 0.08], eyeGlow: [0.5, 0], squint: [0.2, 1], ease: 'out' },
    },
    phases: { recovery: { scaleX: [1.2, 1], scaleY: [0.78, 1], eyeGlow: [0.2, 0.3], ease: 'out' } },
  };
}

const EYES = { width: 0.15, height: 0.24, y: 0.6, forward: 0.14, spread: 0.3 };

// the colours say where a creature lives: stone and salt for the ruins, wet green-black for the mire, glass for the mines, brass for the spire, iron and red for the foundry — all over the same ink
export const BRAMBLE_CRAWLER_LOOK = creature({ id: 'bramble_crawler', width: 1.1, height: 0.7, colors: colors(PALETTE.enemyInk, PALETTE.worldGlow, PALETTE.worldSlate, PALETTE.violetCore), eyes: { ...EYES, y: 0.55, forward: 0.2, spread: 0.26 }, windup: 'squash', spikes: 5 });
export const MIRE_TOAD_LOOK = creature({ id: 'mire_toad', width: 1.2, height: 0.9, colors: colors(PALETTE.worldNight, PALETTE.violetGlow, PALETTE.worldSlate, PALETTE.violetCore), eyes: { width: 0.2, height: 0.2, y: 0.78, forward: 0.12, spread: 0.55 }, windup: 'squash', wobble: 1.6 });
export const STONEBACK_LOOK = creature({ id: 'stoneback', width: 1.4, height: 1.4, colors: colors(PALETTE.worldSlate, PALETTE.worldGlow, PALETTE.worldHaze, PALETTE.violetGlow), eyes: { ...EYES, y: 0.5, forward: 0.2, spread: 0.2 }, windup: 'rise', spikes: 3, wobble: 0.4 });
export const GLOW_SPORE_LOOK = creature({ id: 'glow_spore', width: 0.9, height: 1.1, colors: colors(PALETTE.worldDeep, PALETTE.violetGlow, PALETTE.violetCore, PALETTE.violetGlow, PALETTE.whiteHot), eyes: { width: 0.12, height: 0.12, y: 0.7, forward: 0, spread: 0.3 }, windup: 'swell', wobble: 1.4 });
export const INK_SPITTER_LOOK = creature({ id: 'ink_spitter', width: 0.9, height: 1.2, colors: colors(PALETTE.enemyInk, PALETTE.violetCore, PALETTE.violetDeep, PALETTE.violetCore), eyes: { ...EYES, y: 0.72, forward: 0.22 }, windup: 'rise' });
export const CAVE_BAT_LOOK = creature({ id: 'cave_bat', width: 0.9, height: 0.55, colors: colors(PALETTE.worldVoid, PALETTE.violetDeep, PALETTE.worldDeep, PALETTE.violetCore), eyes: { width: 0.1, height: 0.12, y: 0.6, forward: 0.18, spread: 0.3 }, windup: 'swell', shape: 'orb', wobble: 2.4 });
export const LANTERN_WISP_LOOK = creature({ id: 'lantern_wisp', width: 0.7, height: 0.7, colors: colors(PALETTE.violetGlow, PALETTE.whiteHot, PALETTE.whiteHot, PALETTE.violetCore, PALETTE.violetDeep), eyes: { width: 0.1, height: 0.1, y: 0.55, forward: 0.1, spread: 0.3 }, windup: 'swell', shape: 'orb', wobble: 3 });
export const BELL_TOLLER_LOOK = creature({ id: 'bell_toller', width: 1.2, height: 1.8, colors: colors(PALETTE.worldMist, PALETTE.worldHaze, PALETTE.worldGlow, PALETTE.violetGlow), eyes: { width: 0.14, height: 0.2, y: 0.4, forward: 0, spread: 0.32 }, windup: 'rise', wobble: 0.5 });
export const SHARDLING_LOOK = creature({ id: 'shardling', width: 1.2, height: 0.9, colors: colors(PALETTE.worldHaze, PALETTE.whiteHot, PALETTE.worldGlow, PALETTE.violetGlow), eyes: { ...EYES, y: 0.6, forward: 0.2 }, windup: 'squash', spikes: 6, wobble: 0.5 });
export const CRYSTAL_SHARD_LOOK = creature({ id: 'crystal_shard', width: 0.6, height: 0.45, colors: colors(PALETTE.worldGlow, PALETTE.whiteHot, PALETTE.whiteHot, PALETTE.violetGlow), eyes: { width: 0.08, height: 0.12, y: 0.55, forward: 0.2, spread: 0.3 }, windup: 'squash', spikes: 3 });
export const PISTON_DRONE_LOOK = creature({ id: 'piston_drone', width: 1.2, height: 1.0, colors: colors(PALETTE.worldDusk, PALETTE.accentWarm, PALETTE.worldSlate, PALETTE.accentWarm, PALETTE.accentWarm), eyes: { width: 0.2, height: 0.1, y: 0.5, forward: 0, spread: 0.25 }, windup: 'rise', shape: 'orb', wobble: 0.5 });
export const FLOOR_LEECH_LOOK = creature({ id: 'floor_leech', width: 1.2, height: 0.55, colors: colors(PALETTE.enemyInk, PALETTE.violetDeep, PALETTE.violetDeep, PALETTE.violetCore), eyes: { width: 0.12, height: 0.16, y: 0.6, forward: 0.3, spread: 0.3 }, windup: 'rise', wobble: 1.3 });
export const INK_WEAVER_LOOK = creature({ id: 'ink_weaver', width: 1.0, height: 1.6, colors: colors(PALETTE.worldDeep, PALETTE.violetGlow, PALETTE.violetCore, PALETTE.violetCore), eyes: { ...EYES, y: 0.78, forward: 0.1, spread: 0.36 }, windup: 'swell', wobble: 1.2 });
export const VEIL_SHADE_LOOK = creature({ id: 'veil_shade', width: 0.9, height: 1.7, colors: colors(PALETTE.worldVoid, PALETTE.violetCore, PALETTE.violetDeep, PALETTE.violetCore), eyes: { width: 0.12, height: 0.3, y: 0.78, forward: 0.2, spread: 0.3 }, windup: 'rise', wobble: 1.8 });

export const PROCEDURAL_LOOKS: Readonly<Record<string, ProceduralLook>> = {
  [INK_SLIME_LOOK.id]: INK_SLIME_LOOK,
  ...Object.fromEntries(
    [BRAMBLE_CRAWLER_LOOK, MIRE_TOAD_LOOK, STONEBACK_LOOK, GLOW_SPORE_LOOK, INK_SPITTER_LOOK, CAVE_BAT_LOOK, LANTERN_WISP_LOOK, BELL_TOLLER_LOOK, SHARDLING_LOOK, CRYSTAL_SHARD_LOOK, PISTON_DRONE_LOOK, FLOOR_LEECH_LOOK, INK_WEAVER_LOOK, VEIL_SHADE_LOOK].map((l) => [l.id, l]),
  ),
};
