import { buildPlaceholderSet, type PlaceholderClip, type PlaceholderPose, type PlaceholderSpec } from '@/presentation/placeholder';
import type { AnchorPoint } from '@/presentation/SpriteSetDefinition';

/**
 * Pose table of the PLAYER's abstract placeholder (docs/GAME-SPEC-2D.md §2). It is NOT the protagonist: it is a grey
 * capsule with a facing notch, a hand marker and a blade line that exercises the whole sprite pipeline (states,
 * phase-driven attacks, per-frame sword anchors, swap) until the real sprites exist. Metres relative to the feet,
 * +x forward, +y up. Attack clips are 6 frames = startup [0,1] · active [2,3] · recovery [4,5].
 */

const TAU = Math.PI * 2;
const STAND = 1.7;
const CROUCH = 1.0;

const pose = (h: number, hand: AnchorPoint, angle: number, o: { w?: number; lean?: number; len?: number; y?: number } = {}): PlaceholderPose => ({
  body: { w: o.w ?? 0.62, h, x: 0, y: o.y ?? 0, lean: o.lean ?? 0 },
  hand,
  blade: { angle, length: o.len ?? 1.05 },
});

const cycle = (n: number, f: (t: number, i: number) => PlaceholderPose): PlaceholderPose[] => Array.from({ length: n }, (_, i) => f(i / n, i));

const ATTACK_PHASES = { startup: [0, 1], active: [2, 3], recovery: [4, 5] } as const;

const slash1: PlaceholderPose[] = [
  pose(1.68, [0.16, 1.18], 2.35, { lean: -0.08 }), // raise back
  pose(1.66, [0.08, 1.3], 2.75, { lean: -0.14 }), // wind-up peak
  pose(1.66, [0.58, 1.2], 0.85, { lean: 0.12 }), // active: overhead → forward
  pose(1.62, [0.8, 0.86], -0.12, { lean: 0.2, w: 0.64 }), // active: extended
  pose(1.64, [0.72, 0.62], -0.75, { lean: 0.12 }), // follow-through
  pose(1.68, [0.48, 0.8], -0.95, { lean: 0.04 }), // back to guard
];

const slash2: PlaceholderPose[] = [
  pose(1.64, [0.3, 0.9], -1.0, { lean: 0.06 }), // low back
  pose(1.62, [0.2, 0.9], -1.1),
  pose(1.64, [0.62, 0.72], -0.45, { lean: 0.14 }), // rising slash
  pose(1.66, [0.82, 1.05], 0.55, { lean: 0.18, w: 0.64 }),
  pose(1.68, [0.7, 1.22], 1.15, { lean: 0.1 }),
  pose(1.68, [0.5, 0.95], 0.1, { lean: 0.04 }),
];

const slashAir: PlaceholderPose[] = [
  pose(1.72, [0.2, 1.3], 2.5, { lean: -0.1 }),
  pose(1.72, [0.14, 1.38], 2.8, { lean: -0.14 }),
  pose(1.72, [0.6, 1.22], 0.9, { lean: 0.1 }),
  pose(1.68, [0.82, 0.88], -0.2, { lean: 0.16 }),
  pose(1.7, [0.72, 0.66], -0.8, { lean: 0.1 }),
  pose(1.72, [0.5, 0.8], -0.95, { lean: 0.04 }),
];

const slashCrouch: PlaceholderPose[] = [
  pose(CROUCH, [0.22, 0.62], 3.0, { w: 0.7, lean: 0.1 }), // pull the blade back
  pose(CROUCH, [0.14, 0.62], 3.1, { w: 0.7, lean: 0.06 }),
  pose(CROUCH, [0.62, 0.58], 0.15, { w: 0.7, lean: 0.18 }), // low thrust
  pose(CROUCH, [0.92, 0.52], 0.0, { w: 0.7, lean: 0.24 }),
  pose(CROUCH, [0.72, 0.52], -0.3, { w: 0.7, lean: 0.16 }),
  pose(CROUCH, [0.46, 0.58], -0.7, { w: 0.7, lean: 0.12 }),
];

const clip = (poses: readonly PlaceholderPose[], extra: Omit<PlaceholderClip, 'poses'> = {}): PlaceholderClip => ({ ...extra, poses });

