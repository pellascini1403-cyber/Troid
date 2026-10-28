import type { Bindings } from './bindings';
import { keyLabel, padLabel } from './glyphs';

/**
 * WHAT EACH CONTROL IS, for the controls screen (docs/PROMPT14-LOG.md): built from the bindings in force — so a remapped key is already in it — and from what the touch layer really does. It lists nothing
 * the game does not do: every row names a binding that exists, and every touch line a gesture or button that exists (the recognizer and the touch layer are tested for them).
 *
 * An input is either the label of a key or a button as printed on the hardware (`K`, `Shift`, `Y`: not words, never translated) or the key of a word of the interface (`{ key }`: "left click", the
 * stick), so the screen can say it in the language in force.
 */
export type ControlInput = string | { key: string };

export interface ControlRow {
  /** The text key of what the control does. */
  action: string;
  inputs: ControlInput[];
}

/** One line about the touch layer: the text key of its name and of how it is used. */
export interface TouchRow {
  action: string;
  how: string;
}

export interface ControlsReference {
  keyboard: ControlRow[];
  gamepad: ControlRow[];
  touch: TouchRow[];
}

const unique = (list: string[]): string[] => [...new Set(list)];
const keys = (codes: readonly string[] | undefined): string[] => unique((codes ?? []).map(keyLabel));
const pads = (buttons: readonly number[] | undefined): string[] => unique((buttons ?? []).map(padLabel));

/** The touch layer, as it is: the movement zone with its gestures, three fixed buttons, the contextual bottle chip, the interaction icon and the pause button. */
export const TOUCH_REFERENCE: readonly TouchRow[] = [
  { action: 'controls.touchMove', how: 'controls.touchMoveHow' },
  { action: 'controls.touchJump', how: 'controls.touchJumpHow' },
  { action: 'controls.touchCrouch', how: 'controls.touchCrouchHow' },
  { action: 'controls.touchDrop', how: 'controls.touchDropHow' },
  { action: 'controls.touchButtons', how: 'controls.touchButtonsHow' },
  { action: 'controls.touchAirJump', how: 'controls.touchAirJumpHow' },
  { action: 'controls.touchSlam', how: 'controls.touchSlamHow' },
  { action: 'controls.touchAirDash', how: 'controls.touchAirDashHow' },
  { action: 'controls.touchBottle', how: 'controls.touchBottleHow' },
  { action: 'controls.touchInteract', how: 'controls.touchInteractHow' },
  { action: 'controls.touchPause', how: 'controls.touchPauseHow' },
];

export function controlsReference(bindings: Readonly<Bindings>): ControlsReference {
  const k = bindings.keyboard;
  const g = bindings.gamepad.buttons;
  const m = bindings.mouse;
  const withMouse = (action: 'attack' | 'ability', own: string[]): ControlInput[] => {
    const buttons = m[action] ?? [];
    return [...own, ...buttons.map((b): ControlInput => ({ key: b === 0 ? 'controls.mouseLeft' : b === 2 ? 'controls.mouseRight' : 'controls.mouseOther' }))];
  };
  const keyboard: ControlRow[] = [
    { action: 'controls.move', inputs: keys([...k.left, ...k.right]) },
    { action: 'action.jump', inputs: keys(k.jump) },
    { action: 'action.attack', inputs: withMouse('attack', keys(k.attack)) },
    { action: 'action.dash', inputs: keys(k.dash) },
    // the moves the hero learns on the way: each one is a combination of the same buttons, in the air
    { action: 'controls.doubleJump', inputs: keys(k.jump) },
    { action: 'controls.wallJump', inputs: keys(k.jump) },
    { action: 'controls.airDash', inputs: keys(k.dash) },
    { action: 'controls.groundSlam', inputs: [...keys(k.down.slice(0, 1)), '+', ...keys(k.attack.slice(0, 1))] },
    { action: 'action.ability', inputs: withMouse('ability', keys(k.ability)) },
    { action: 'action.bottle', inputs: keys(k.bottle) },
    { action: 'action.interact', inputs: keys(k.interact) },
    { action: 'action.crouch', inputs: keys(k.down) },
    // dropping through a one-way platform is crouch + jump: it has no key of its own
    { action: 'controls.drop', inputs: [...keys(k.down.slice(0, 1)), '+', ...keys(k.jump.slice(0, 1))] },
    { action: 'controls.walk', inputs: keys(k.walk) },
    { action: 'controls.pause', inputs: keys(k.pause) },
  ];
  const gamepad: ControlRow[] = [
    { action: 'controls.move', inputs: [{ key: 'controls.padStick' }, ...pads([...(g.left ?? []), ...(g.right ?? [])]).flatMap((x) => [x])] },
    { action: 'action.jump', inputs: pads(g.jump) },
    { action: 'action.attack', inputs: pads(g.attack) },
    { action: 'action.dash', inputs: pads(g.dash) },
    { action: 'controls.doubleJump', inputs: pads(g.jump) },
    { action: 'controls.wallJump', inputs: pads(g.jump) },
    { action: 'controls.airDash', inputs: pads(g.dash) },
    { action: 'controls.groundSlam', inputs: [{ key: 'controls.padStickDown' }, '+', ...pads(g.attack?.slice(0, 1))] },
    { action: 'action.ability', inputs: pads(g.ability) },
    { action: 'action.bottle', inputs: pads(g.bottle) },
    { action: 'action.interact', inputs: pads(g.interact) },
    { action: 'action.crouch', inputs: [{ key: 'controls.padStickDown' }, ...pads(g.down)] },
    { action: 'controls.pause', inputs: pads(g.pause) },
  ];
  // a row whose action has no input in these bindings (a remap that took it away) is not shown: the screen lists what can be done
  return { keyboard: keyboard.filter((r) => r.inputs.length > 0), gamepad: gamepad.filter((r) => r.inputs.length > 0), touch: [...TOUCH_REFERENCE] };
}
