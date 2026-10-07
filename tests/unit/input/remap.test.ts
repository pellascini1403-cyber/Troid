import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { ACTIONS } from '@/input/InputFrame';
import {
  applyKeyMap, assignKey, defaultKey, effectiveKeys, isBindable, isKeyCode, isRemappable, isReserved, REMAPPABLE, sanitizeKeyMap, type KeyMap,
} from '@/input/remap';

/**
 * Remapping, small on purpose (docs/PROMPT6-LOG.md S30): one key per main action, a swap when two would meet, a short list of keys that cannot be
 * given away, and the bindings of `bindings.ts` as the one truth underneath. All pure data.
 */
describe('what can be remapped', () => {
  it('the main actions of the game: jump, attack, dash, ability, bottle, interact and the crouch (`down`) — and nothing else', () => {
    expect([...REMAPPABLE]).toEqual(['jump', 'attack', 'dash', 'ability', 'bottle', 'interact', 'down']);
    for (const a of REMAPPABLE) expect((ACTIONS as readonly string[]).includes(a), a).toBe(true);
    expect(isRemappable('attack')).toBe(true);
    for (const no of ['left', 'right', 'up', 'drop', 'pause', 'walk', 'fly', '', 3]) expect(isRemappable(no), String(no)).toBe(false);
  });

  it('each starts on the first key of its default list', () => {
    expect(REMAPPABLE.map(defaultKey)).toEqual(['Space', 'KeyJ', 'ShiftLeft', 'KeyK', 'KeyL', 'KeyE', 'KeyS']);
    expect(effectiveKeys({})).toEqual({ jump: 'Space', attack: 'KeyJ', dash: 'ShiftLeft', ability: 'KeyK', bottle: 'KeyL', interact: 'KeyE', down: 'KeyS' });
  });
});

describe('which keys a player may use', () => {
  it('a key code is letters and digits as `KeyboardEvent.code` writes them', () => {
    for (const ok of ['KeyF', 'Digit4', 'Space', 'ShiftRight', 'BracketLeft', 'Numpad1', 'Enter']) expect(isKeyCode(ok), ok).toBe(true);
    for (const bad of ['', '4', 'Key F', 'Key-F', '<b>', 'K'.repeat(30), 'ñ', 7, null, undefined]) expect(isKeyCode(bad), String(bad)).toBe(false);
  });

  it('the movement keys, Walk and the pause keys are the game\'s: they come from the bindings, not from a second list that could drift', () => {
    const own = (['left', 'right', 'up', 'walk', 'drop', 'pause'] as const).flatMap((a) => DEFAULT_BINDINGS.keyboard[a]);
    expect(own.length).toBeGreaterThanOrEqual(9);
    for (const k of own) expect(isReserved(k), k).toBe(true);
  });

  it('and so are the keys the browser keeps: Tab, the function keys, Alt, the system key, the context-menu key and Caps Lock', () => {
    for (const k of ['Tab', 'F1', 'F5', 'F12', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'ContextMenu', 'CapsLock']) expect(isReserved(k), k).toBe(true);
  });

  it('every key of the main actions — their own defaults, extras included — and any ordinary key can be used', () => {
    for (const a of REMAPPABLE) for (const k of DEFAULT_BINDINGS.keyboard[a]) expect(isBindable(k), `${a}: ${k}`).toBe(true);
    for (const k of ['KeyF', 'KeyH', 'Digit1', 'Enter', 'Numpad0', 'ShiftRight', 'Backquote', 'ControlRight']) expect(isBindable(k), k).toBe(true);
    for (const k of ['KeyD', 'ArrowLeft', 'Escape', 'KeyP', 'ControlLeft', 'Tab', 'F2', 'nonsense key']) expect(isBindable(k), k).toBe(false);
  });
});

