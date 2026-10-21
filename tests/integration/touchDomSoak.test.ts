// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { InputManager } from '@/input/InputManager';
import type { TouchTarget } from '@/input/sources/TouchSource';
import { TouchSource } from '@/input/sources/TouchSource';
import { TouchControls } from '@/ui/touch/TouchControls';
import { discsOverlap, type ButtonPlacements } from '@/ui/touch/layout';

/**
 * SOAK of the touch layer as DOM (docs/PROMPT5-LOG.md S20): pointer events thrown at the real elements — down, move, up, cancel and
 * lost capture, from five fingers at once, on buttons that are hidden, shown and hidden again under a finger — while the window
 * is resized, loses focus, rotates, is hidden and shown, and the whole layer is switched off and on. After every event the DOM and
 * the input must agree: a button LOOKS pressed iff a finger owns it; a button that is not there is owned by nobody; a layer that
 * is not there holds no finger; whatever the manager reports held is a finger on its button; and when the fingers are gone,
 * nothing is left pressed. Since docs/PROMPT15-LOG.md the buttons also change SIZE and PLACE under the fingers (the player places them), the dash comes and goes like the magic, and the whole layer
 * steps aside while the editor has the screen: a button is always where the layout says, never overlapping another, and a layer that has stepped aside holds no finger.
 */
