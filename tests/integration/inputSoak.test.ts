// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { DisposableStore } from '@/core/lifecycle';
import { ACTIONS, type Action } from '@/input/InputFrame';
import { InputManager } from '@/input/InputManager';
import { DEFAULT_BINDINGS, boundKeyCodes } from '@/input/bindings';
import { DEFAULT_TOUCH } from '@/input/gestures/TouchConfig';
import { attachGamepad } from '@/input/sources/GamepadSource';
import { attachKeyboardMouse } from '@/input/sources/KeyboardMouseSource';
import { TouchSource, type TouchTarget } from '@/input/sources/TouchSource';
import { VirtualPad } from '@/input/sources/VirtualPad';
import { padList } from '../helpers/gamepad';

/**
 * SOAK of the input layer (docs/PROMPT5-LOG.md S20): a keyboard, a mouse, up to five fingers on the touch layer and a gamepad, all
 * at once and all at random — keys that go down and up in any order, two keys for the same action, fingers that land on the wrong
 * thing, lift in the wrong order, are cancelled, a window that loses the focus, a pad that is unplugged mid-stick, a stick that
 * reports NaN — through the REAL sources and the REAL manager, against a deliberately naive MODEL of what the player is doing
 * ("an action is held while ANY physical input bound to it is down"). After every sample the frame must agree with the model:
 *  - what is held IS held, and nothing else (no stuck input, none lost);
 *  - a press that happened since the last sample shows as an edge, even if it was released again before the sample;
 *  - every number is a number inside its range; and when everything is let go, the next frame is silent.
 */
const TICKS = Math.max(500, Number(process.env['SOAK_TICKS'] ?? 4000));
const SEEDS = Array.from({ length: Math.max(6, Number(process.env['SOAK_SEEDS'] ?? 6)) }, (_, i) => [3, 11, 29, 101, 777, 4242][i] ?? 5000 + i * 104729);
const TARGETS: readonly TouchTarget[] = ['zone', 'zone', 'attack', 'dash', 'ability', 'interact', 'bottle', 'bottle:0', 'bottle:1', 'bottle:2'];
const KEY_POOL = [...boundKeyCodes(DEFAULT_BINDINGS), 'KeyV', 'F5']; // the bound keys, and two that nothing listens to
const PAD_ACTIONS = ACTIONS;
const EDGE_ACTIONS = ['attack', 'dash', 'ability', 'bottle', 'interact', 'pause'] as const;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

interface Totals {
  samples: number;
  edges: number;
  calms: number;
  refusedFingers: number;
  twoKeysOneAction: number;
}

