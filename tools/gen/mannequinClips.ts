import { mirror, mix, pose, type Pose } from './poseDsl';
import type { MannequinClipDef } from './mannequin';

/**
 * Placeholder animation set for the mannequin. The camera sees the character from the SIDE, so every pose
 * is authored for side readability: forward/back swing (rx), torso lean and exaggerated silhouettes matter
 * far more than lateral spread. Replace by pointing `ModelDefinition.clips` at the final clips.
 *
 * Remember: thigh/arm forward = −rx · knee flex = +rx · elbow flex = −rx · lean forward = +rx · +ry = turn left.
 */

// --------------------------------------------------------------------------------------------- stances

/** Combat-ready stance, knees soft, hands up. Base for most ground clips. */
const READY = pose({
  spine: [7, 0, 0], chest: [3, 0, 0], neck: [-3, 0, 0], head: [-6, 0, 0],
  upLeg_L: [-18, 0, 2], leg_L: [28, 0, 0], foot_L: [-10, 0, 0],
  upLeg_R: [12, 0, -2], leg_R: [22, 0, 0], foot_R: [-8, 0, 0],
  upperArm_L: [-16, 0, 5], forearm_L: [-50, 0, 0],
  upperArm_R: [-22, 0, -5], forearm_R: [-62, 0, 0],
});

const READY_BREATH = mix(
  READY,
  pose({ spine: [8.5, 0, 0], chest: [6, 0, 0], head: [-8, 0, 0], upperArm_L: [-18, 0, 6], upperArm_R: [-24, 0, -6] }),
);

// ----------------------------------------------------------------------------------------- locomotion

const WALK_0 = pose({
  hips: [0, -5, 0], spine: [3, 4, 0], chest: [2, 6, 0], head: [-3, -5, 0],
  upLeg_L: [-27, 0, 0], leg_L: [6, 0, 0], foot_L: [-12, 0, 0],
  upLeg_R: [18, 0, 0], leg_R: [30, 0, 0], foot_R: [14, 0, 0],
  upperArm_L: [22, 0, 3], forearm_L: [-26, 0, 0],
  upperArm_R: [-26, 0, -3], forearm_R: [-42, 0, 0],
});
const WALK_1 = pose({
  hips: [0, 0, 0], spine: [3, 0, 0], chest: [2, 0, 0], head: [-3, 0, 0],
  upLeg_L: [-2, 0, 0], leg_L: [8, 0, 0], foot_L: [-6, 0, 0],
  upLeg_R: [-8, 0, 0], leg_R: [50, 0, 0], foot_R: [10, 0, 0],
  upperArm_L: [4, 0, 3], forearm_L: [-30, 0, 0],
  upperArm_R: [-6, 0, -3], forearm_R: [-34, 0, 0],
});

const RUN_0 = pose(
  {
    hips: [0, -7, 0], spine: [14, 5, 0], chest: [10, 9, 0], neck: [-6, 0, 0], head: [-14, -9, 0],
    upLeg_L: [-46, 0, 0], leg_L: [14, 0, 0], foot_L: [-14, 0, 0],
    upLeg_R: [34, 0, 0], leg_R: [62, 0, 0], foot_R: [28, 0, 0],
    upperArm_L: [42, 0, 4], forearm_L: [-78, 0, 0],
    upperArm_R: [-48, 0, -4], forearm_R: [-92, 0, 0],
  },
  { hips: [0, -0.03, 0] },
);
const RUN_1 = pose(
  {
    hips: [0, 0, 0], spine: [14, 0, 0], chest: [10, 0, 0], neck: [-6, 0, 0], head: [-14, 0, 0],
    upLeg_L: [-8, 0, 0], leg_L: [16, 0, 0], foot_L: [8, 0, 0],
    upLeg_R: [-30, 0, 0], leg_R: [112, 0, 0], foot_R: [22, 0, 0],
    upperArm_L: [14, 0, 4], forearm_L: [-78, 0, 0],
    upperArm_R: [-14, 0, -4], forearm_R: [-90, 0, 0],
  },
  { hips: [0, 0.06, 0] },
);

// ------------------------------------------------------------------------------------------- airborne

