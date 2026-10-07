// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InputManager } from '@/input/InputManager';
import { TouchSource } from '@/input/sources/TouchSource';
import { CATALOGS, createTranslator } from '@/i18n';
import { TouchControls } from '@/ui/touch/TouchControls';
import { computeTouchLayout } from '@/ui/touch/layout';
import { attachKeyboardMouse } from '@/input/sources/KeyboardMouseSource';
import { DisposableStore } from '@/core/lifecycle';
import { DEFAULT_BINDINGS } from '@/input/bindings';

/**
 * The touch layer as DOM (docs/ARCHITECTURE-2D.md §6.4): which elements exist, where they are, what the pointer events do.
 * Real fingers and multitouch are proven in the browser E2E (CDP touches); here the events are synthetic.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;

function pointer(type: string, id: number, x: number, y: number): PointerEvent {
  return new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' });
}

describe('touch controls (DOM)', () => {
  let host: HTMLDivElement;
  let input: InputManager;
  let source: TouchSource;
  let controls: TouchControls;
  const tr = createTranslator(CATALOGS, 'es');

  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    input = new InputManager();
    source = new TouchSource(input);
    controls = new TouchControls(host, source, tr);
    controls.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 });
  });
  afterEach(() => {
    controls.dispose();
    tr.setLocale('es');
  });

  it('has the movement zone and the Attack and Dash buttons; the Ability button and the bottle chip are hidden until they make sense', () => {
    expect(q(host, 'touch-zone')).not.toBeNull();
    for (const id of ['touch-attack', 'touch-dash']) expect(q(host, id).style.display, id).not.toBe('none');
    for (const id of ['touch-ability', 'touch-chip']) expect(q(host, id).style.display, id).toBe('none');
  });

  it('has NO joystick, NO jump button and NO permanent interaction or bottle button', () => {
    const ids = [...host.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid'));
    expect(ids.sort()).toEqual(['touch-ability', 'touch-attack', 'touch-chip', 'touch-dash', 'touch-layer', 'touch-zone']);
    expect(host.querySelector('[data-testid*="joystick"], [data-testid*="jump"], [data-testid*="interact"]')).toBeNull();
  });

  it('the movement zone draws nothing: no background, no children, no border', () => {
    const zone = q(host, 'touch-zone');
    expect(zone.children.length).toBe(0);
    expect(zone.style.background === 'transparent' || zone.style.background === '').toBe(true);
    expect(zone.style.border).toBe('');
    expect(zone.textContent).toBe('');
  });

  it('is placed by the layout: the zone, and every button centred where the design says (hit area and drawn disc)', () => {
    const l = computeTouchLayout(844, 390);
    const zone = q(host, 'touch-zone');
    expect(Number.parseFloat(zone.style.left)).toBeCloseTo(l.zone.x, 6);
    expect(Number.parseFloat(zone.style.width)).toBeCloseTo(l.zone.w, 6);
    expect(Number.parseFloat(zone.style.height)).toBeCloseTo(390, 6);
    for (const [id, d] of [['touch-attack', l.attack], ['touch-dash', l.dash], ['touch-ability', l.ability], ['touch-chip', l.chip]] as const) {
      const el = q(host, id);
      expect(Number.parseFloat(el.style.left) + Number.parseFloat(el.style.width) / 2, id).toBeCloseTo(d.cx, 6);
      expect(Number.parseFloat(el.style.top) + Number.parseFloat(el.style.height) / 2, id).toBeCloseTo(d.cy, 6);
      expect(Number.parseFloat(el.style.width), id).toBeCloseTo(d.hit, 6);
      expect(Number.parseFloat((el.firstElementChild as HTMLElement).style.width), id).toBeCloseTo(d.visual, 6);
    }
  });

  describe('where the player put the buttons (docs/PROMPT6-LOG.md S30)', () => {
    const at = (id: string): { cx: number; cy: number } => {
      const el = q(host, id);
      return { cx: Number.parseFloat(el.style.left) + Number.parseFloat(el.style.width) / 2, cy: Number.parseFloat(el.style.top) + Number.parseFloat(el.style.height) / 2 };
    };
    const NONE = { top: 0, right: 0, bottom: 0, left: 0 };

    it('the buttons go to the other side and the movement zone comes to this one: the DOM is the layout of that placement', () => {
      controls.setPlacement({ side: 'left', offsetX: 0, offsetY: 0 });
      const l = computeTouchLayout(844, 390, NONE, 1, undefined, { side: 'left', offsetX: 0, offsetY: 0 });
      expect(controls.current.side).toBe('left');
      for (const [id, d] of [['touch-attack', l.attack], ['touch-dash', l.dash]] as const) {
        expect(at(id).cx, id).toBeCloseTo(d.cx, 3);
        expect(at(id).cy, id).toBeCloseTo(d.cy, 3);
        expect(at(id).cx, `${id} is on the left half`).toBeLessThan(422);
      }
      const zone = q(host, 'touch-zone');
      expect(Number.parseFloat(zone.style.left)).toBeCloseTo(l.zone.x, 3);
      expect(Number.parseFloat(zone.style.left), 'the zone is on the right half').toBeGreaterThan(422);
      expect(Number.parseFloat(zone.style.left) + Number.parseFloat(zone.style.width)).toBeCloseTo(844, 3);
    });

    it('in and up: the offsets move the whole block together', () => {
      const a0 = at('touch-attack');
      const d0 = at('touch-dash');
      controls.setPlacement({ side: 'right', offsetX: 1, offsetY: 1 });
      const a1 = at('touch-attack');
      const d1 = at('touch-dash');
      expect(a1.cx).toBeLessThan(a0.cx);
      expect(a1.cy).toBeLessThan(a0.cy);
      expect(a1.cx - d1.cx).toBeCloseTo(a0.cx - d0.cx, 3);
      expect(a1.cy - d1.cy).toBeCloseTo(a0.cy - d0.cy, 3);
    });

    it('is given at construction as well: a saved game opens with the buttons where they were left', () => {
      const own = document.createElement('div');
      document.body.appendChild(own);
      const c = new TouchControls(own, new TouchSource(new InputManager()), tr, { placement: { side: 'left', offsetX: 0.5, offsetY: 0 } });
      c.place(844, 390, NONE);
      expect(c.current.side).toBe('left');
      expect(Number.parseFloat(q(own, 'touch-attack').style.left)).toBeLessThan(422);
      c.dispose();
    });

    it('the size and the placement keep each other: changing one does not forget the other', () => {
      controls.setPlacement({ side: 'left', offsetX: 0.5, offsetY: 0.5 });
      controls.setSize(1.3);
      const l = computeTouchLayout(844, 390, NONE, 1.3, undefined, { side: 'left', offsetX: 0.5, offsetY: 0.5 });
      expect(at('touch-attack').cx).toBeCloseTo(l.attack.cx, 3);
      expect(at('touch-attack').cy).toBeCloseTo(l.attack.cy, 3);
      controls.place(1280, 720, NONE);
      const m = computeTouchLayout(1280, 720, NONE, 1.3, undefined, { side: 'left', offsetX: 0.5, offsetY: 0.5 });
      expect(at('touch-attack').cx).toBeCloseTo(m.attack.cx, 3);
    });

    it('moving the buttons lets go of every finger: a thumb on a button that moved is no longer on it', () => {
      q(host, 'touch-attack').dispatchEvent(pointer('pointerdown', 1, 700, 340));
      expect(input.sample().attackHeld).toBe(true);
      controls.setPlacement({ side: 'left', offsetX: 0, offsetY: 0 });
      expect(input.sample().attackHeld).toBe(false);
    });
  });

  it('moves with the window and with the safe area (a notch pushes the buttons in)', () => {
    const before = Number.parseFloat(q(host, 'touch-attack').style.left);
    controls.place(844, 390, { top: 0, right: 47, bottom: 21, left: 47 });
    const after = Number.parseFloat(q(host, 'touch-attack').style.left);
    expect(after).toBeCloseTo(before - 47, 6);
  });

  it('accessible names come from the translator and follow the language', () => {
    expect(q(host, 'touch-attack').getAttribute('aria-label')).toBe('Atacar');
    tr.setLocale('en');
    expect(q(host, 'touch-attack').getAttribute('aria-label')).toBe('Attack');
    expect(q(host, 'touch-dash').getAttribute('aria-label')).toBe('Dash');
    expect(q(host, 'touch-ability').getAttribute('aria-label')).toBe('Ability');
    expect(q(host, 'touch-chip').getAttribute('aria-label')).toBe('Drink a bottle');
  });

  it('a finger on Attack presses the action at once and lets go when it lifts', () => {
    q(host, 'touch-attack').dispatchEvent(pointer('pointerdown', 1, 700, 340));
    let f = input.sample();
    expect([f.attackPressed, f.attackHeld, f.device]).toEqual([true, true, 'touch']);
    q(host, 'touch-attack').dispatchEvent(pointer('pointerup', 1, 700, 340));
    f = input.sample();
    expect(f.attackHeld).toBe(false);
  });

  it('the pressed look follows the finger (data-pressed on the drawn disc)', () => {
    const attack = q(host, 'touch-attack');
    const disc = attack.firstElementChild as HTMLElement;
    expect(disc.dataset['pressed']).toBe('0');
    attack.dispatchEvent(pointer('pointerdown', 1, 700, 340));
    expect(disc.dataset['pressed']).toBe('1');
    attack.dispatchEvent(pointer('pointercancel', 1, 700, 340));
    expect(disc.dataset['pressed']).toBe('0');
  });

  it('a drag in the zone runs; lifting the finger stops; a second finger in the zone is ignored', () => {
    const zone = q(host, 'touch-zone');
    zone.dispatchEvent(pointer('pointerdown', 1, 120, 300));
    zone.dispatchEvent(pointer('pointermove', 1, 176, 300));
    expect(input.sample().move.x).toBe(1);
    zone.dispatchEvent(pointer('pointerdown', 2, 60, 200));
    zone.dispatchEvent(pointer('pointermove', 2, 0, 200));
    expect(input.sample().move.x).toBe(1);
    zone.dispatchEvent(pointer('pointerup', 1, 176, 300));
    expect(input.sample().move.x).toBe(0);
  });

  it('move + attack with two fingers: neither interferes with the other', () => {
    const zone = q(host, 'touch-zone');
    zone.dispatchEvent(pointer('pointerdown', 1, 120, 300));
    zone.dispatchEvent(pointer('pointermove', 1, 176, 300));
    q(host, 'touch-attack').dispatchEvent(pointer('pointerdown', 2, 700, 340));
    let f = input.sample();
    expect([f.move.x, f.attackHeld]).toEqual([1, true]);
    q(host, 'touch-attack').dispatchEvent(pointer('pointerup', 2, 700, 340));
    f = input.sample();
    expect([f.move.x, f.attackHeld]).toEqual([1, false]);
  });

  it('a second finger on a held button is ignored and cannot steal its release', () => {
    const attack = q(host, 'touch-attack');
    attack.dispatchEvent(pointer('pointerdown', 1, 700, 340));
    attack.dispatchEvent(pointer('pointerdown', 2, 705, 345));
    attack.dispatchEvent(pointer('pointerup', 2, 705, 345));
    expect(input.sample().attackHeld).toBe(true);
    attack.dispatchEvent(pointer('pointerup', 1, 700, 340));
    expect(input.sample().attackHeld).toBe(false);
  });

  it('the moves of a button finger do not reach the gesture, and the events of an unknown pointer are harmless', () => {
    const dash = q(host, 'touch-dash');
    dash.dispatchEvent(pointer('pointerdown', 1, 650, 350));
    dash.dispatchEvent(pointer('pointermove', 1, 10, 10));
    dash.dispatchEvent(pointer('pointermove', 99, 10, 10));
    dash.dispatchEvent(pointer('pointerup', 99, 10, 10));
    const f = input.sample();
    expect([f.dashHeld, f.move.x]).toEqual([true, 0]);
  });

  it('window blur, a hidden app and a rotation all let go of every finger', () => {
    for (const how of ['blur', 'orientationchange'] as const) {
      q(host, 'touch-zone').dispatchEvent(pointer('pointerdown', 1, 120, 300));
      q(host, 'touch-zone').dispatchEvent(pointer('pointermove', 1, 176, 300));
      q(host, 'touch-attack').dispatchEvent(pointer('pointerdown', 2, 700, 340));
      expect(input.sample().move.x).toBe(1);
      window.dispatchEvent(new Event(how));
      const f = input.sample();
      expect([f.move.x, f.attackHeld], how).toEqual([0, false]);
    }
    q(host, 'touch-attack').dispatchEvent(pointer('pointerdown', 3, 700, 340));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(input.sample().attackHeld).toBe(false);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  it('a resize that changes the window releases the fingers (they are no longer where they were)', () => {
    q(host, 'touch-attack').dispatchEvent(pointer('pointerdown', 1, 700, 340));
    expect(input.sample().attackHeld).toBe(true);
    controls.place(932, 430, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(input.sample().attackHeld).toBe(false);
  });

  it('the Ability button appears with a card, shows its icon, dims without magic, and disappears (letting go of a held finger)', () => {
    const ability = q(host, 'touch-ability');
    controls.setAbility(true, 'spirit_bolt', true);
    expect(ability.style.display).not.toBe('none');
    expect(ability.querySelector('svg')).not.toBeNull();
    controls.setAbility(true, undefined, false);
    expect((ability.firstElementChild as HTMLElement).style.opacity).toBe('0.45');
    ability.dispatchEvent(pointer('pointerdown', 1, 640, 250));
    expect(input.sample().abilityHeld).toBe(true);
    controls.setAbility(false);
    expect(ability.style.display).toBe('none');
    expect(input.sample().abilityHeld).toBe(false);
  });

  it('the bottle chip is a contextual button: it fades in only when shown, and a tap drinks the next ready bottle', () => {
    const chip = q(host, 'touch-chip');
    controls.setChip(true);
    expect(chip.style.display).not.toBe('none');
    chip.dispatchEvent(pointer('pointerdown', 1, 770, 190));
    chip.dispatchEvent(pointer('pointerup', 1, 770, 190));
    const f = input.sample();
    expect([f.bottlePressed, f.bottleSlot]).toEqual([true, -1]);
    controls.setChip(false);
    expect(chip.style.display).toBe('none');
  });

  it('hiding the layer (a desktop) removes it from view and releases everything', () => {
    q(host, 'touch-attack').dispatchEvent(pointer('pointerdown', 1, 700, 340));
    controls.setVisible(false);
    expect((q(host, 'touch-layer')).style.display).toBe('none');
    expect(controls.isVisible).toBe(false);
    expect(input.sample().attackHeld).toBe(false);
    controls.setVisible(true);
    expect(q(host, 'touch-layer').style.display).toBe('');
  });

  it('the layer asks the mouse source to ignore clicks on it (a touch tap is never also a mouse "attack")', () => {
    expect(q(host, 'touch-layer').closest('[data-ui-block]')).not.toBeNull();
    const store = new DisposableStore();
    const kb = new InputManager();
    attachKeyboardMouse(store, kb, () => structuredClone(DEFAULT_BINDINGS));
    q(host, 'touch-zone').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(kb.sample().attackPressed).toBe(false);
    store.dispose();
  });

  it('is built for touch: no scrolling or zooming gestures, no text selection, the layer lets everything else through', () => {
    const layer = q(host, 'touch-layer');
    expect(layer.style.touchAction).toBe('none');
    expect(layer.style.pointerEvents).toBe('none');
    expect(q(host, 'touch-zone').style.pointerEvents).toBe('auto');
    expect(q(host, 'touch-attack').style.touchAction).toBe('none');
  });

  it('dispose removes the layer and every listener: later events do nothing', () => {
    const attack = q(host, 'touch-attack');
    controls.dispose();
    attack.dispatchEvent(pointer('pointerdown', 1, 700, 340));
    expect(input.sample().attackHeld).toBe(false);
    expect(host.querySelector('[data-testid="touch-layer"]')).toBeNull();
  });
});
