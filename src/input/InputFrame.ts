import type { Vec2 } from '@/core/math';

/** Logical actions. Devices (keyboard, touch, gamepad) are mapped onto these by data (see bindings.ts). */
export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'ability', 'pause', 'walk'] as const;
export type Action = (typeof ACTIONS)[number];

/** Which kind of device the player is currently using (drives on-screen prompts: "Shift" vs "B" vs a touch icon). */
export type InputDevice = 'keyboard' | 'touch' | 'gamepad';

/**
 * One simulation tick of player intent. This is the ONLY input the gameplay code ever sees:
 *
 *   Input.Move → move · Input.JumpPressed → jumpPressed · Input.AttackPressed → attackPressed
 *   Input.DashPressed → dashPressed · Input.AbilityPressed → abilityPressed
 *
 * `*Pressed` / `*Released` are edge events latched between ticks, so a tap shorter than a frame is never lost
 * (essential on 30 fps phones). Gameplay code never touches buttons, keys or UI elements.
 */
export interface InputFrame {
  /** Analog movement, each axis in [-1, 1]; +y is up. Digital sources give exactly -1 / 0 / 1. */
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
    pausePressed: false,
    device: 'keyboard',
  };
}

/** Frozen "no input" frame: used while the player is locked (cutscenes, transitions) and as a test default. */
export const NEUTRAL_INPUT: Readonly<InputFrame> = Object.freeze(createInputFrame());
