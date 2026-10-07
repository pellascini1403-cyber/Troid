import { DEFAULT_BINDINGS, type Bindings } from './bindings';
import type { Action } from './InputFrame';

/**
 * Remapping, kept SMALL on purpose (docs/PROMPT6-LOG.md S30): a player may give the main actions another KEY, one key each. There is no list of keys
 * per action, no combination, no gamepad or touch remapping, no profiles: the bindings of `bindings.ts` stay the truth, and a `KeyMap` is the
 * handful of overrides on top of them. Everything here is pure data in and data out: the settings menu asks, the game applies.
 *
 * What a player cannot do: move a key onto movement (the stick of the keyboard), the pause keys, Walk, or what the browser keeps for itself (Tab,
 * the function keys, Alt, the system key). A reserved key is refused, never silently moved: the menu says so.
 */

/** The actions a player may give another key, in the order the menu lists them. `down` is the crouch. */
export const REMAPPABLE = ['jump', 'attack', 'dash', 'ability', 'bottle', 'interact', 'down'] as const;
export type Remappable = (typeof REMAPPABLE)[number];

/** The overrides: an action → the `KeyboardEvent.code` that is its main key now. Only what differs from the default is kept. */
export type KeyMap = Partial<Record<Remappable, string>>;

export const isRemappable = (value: unknown): value is Remappable => typeof value === 'string' && (REMAPPABLE as readonly string[]).includes(value);

/** The main key of an action by default (the first one of its list: the others are its extras). */
export function defaultKey(action: Remappable): string {
  return DEFAULT_BINDINGS.keyboard[action][0] as string;
}

/** What a `KeyboardEvent.code` looks like: letters and digits only ("KeyJ", "Digit4", "ShiftLeft", "Space", "BracketLeft"). */
export const isKeyCode = (code: unknown): code is string => typeof code === 'string' && /^[A-Za-z][A-Za-z0-9]{0,23}$/.test(code);

/** The keys that belong to what a player cannot remap: movement, Walk, Drop, the pause keys (taken from the bindings, not repeated here). */
const OWN = new Set<string>(
  (['left', 'right', 'up', 'walk', 'drop', 'pause'] as const satisfies readonly Action[]).flatMap((a) => DEFAULT_BINDINGS.keyboard[a]),
);

/** True for a key the game keeps (movement, pause, Walk) or the browser does (Tab, F1–F12, Alt, the system key, the context-menu key, Caps Lock). */
export function isReserved(code: string): boolean {
  return OWN.has(code) || /^F\d{1,2}$/.test(code) || /^(Tab|Meta(Left|Right)|OSLeft|OSRight|Alt(Left|Right)|ContextMenu|CapsLock)$/.test(code);
}

/** A key a player may use for an action. */
export const isBindable = (code: unknown): code is string => isKeyCode(code) && !isReserved(code);

/** The main key of every remappable action now: the override, or the default. */
export function effectiveKeys(map: Readonly<KeyMap>): Record<Remappable, string> {
  const out = {} as Record<Remappable, string>;
  for (const a of REMAPPABLE) out[a] = map[a] ?? defaultKey(a);
  return out;
}

/** Drops what equals the default: a map holds only real overrides, so what is compared and saved is the same thing. */
function pruned(map: Readonly<KeyMap>): KeyMap {
  const out: KeyMap = {};
  for (const a of REMAPPABLE) {
    const k = map[a];
    if (k !== undefined && k !== defaultKey(a)) out[a] = k;
  }
  return out;
}

/**
 * Makes ANY value into a valid map (it comes from a saved file a person could have edited): unknown actions, codes that are not keys, reserved
 * keys and defaults are dropped, and when two actions would end up on the same key the later override goes back to its default — so whatever is
 * read, every action has its own key.
 */
export function sanitizeKeyMap(raw: unknown): KeyMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const map: KeyMap = {};
  for (const a of REMAPPABLE) if (isBindable(r[a])) map[a] = r[a] as string;
  let out = pruned(map);
  for (let guard = 0; guard < REMAPPABLE.length; guard++) {
    const eff = effectiveKeys(out);
    const clash = REMAPPABLE.find((a) => REMAPPABLE.some((b) => b !== a && eff[b] === eff[a] && out[b] !== undefined));
    if (clash === undefined) break;
    // among the actions that share a key, the last one that has an override gives it up
    const owners = REMAPPABLE.filter((b) => eff[b] === eff[clash] && out[b] !== undefined);
    const give = owners[owners.length - 1] as Remappable;
    const { [give]: _dropped, ...rest } = out;
    out = rest;
  }
  return out;
}

export type Assignment = { ok: true; map: KeyMap; swapped: Remappable | null } | { ok: false; reason: 'invalid' | 'reserved' };

/**
 * `action` is given `code`. A key can serve only one of the remappable actions, so if another one has it they SWAP — the other action gets the key
 * `action` had, and nobody is left without one. A reserved key (or something that is not a key) is refused and the map is not changed.
 */
export function assignKey(map: Readonly<KeyMap>, action: Remappable, code: string): Assignment {
  if (!isKeyCode(code)) return { ok: false, reason: 'invalid' };
  if (isReserved(code)) return { ok: false, reason: 'reserved' };
  const eff = effectiveKeys(map);
  if (eff[action] === code) return { ok: true, map: pruned(map), swapped: null };
  const other = REMAPPABLE.find((a) => a !== action && eff[a] === code) ?? null;
  const next: KeyMap = { ...map, [action]: code };
  if (other) next[other] = eff[action];
  return { ok: true, map: pruned(next), swapped: other };
}

/**
 * The bindings with the map applied: the main key of each remappable action is the player's, and what stays are its EXTRAS (the second Shift of the
 * dash, the arrow of the crouch, the second bottle key) — unless a player's key took it, then that extra is gone so no key does two things.
 * Returns a new object; the defaults are never touched.
 */
export function applyKeyMap(base: Readonly<Bindings>, map: Readonly<KeyMap>): Bindings {
  const out = structuredClone(base) as Bindings;
  const main = {} as Record<Remappable, string | undefined>;
  for (const a of REMAPPABLE) main[a] = map[a] ?? base.keyboard[a][0];
  const taken = new Set(Object.values(main).filter((k): k is string => k !== undefined));
  for (const a of REMAPPABLE) {
    const extras = base.keyboard[a].slice(1).filter((k) => !taken.has(k));
    const first = main[a];
    out.keyboard[a] = first === undefined ? extras : [first, ...extras];
  }
  return out;
}