const JUMP_CROUCH = pose(
  {
    spine: [20, 0, 0], chest: [10, 0, 0], head: [-14, 0, 0],
    upLeg_L: [-62, 0, 1], leg_L: [100, 0, 0], foot_L: [-36, 0, 0],
    upLeg_R: [-58, 0, -1], leg_R: [96, 0, 0], foot_R: [-34, 0, 0],
    upperArm_L: [26, 0, 6], forearm_L: [-30, 0, 0],
    upperArm_R: [24, 0, -6], forearm_R: [-30, 0, 0],
  },
  { hips: [0, -0.12, 0] },
);
const JUMP_EXTEND = pose(
  {
    spine: [-6, 0, 0], chest: [-4, 0, 0], head: [-8, 0, 0],
    upLeg_L: [-8, 0, 1], leg_L: [10, 0, 0], foot_L: [24, 0, 0],
    upLeg_R: [6, 0, -1], leg_R: [14, 0, 0], foot_R: [26, 0, 0],
    upperArm_L: [-150, 0, 14], forearm_L: [-14, 0, 0],
    upperArm_R: [-146, 0, -14], forearm_R: [-14, 0, 0],
  },
  { hips: [0, 0.02, 0] },
);
const JUMP_RISE = pose({
  spine: [4, 0, 0], chest: [0, 0, 0], head: [-10, 0, 0],
  upLeg_L: [-44, 0, 1], leg_L: [66, 0, 0], foot_L: [14, 0, 0],
  upLeg_R: [-10, 0, -1], leg_R: [40, 0, 0], foot_R: [22, 0, 0],
  upperArm_L: [-118, 0, 16], forearm_L: [-30, 0, 0],
  upperArm_R: [-100, 0, -16], forearm_R: [-36, 0, 0],
});

const FALL_A = pose({
  spine: [-2, 0, 0], chest: [-4, 0, 0], head: [-8, 0, 0],
  upLeg_L: [-24, 0, 2], leg_L: [46, 0, 0], foot_L: [18, 0, 0],
  upLeg_R: [14, 0, -2], leg_R: [28, 0, 0], foot_R: [26, 0, 0],
  upperArm_L: [-136, 0, 20], forearm_L: [-18, 0, 0],
  upperArm_R: [-122, 0, -20], forearm_R: [-26, 0, 0],
});
const FALL_B = mix(
  FALL_A,
  pose({
    upLeg_L: [12, 0, 2], leg_L: [28, 0, 0], upLeg_R: [-26, 0, -2], leg_R: [48, 0, 0],
    upperArm_L: [-122, 0, 22], upperArm_R: [-138, 0, -22],
  }),
);

const LAND_CROUCH = pose({
  spine: [26, 0, 0], chest: [12, 0, 0], neck: [-6, 0, 0], head: [-18, 0, 0],
  upLeg_L: [-70, 0, 2], leg_L: [112, 0, 0], foot_L: [-42, 0, 0],
  upLeg_R: [-64, 0, -2], leg_R: [106, 0, 0], foot_R: [-40, 0, 0],
  upperArm_L: [-36, 0, 14], forearm_L: [-30, 0, 0],
  upperArm_R: [-34, 0, -14], forearm_R: [-34, 0, 0],
});

// ---------------------------------------------------------------------------------------------- combat

const ATK_WINDUP = pose({
  hips: [0, -10, 0], spine: [4, -14, 0], chest: [0, -32, 0], neck: [0, 10, 0], head: [-6, 22, 0],
  upLeg_L: [-14, 0, 3], leg_L: [24, 0, 0], foot_L: [-8, 0, 0],
  upLeg_R: [26, 0, -3], leg_R: [20, 0, 0], foot_R: [16, 0, 0],
  upperArm_L: [-30, 0, 8], forearm_L: [-60, 0, 0],
  upperArm_R: [-168, 0, -24], forearm_R: [-70, 0, 0],
});
const ATK_STRIKE = pose({
  hips: [0, 18, 0], spine: [20, 10, 0], chest: [10, 36, 0], neck: [0, -10, 0], head: [-10, -26, 0],
  upLeg_L: [-46, 0, 3], leg_L: [34, 0, 0], foot_L: [-6, 0, 0],
  upLeg_R: [30, 0, -3], leg_R: [14, 0, 0], foot_R: [22, 0, 0],
  upperArm_L: [26, 0, 12], forearm_L: [-40, 0, 0],
  upperArm_R: [-82, 0, -8], forearm_R: [-8, 0, 0],
});
const ATK_FOLLOW = mix(
  ATK_STRIKE,
  pose({
    hips: [0, 26, 0], spine: [24, 14, 0], chest: [12, 44, 0], head: [-12, -34, 0],
    upperArm_R: [-34, 0, -14], forearm_R: [-12, 0, 0],
  }),
);