function run(seed: number): { violations: string[]; totals: Totals } {
  const rnd = lcg(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const violations: string[] = [];
  let tick = 0;
  const bad = (what: string): void => {
    if (violations.length < 10) violations.push(`seed ${seed}, sample ${tick}: ${what}`);
  };
  const totals: Totals = { samples: 0, edges: 0, calms: 0, refusedFingers: 0, twoKeysOneAction: 0 };

  const bindings = structuredClone(DEFAULT_BINDINGS);
  const store = new DisposableStore();
  const input = new InputManager();
  attachKeyboardMouse(store, input, () => bindings);
  const touch = new TouchSource(input, DEFAULT_TOUCH, () => 1);
  const pad = new VirtualPad();
  const { pads } = padList(pad);
  attachGamepad(input, () => bindings, () => pads);

  // ---------------------------------------------------------------------------------------------- the model
  const keys = new Set<string>();
  const mouse = new Set<number>();
  const owners = new Map<number, TouchTarget>(); // finger → what it holds (the buttons, the zone, a bottle)
  const padPolled = new Map<Action, boolean>(); // what the pad held at the last poll (it is only seen then)
  const rose = new Set<Action>();
  const fell = new Set<Action>();
  const prevAgg = new Map<Action, boolean>();
  let zoneUsed = false; // the movement zone was touched since the last sample: its gestures press jump and drop on their own
  let zoneActiveBefore = false; // …and a finger that was on it at the last sample may lift now (that releases the jump it was holding)
  let bottleAsked = false;
  let bottleSlot = -1;

  const zoneFinger = (): number | null => {
    for (const [id, t] of owners) if (t === 'zone') return id;
    return null;
  };
  const nonPad = (a: Action): boolean =>
    bindings.keyboard[a].some((c) => keys.has(c)) ||
    (bindings.mouse[a] ?? []).some((b) => mouse.has(b)) ||
    ((a === 'attack' || a === 'dash' || a === 'ability' || a === 'interact') && [...owners.values()].includes(a));
  const agg = (a: Action): boolean => nonPad(a) || padPolled.get(a) === true;
  const refresh = (): void => {
    for (const a of ACTIONS) {
      const now = agg(a);
      const before = prevAgg.get(a) === true;
      if (now && !before) rose.add(a);
      if (!now && before) fell.add(a);
      prevAgg.set(a, now);
    }
  };
  const padNow = (a: Action): boolean => pad.connected && (bindings.gamepad.buttons[a] ?? []).some((i) => pad.buttons[i]?.pressed === true || (pad.buttons[i]?.value ?? 0) > 0.5);
  const finite = (v: number): number => (Number.isFinite(v) ? v : 0);
  const stickActive = (): boolean => pad.connected && Math.hypot(finite(pad.axes[0] ?? 0), finite(pad.axes[1] ?? 0)) > bindings.gamepad.deadZone;

  // ---------------------------------------------------------------------------------------------- random events
  const key = (type: 'keydown' | 'keyup', code: string, repeat = false): void => {
    window.dispatchEvent(new KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true }));
  };
  const mouseEvent = (type: 'mousedown' | 'mouseup', button: number): void => {
    window.dispatchEvent(new MouseEvent(type, { button, bubbles: true, cancelable: true }));
  };

  const randomEvent = (): void => {
    const r = rnd();
    if (r < 0.24) {
      // a key
      const down = [...keys];
      if (down.length && rnd() < 0.5) {
        const code = pick(down);
        key('keyup', code);
        keys.delete(code);
      } else {
        const code = pick(KEY_POOL);
        if (keys.has(code)) key('keydown', code, true); // auto-repeat: no effect
        else {
          key('keydown', code);
          if (boundKeyCodes(bindings).has(code)) keys.add(code);
          else key('keyup', code);
        }
      }
    } else if (r < 0.3) {
      const button = pick([0, 2, 1]);
      if (mouse.has(button)) {
        mouseEvent('mouseup', button);
        mouse.delete(button);
      } else {
        mouseEvent('mousedown', button);
        if (button === 0 || button === 2) mouse.add(button);
        else mouseEvent('mouseup', button);
      }
    } else if (r < 0.62) {
      // a finger
      const id = 1 + Math.floor(rnd() * 5);
      const t = tick * (1000 / 60);
      const held = owners.get(id);
      if (held === undefined) {
        const target = pick(TARGETS);
        const x = rnd() * 844;
        const y = rnd() * 390;
        // the model of who may take what: a finger holds one thing; a button, and the zone, one finger at a time
        const taken = target === 'zone' ? zoneFinger() !== null : target === 'attack' || target === 'dash' || target === 'ability' || target === 'interact' ? [...owners.values()].includes(target) : false;
        const ok = touch.down(id, target, x, y, t);
        if (ok === taken) bad(`finger ${id} on "${target}": ${ok ? 'accepted though it was taken' : 'refused though it was free'}`);
        if (ok) {
          owners.set(id, target);
          if (target === 'zone') zoneUsed = true;
          if (target === 'bottle' || target.startsWith('bottle:')) {
            bottleAsked = true;
            bottleSlot = target === 'bottle' ? -1 : Number(target.slice(7));
          }
        } else totals.refusedFingers++;
      } else {
        const what = rnd();
        if (what < 0.5) touch.move(id, rnd() * 844, rnd() * 390, t);
        else if (what < 0.5 + 0.35) {
          touch.up(id);
          owners.delete(id);
        } else {
          touch.cancel(id);
          owners.delete(id);
        }
      }
      // a finger that is not the one the model says
      if (touch.ownerOf(id) !== owners.get(id)) bad(`finger ${id} owns "${touch.ownerOf(id)}", the model says "${owners.get(id)}"`);
      if (touch.active !== owners.size) bad(`${touch.active} fingers own something, the model says ${owners.size}`);
      if (zoneFinger() !== null) zoneUsed = true;
    } else if (r < 0.9) {
      // the pad
      const w = rnd();
      if (w < 0.25) pad.stick(pick([0, 0, 0.1, -0.15, 0.5, 1, -1, NaN, 0.9]), pick([0, 0, 0.1, -0.15, 0.5, 1, -1, Infinity, 0.3]));
      else if (w < 0.6) pad.press(Math.floor(rnd() * 16));
      else if (w < 0.85) pad.release(Math.floor(rnd() * 16));
      else if (w < 0.9) pad.analog(Math.floor(rnd() * 16), rnd());
      else if (w < 0.94) pad.neutral();
      else if (w < 0.97) pad.disconnect();
      else pad.connected = true;
    } else if (r < 0.95) {
      window.dispatchEvent(new Event('blur')); // the window lost the focus: nothing the keyboard or the mouse held stays held
      keys.clear();
      mouse.clear();
    } else if (r < 0.97) {
      touch.releaseAll(); // the device turned, the app was hidden
      owners.clear();
    }
    refresh();
  };

  /** Lets go of everything the proper way: key-ups, mouse-ups, fingers lifted, the pad neutral and plugged in. */
  const calm = (): void => {
    for (const code of [...keys]) key('keyup', code);
    keys.clear();
    for (const b of [...mouse]) mouseEvent('mouseup', b);
    mouse.clear();
    for (const id of [...owners.keys()]) touch.up(id);
    owners.clear();
    pad.neutral();
    pad.connected = true;
    refresh();
  };

  // ---------------------------------------------------------------------------------------------- the check
  const verify = (calmNow: boolean): void => {
    // the pad is read when the frame is built: its changes since the last sample land now
    for (const a of PAD_ACTIONS) padPolledUpdate(a);
    refresh();
    const f = input.sample();
    totals.samples++;

    if (!Number.isFinite(f.move.x) || !Number.isFinite(f.move.y) || Math.abs(f.move.x) > 1 || Math.abs(f.move.y) > 1) bad(`move (${f.move.x}, ${f.move.y}) is not inside the unit box`);
    if (f.bottleSlot < -1 || f.bottleSlot > 2) bad(`bottleSlot ${f.bottleSlot}`);
    if (!f.bottlePressed && f.bottleSlot !== -1) bad(`bottleSlot ${f.bottleSlot} with no bottle press`);
    if (!['keyboard', 'touch', 'gamepad'].includes(f.device)) bad(`device "${f.device}"`);

    // what is held, is held — and nothing else is
    const held: Array<[string, boolean, Action]> = [
      ['attackHeld', f.attackHeld, 'attack'],
      ['dashHeld', f.dashHeld, 'dash'],
      ['abilityHeld', f.abilityHeld, 'ability'],
    ];
    if (zoneFinger() === null) held.push(['jumpHeld', f.jumpHeld, 'jump']);
    for (const [name, got, a] of held) if (got !== agg(a)) bad(`${name} is ${got} but the model says ${agg(a)} (keys ${[...keys].join(',')}; fingers ${[...owners].map(([i, t]) => `${i}:${t}`).join(',')}; pad ${pad.connected})`);

    // a press that happened since the last sample is an edge, even if it was let go again before the sample
    const edge: Record<(typeof EDGE_ACTIONS)[number], boolean> = {
      attack: f.attackPressed, dash: f.dashPressed, ability: f.abilityPressed, bottle: f.bottlePressed, interact: f.interactPressed, pause: f.pausePressed,
    };
    for (const a of EDGE_ACTIONS) {
      const want = rose.has(a) || (a === 'bottle' && bottleAsked);
      if (edge[a] !== want) bad(`${a}Pressed is ${edge[a]} but a press ${want ? 'happened' : 'did not happen'} since the last sample`);
      if (want) totals.edges++;
    }
    if (f.bottlePressed && bottleAsked && f.bottleSlot !== bottleSlot) bad(`bottleSlot ${f.bottleSlot}, the finger asked for ${bottleSlot}`);
    if (!zoneUsedSinceSample && !zoneActiveBefore && zoneFinger() === null) {
      if (f.jumpPressed !== rose.has('jump')) bad(`jumpPressed is ${f.jumpPressed} but ${rose.has('jump') ? 'a press' : 'no press'} happened`);
      if (f.jumpReleased !== fell.has('jump')) bad(`jumpReleased is ${f.jumpReleased} but ${fell.has('jump') ? 'a release' : 'no release'} happened`);
    }

    // movement: with no finger on the zone and the stick at rest, it is exactly what the digital directions say
    if (zoneFinger() === null && !zoneUsedSinceSample && !stickActive()) {
      let dx = (agg('right') ? 1 : 0) - (agg('left') ? 1 : 0);
      const dy = (agg('up') ? 1 : 0) - (agg('down') ? 1 : 0);
      if (agg('walk') && dx !== 0) dx *= 0.5;
      if (f.move.x !== dx || f.move.y !== dy) bad(`move (${f.move.x}, ${f.move.y}) but the digital directions say (${dx}, ${dy})`);
    }

    // when everything has been let go, the frame is silent
    if (calmNow) {
      totals.calms++;
      const silent = !f.attackHeld && !f.dashHeld && !f.abilityHeld && !f.jumpHeld && f.move.x === 0 && f.move.y === 0;
      if (!silent) bad(`after letting go of everything: held ${[f.attackHeld, f.dashHeld, f.abilityHeld, f.jumpHeld].join('/')}, move (${f.move.x}, ${f.move.y})`);
      if (touch.active !== 0) bad(`${touch.active} fingers still own something after everything was lifted`);
      const g = input.sample();
      if (g.attackPressed || g.dashPressed || g.abilityPressed || g.bottlePressed || g.interactPressed || g.jumpPressed || g.jumpReleased) bad('an edge survived two samples');
    }
    rose.clear();
    fell.clear();
    bottleAsked = false;
    bottleSlot = -1;
    zoneUsedSinceSample = false;
    zoneActiveBefore = zoneFinger() !== null;
  };
  let zoneUsedSinceSample = false;
  const padPolledUpdate = (a: Action): void => {
    const now = padNow(a);
    if (padPolled.get(a) !== now) padPolled.set(a, now);
  };

  // ---------------------------------------------------------------------------------------------- run
  for (tick = 0; tick < TICKS; tick++) {
    const n = 1 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) randomEvent();
    zoneUsedSinceSample ||= zoneUsed || zoneFinger() !== null;
    zoneUsed = false;
    // two keys of the same action down together is the case that is easiest to get wrong: count how often it is exercised
    for (const a of ACTIONS) if (bindings.keyboard[a].filter((c) => keys.has(c)).length > 1) totals.twoKeysOneAction++;
    if (rnd() < 0.004) {
      calm();
      verify(true);
    } else verify(false);
  }
  store.dispose();
  return { violations, totals };
}

describe('input soak: keyboard, mouse, five fingers and a gamepad at random, against a naive model', () => {
  const results = SEEDS.map((seed) => run(seed));

  it('breaks no invariant, on any seed, on any sample', () => {
    expect(results.flatMap((r) => r.violations)).toEqual([]);
  });

  it('really plays: edges, refused fingers, simultaneous keys for one action, and moments of calm', () => {
    const sum = (f: (t: Totals) => number): number => results.reduce((n, r) => n + f(r.totals), 0);
    expect(sum((t) => t.samples)).toBe(SEEDS.length * TICKS);
    expect(sum((t) => t.edges)).toBeGreaterThan(500);
    expect(sum((t) => t.refusedFingers)).toBeGreaterThan(100);
    expect(sum((t) => t.twoKeysOneAction)).toBeGreaterThan(100);
    expect(sum((t) => t.calms)).toBeGreaterThan(20);
  });

  it('is deterministic: the same seed gives the same totals', () => {
    expect(run(SEEDS[0]!).totals).toEqual(results[0]!.totals);
  });
});