describe('assigning a key', () => {
  it('a free key becomes the action\'s own: the map holds just that override', () => {
    const r = assignKey({}, 'attack', 'KeyF');
    expect(r).toEqual({ ok: true, map: { attack: 'KeyF' }, swapped: null });
  });

  it('a key another action has makes them SWAP: nobody is left without a key, and the map says it', () => {
    const r = assignKey({}, 'attack', 'KeyK'); // KeyK is the ability's
    expect(r).toEqual({ ok: true, map: { attack: 'KeyK', ability: 'KeyJ' }, swapped: 'ability' });
    expect(effectiveKeys((r as { map: KeyMap }).map)).toMatchObject({ attack: 'KeyK', ability: 'KeyJ' });
  });

  it('a swap with an action that was already changed works the same way', () => {
    const first = assignKey({}, 'attack', 'KeyF') as { map: KeyMap };
    const r = assignKey(first.map, 'dash', 'KeyF'); // attack has KeyF now
    expect(r).toEqual({ ok: true, map: { attack: 'ShiftLeft', dash: 'KeyF' }, swapped: 'attack' });
  });

  it('putting an action back on its default key removes the override: a map holds only what differs', () => {
    const first = assignKey({}, 'attack', 'KeyF') as { map: KeyMap };
    expect(assignKey(first.map, 'attack', 'KeyJ')).toEqual({ ok: true, map: {}, swapped: null });
    // …and a swap that happens to put both back on their defaults leaves nothing
    const swap = assignKey({}, 'attack', 'KeyK') as { map: KeyMap };
    expect(assignKey(swap.map, 'attack', 'KeyJ')).toEqual({ ok: true, map: {}, swapped: 'ability' });
  });

  it('the key it already has changes nothing', () => {
    expect(assignKey({ attack: 'KeyF' }, 'attack', 'KeyF')).toEqual({ ok: true, map: { attack: 'KeyF' }, swapped: null });
    expect(assignKey({}, 'jump', 'Space')).toEqual({ ok: true, map: {}, swapped: null });
  });

  it('a reserved key is REFUSED and the map is not touched; so is something that is not a key', () => {
    const map: KeyMap = { attack: 'KeyF' };
    expect(assignKey(map, 'dash', 'KeyD')).toEqual({ ok: false, reason: 'reserved' });
    expect(assignKey(map, 'dash', 'Escape')).toEqual({ ok: false, reason: 'reserved' });
    expect(assignKey(map, 'dash', 'F5')).toEqual({ ok: false, reason: 'reserved' });
    expect(assignKey(map, 'dash', '??')).toEqual({ ok: false, reason: 'invalid' });
    expect(map).toEqual({ attack: 'KeyF' });
  });

  it('a key that is only an EXTRA of another action (the arrow of the crouch) is simply taken: that action keeps its main key', () => {
    const r = assignKey({}, 'attack', 'ArrowDown') as { map: KeyMap; swapped: string | null };
    expect(r.map).toEqual({ attack: 'ArrowDown' });
    expect(r.swapped).toBeNull();
    const b = applyKeyMap(DEFAULT_BINDINGS, r.map);
    expect(b.keyboard.attack).toEqual(['ArrowDown']);
    expect(b.keyboard.down, 'the crouch keeps S and loses the arrow, which the attack has now').toEqual(['KeyS']);
  });

  it('does not mutate what it is given', () => {
    const map: KeyMap = Object.freeze({ attack: 'KeyF' });
    expect(() => assignKey(map, 'dash', 'KeyG')).not.toThrow();
    expect(map).toEqual({ attack: 'KeyF' });
  });
});

