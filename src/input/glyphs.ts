import type { Bindings } from './bindings';
import type { InputDevice } from './InputFrame';

/**
 * What a key or a button is called on the interaction icon (docs/GAME-SPEC-2D.md §12: "el icono muestra la tecla/botón del
 * dispositivo en uso"). PURE: the label comes from the BINDINGS (data), so remapping a key changes the icon with it. They are
 * the names printed on the hardware, not words of the game: they do not go through the translator.
 */

/** The standard gamepad mapping: the face buttons, the shoulders, the triggers, the menu buttons and the d-pad. */
const PAD_LABELS: Readonly<Record<number, string>> = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'Back', 9: 'Start', 10: 'LS', 11: 'RS', 12: '↑', 13: '↓', 14: '←', 15: '→',
};

const ARROWS: Readonly<Record<string, string>> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

/** `KeyE` → `E`, `Digit3` → `3`, `ArrowUp` → `↑`, `ShiftLeft` → `Shift`, `Space` → `Space`. */
export function keyLabel(code: string): string {
  if (ARROWS[code]) return ARROWS[code] as string;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1] as string;
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (digit) return digit[1] as string;
  return code.replace(/(Left|Right)$/, '');
}

export function padLabel(index: number): string {
  return PAD_LABELS[index] ?? String(index);
}

/** The label to show on the interaction icon for `device`: the key, the button, or nothing for touch (the icon IS the button). */
export function interactGlyph(device: InputDevice, bindings: Readonly<Bindings>): string {
  if (device === 'gamepad') {
    const b = bindings.gamepad.buttons.interact?.[0];
    return b === undefined ? '' : padLabel(b);
  }
  if (device === 'keyboard') {
    const k = bindings.keyboard.interact[0];
    return k === undefined ? '' : keyLabel(k);
  }
  return '';
}
