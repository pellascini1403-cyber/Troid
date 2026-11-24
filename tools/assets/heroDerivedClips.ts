import type { FrameOp } from './heroDerive';

/**
 * THE SIX CLIPS THE SHEET HAS NO DRAWING FOR, as recipes (docs/PROMPT24-LOG.md, F5): which of the owner's frames each frame is made from and what is done to it (`heroDerive.ts`). The timings, the loops and the phases are the ones the production kit
 * asked for (`art/player/requests/requests.json`), which the simulation's own durations hold the clips to (`tests/integration/heroContinuity.test.ts`).
 */
export interface DerivedClip {
  fps: number;
  loop: boolean;
  phases?: Record<string, [number, number]>;
  tags: string[];
  /** One line for the manifest: what it is made of. */
  comment: string;
  frames: readonly FrameOp[];
  /** Whether the clip carries the sword's anchors (a blow). */
  sword: boolean;
}

/** Where the eye is for the low blow (canvas y): about as low as the owner's own crouched drawing, the blade near the floor. */
const LOW = 150;

// the vial and the arm that holds it, relative to the eye (px; +x forward, +y down)
const SHOULDER = { x: -8, y: 40 };

export const DERIVED_CLIPS: Readonly<Record<string, DerivedClip>> = {
  attack2: {
    fps: 28,
    loop: false,
    phases: { startup: [0, 1], active: [2, 3], recovery: [4, 4] },
    tags: ['derived', 'sword'],
    sword: true,
    comment: "The second blow of the combo, made from the first one's drawings turned about the hand so that the blade RISES across the body where the first one thrusts: coil (the first one's wind-up, lower and drawn back), the drive forward, the swing up across the chest, the cut at full reach, the settle.",
    frames: [
      { from: 'attack1_00', crouch: { drop: 16, lean: -2 }, turn: { deg: -6, about: 'feet' }, dx: -6 },
      { from: 'attack1_00', turn: { deg: 4, about: 'feet' }, dx: 7 },
      { from: 'attack1_01', turn: { deg: -17, about: 'hand' }, dx: 7 },
      { from: 'attack1_02', turn: { deg: -13, about: 'hand' }, dx: 9, dy: -2 },
      { from: 'attack1_03', turn: { deg: -3, about: 'feet' }, dx: 2 },
    ],
  },
  crouch: {
    fps: 2,
    loop: true,
    tags: ['derived'],
    sword: false,
    comment: "The held crouch: the owner's own drawing of the body brought low (the landing — knees bent, the head forward, the scarf trailing flat, the sword down and back), and its breath: the same drawing with the head and the chest two pixels higher.",
    frames: [
      { from: 'land_00' },
      { from: 'land_00', crouch: { drop: -3, lean: 1 } },
    ],
  },
  crouchWalk: {
    fps: 10,
    loop: true,
    tags: ['derived'],
    sword: false,
    comment: "The crawl: the held crouch's drawing shuffled along — the two contacts (the head forward, the body low) and the two passings (the head a little higher, the body under it), the scarf trailing — at the same height as the held crouch.",
    frames: [
      { from: 'land_00', crouch: { drop: 4, lean: 7 }, dx: 5, turn: { deg: 4, about: 'feet' } },
      { from: 'land_00', crouch: { drop: -6, lean: -1 }, dx: -2 },
      { from: 'land_00', crouch: { drop: 4, lean: 7 }, dx: 5, turn: { deg: -3, about: 'feet' } },
      { from: 'land_00', crouch: { drop: -6, lean: -1 }, dx: -2, turn: { deg: 1, about: 'feet' } },
    ],
  },
  aerialAttack: {
    fps: 26,
    loop: false,
    phases: { startup: [0, 1], active: [2, 3], recovery: [4, 5] },
    tags: ['derived', 'sword'],
    sword: true,
    comment: "The blow in the air: the owner's jump to tuck, the first blow's drawings tipped the other way — about the hand, the blade coming DOWN across the front where the second blow's rises — and the owner's fall to be ready to land.",
    frames: [
      { from: 'jump_02', anchorsOf: 'attack1_00', turn: { deg: -4, about: 'feet' } },
      { from: 'attack1_00', turn: { deg: -26, about: 'hand' }, dy: -4 },
      { from: 'attack1_01', turn: { deg: 20, about: 'hand' }, dx: 4, dy: -2 },
      { from: 'attack1_02', turn: { deg: 30, about: 'hand' }, dx: 6, dy: -2 },
      { from: 'attack1_03', turn: { deg: 22, about: 'feet' }, dx: 2 },
      { from: 'fall_01', anchorsOf: 'attack1_03', turn: { deg: 4, about: 'feet' } },
    ],
  },
  crouchAttack: {
    fps: 26,
    loop: false,
    phases: { startup: [0, 1], active: [2, 3], recovery: [4, 4] },
    tags: ['derived', 'sword'],
    sword: true,
    comment: "The low blow: the first blow's drawings with the body brought down to the crouch — the blade sweeps at knee height — and the held crouch to settle into.",
    frames: [
      { from: 'attack1_00', crouch: { eyeAt: LOW, lean: 3 } },
      { from: 'attack1_00', crouch: { eyeAt: LOW + 4, lean: 9 }, dx: 6 },
      { from: 'attack1_01', crouch: { eyeAt: LOW + 2, lean: 9 }, dx: 4 },
      { from: 'attack1_02', crouch: { eyeAt: LOW, lean: 7 }, dx: 2 },
      { from: 'land_00', anchorsOf: 'attack1_03' },
    ],
  },
  drink: {
    fps: 10,
    loop: false,
    tags: ['derived'],
    sword: false,
    comment: "The drink: the owner's idle drawings with a glass vial of cyan liquid and the small arm that holds it drawn over them (the one thing the sheet cannot lend), the head bent back about the neck for the swallow and the eye brighter at the end.",
    frames: [
      { from: 'idle_01', relative: true, arm: { from: SHOULDER, to: { x: 24, y: 50 }, w0: 11, w1: 8 }, vial: { at: { x: 27, y: 62 }, tilt: 8, fill: 1 } },
      { from: 'idle_00', relative: true, arm: { from: SHOULDER, to: { x: 26, y: 30 }, w0: 11, w1: 8 }, vial: { at: { x: 30, y: 40 }, tilt: -20, fill: 1 } },
      { from: 'idle_00', head: { deg: -9 }, relative: true, arm: { from: SHOULDER, to: { x: 30, y: 24 }, w0: 11, w1: 8 }, vial: { at: { x: 40, y: 34 }, tilt: -62, fill: 0.85 } },
      { from: 'idle_01', relative: true, glow: { radius: 34, strength: 0.28 }, arm: { from: SHOULDER, to: { x: 22, y: 56 }, w0: 11, w1: 8 }, vial: { at: { x: 25, y: 68 }, tilt: 6, fill: 0.45 } },
    ],
  },
};