const ATK2_WINDUP = pose({
  hips: [0, 14, 0], spine: [10, 12, 0], chest: [4, 34, 0], neck: [0, -8, 0], head: [-6, -22, 0],
  upLeg_L: [20, 0, 3], leg_L: [28, 0, 0], foot_L: [16, 0, 0],
  upLeg_R: [-20, 0, -3], leg_R: [26, 0, 0], foot_R: [-8, 0, 0],
  upperArm_L: [58, 0, 14], forearm_L: [-26, 0, 0],
  upperArm_R: [-26, 0, -8], forearm_R: [-70, 0, 0],
});
const ATK2_STRIKE = pose({
  hips: [0, -20, 0], spine: [6, -8, 0], chest: [-4, -40, 0], neck: [0, 12, 0], head: [-4, 28, 0],
  upLeg_L: [18, 0, 3], leg_L: [20, 0, 0], foot_L: [22, 0, 0],
  upLeg_R: [-52, 0, -3], leg_R: [40, 0, 0], foot_R: [-4, 0, 0],
  upperArm_L: [-124, 0, 10], forearm_L: [-10, 0, 0],
  upperArm_R: [10, 0, -14], forearm_R: [-50, 0, 0],
});
const ATK2_FOLLOW = mix(
  ATK2_STRIKE,
  pose({ hips: [0, -28, 0], chest: [-6, -50, 0], head: [-6, 38, 0], upperArm_L: [-150, 0, 12] }),
);

const ATK_AIR_WINDUP = mix(ATK_WINDUP, pose({
  upLeg_L: [-34, 0, 2], leg_L: [64, 0, 0], foot_L: [12, 0, 0],
  upLeg_R: [-6, 0, -2], leg_R: [48, 0, 0], foot_R: [20, 0, 0],
}));
const ATK_AIR_STRIKE = mix(ATK_STRIKE, pose({
  upLeg_L: [-52, 0, 2], leg_L: [70, 0, 0], foot_L: [10, 0, 0],
  upLeg_R: [-14, 0, -2], leg_R: [52, 0, 0], foot_R: [20, 0, 0],
}));

const DASH_START = pose(
  {
    spine: [26, 0, 0], chest: [14, 0, 0], head: [-18, 0, 0],
    upLeg_L: [-52, 0, 1], leg_L: [70, 0, 0], foot_L: [-14, 0, 0],
    upLeg_R: [34, 0, -1], leg_R: [60, 0, 0], foot_R: [26, 0, 0],
    upperArm_L: [30, 0, 4], forearm_L: [-40, 0, 0],
    upperArm_R: [36, 0, -4], forearm_R: [-40, 0, 0],
  },
  { hips: [0, -0.18, 0] },
);
const DASH_FULL = pose(
  {
    hips: [-22, 0, 0], spine: [34, 0, 0], chest: [18, 0, 0], neck: [-6, 0, 0], head: [-34, 0, 0],
    upLeg_L: [-58, 0, 1], leg_L: [64, 0, 0], foot_L: [-6, 0, 0],
    upLeg_R: [44, 0, -1], leg_R: [74, 0, 0], foot_R: [34, 0, 0],
    upperArm_L: [74, 0, 6], forearm_L: [-18, 0, 0],
    upperArm_R: [82, 0, -6], forearm_R: [-14, 0, 0],
  },
  { hips: [0, -0.3, 0.05] },
);

const HURT_PEAK = pose(
  {
    hips: [6, 0, 0], spine: [-24, 0, 0], chest: [-12, 0, 0], neck: [-8, 0, 0], head: [-26, 0, 0],
    upLeg_L: [-34, 0, 2], leg_L: [44, 0, 0], foot_L: [-6, 0, 0],
    upLeg_R: [18, 0, -2], leg_R: [30, 0, 0], foot_R: [14, 0, 0],
    upperArm_L: [-56, 0, 22], forearm_L: [-26, 0, 0],
    upperArm_R: [-38, 0, -22], forearm_R: [-34, 0, 0],
  },
  { hips: [0, -0.04, -0.14] },
);

const DEATH_KNEEL = pose(
  {
    hips: [4, 0, 0], spine: [-6, 0, 0], chest: [-4, 0, 0], head: [-14, 0, 0],
    upLeg_L: [-92, 0, 4], leg_L: [128, 0, 0], foot_L: [-34, 0, 0],
    upLeg_R: [-50, 0, -4], leg_R: [92, 0, 0], foot_R: [10, 0, 0],
    upperArm_L: [-18, 0, 20], forearm_L: [-20, 0, 0],
    upperArm_R: [-6, 0, -20], forearm_R: [-24, 0, 0],
  },
  { hips: [0, -0.46, -0.1] },
);
const DEATH_DOWN = pose(
  {
    hips: [-90, 0, 0], spine: [-4, 0, 0], chest: [-2, 0, 0], head: [-14, 0, 0],
    upLeg_L: [64, 0, 6], leg_L: [14, 0, 0], foot_L: [14, 0, 0],
    upLeg_R: [74, 0, -6], leg_R: [20, 0, 0], foot_R: [10, 0, 0],
    upperArm_L: [-12, 0, 52], forearm_L: [-10, 0, 0],
    upperArm_R: [10, 0, -48], forearm_R: [-14, 0, 0],
  },
  { hips: [0, -0.84, -0.12] },
);