export const PLAYER_PLACEHOLDER_SPEC: PlaceholderSpec = {
  id: 'player_placeholder',
  artPxPerMeter: 56,
  cell: { w: 3.6, h: 2.4 },
  pivot: [0.45, 0.92],
  height: STAND,
  columns: 8,
  clips: {
    idle: clip(
      [
        pose(1.7, [0.36, 0.86], -1.0),
        pose(1.69, [0.36, 0.85], -1.0),
        pose(1.67, [0.36, 0.84], -1.02),
        pose(1.69, [0.36, 0.85], -1.0),
      ],
      { fps: 5 },
    ),
    walk: clip(
      cycle(6, (t) => {
        const s = Math.sin(TAU * t);
        return pose(STAND - 0.035 * Math.abs(s), [0.38 + 0.08 * s, 0.86], -1.0 + 0.08 * s, { lean: 0.05 });
      }),
      { fps: 9 },
    ),
    run: clip(
      cycle(6, (t) => {
        const s = Math.sin(TAU * t);
        return pose(1.62 - 0.06 * Math.abs(s), [0.3 + 0.18 * s, 0.9], -0.5 + 0.2 * s, { lean: 0.2 });
      }),
      { fps: 14 },
    ),
    jump: clip([pose(1.74, [0.34, 1.0], 0.6, { lean: 0.05 }), pose(1.72, [0.32, 1.06], 0.85, { lean: 0.03 })], { fps: 8 }),
    fall: clip([pose(1.72, [0.3, 1.0], 0.9, { lean: 0.02 }), pose(STAND, [0.28, 1.08], 1.0, { lean: 0.02 })], { fps: 6 }),
    land: clip([pose(1.46, [0.4, 0.7], -0.9, { w: 0.74, lean: 0.08 }), pose(1.6, [0.38, 0.8], -1.0, { w: 0.68 })], { fps: 20 }),
    crouch: clip([pose(CROUCH, [0.4, 0.58], -0.75, { w: 0.7, lean: 0.12 }), pose(0.98, [0.4, 0.57], -0.75, { w: 0.7, lean: 0.12 })], { fps: 4 }),
    crouchWalk: clip(
      cycle(4, (t) => {
        const s = Math.sin(TAU * t);
        return pose(CROUCH - 0.03 * Math.abs(s), [0.4 + 0.06 * s, 0.58], -0.75, { w: 0.7, lean: 0.14 });
      }),
      { fps: 7 },
    ),
    dash: clip([pose(1.38, [0.62, 0.78], 2.95, { w: 0.7, lean: 0.5, len: 1.0 }), pose(1.34, [0.66, 0.74], 3.05, { w: 0.72, lean: 0.55, len: 1.0 })], { fps: 16 }),
    attack: clip(slash1, { fps: 12, phases: ATTACK_PHASES }),
    attack2: clip(slash2, { fps: 12, phases: ATTACK_PHASES }),
    attackAir: clip(slashAir, { fps: 12, phases: ATTACK_PHASES }),
    attackCrouch: clip(slashCrouch, { fps: 12, phases: ATTACK_PHASES }),
    hurt: clip([pose(1.66, [0.2, 0.9], -0.4, { lean: -0.3 }), pose(1.68, [0.24, 0.9], -0.6, { lean: -0.2 })], { fps: 10 }),
    death: clip(
      cycle(6, (_t, i) => {
        const k = i / 5; // 0 → 1: falls backwards and lies down
        const lean = -(0.2 + 1.15 * k);
        // the body pivots about its heel: lift it by the half-width so the lying body rests ON the floor
        return pose(1.7 - 0.2 * k, [0.3 - 0.35 * k, 0.85 - 0.75 * k], -0.9 + 0.8 * k, { lean, y: 0.31 * Math.sin(-lean) });
      }),
      { fps: 8 },
    ),
  },
};

const BUILT = buildPlaceholderSet(PLAYER_PLACEHOLDER_SPEC);

/**
 * Definition + per-frame anchors + atlas layout, built once (pure).
 *
 * The states Prompt 5 added get their OWN clip (so playing them never falls back, which logs a warning each time) without a
 * single new frame: `cast` is the rising slash's sword poses, phase-driven like an attack (preparation · release · recovery).
 * The placeholder stays what it was — a capsule and a sword; no new character art is invented.
 */
export const PLAYER_PLACEHOLDER = {
  ...BUILT,
  def: { ...BUILT.def, clips: { ...BUILT.def.clips, cast: BUILT.def.clips.attack2! } },
};
