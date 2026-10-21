// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { InputManager } from '@/input/InputManager';
import { TouchSource } from '@/input/sources/TouchSource';
import { TOUCH_BUTTONS, TOUCH_LIMITS } from '@/save/SettingsData';
import { TOUCH_ART } from '@/ui/touch/art';
import { computeTouchLayout, discsOverlap, NO_INSETS, pointOf, touchFrame, type ButtonId, type ButtonPlacements, type Insets, type Rect } from '@/ui/touch/layout';
import { TouchControls } from '@/ui/touch/TouchControls';
import { TouchEditor } from '@/ui/touch/TouchEditor';

/**
 * THE EDITOR OF THE TOUCH BUTTONS (docs/PROMPT15-LOG.md): a mode where a finger on a button MOVES it. Everything it must not do is as much a part of the test as what it does: it never presses a button of
 * the game, never takes a button where the game cannot have it, never keeps anything the player did not ask to keep, and never leaves the real layer hidden.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;
function pointer(type: string, id: number, x: number, y: number): PointerEvent {
  return new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' });
}
const rectOf = (d: { cx: number; cy: number; hit: number }): Rect => ({ x0: d.cx - d.hit / 2, y0: d.cy - d.hit / 2, x1: d.cx + d.hit / 2, y1: d.cy + d.hit / 2 });
function reaches(d: { cx: number; cy: number; hit: number }, r: Rect): boolean {
  const nx = Math.max(r.x0, Math.min(d.cx, r.x1));
  const ny = Math.max(r.y0, Math.min(d.cy, r.y1));
  return Math.hypot(d.cx - nx, d.cy - ny) < d.hit / 2 - 1e-6;
}

describe('the editor of the touch buttons', () => {
  let parent: HTMLDivElement;
  let editor: TouchEditor;
  let controls: TouchControls;
  let input: InputManager;
  const tr = createTranslator(CATALOGS, 'es');
  const state: { width: number; height: number; insets: Insets; hudScale: number; scale: number; buttons: ButtonPlacements } = { width: 844, height: 390, insets: NO_INSETS, hudScale: 1, scale: 1, buttons: {} };
  const log: { saved: ButtonPlacements[]; suspended: boolean[]; done: number } = { saved: [], suspended: [], done: 0 };

  /** The editor and the real layer side by side, wired as the game wires them: the editor's `suspend` is the layer's, and what it saves is what the layer then lays out. */
  function make(): void {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    input = new InputManager();
    controls = new TouchControls(parent, new TouchSource(input), tr);
    controls.place(state.width, state.height, state.insets);
    editor = new TouchEditor(parent, tr, {
      window: () => ({ width: state.width, height: state.height, insets: state.insets, hudScale: state.hudScale }),
      current: () => ({ scale: state.scale, buttons: state.buttons }),
      save: (buttons) => {
        log.saved.push(buttons);
        state.buttons = buttons;
        controls.setButtons(buttons);
      },
      suspend: (s) => {
        log.suspended.push(s);
        controls.setSuspended(s);
      },
      done: () => void log.done++,
    });
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    Object.assign(state, { width: 844, height: 390, insets: NO_INSETS, hudScale: 1, scale: 1, buttons: {} });
    Object.assign(log, { saved: [], suspended: [], done: 0 });
    tr.setLocale('es');
    make();
  });
  afterEach(() => {
    editor.dispose();
    controls.dispose();
    tr.setLocale('es');
  });

  const hit = (id: ButtonId): HTMLElement => q(parent, `touch-editor-${id}`);
  const centre = (id: ButtonId): { x: number; y: number } => ({ x: editor.current[id].cx, y: editor.current[id].cy });
  const sample = () => input.sample();
  /** A finger takes a button, goes to `(x, y)` in a few steps and lets go. */
  function drag(id: ButtonId, x: number, y: number, pointerId = 1, lift = true): void {
    const from = centre(id);
    hit(id).dispatchEvent(pointer('pointerdown', pointerId, from.x, from.y));
    for (let i = 1; i <= 6; i++) hit(id).dispatchEvent(pointer('pointermove', pointerId, from.x + ((x - from.x) * i) / 6, from.y + ((y - from.y) * i) / 6));
    if (lift) hit(id).dispatchEvent(pointer('pointerup', pointerId, x, y));
  }

  describe('opening', () => {
    it('has the screen over the game: the real layer steps aside, the three buttons are where the settings put them, and it is a dialog', () => {
      expect(editor.active).toBe(false);
      expect(getComputedStyle(editor.root).display).toBe('none');
      state.buttons = { dash: { x: 0.3, y: 0.8, scale: 1 } };
      editor.open();
      expect(editor.active).toBe(true);
      expect(log.suspended).toEqual([true]);
      expect(getComputedStyle(editor.root).display).toBe('block');
      expect(editor.root.getAttribute('role')).toBe('dialog');
      expect(editor.root.getAttribute('aria-modal')).toBe('true');
      expect(editor.root.hasAttribute('data-ui-block')).toBe(true);
      const want = computeTouchLayout(844, 390, NO_INSETS, { buttons: state.buttons });
      for (const id of TOUCH_BUTTONS) {
        expect(Number.parseFloat(hit(id).style.left) + Number.parseFloat(hit(id).style.width) / 2, id).toBeCloseTo(want[id].cx, 3);
        expect(Number.parseFloat(hit(id).style.top) + Number.parseFloat(hit(id).style.height) / 2, id).toBeCloseTo(want[id].cy, 3);
      }
      expect(editor.pending).toEqual(state.buttons);
      // the first button is the chosen one, and looks it
      expect(editor.chosen).toBe('attack');
      expect([hit('attack').dataset['selected'], hit('dash').dataset['selected'], hit('ability').dataset['selected']]).toEqual(['1', '0', '0']);
    });

    it('each button is the artist\'s PNG (the same file the game\'s own button shows), by the same code, at the size the layout gives it', () => {
      editor.open();
      for (const id of TOUCH_BUTTONS) {
        const img = hit(id).querySelector('img');
        expect(img!.getAttribute('src'), id).toBe(TOUCH_ART[id]);
        expect(hit(id).querySelector('svg, canvas'), id).toBeNull();
        expect(Number.parseFloat((hit(id).firstElementChild as HTMLElement).style.height), id).toBeCloseTo(editor.current[id].visual, 3);
      }
      // the three of them are there even when the hero has no card: the player can place the magic button before they have it
      expect(getComputedStyle(hit('ability')).display).not.toBe('none');
    });

    it('shows what the buttons keep out of (the HUD, the pause button, the boss\'s bar) and the movement zone', () => {
      editor.open();
      const f = touchFrame(844, 390);
      for (const [name, r] of [['hud', f.hud], ['pause', f.pause], ['boss', f.boss]] as const) {
        const el = q(parent, `touch-editor-keep-${name}`);
        expect(Number.parseFloat(el.style.left), name).toBeCloseTo(r.x0, 3);
        expect(Number.parseFloat(el.style.top), name).toBeCloseTo(r.y0, 3);
        expect(Number.parseFloat(el.style.width), name).toBeCloseTo(r.x1 - r.x0, 3);
        expect(el.getAttribute('aria-hidden'), name).toBe('true');
      }
      const zone = q(parent, 'touch-editor-zone');
      expect(Number.parseFloat(zone.style.left)).toBeCloseTo(editor.current.zone.x, 3);
      expect(Number.parseFloat(zone.style.width)).toBeCloseTo(editor.current.zone.w, 3);
      expect(zone.textContent).toBe('Zona de movimiento');
    });

    it('its words are the translator\'s, in both languages', () => {
      editor.open();
      expect(q(parent, 'touch-editor-title').textContent).toBe('Editar botones táctiles');
      expect(q(parent, 'touch-editor-save').textContent).toBe('Guardar');
      expect(q(parent, 'touch-editor-cancel').textContent).toBe('Cancelar');
      expect(hit('attack').getAttribute('aria-label')).toContain('Atacar');
      tr.setLocale('en');
      expect(q(parent, 'touch-editor-title').textContent).toBe('Edit touch buttons');
      expect(q(parent, 'touch-editor-save').textContent).toBe('Save');
      expect(q(parent, 'touch-editor-mirror').textContent).toBe('Swap sides');
      expect(hit('dash').getAttribute('aria-label')).toContain('Dash');
      expect(q(parent, 'touch-editor-size-row').textContent).toContain('Size: Attack');
    });
  });

  describe('a finger on a button MOVES it: nothing is pressed', () => {
    it('dragging any of the three never attacks, dashes or casts — not a press, not a hold — and the movement gesture does not start either', () => {
      editor.open();
      for (const id of TOUCH_BUTTONS) {
        const from = centre(id);
        hit(id).dispatchEvent(pointer('pointerdown', 7, from.x, from.y));
        let f = sample();
        expect([f.attackPressed, f.attackHeld, f.dashPressed, f.dashHeld, f.abilityPressed, f.abilityHeld], `${id}: down`).toEqual([false, false, false, false, false, false]);
        hit(id).dispatchEvent(pointer('pointermove', 7, from.x - 80, from.y - 50));
        f = sample();
        expect([f.attackHeld, f.dashHeld, f.abilityHeld, f.move.x, f.move.y], `${id}: moving`).toEqual([false, false, false, 0, 0]);
        hit(id).dispatchEvent(pointer('pointerup', 7, from.x - 80, from.y - 50));
        f = sample();
        expect([f.attackPressed, f.dashPressed, f.abilityPressed, f.device], `${id}: up (and the last device is not touch because of the editor)`).not.toContain(true);
      }
    });

    it('the real layer is not there to be touched while it is open: hidden, and — whatever reaches it — it holds nothing and passes nothing to the game', () => {
      editor.open();
      expect(q(parent, 'touch-layer').style.visibility).toBe('hidden');
      for (const id of ['touch-attack', 'touch-dash', 'touch-zone']) {
        q(parent, id).dispatchEvent(pointer('pointerdown', 3, 700, 340));
        q(parent, id).dispatchEvent(pointer('pointermove', 3, 650, 340));
        expect(sample().attackHeld || sample().dashHeld || sample().move.x !== 0, id).toBe(false);
      }
      // a finger on the editor's own scrim (the rest of the screen) does nothing to the game either
      editor.root.dispatchEvent(pointer('pointerdown', 4, 100, 300));
      editor.root.dispatchEvent(pointer('pointermove', 4, 180, 300));
      expect(sample().move.x).toBe(0);
      expect(editor.pending).toEqual({});
      editor.cancel();
      // …and once it is closed the layer answers again
      q(parent, 'touch-attack').dispatchEvent(pointer('pointerdown', 5, 700, 340));
      expect(sample().attackHeld).toBe(true);
    });

    it('the button follows the finger and keeps the point it was taken by (it does not jump to be centred on it)', () => {
      editor.open();
      const from = centre('attack');
      hit('attack').dispatchEvent(pointer('pointerdown', 1, from.x + 10, from.y - 6));
      hit('attack').dispatchEvent(pointer('pointermove', 1, from.x + 10 - 200, from.y - 6 - 40));
      const to = centre('attack');
      expect(to.x).toBeCloseTo(from.x - 200, 0);
      expect(to.y).toBeCloseTo(from.y - 40, 0);
      hit('attack').dispatchEvent(pointer('pointerup', 1, from.x + 10 - 200, from.y - 6 - 40));
    });

    it('a drag that is let go keeps the place as a fraction of the safe area, only for the button that was moved', () => {
      editor.open();
      drag('attack', 300, 200);
      const pending = editor.pending;
      expect(Object.keys(pending)).toEqual(['attack']);
      expect(pending.attack!.x).toBeCloseTo(300 / 844, 3);
      expect(pending.attack!.y).toBeCloseTo(200 / 390, 3);
      expect(pending.attack!.scale).toBe(1);
      // the other two are where the design has them still
      const design = computeTouchLayout(844, 390);
      for (const id of ['dash', 'ability'] as const) expect(editor.current[id].cx, id).toBeCloseTo(design[id].cx, 6);
    });

    it('a tap (a finger that does not move) only chooses the button: the slider is its, and nothing is changed', () => {
      editor.open();
      const from = centre('dash');
      hit('dash').dispatchEvent(pointer('pointerdown', 1, from.x, from.y));
      hit('dash').dispatchEvent(pointer('pointermove', 1, from.x + 1, from.y + 1)); // a finger is never quite still
      hit('dash').dispatchEvent(pointer('pointerup', 1, from.x + 1, from.y + 1));
      expect(editor.chosen).toBe('dash');
      expect(hit('dash').dataset['selected']).toBe('1');
      expect(hit('attack').dataset['selected']).toBe('0');
      expect(editor.pending).toEqual({});
      expect(q(parent, 'touch-editor-size-row').textContent).toContain('Esquiva');
    });

    it('a touch that is cancelled (the system took it) is as if it had not been: the button goes back where it was', () => {
      state.buttons = { attack: { x: 0.5, y: 0.5, scale: 1 } };
      editor.open();
      const before = centre('attack');
      drag('attack', 200, 100, 1, false);
      expect(centre('attack').x).toBeCloseTo(200, 0);
      hit('attack').dispatchEvent(pointer('pointercancel', 1, 200, 100));
      expect(centre('attack')).toEqual(before);
      expect(editor.pending).toEqual(state.buttons);
      // and one that was never placed goes back to the design's place, and is not placed
      editor.cancel();
      state.buttons = {};
      editor.open();
      drag('dash', 200, 100, 1, false);
      hit('dash').dispatchEvent(pointer('pointercancel', 1, 200, 100));
      expect(editor.pending).toEqual({});
      expect(centre('dash').x).toBeCloseTo(computeTouchLayout(844, 390).dash.cx, 6);
    });

    it('one hand at a time: a second finger on another button while one is dragging is ignored', () => {
      editor.open();
      const a = centre('attack');
      const d = centre('dash');
      hit('attack').dispatchEvent(pointer('pointerdown', 1, a.x, a.y));
      hit('dash').dispatchEvent(pointer('pointerdown', 2, d.x, d.y));
      hit('dash').dispatchEvent(pointer('pointermove', 2, d.x - 100, d.y - 100));
      expect(editor.chosen).toBe('attack');
      expect(centre('dash').x).toBeCloseTo(d.x, 6);
      hit('attack').dispatchEvent(pointer('pointerup', 1, a.x, a.y));
    });
  });

  describe('it never takes a button where the game cannot have it', () => {
    it('a button taken to the HUD, the pause button or the boss\'s bar stops against them, and the others do not move for it', () => {
      editor.open();
      const f = touchFrame(844, 390);
      const design = computeTouchLayout(844, 390);
      for (const [what, x, y] of [['the HUD', (f.hud.x0 + f.hud.x1) / 2, (f.hud.y0 + f.hud.y1) / 2], ['the pause button', (f.pause.x0 + f.pause.x1) / 2, (f.pause.y0 + f.pause.y1) / 2], ['the bar', 422, 360]] as const) {
        drag('attack', x, y);
        for (const r of [f.hud, f.pause, f.boss]) expect(reaches(editor.current.attack, r), `${what}: ${JSON.stringify(r)}`).toBe(false);
        for (const id of ['dash', 'ability'] as const) expect(editor.current[id].cx, `${what}: ${id} stayed`).toBeCloseTo(design[id].cx, 6);
        expect(editor.current.exact, what).toBe(true);
      }
    });

    it('a button taken onto another stops against it: they never overlap, and it is the one in the hand that gives way', () => {
      editor.open();
      const dash = centre('dash');
      drag('attack', dash.x, dash.y);
      expect(discsOverlap(editor.current.attack, editor.current.dash)).toBe(false);
      expect(editor.current.dash.cx).toBeCloseTo(computeTouchLayout(844, 390).dash.cx, 6);
      // the magic button onto the attack button, the small onto the big
      const attack = centre('attack');
      drag('ability', attack.x, attack.y);
      for (const id of ['attack', 'dash'] as const) expect(discsOverlap(editor.current.ability, editor.current[id]), `magic / ${id}`).toBe(false);
    });

    it('a button taken off the screen is held inside the safe area (a notch and a home indicator included), and keeps the margin of the sides', () => {
      state.insets = { top: 0, right: 47, bottom: 21, left: 47 };
      editor.dispose();
      make();
      editor.open();
      for (const [x, y] of [[-200, -200], [2000, 2000], [-50, 500], [900, -30]] as const) {
        drag('dash', x, y);
        const d = editor.current.dash;
        const r = rectOf(d);
        expect(r.x0, `${x},${y}`).toBeGreaterThanOrEqual(47 - 1e-6);
        expect(r.x1, `${x},${y}`).toBeLessThanOrEqual(844 - 47 + 1e-6);
        expect(r.y0, `${x},${y}`).toBeGreaterThanOrEqual(0 - 1e-6);
        expect(r.y1, `${x},${y}`).toBeLessThanOrEqual(390 - 21 + 1e-6);
        expect(d.cx + d.visual / 2, `${x},${y}`).toBeLessThanOrEqual(844 - 47 - 28 * editor.current.controlScale + 1e-6);
      }
    });

    it('whatever the finger does, the layout is always one the game would keep: a long random drag session never leaves a button overlapping, out of the screen or on something', () => {
      editor.open();
      let seed = 7;
      const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const f = touchFrame(844, 390);
      for (let i = 0; i < 60; i++) {
        const id = TOUCH_BUTTONS[Math.floor(rnd() * 3)] as ButtonId;
        drag(id, rnd() * 900 - 30, rnd() * 430 - 20);
        const l = editor.current;
        for (const b of TOUCH_BUTTONS) {
          for (const kept of [f.hud, f.pause, f.boss]) expect(reaches(l[b], kept), `step ${i}: ${b}`).toBe(false);
          const r = rectOf(l[b]);
          expect(r.x0 >= -1e-6 && r.x1 <= 844 + 1e-6 && r.y0 >= -1e-6 && r.y1 <= 390 + 1e-6, `step ${i}: ${b} inside`).toBe(true);
          expect(l[b].hit, `step ${i}: ${b} is a finger`).toBeGreaterThanOrEqual(44 - 1e-6);
        }
        for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) expect(discsOverlap(l[TOUCH_BUTTONS[a] as ButtonId], l[TOUCH_BUTTONS[b] as ButtonId]), `step ${i}`).toBe(false);
      }
    });

    it('what is kept is what the player SAW: the layout of the saved places is the layout the editor showed (so the game lays out the same)', () => {
      editor.open();
      drag('attack', 300, 200);
      drag('ability', 60, 340);
      drag('dash', 500, 120);
      const shown = editor.current;
      editor.save();
      const kept = computeTouchLayout(844, 390, NO_INSETS, { buttons: log.saved[0] });
      for (const id of TOUCH_BUTTONS) expect(Math.hypot(kept[id].cx - shown[id].cx, kept[id].cy - shown[id].cy), id).toBeLessThan(0.1);
    });
  });

  describe('keeping and giving up', () => {
    it('Save keeps what was done — only the buttons the player touched, in the places they were left — and gives the screen back: the layer is back, and works', () => {
      editor.open();
      drag('attack', 300, 200);
      q(parent, 'touch-editor-save').click();
      expect(log.saved.length).toBe(1);
      expect(Object.keys(log.saved[0]!)).toEqual(['attack']);
      expect(log.saved[0]!.attack!.x).toBeCloseTo(300 / 844, 3);
      expect(log.suspended).toEqual([true, false]);
      expect(log.done).toBe(1);
      expect(editor.active).toBe(false);
      expect(getComputedStyle(editor.root).display).toBe('none');
      // the real buttons are back, at the new place, and a finger on them acts as always
      expect(q(parent, 'touch-layer').style.visibility).toBe('');
      const a = controls.current.attack;
      expect(a.cx).toBeCloseTo(300, 0);
      q(parent, 'touch-attack').dispatchEvent(pointer('pointerdown', 1, a.cx, a.cy));
      expect(sample().attackHeld).toBe(true);
      q(parent, 'touch-attack').dispatchEvent(pointer('pointerup', 1, a.cx, a.cy));
      for (const id of ['dash', 'ability'] as const) {
        const d = controls.current[id];
        controls.setAbility(true);
        q(parent, `touch-${id}`).dispatchEvent(pointer('pointerdown', 2, d.cx, d.cy));
        expect(id === 'dash' ? sample().dashHeld : sample().abilityHeld, id).toBe(true);
        q(parent, `touch-${id}`).dispatchEvent(pointer('pointerup', 2, d.cx, d.cy));
      }
    });

    it('Cancel keeps nothing, and the layer is back exactly as it was', () => {
      editor.open();
      drag('attack', 300, 200);
      drag('dash', 100, 100);
      q(parent, 'touch-editor-cancel').click();
      expect(log.saved).toEqual([]);
      expect(log.suspended).toEqual([true, false]);
      expect(log.done).toBe(1);
      expect(controls.current.attack.cx).toBeCloseTo(computeTouchLayout(844, 390).attack.cx, 6);
      expect(editor.active).toBe(false);
    });

    it('Escape gives up (and is not the pause key: the game never sees it), and so does closing it from outside', () => {
      let seen = 0;
      const onKey = (): void => void seen++;
      document.addEventListener('keydown', onKey);
      editor.open();
      drag('attack', 300, 200);
      const e = new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true });
      hit('attack').dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      expect(seen, 'it never reached the page').toBe(0);
      expect(log.saved).toEqual([]);
      expect(log.done).toBe(1);
      expect(editor.active).toBe(false);
      document.removeEventListener('keydown', onKey);
      // a second Cancel (the menu asks to close) is nothing
      editor.cancel();
      expect(log.done).toBe(1);
    });

    it('opened again it starts from what the settings hold, not from what was given up; and buttons the player never touched are never turned into placed ones by saving', () => {
      state.buttons = { dash: { x: 0.3, y: 0.8, scale: 1.2 } };
      editor.open();
      drag('attack', 300, 200);
      editor.cancel();
      editor.open();
      expect(editor.pending).toEqual(state.buttons);
      drag('ability', 500, 150);
      editor.save();
      expect(Object.keys(log.saved[0]!).sort()).toEqual(['ability', 'dash']);
      expect(log.saved[0]!.dash).toEqual({ x: 0.3, y: 0.8, scale: 1.2 });
    });

    it('disposed while open, it gives the real layer back (a page that is torn down leaves nothing hidden)', () => {
      editor.open();
      expect(q(parent, 'touch-layer').style.visibility).toBe('hidden');
      editor.dispose();
      expect(q(parent, 'touch-layer').style.visibility).toBe('');
      make(); // (afterEach disposes what the test made last)
    });
  });

  describe('the buttons of the panel', () => {
    const tap = (id: string, pointerId = 9, clickToo = false): void => {
      const b = q(parent, id);
      b.dispatchEvent(pointer('pointerdown', pointerId, 700, 120));
      b.dispatchEvent(pointer('pointerup', pointerId, 700, 120));
      if (clickToo) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    };

    it('a finger acts when it lifts, even when the browser makes no click of the tap (it does not, soon after a drag on a surface that takes no scrolling): the first press of Save is never lost', () => {
      editor.open();
      drag('attack', 300, 200);
      tap('touch-editor-save'); // a tap with no click after it
      expect(log.saved.length).toBe(1);
      expect(log.done).toBe(1);
    });

    it('and a tap that does come with its click is one press, not two', () => {
      editor.open();
      tap('touch-editor-reset', 9, true);
      tap('touch-editor-mirror', 10, true);
      tap('touch-editor-mirror', 11, true);
      expect(editor.current.side).toBe('right'); // mirrored twice: once each, never twice at a time
      tap('touch-editor-cancel', 12, true);
      expect(log.done).toBe(1);
      expect(log.saved).toEqual([]);
    });

    it('a mouse, a pen and the keyboard act on the click, as any button does', () => {
      editor.open();
      q(parent, 'touch-editor-mirror').click();
      expect(editor.current.side).toBe('left');
      q(parent, 'touch-editor-save').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', bubbles: true }));
      q(parent, 'touch-editor-save').dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', bubbles: true }));
      expect(log.saved.length, 'a mouse press waits for its click').toBe(0);
      q(parent, 'touch-editor-save').click();
      expect(log.saved.length).toBe(1);
    });

    it('a touch that is cancelled, or that began elsewhere, presses nothing', () => {
      editor.open();
      const b = q(parent, 'touch-editor-save');
      b.dispatchEvent(pointer('pointerdown', 5, 700, 120));
      b.dispatchEvent(pointer('pointercancel', 5, 700, 120));
      b.dispatchEvent(pointer('pointerup', 5, 700, 120));
      b.dispatchEvent(pointer('pointerup', 6, 700, 120)); // a finger that never went down on it
      expect(log.saved.length).toBe(0);
      expect(editor.active).toBe(true);
    });
  });

  describe('the other things the player can do', () => {
    it('Default puts every button back where the design has it and forgets the sizes — and can still be given up', () => {
      state.buttons = { attack: { x: 0.2, y: 0.7, scale: 1.4 }, ability: { x: 0.9, y: 0.2, scale: 0.8 } };
      editor.open();
      q(parent, 'touch-editor-reset').click();
      expect(editor.pending).toEqual({});
      const design = computeTouchLayout(844, 390);
      for (const id of TOUCH_BUTTONS) expect(editor.current[id].cx, id).toBeCloseTo(design[id].cx, 6);
      expect(editor.active).toBe(true);
      editor.cancel();
      expect(log.saved).toEqual([]);
      editor.open();
      q(parent, 'touch-editor-reset').click();
      editor.save();
      expect(log.saved).toEqual([{}]);
    });

    it('Swap sides turns the three buttons over from side to side, for the other hand: all three are then placed, and the zone goes to the other side', () => {
      editor.open();
      const before = editor.current;
      expect(before.side).toBe('right');
      q(parent, 'touch-editor-mirror').click();
      const after = editor.current;
      expect(after.side).toBe('left');
      expect(Object.keys(editor.pending).sort()).toEqual(['ability', 'attack', 'dash']);
      for (const id of TOUCH_BUTTONS) {
        expect(after[id].cx, `${id} is on the left half`).toBeLessThan(422);
        expect(after[id].cx, `${id} is the mirror image`).toBeCloseTo(844 - before[id].cx, 0);
        expect(after[id].cy, `${id}: as high as it was`).toBeCloseTo(before[id].cy, 0);
      }
      expect(after.zone.x + after.zone.w).toBeCloseTo(844, 3);
      // twice is back where it was
      q(parent, 'touch-editor-mirror').click();
      for (const id of TOUCH_BUTTONS) expect(editor.current[id].cx, id).toBeCloseTo(before[id].cx, 0);
    });

    it('the size of the chosen button has a slider: its own size, 70 – 150 %, on top of the size of all of them; choosing another button shows its size', () => {
      editor.open();
      const size = q(parent, 'touch-editor-size') as HTMLInputElement;
      expect([size.min, size.max, size.value]).toEqual([String(TOUCH_LIMITS.button.min), String(TOUCH_LIMITS.button.max), '1']);
      const before = editor.current.attack.visual;
      size.value = '1.4';
      size.dispatchEvent(new Event('input', { bubbles: true }));
      expect(editor.current.attack.visual / before).toBeCloseTo(1.4, 6);
      expect(editor.pending.attack!.scale).toBe(1.4);
      expect(q(parent, 'touch-editor-size-row').textContent).toContain('140%');
      // the others did not change size
      expect(editor.current.dash.visual).toBeCloseTo(before, 6);
      // choosing another button: its own size is shown
      const d = centre('dash');
      hit('dash').dispatchEvent(pointer('pointerdown', 1, d.x, d.y));
      hit('dash').dispatchEvent(pointer('pointerup', 1, d.x, d.y));
      expect(size.value).toBe('1');
      size.value = '0.7';
      size.dispatchEvent(new Event('input', { bubbles: true }));
      expect(editor.current.dash.visual / before).toBeCloseTo(0.7, 6);
      expect(editor.current.dash.hit, 'smaller, but still a finger').toBeGreaterThanOrEqual(44 - 1e-6);
      expect(editor.pending.attack!.scale).toBe(1.4);
    });

    it('a size the window cannot hold is not given: the slider stops at the biggest it can, and the layout stays exactly as the game would lay it out', () => {
      state.width = 400;
      state.height = 225;
      editor.dispose();
      make();
      editor.open();
      const size = q(parent, 'touch-editor-size') as HTMLInputElement;
      size.value = String(TOUCH_LIMITS.button.max);
      size.dispatchEvent(new Event('input', { bubbles: true }));
      expect(editor.current.exact).toBe(true);
      expect(Number(size.value)).toBeLessThanOrEqual(TOUCH_LIMITS.button.max);
      expect(Number(size.value)).toBeGreaterThanOrEqual(1);
      expect(editor.pending.attack!.scale).toBeCloseTo(Number(size.value), 6);
    });

    it('the arrow keys move the chosen button (a step; Shift a bigger one) — the editor can be used with a keyboard; they stop where the finger would stop; and never while a slider has them', () => {
      editor.open();
      const from = centre('attack');
      const press = (code: string, target: Element, init: KeyboardEventInit = {}): KeyboardEvent => {
        const e = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true, ...init });
        target.dispatchEvent(e);
        return e;
      };
      const e = press('ArrowDown', hit('attack'));
      expect(e.defaultPrevented).toBe(true);
      expect(centre('attack').y).toBeCloseTo(from.y + 8, 1); // (a place is kept to a tenth of a pixel)
      expect(centre('attack').x).toBeCloseTo(from.x, 1);
      press('ArrowUp', hit('attack'), { shiftKey: true });
      expect(centre('attack').y).toBeCloseTo(from.y + 8 - 32, 1);
      expect(Object.keys(editor.pending)).toEqual(['attack']);
      // toward the magic button the step stops against it, and toward the edge against the edge: never overlapping, never outside
      for (let i = 0; i < 12; i++) press('ArrowLeft', hit('attack'), { shiftKey: true });
      expect(discsOverlap(editor.current.attack, editor.current.ability)).toBe(false);
      expect(discsOverlap(editor.current.attack, editor.current.dash)).toBe(false);
      // with the focus on another button, that button moves (and is chosen)
      const d = centre('dash');
      press('ArrowDown', hit('dash'));
      expect(editor.chosen).toBe('dash');
      expect(centre('dash').y).toBeGreaterThanOrEqual(d.y - 1e-6);
      // a slider keeps its own arrows
      const size = q(parent, 'touch-editor-size');
      const before = centre('dash');
      const k = press('ArrowLeft', size);
      expect(k.defaultPrevented).toBe(false);
      expect(centre('dash')).toEqual(before);
    });

    it('follows the window: turned or resized while it is open, the buttons keep their place on the screen', () => {
      state.buttons = { dash: { x: 0.3, y: 0.8, scale: 1 } };
      editor.open();
      state.width = 1280;
      state.height = 720;
      window.dispatchEvent(new Event('resize'));
      expect(editor.current.dash.cx / 1280).toBeCloseTo(0.3, 3);
      expect(editor.current.dash.cy / 720).toBeCloseTo(0.8, 3);
      expect(editor.current.gestureScale).toBeCloseTo(computeTouchLayout(1280, 720).gestureScale, 9);
      // closed, a resize costs nothing
      editor.cancel();
      state.width = 844;
      window.dispatchEvent(new Event('resize'));
      expect(editor.active).toBe(false);
    });

    it('the HUD the player made bigger is respected: the buttons keep out of it at its size', () => {
      state.hudScale = 1.35;
      editor.open();
      const big = touchFrame(844, 390, NO_INSETS, 1.35);
      const p = pointOf(big, 0.1, 0.1);
      drag('dash', p.x + 20, p.y + 20);
      expect(reaches(editor.current.dash, big.hud)).toBe(false);
    });
  });

  it('the editor never reaches the touch source: it does not even know it (the only way a button of the game is pressed is the real layer)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, '../../../src/ui/touch/TouchEditor.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    expect(source).not.toMatch(/TouchSource|InputManager|setAction|\.down\(|requestBottle|releaseAll/);
  });
});