describe('the bindings with the keys applied', () => {
  it('no overrides: exactly the default bindings of those actions (and the object is a copy)', () => {
    const b = applyKeyMap(DEFAULT_BINDINGS, {});
    expect(b).toEqual(DEFAULT_BINDINGS);
    expect(b).not.toBe(DEFAULT_BINDINGS);
    b.keyboard.attack.push('KeyZ');
    expect(DEFAULT_BINDINGS.keyboard.attack).toEqual(['KeyJ']);
  });

  it('an override is the action\'s main key, and its extras stay: the dash on G still has the second Shift', () => {
    const b = applyKeyMap(DEFAULT_BINDINGS, { dash: 'KeyG', bottle: 'KeyH' });
    expect(b.keyboard.dash).toEqual(['KeyG', 'ShiftRight']);
    expect(b.keyboard.bottle).toEqual(['KeyH', 'KeyQ']);
    expect(b.keyboard.attack).toEqual(['KeyJ']);
  });

  it('what is not remappable is untouched: movement, pause, Walk, Drop, the mouse and the gamepad', () => {
    const b = applyKeyMap(DEFAULT_BINDINGS, { attack: 'KeyF', jump: 'KeyH', down: 'KeyX', interact: 'KeyG' });
    for (const a of ['left', 'right', 'up', 'drop', 'pause', 'walk'] as const) expect(b.keyboard[a], a).toEqual(DEFAULT_BINDINGS.keyboard[a]);
    expect(b.mouse).toEqual(DEFAULT_BINDINGS.mouse);
    expect(b.gamepad).toEqual(DEFAULT_BINDINGS.gamepad);
  });

  it('no key ever does two things: after any valid map, the keys of the actions are all different', () => {
    const maps: KeyMap[] = [
      {},
      { attack: 'KeyF' },
      { attack: 'KeyK', ability: 'KeyJ' },
      { attack: 'ShiftRight' },
      { dash: 'ArrowDown', down: 'KeyX' },
      { jump: 'KeyL', bottle: 'Space', interact: 'KeyQ' },
    ];
    for (const m of maps) {
      const b = applyKeyMap(DEFAULT_BINDINGS, m);
      const seen = new Map<string, string>();
      for (const a of ACTIONS) {
        for (const k of b.keyboard[a]) {
          expect(seen.get(k), `${JSON.stringify(m)}: ${k} is on ${seen.get(k)} and on ${a}`).toBeUndefined();
          seen.set(k, a);
        }
      }
    }
  });

  it('a long run of random assignments never breaks that (every swap and every refusal, 400 times)', () => {
    let seed = 12345;
    const rnd = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const pool = ['KeyF', 'KeyG', 'KeyH', 'KeyZ', 'KeyJ', 'KeyK', 'KeyL', 'KeyE', 'KeyS', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowDown', 'KeyQ', 'KeyD', 'Escape', 'Digit1'];
    let map: KeyMap = {};
    for (let i = 0; i < 400; i++) {
      const a = REMAPPABLE[Math.floor(rnd() * REMAPPABLE.length)] as (typeof REMAPPABLE)[number];
      const r = assignKey(map, a, pool[Math.floor(rnd() * pool.length)] as string);
      if (r.ok) map = r.map;
      const keys = Object.values(effectiveKeys(map));
      expect(new Set(keys).size, JSON.stringify(map)).toBe(REMAPPABLE.length);
      expect(sanitizeKeyMap(map), 'what is kept is already clean').toEqual(map);
    }
  });
});

describe('a map read from a file', () => {
  it('is cleaned: unknown actions, non-keys, reserved keys and defaults are dropped', () => {
    expect(sanitizeKeyMap({ attack: 'KeyF', fly: 'KeyZ', jump: 3, dash: 'KeyD', interact: 'KeyE', ability: 'F4' })).toEqual({ attack: 'KeyF' });
  });

  it('two actions on one key are not allowed: the later override goes back to its default', () => {
    expect(sanitizeKeyMap({ attack: 'KeyF', dash: 'KeyF' })).toEqual({ attack: 'KeyF' });
    expect(sanitizeKeyMap({ attack: 'KeyK' }), 'the ability has KeyK by default').toEqual({});
    expect(sanitizeKeyMap({ attack: 'KeyK', ability: 'KeyJ' }), 'a real swap stays').toEqual({ attack: 'KeyK', ability: 'KeyJ' });
    expect(sanitizeKeyMap({ attack: 'KeyK', ability: 'KeyK' })).toEqual({});
  });

  it('whatever it is, it gives a map and never throws', () => {
    for (const bad of [null, undefined, 4, 'KeyF', [], [['attack', 'KeyF']], () => 1]) expect(sanitizeKeyMap(bad), String(bad)).toEqual({});
  });
});