// ------------------------------------------------------------------------------------------------ clips

export const MANNEQUIN_CLIPS: MannequinClipDef[] = [
  {
    name: 'Idle', duration: 2.4, loop: true, ground: true,
    keys: [{ t: 0, pose: READY }, { t: 1.2, pose: READY_BREATH }],
  },
  {
    name: 'Walk', duration: 0.95, loop: true, ground: true,
    keys: [
      { t: 0, pose: WALK_0 },
      { t: 0.2375, pose: WALK_1 },
      { t: 0.475, pose: mirror(WALK_0) },
      { t: 0.7125, pose: mirror(WALK_1) },
    ],
  },
  {
    name: 'Run', duration: 0.62, loop: true,
    keys: [
      { t: 0, pose: RUN_0, ease: 'inOut' },
      { t: 0.155, pose: RUN_1, ease: 'out' },
      { t: 0.31, pose: mirror(RUN_0), ease: 'in' },
      { t: 0.465, pose: mirror(RUN_1), ease: 'out' },
    ],
  },
  {
    name: 'Jump', duration: 0.4, loop: false,
    keys: [
      { t: 0, pose: JUMP_CROUCH },
      { t: 0.07, pose: JUMP_EXTEND, ease: 'out' },
      { t: 0.4, pose: JUMP_RISE, ease: 'out' },
    ],
  },
  {
    name: 'Fall', duration: 0.5, loop: true,
    keys: [{ t: 0, pose: FALL_A }, { t: 0.25, pose: FALL_B }],
  },
  {
    name: 'Land', duration: 0.26, loop: false, ground: true,
    keys: [
      { t: 0, pose: LAND_CROUCH, ease: 'out' },
      { t: 0.1, pose: LAND_CROUCH },
      { t: 0.26, pose: READY, ease: 'inOut' },
    ],
  },
  {
    name: 'Attack', duration: 0.42, loop: false, ground: true,
    keys: [
      { t: 0, pose: READY },
      { t: 0.07, pose: ATK_WINDUP, ease: 'out' },
      { t: 0.12, pose: ATK_STRIKE, ease: 'in' },
      { t: 0.19, pose: ATK_FOLLOW, ease: 'back' },
      { t: 0.42, pose: READY, ease: 'inOut' },
    ],
  },
  {
    name: 'Attack2', duration: 0.46, loop: false, ground: true,
    keys: [
      { t: 0, pose: ATK_FOLLOW },
      { t: 0.08, pose: ATK2_WINDUP, ease: 'out' },
      { t: 0.14, pose: ATK2_STRIKE, ease: 'in' },
      { t: 0.22, pose: ATK2_FOLLOW, ease: 'back' },
      { t: 0.46, pose: READY, ease: 'inOut' },
    ],
  },
  {
    name: 'AttackAir', duration: 0.4, loop: false,
    keys: [
      { t: 0, pose: JUMP_RISE },
      { t: 0.07, pose: ATK_AIR_WINDUP, ease: 'out' },
      { t: 0.12, pose: ATK_AIR_STRIKE, ease: 'in' },
      { t: 0.4, pose: FALL_A, ease: 'inOut' },
    ],
  },
  {
    name: 'Dash', duration: 0.22, loop: false,
    keys: [
      { t: 0, pose: DASH_START, ease: 'out' },
      { t: 0.05, pose: DASH_FULL, ease: 'out' },
    ],
  },
  {
    name: 'Hurt', duration: 0.34, loop: false,
    keys: [
      { t: 0, pose: READY },
      { t: 0.05, pose: HURT_PEAK, ease: 'out' },
      { t: 0.34, pose: READY, ease: 'inOut' },
    ],
  },
  {
    name: 'Death', duration: 1.15, loop: false,
    keys: [
      { t: 0, pose: READY },
      { t: 0.1, pose: HURT_PEAK, ease: 'out' },
      { t: 0.42, pose: DEATH_KNEEL, ease: 'inOut' },
      { t: 0.95, pose: DEATH_DOWN, ease: 'in' },
      { t: 1.15, pose: DEATH_DOWN, ease: 'out' },
    ],
  },
];

export type { Pose };
