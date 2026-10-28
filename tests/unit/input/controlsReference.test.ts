import { describe, expect, it } from 'vitest';
import { applyKeyMap } from '@/input/remap';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { controlsReference, TOUCH_REFERENCE } from '@/input/controlsReference';

/**
 * THE CONTROLS SCREEN'S DATA (docs/PROMPT14-LOG.md): every row is a binding that exists in the bindings in force — a remapped key is already in it — and nothing is listed that the game does not do.
 */
const rows = (r: ReturnType<typeof controlsReference>['keyboard'], action: string) => r.find((x) => x.action === action)?.inputs;

describe('the keyboard and the mouse', () => {
  const ref = controlsReference(DEFAULT_BINDINGS);

  it('lists each action with the keys that do it, as printed on the hardware', () => {
    expect(rows(ref.keyboard, 'action.jump')).toEqual(['Space']);
    expect(rows(ref.keyboard, 'action.dash')).toEqual(['Shift']);
    expect(rows(ref.keyboard, 'action.bottle')).toEqual(['L', 'Q']);
    expect(rows(ref.keyboard, 'action.interact')).toEqual(['E']);
    expect(rows(ref.keyboard, 'controls.walk')).toEqual(['Control']);
    expect(rows(ref.keyboard, 'controls.pause')).toEqual(['Escape', 'P']);
  });

  it('movement is the two pairs of keys, and crouch is its own row', () => {
    expect(rows(ref.keyboard, 'controls.move')).toEqual(['A', '←', 'D', '→']);
    expect(rows(ref.keyboard, 'action.crouch')).toEqual(['S', '↓']);
  });

  it('attack and ability also say the mouse button that does them, by a key of the interface (it is a word, so it is translated)', () => {
    expect(rows(ref.keyboard, 'action.attack')).toEqual(['J', { key: 'controls.mouseLeft' }]);
    expect(rows(ref.keyboard, 'action.ability')).toEqual(['K', { key: 'controls.mouseRight' }]);
  });

  it('dropping through a platform is crouch + jump: it has no key of its own, and says so', () => {
    expect(rows(ref.keyboard, 'controls.drop')).toEqual(['S', '+', 'Space']);
    expect(DEFAULT_BINDINGS.keyboard.drop).toEqual([]);
  });

  it('follows a remap: the key the player chose is the one listed, and the extras that no longer apply are gone', () => {
    const mine = applyKeyMap(DEFAULT_BINDINGS, { attack: 'KeyF', bottle: 'KeyH', jump: 'KeyQ' });
    const r = controlsReference(mine).keyboard;
    expect(rows(r, 'action.attack')?.[0]).toBe('F');
    expect(rows(r, 'action.bottle')).toEqual(['H']);
    expect(rows(r, 'action.jump')).toEqual(['Q']);
    expect(rows(r, 'controls.drop')).toEqual(['S', '+', 'Q']);
  });

  it('an action with no input in these bindings is not listed (the screen lists what can be done)', () => {
    const none = structuredClone(DEFAULT_BINDINGS);
    none.keyboard.interact = [];
    expect(controlsReference(none).keyboard.some((r) => r.action === 'action.interact')).toBe(false);
  });
});

describe('the gamepad', () => {
  const ref = controlsReference(DEFAULT_BINDINGS);

  it('is the standard mapping the game reads: A jumps, X attacks, B and RB dash, Y casts, LB drinks, LT interacts, Start pauses', () => {
    expect(rows(ref.gamepad, 'action.jump')).toEqual(['A']);
    expect(rows(ref.gamepad, 'action.attack')).toEqual(['X']);
    expect(rows(ref.gamepad, 'action.dash')).toEqual(['B', 'RB']);
    expect(rows(ref.gamepad, 'action.ability')).toEqual(['Y']);
    expect(rows(ref.gamepad, 'action.bottle')).toEqual(['LB']);
    expect(rows(ref.gamepad, 'action.interact')).toEqual(['LT']);
    expect(rows(ref.gamepad, 'controls.pause')).toEqual(['Start']);
  });

  it('moves with the stick and the d-pad', () => {
    expect(rows(ref.gamepad, 'controls.move')).toEqual([{ key: 'controls.padStick' }, '←', '→']);
    expect(rows(ref.gamepad, 'action.crouch')).toEqual([{ key: 'controls.padStickDown' }, '↓']);
  });
});

describe('the touch layer', () => {
  it('lists what it really has: the movement zone and its gestures, three buttons, the moves of the air, the bottle chip, the interaction icon and the pause button', () => {
    const t = controlsReference(DEFAULT_BINDINGS).touch;
    expect(t.map((r) => r.action)).toEqual([
      'controls.touchMove', 'controls.touchJump', 'controls.touchCrouch', 'controls.touchDrop', 'controls.touchButtons', 'controls.touchAirJump', 'controls.touchSlam', 'controls.touchAirDash', 'controls.touchBottle', 'controls.touchInteract', 'controls.touchPause',
    ]);
    expect(t).toEqual([...TOUCH_REFERENCE]);
  });

  it('every line has a name and a description of its own', () => {
    for (const r of TOUCH_REFERENCE) {
      expect(r.action).not.toBe(r.how);
      expect(new Set(TOUCH_REFERENCE.map((x) => x.how)).size).toBe(TOUCH_REFERENCE.length);
    }
  });
});
