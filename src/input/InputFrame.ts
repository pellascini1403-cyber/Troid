import type { Vec2 } from '@/core/math';

/** Logical actions. Devices (keyboard, touch, gamepad) are mapped onto these by data (see bindings.ts). */
export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'ability', 'bottle', 'interact', 'drop', 'pause', 'walk'] as const;
export type Action = (typeof ACTIONS)[number];

/** Which kind of device the player is currently using (drives on-screen prompts: "Shift" vs "B" vs a touch icon). */
export type InputDevice = 'keyboard' | 'touch' | 'gamepad';

/**
 * One simulation tick of player intent. This is the ONLY input the gameplay code ever sees:
 *
 *   Input.Move → move · Input.JumpPressed → jumpPressed · Input.AttackPressed → attackPressed
 *   Input.DashPressed → dashPressed · Input.AbilityPressed → abilityPressed
 *   Input.BottlePressed → bottlePressed (+ bottleSlot) · Input.InteractPressed → interactPressed · Input.DropPressed → dropPressed
 *
 * `*Pressed` / `*Released` are edge events latched between ticks, so a tap shorter than a frame is never lost
 * (essential on 30 fps phones). Gameplay code never touches buttons, keys or UI elements.
 *
 * THE AXIS CONTRACT (docs/PROMPT5-LOG.md S13). `move` is two INDEPENDENT intentions that the simulation reads separately:
 * `x` is how fast to run (a gentle tilt walks, a firm push runs), `y` below −0.6 is a crouch (and a drop through a one-way
 * platform together with a jump). So the horizontal speed must never depend on the vertical axis, whatever the device:
 *  - digital sources (keys, D-pad) give exactly −1 / 0 / 1 per axis, and holding two keys gives (±1, ±1): no normalisation;
 *  - a thumb-stick is one physical vector: the source clamps it to the unit disc (`radial`);
 *  - a touch drag has a separate meaning per axis (run speed / crouch), so each axis is clamped on its own (`independent`);
 *  - when several sources are active, each axis takes the largest magnitude.
 */
export interface InputFrame {
  /** Movement, each axis in [-1, 1]; +y is up. See the axis contract above. */
  move: Vec2;
  jumpPressed: boolean;
  jumpHeld: boolean;
  jumpReleased: boolean;
  attackPressed: boolean;
  attackHeld: boolean;
  dashPressed: boolean;
  dashHeld: boolean;
  abilityPressed: boolean;
  abilityHeld: boolean;
  /** Drink a bottle: `bottleSlot` −1 = the next one that is ready, 0.. = that slot (tapping a bottle icon of the HUD). */
  bottlePressed: boolean;
  bottleSlot: number;
  /** The contextual interaction (GAME-SPEC-2D §12): the key / button, or a tap on the interaction icon. */
  interactPressed: boolean;
  /** Fall through the one-way platform underneath (a flick down on touch; keyboard and gamepad use down + jump). */
  dropPressed: boolean;
  pausePressed: boolean;
  device: InputDevice;
}

export function createInputFrame(): InputFrame {
  return {
    move: { x: 0, y: 0 },
    jumpPressed: false, jumpHeld: false, jumpReleased: false,
    attackPressed: false, attackHeld: false,
    dashPressed: false, dashHeld: false,
    abilityPressed: false, abilityHeld: false,
    bottlePressed: false, bottleSlot: -1,
    interactPressed: false,
    dropPressed: false,
    pausePressed: false,
    device: 'keyboard',
  };
}

/** Frozen "no input" frame: used while the player is locked (cutscenes, transitions) and as a test default. */
export const NEUTRAL_INPUT: Readonly<InputFrame> = Object.freeze(createInputFrame());
