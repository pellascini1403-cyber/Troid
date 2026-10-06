import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { interactGlyph, keyLabel, padLabel } from '@/input/glyphs';

/**
 * What the interaction icon says about the key or the button of the device in use (docs/GAME-SPEC-2D.md §12). The label is
 * derived from the BINDINGS, so remapping a key changes the icon with it, and it is the name printed on the hardware.
 */
describe('glyphs', () => {
  it('a keyboard code becomes the name on the key', () => {
    expect(keyLabel('KeyE')).toBe('E');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('Numpad7')).toBe('7');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('Space')).toBe('Space');
    expect(keyLabel('Enter')).toBe('Enter');
  });

  it('a standard gamepad button becomes its name, and an unknown one its number', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(padLabel)).toEqual(['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT']);
    expect(padLabel(9)).toBe('Start');
    expect(padLabel(12)).toBe('↑');
    expect(padLabel(40)).toBe('40');
  });

  it('the icon shows the key on a keyboard (E), the button on a gamepad (LT) and nothing on touch (the icon IS the button)', () => {
    expect(interactGlyph('keyboard', DEFAULT_BINDINGS)).toBe('E');
    expect(interactGlyph('gamepad', DEFAULT_BINDINGS)).toBe('LT');
    expect(interactGlyph('touch', DEFAULT_BINDINGS)).toBe('');
  });

  it('remapping changes the label with it; an action with no binding shows nothing', () => {
    const remapped = structuredClone(DEFAULT_BINDINGS);
    remapped.keyboard.interact = ['KeyF'];
    remapped.gamepad.buttons.interact = [2];
    expect(interactGlyph('keyboard', remapped)).toBe('F');
    expect(interactGlyph('gamepad', remapped)).toBe('X');
    remapped.keyboard.interact = [];
    delete remapped.gamepad.buttons.interact;
    expect(interactGlyph('keyboard', remapped)).toBe('');
    expect(interactGlyph('gamepad', remapped)).toBe('');
  });
});