const TICKS = Math.max(1000, Number(process.env['SOAK_TICKS'] ?? 4000));
const SEEDS = Array.from({ length: Math.max(3, Number(process.env['SOAK_SEEDS'] ?? 3)) }, (_, i) => [5, 17, 999][i] ?? 7000 + i * 15485863);
const IDS = [1, 2, 3, 4, 5, 6];
const TESTIDS = ['touch-zone', 'touch-attack', 'touch-dash', 'touch-ability', 'touch-chip'] as const;
const TARGET_OF: Record<(typeof TESTIDS)[number], TouchTarget> = { 'touch-zone': 'zone', 'touch-attack': 'attack', 'touch-dash': 'dash', 'touch-ability': 'ability', 'touch-chip': 'bottle' };

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function run(seed: number): { violations: string[]; downs: number; hidden: number; releases: number } {
  const rnd = lcg(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const violations: string[] = [];
  let step = 0;
  const bad = (what: string): void => {
    if (violations.length < 10) violations.push(`seed ${seed}, event ${step}: ${what}`);
  };
  let downs = 0;
  let hidden = 0;
  let releases = 0;
  /** The layer is stepping aside for the editor: nothing is shown to a finger. */
  let suspended = false;

  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.appendChild(host);
  const input = new InputManager();
  const source = new TouchSource(input);
  const tr = createTranslator(CATALOGS, 'es');
  const controls = new TouchControls(host, source, tr);
  controls.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 });
  const el = (id: string): HTMLElement => host.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  const shown = (id: string): boolean => el(id).style.display !== 'none' && controls.isVisible && !suspended; // a browser sends nothing to what is not displayed, or to what is hidden
  const owner = (id: number): TouchTarget | undefined => source.ownerOf(id);
  const ownedBy = (t: TouchTarget): number[] => IDS.filter((i) => owner(i) === t);
  const ptr = (type: string, id: number, x = 100, y = 200): PointerEvent => new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' });

  const sizes: Array<[number, number]> = [[844, 390], [844, 390], [932, 430], [390, 844], [1024, 768]];

  const verify = (releasedNow: boolean): void => {
    const owned = IDS.filter((i) => owner(i) !== undefined);
    if (source.active !== owned.length) bad(`${source.active} fingers own something, ${owned.length} are visible through ownerOf`);
    for (const id of TESTIDS) {
      const t = TARGET_OF[id];
      if (t === 'zone') continue;
      const pressed = el(id).querySelector('div')?.dataset['pressed'] === '1';
      const held = ownedBy(t).length > 0;
      // the chip is a TAP (it has no "held": two fingers may tap it, and the first to lift ends its pressed look); a button is HELD by one finger
      if (t === 'bottle') {
        if (pressed && !held) bad(`${id} looks pressed but no finger owns it`);
      } else {
        if (pressed !== held) bad(`${id} looks ${pressed ? 'pressed' : 'released'} but ${held ? 'a finger owns it' : 'no finger owns it'}`);
        if (ownedBy(t).length > 1) bad(`${id} is owned by ${ownedBy(t).length} fingers`);
      }
      if (!shown(id) && held) bad(`${id} is not displayed and a finger still owns it`);
    }
    if (!controls.isVisible && source.active !== 0) bad(`the layer is hidden and ${source.active} fingers still hold something`);
    if (suspended && source.active !== 0) bad(`the layer has stepped aside and ${source.active} fingers still hold something`);
    // every button is where the layout says (the touch area is the disc, centred), and no two touch areas overlap — however they were placed and sized
    const l = controls.current;
    for (const id of ['attack', 'dash', 'ability', 'chip'] as const) {
      const box = el(`touch-${id}`);
      const d = l[id];
      const cx = Number.parseFloat(box.style.left) + Number.parseFloat(box.style.width) / 2;
      const cy = Number.parseFloat(box.style.top) + Number.parseFloat(box.style.height) / 2;
      if (Math.abs(cx - d.cx) > 1e-3 || Math.abs(cy - d.cy) > 1e-3 || Math.abs(Number.parseFloat(box.style.width) - d.hit) > 1e-3) bad(`${id} is not where the layout says`);
    }
    for (const [a, b] of [['attack', 'dash'], ['attack', 'ability'], ['dash', 'ability'], ['attack', 'chip'], ['dash', 'chip'], ['ability', 'chip']] as const) {
      if (discsOverlap(l[a], l[b])) bad(`${a} and ${b} overlap`);
    }
    const f = input.sample();
    for (const [name, got, t] of [['attackHeld', f.attackHeld, 'attack'], ['dashHeld', f.dashHeld, 'dash'], ['abilityHeld', f.abilityHeld, 'ability']] as const) {
      if (got !== ownedBy(t).length > 0) bad(`${name} is ${got} but ${ownedBy(t).length} fingers own "${t}"`);
    }
    if (releasedNow) {
      releases++;
      if (source.active !== 0) bad(`${source.active} fingers still own something after a release`);
      for (const id of TESTIDS) if (TARGET_OF[id] !== 'zone' && el(id).querySelector('div')?.dataset['pressed'] === '1') bad(`${id} still looks pressed after a release`);
      if (f.attackHeld || f.dashHeld || f.abilityHeld || f.jumpHeld || f.move.x !== 0 || f.move.y !== 0) bad('input is not silent after a release');
    }
  };

  for (step = 0; step < TICKS; step++) {
    const r = rnd();
    let releasedNow = false;
    if (r < 0.34) {
      // a finger lands
      const id = pick(IDS);
      const testid = pick(TESTIDS);
      if (shown(testid)) {
        el(testid).dispatchEvent(ptr('pointerdown', id, 50 + rnd() * 300, 100 + rnd() * 250));
        downs++;
      } else hidden++;
    } else if (r < 0.52) {
      const id = pick(IDS);
      const t = owner(id);
      const testid = TESTIDS.find((x) => TARGET_OF[x] === t) ?? pick(TESTIDS);
      if (shown(testid)) el(testid).dispatchEvent(ptr('pointermove', id, 20 + rnd() * 500, 20 + rnd() * 350));
    } else if (r < 0.74) {
      // a finger leaves: lifted, cancelled, or its capture lost — on its own element, or on one it never touched
      const id = pick(IDS);
      const t = owner(id);
      const testid = rnd() < 0.8 ? (TESTIDS.find((x) => TARGET_OF[x] === t) ?? pick(TESTIDS)) : pick(TESTIDS);
      if (shown(testid)) el(testid).dispatchEvent(ptr(pick(['pointerup', 'pointerup', 'pointercancel', 'lostpointercapture']), id));
    } else if (r < 0.78) {
      controls.setAbility(rnd() < 0.5, rnd() < 0.5);
    } else if (r < 0.82) {
      controls.setDash(rnd() < 0.8, rnd() < 0.5);
    } else if (r < 0.86) {
      controls.setChip(rnd() < 0.5);
    } else if (r < 0.88) {
      controls.setScale(0.8 + rnd() * 0.6); // the player's size slider: what moved lets go
      releasedNow = true;
    } else if (r < 0.9) {
      // the editor's Save (or Default): some buttons placed, the others not
      const placed: ButtonPlacements = rnd() < 0.3 ? {} : { ...(rnd() < 0.7 ? { attack: { x: rnd(), y: rnd(), scale: 0.7 + rnd() * 0.8 } } : {}), ...(rnd() < 0.7 ? { dash: { x: rnd(), y: rnd(), scale: 0.7 + rnd() * 0.8 } } : {}), ...(rnd() < 0.7 ? { ability: { x: rnd(), y: rnd(), scale: 0.7 + rnd() * 0.8 } } : {}) };
      controls.setButtons(placed);
      releasedNow = true;
    } else if (r < 0.915) {
      suspended = rnd() < 0.5; // the editor opens or closes
      controls.setSuspended(suspended);
      releasedNow = suspended;
    } else if (r < 0.93) {
      controls.setVisible(rnd() < 0.6);
      releasedNow = !controls.isVisible;
    } else if (r < 0.96) {
      const [w, h] = pick(sizes);
      controls.place(w, h, { top: 0, right: 0, bottom: 0, left: 0 });
    } else if (r < 0.975) {
      window.dispatchEvent(new Event('blur'));
      releasedNow = true;
    } else if (r < 0.985) {
      window.dispatchEvent(new Event('orientationchange'));
      releasedNow = true;
    } else if (r < 0.993) {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      releasedNow = true;
    } else {
      controls.releaseAll();
      releasedNow = true;
    }
    verify(releasedNow);
  }
  controls.dispose();
  return { violations, downs, hidden, releases };
}

describe('touch layer soak: five fingers, buttons that come and go, a window that moves, loses focus and turns', () => {
  const results = SEEDS.map((seed) => run(seed));

  it('breaks no invariant, on any seed, on any event', () => {
    expect(results.flatMap((r) => r.violations)).toEqual([]);
  });

  it('really plays: fingers that land, buttons that were not there, releases', () => {
    const sum = (f: (r: (typeof results)[number]) => number): number => results.reduce((n, r) => n + f(r), 0);
    expect(sum((r) => r.downs)).toBeGreaterThan(800);
    expect(sum((r) => r.hidden)).toBeGreaterThan(80);
    expect(sum((r) => r.releases)).toBeGreaterThan(80);
  });
});
