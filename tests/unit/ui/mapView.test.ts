// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import { MapView } from '@/ui/map/MapView';
import { fitView, FIT_PAD, TOOLS_CORNER, toScreen, ZOOM, ZOOM_STEP } from '@/ui/map/viewport';
import { EMPTY_SCENE, type MapScene } from '@/world/worldMap';
import { shippedScene } from '../../helpers/pauseHost';

/**
 * THE MAP AS IT IS DRAWN AND MOVED (docs/PROMPT19-LOG.md): the scene comes in whole, rooms and marks come out; a drag, a wheel, a pinch, the keys and the three buttons move the view; what the player moved is kept
 * when the scene is drawn again; and nothing in it is a game input.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const all = (root: ParentNode, selector: string): HTMLElement[] => [...root.querySelectorAll(selector)] as HTMLElement[];

describe('the map view', () => {
  let parent: HTMLDivElement;
  let view: MapView;
  const tr = createTranslator(CATALOGS, 'es');
  for (const [lang, entries] of Object.entries(MENU_CATALOGS)) tr.extend(lang, entries);

  const two = (): MapScene => shippedScene(['r1_gate', 'r2_hall'], ['defeated:r1_slime'], 'r2_hall');

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    parent = document.createElement('div');
    document.body.appendChild(parent);
    tr.setLocale('es');
    view = new MapView(parent, tr);
    view.resize(800, 400);
  });
  afterEach(() => {
    view.dispose();
    tr.setLocale('es');
  });

  const pointer = (type: string, id: number, x: number, y: number): PointerEvent => new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' });
  /** A wheel as a browser makes it (the test environment's `WheelEvent` keeps neither the position nor the modifiers). */
  const wheel = (deltaY: number, x: number, y: number, ctrlKey = false): WheelEvent => {
    const e = new MouseEvent('wheel', { clientX: x, clientY: y, ctrlKey, bubbles: true, cancelable: true });
    Object.defineProperties(e, { deltaY: { value: deltaY }, deltaX: { value: 0 }, deltaMode: { value: 0 } });
    return e as WheelEvent;
  };
  const key = (k: string, extra: KeyboardEventInit = {}): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
    view.root.dispatchEvent(e);
    return e;
  };

  describe('what it draws', () => {
    it('draws the rooms of the scene and no others, the one the hero is in marked', () => {
      view.update(two());
      expect(all(view.root, '.map-room').map((r) => r.dataset['room'])).toEqual(['r1_gate', 'r2_hall']);
      expect(q(view.root, 'map-room-r2_hall').dataset['current']).toBe('1');
      expect(q(view.root, 'map-room-r1_gate').dataset['current']).toBe('0');
      expect(view.root.dataset['rooms']).toBe('2');
      expect(view.root.dataset['empty']).toBe('0');
    });

    it('puts the hero on the map where the scene says, and the mark follows the view', () => {
      const scene = two();
      view.update(scene, { recentre: true });
      const hero = q(view.root, 'map-hero');
      expect(hero.dataset['room']).toBe('r2_hall');
      const at = toScreen(view.view, { x: scene.hero!.x, y: scene.hero!.y });
      const m = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(hero.getAttribute('transform') ?? '')!;
      expect(Number(m[1])).toBeCloseTo(at.x, 0);
      expect(Number(m[2])).toBeCloseTo(at.y, 0);
      view.panBy(40, -10);
      const moved = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(hero.getAttribute('transform') ?? '')!;
      expect(Number(moved[1])).toBeCloseTo(Number(m[1]) + 40, 0);
    });

    it('draws a shut way as a lock and a way into the unknown as a dashed stub, a way between two known rooms as a connection', () => {
      view.update(shippedScene(['r1_gate'], []));
      const east = q(view.root, 'map-door-r1_gate:east');
      expect(east.dataset['state']).toBe('locked');
      expect(east.dataset['known']).toBe('0');
      expect(east.querySelector('.map-glyph-lock')).toBeTruthy();
      expect(view.root.querySelectorAll('.map-stub')).toHaveLength(1);
      expect(view.root.querySelectorAll('.map-link')).toHaveLength(0);
      view.update(two());
      expect(q(view.root, 'map-door-r1_gate:east').dataset['state']).toBe('open');
      expect(q(view.root, 'map-door-r1_gate:east').dataset['known']).toBe('1');
      expect(view.root.querySelectorAll('.map-link')).toHaveLength(1);
      // the way on from R2 still leads into the unknown
      expect(q(view.root, 'map-door-r2_hall:east').dataset['known']).toBe('0');
      expect(view.root.querySelectorAll('.map-stub')).toHaveLength(1);
    });

    it('draws the places of interest of the rooms it shows, with the state the flags give them', () => {
      view.update(shippedScene(['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum'], [], 'r4_sanctum'));
      const kinds = all(view.root, '.map-poi').map((p) => p.dataset['kind']).sort();
      expect(kinds).toEqual(['boss', 'rest', 'rest', 'seal']);
      expect(all(view.root, '.map-poi').every((p) => p.dataset['done'] === '0')).toBe(true);
      view.update(shippedScene(['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum'], ['broken:r3_seal', 'defeated:r4_boss'], 'r4_sanctum'));
      const done = all(view.root, '.map-poi[data-done="1"]').map((p) => p.dataset['kind']).sort();
      expect(done).toEqual(['boss', 'seal']);
    });

    it('draws a gate that is shut and leaves out one that is open', () => {
      view.update(shippedScene(['r1_gate'], []));
      expect(view.root.querySelectorAll('.map-gate')).toHaveLength(1);
      view.update(shippedScene(['r1_gate'], ['defeated:r1_slime']));
      expect(view.root.querySelectorAll('.map-gate')).toHaveLength(0);
    });

    it('writes the name of a room in its own language, only where the room is wide enough on the screen to hold it', () => {
      view.update(two(), { recentre: true });
      const name = (id: string): HTMLElement => view.root.querySelector(`.map-name[data-room="${id}"]`) as HTMLElement;
      expect(name('r2_hall').textContent).toBe('Galería de Raíces');
      expect(name('r2_hall').style.display).toBe('');
      tr.setLocale('en');
      expect(name('r2_hall').textContent).toBe('Root Gallery');
      view.zoomBy(0.01); // all the way out: a room is a mark
      expect(name('r2_hall').style.display).toBe('none');
    });

    it('names the zones that have something discovered in them', () => {
      view.update(shippedScene(['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum'], [], 'r4_sanctum'), { recentre: true });
      view.zoomBy(1.0);
      const regions = all(view.root, '.map-region').map((r) => r.textContent);
      expect(regions).toEqual(['Ruinas del bosque antiguo', 'Santuario']);
    });

    it('says in words what it shows, for a screen reader: where the hero is and how many rooms are known', () => {
      view.update(two());
      expect(q(view.root, 'map-summary').textContent).toBe('Estás en Galería de Raíces. Salas descubiertas: 2 de 4.');
      expect(all(view.root, '[data-testid="map-rooms"] li').map((li) => li.textContent)).toEqual(['Puerta de las Ruinas', 'Estás en Galería de Raíces']);
      expect(view.root.getAttribute('aria-label')).toBe('Mapa del mundo');
      tr.setLocale('en');
      expect(q(view.root, 'map-summary').textContent).toBe('You are in Root Gallery. Rooms discovered: 2 of 4.');
    });

    it('with nothing to show says so, and offers no zoom', () => {
      view.update(EMPTY_SCENE);
      expect(q(view.root, 'map-empty').hidden).toBe(false);
      expect(q(view.root, 'map-empty').textContent).toBe('No hay mapa de este lugar.');
      expect(view.root.dataset['empty']).toBe('1');
      expect(view.root.querySelectorAll('.map-room')).toHaveLength(0);
      expect((view.root.querySelector('.map-tools') as HTMLElement).style.display).toBe('none');
      view.update(two());
      expect(q(view.root, 'map-empty').hidden).toBe(true);
      expect((view.root.querySelector('.map-tools') as HTMLElement).style.display).toBe('');
    });
  });

  describe('the view', () => {
    it('opens on everything discovered, fitted to the panel — and, where that would put the map under the zoom buttons, to what is left of it', () => {
      const scene = two();
      view.update(scene, { recentre: true });
      expect(view.view).toEqual(fitView(scene.bounds!, { width: 800, height: 400 }, FIT_PAD, TOOLS_CORNER));
      expect(Number(view.root.dataset['scale'])).toBeCloseTo(view.view.scale, 3);
      // a short panel: the map would reach the corner of the buttons, so its east end (a door, its stub) is left of them
      view.resize(800, 240);
      view.update(scene, { recentre: true });
      expect(toScreen(view.view, { x: scene.bounds!.x1, y: scene.bounds!.y0 }).x).toBeLessThanOrEqual(800 - TOOLS_CORNER.width);
    });

    it('fits again when the panel changes size, until the player has moved it — then it keeps what the player has', () => {
      view.update(two(), { recentre: true });
      const before = view.view.scale;
      view.resize(400, 400);
      expect(view.view.scale).toBeLessThan(before);
      view.zoomBy(1.5);
      const kept = { ...view.view };
      view.resize(900, 450);
      expect(view.view.scale).toBeCloseTo(kept.scale, 6);
      expect(view.root.dataset['moved']).toBe('1');
    });

    it('draws a new scene without undoing what the player moved, unless it is asked to start again', () => {
      view.update(two(), { recentre: true });
      view.zoomBy(2);
      view.panBy(30, 5);
      const kept = { ...view.view };
      view.update(two());
      expect(view.view).toEqual(kept);
      view.update(two(), { recentre: true });
      expect(view.view.scale).not.toBeCloseTo(kept.scale, 3);
      expect(view.root.dataset['moved']).toBe('0');
    });
  });

  describe('a mouse and fingers', () => {
    beforeEach(() => view.update(two(), { recentre: true }));

    it('a drag moves the map with the pointer, whatever the pointer', () => {
      const x0 = view.view.x;
      const y0 = view.view.y;
      view.root.dispatchEvent(pointer('pointerdown', 1, 300, 200));
      expect(view.root.dataset['dragging']).toBe('1');
      view.root.dispatchEvent(pointer('pointermove', 1, 340, 215));
      expect(view.view.x).toBeCloseTo(x0 + 40, 6);
      expect(view.view.y).toBeCloseTo(y0 + 15, 6);
      view.root.dispatchEvent(pointer('pointerup', 1, 340, 215));
      expect(view.root.dataset['dragging']).toBe('0');
      view.root.dispatchEvent(pointer('pointermove', 1, 600, 300)); // nobody is holding: nothing moves
      expect(view.view.x).toBeCloseTo(x0 + 40, 6);
    });

    it('forgets the fingers that are on it when asked — the menu put it away, or closed, under a finger — so the next drag is a drag and not a pinch with a ghost', () => {
      const s0 = view.view.scale;
      view.root.dispatchEvent(pointer('pointerdown', 1, 300, 200)); // a finger rests on the map…
      expect(view.root.dataset['dragging']).toBe('1');
      view.cancelGestures(); // …and the map is put away
      expect(view.root.dataset['dragging']).toBe('0');
      const x0 = view.view.x;
      view.root.dispatchEvent(pointer('pointerdown', 2, 500, 200)); // with the ghost of the first this would be two fingers, and a pinch
      view.root.dispatchEvent(pointer('pointermove', 2, 540, 200));
      expect(view.view.scale).toBeCloseTo(s0, 9);
      expect(view.view.x).toBeCloseTo(x0 + 40, 6);
      view.root.dispatchEvent(pointer('pointerup', 1, 300, 200)); // the first finger, lifting out of sight, changes nothing
      view.root.dispatchEvent(pointer('pointermove', 2, 560, 200));
      expect(view.view.scale).toBeCloseTo(s0, 9);
      expect(view.view.x).toBeCloseTo(x0 + 60, 6);
    });

    it('a capture that is lost is a finger that is gone (whatever the reason: the lift, a cancel, an element taken away under it)', () => {
      view.root.dispatchEvent(pointer('pointerdown', 1, 300, 200));
      view.root.dispatchEvent(pointer('pointerdown', 2, 400, 200));
      view.root.dispatchEvent(pointer('lostpointercapture', 1, 300, 200));
      view.root.dispatchEvent(pointer('lostpointercapture', 2, 400, 200));
      expect(view.root.dataset['dragging']).toBe('0');
      const x0 = view.view.x;
      view.root.dispatchEvent(pointer('pointermove', 1, 340, 200)); // nobody is holding: nothing moves
      expect(view.view.x).toBe(x0);
    });

    it('never lets the map be dragged out of the panel altogether', () => {
      view.root.dispatchEvent(pointer('pointerdown', 1, 100, 100));
      view.root.dispatchEvent(pointer('pointermove', 1, 100 + 50_000, 100));
      const b = view.shown.bounds!;
      expect(b.x0 * view.view.scale + view.view.x).toBeLessThanOrEqual(800 - 60);
    });

    it('two fingers zoom about their middle: the point between them stays between them', () => {
      const scene = two();
      const middle = { x: 400, y: 200 };
      const mapAt = { x: (middle.x - view.view.x) / view.view.scale, y: (middle.y - view.view.y) / view.view.scale };
      const before = view.view.scale;
      view.root.dispatchEvent(pointer('pointerdown', 1, 350, 200));
      view.root.dispatchEvent(pointer('pointerdown', 2, 450, 200));
      view.root.dispatchEvent(pointer('pointermove', 1, 300, 200));
      view.root.dispatchEvent(pointer('pointermove', 2, 500, 200));
      expect(view.view.scale).toBeCloseTo(before * 2, 4);
      const back = toScreen(view.view, mapAt);
      expect(back.x).toBeCloseTo(middle.x, 3);
      expect(back.y).toBeCloseTo(middle.y, 3);
      view.root.dispatchEvent(pointer('pointerup', 2, 500, 200));
      view.root.dispatchEvent(pointer('pointermove', 1, 320, 210)); // one finger left: it drags
      view.root.dispatchEvent(pointer('pointerup', 1, 320, 210));
      expect(view.root.dataset['dragging']).toBe('0');
      expect(scene.rooms).toHaveLength(2);
    });

    it('the wheel zooms into the cursor and does not scroll the page', () => {
      const cursor = { x: 250, y: 120 };
      const mapAt = { x: (cursor.x - view.view.x) / view.view.scale, y: (cursor.y - view.view.y) / view.view.scale };
      const before = view.view.scale;
      const e = wheel(-120, cursor.x, cursor.y);
      view.root.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      expect(view.view.scale).toBeGreaterThan(before);
      const back = toScreen(view.view, mapAt);
      expect(back.x).toBeCloseTo(cursor.x, 3);
      expect(back.y).toBeCloseTo(cursor.y, 3);
      view.root.dispatchEvent(wheel(400, cursor.x, cursor.y));
      expect(view.view.scale).toBeLessThan(before * 1.2);
    });

    it('never zooms past the least and the most scale', () => {
      for (let i = 0; i < 80; i++) view.zoomBy(1.4);
      expect(view.view.scale).toBe(ZOOM.max);
      for (let i = 0; i < 200; i++) view.zoomBy(1 / 1.4);
      expect(view.view.scale).toBe(ZOOM.min);
    });
  });

  describe('the keyboard and the buttons', () => {
    beforeEach(() => view.update(two(), { recentre: true }));

    it('is a focusable region with a name, so the keys are for it only once the player has gone to it', () => {
      expect(view.root.tabIndex).toBe(0);
      expect(view.root.getAttribute('role')).toBe('group');
      expect(view.root.getAttribute('aria-roledescription')).toBe('map');
    });

    it('the arrows move the map the way the finger would, + and − zoom, 0 and Home come back, and each key is taken (it is not the page\'s)', () => {
      const x0 = view.view.x;
      const y0 = view.view.y;
      expect(key('ArrowLeft').defaultPrevented).toBe(true);
      expect(view.view.x).toBeGreaterThan(x0); // the map moves right: the view goes left
      key('ArrowDown');
      expect(view.view.y).toBeLessThan(y0);
      const s0 = view.view.scale;
      key('+');
      expect(view.view.scale).toBeGreaterThan(s0);
      key('-');
      key('-');
      expect(view.view.scale).toBeLessThan(s0);
      key('0');
      expect(view.view.scale).toBeCloseTo(s0, 6);
      expect(view.view.x).toBeCloseTo(x0, 6);
      key('ArrowRight');
      key('Home');
      expect(view.view.x).toBeCloseTo(x0, 6);
    });

    it('leaves alone what it does not use, and the keys with a modifier (they are the browser\'s)', () => {
      expect(key('Tab').defaultPrevented).toBe(false);
      expect(key('Enter').defaultPrevented).toBe(false);
      expect(key('+', { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(key('ArrowLeft', { altKey: true }).defaultPrevented).toBe(false);
    });

    it('the three buttons zoom in, zoom out and come back to the opening view; each has a name in both languages, and the limits switch them off', () => {
      const s0 = view.view.scale;
      q(view.root, 'map-zoom-in').click();
      expect(view.view.scale).toBeGreaterThan(s0);
      q(view.root, 'map-zoom-out').click();
      expect(view.view.scale).toBeCloseTo(s0, 6);
      q(view.root, 'map-zoom-in').click();
      q(view.root, 'map-center').click();
      expect(view.view.scale).toBeCloseTo(s0, 6);
      expect(q(view.root, 'map-zoom-in').getAttribute('aria-label')).toBe('Acercar el mapa');
      expect(q(view.root, 'map-center').getAttribute('aria-label')).toBe('Centrar el mapa en tu posición');
      tr.setLocale('en');
      expect(q(view.root, 'map-zoom-out').getAttribute('aria-label')).toBe('Zoom the map out');
      for (let i = 0; i < 80; i++) view.zoomBy(1.4);
      expect((q(view.root, 'map-zoom-in') as HTMLButtonElement).disabled).toBe(true);
      expect((q(view.root, 'map-zoom-out') as HTMLButtonElement).disabled).toBe(false);
    });

    it('a finger presses a button when it LIFTS — the browser makes no click of a tap that follows a drag or a pinch on the map (docs/PROMPT15-LOG.md §6.4) — and the click that does come is not a second press', () => {
      const s0 = view.view.scale;
      const zoomIn = q(view.root, 'map-zoom-in');
      // a drag on the map, then straight to the button: down and up on it, and no click
      view.root.dispatchEvent(pointer('pointerdown', 1, 300, 200));
      view.root.dispatchEvent(pointer('pointermove', 1, 340, 215));
      view.root.dispatchEvent(pointer('pointerup', 1, 340, 215));
      zoomIn.dispatchEvent(pointer('pointerdown', 2, 700, 350));
      zoomIn.dispatchEvent(pointer('pointerup', 2, 700, 350));
      expect(view.view.scale).toBeCloseTo(s0 * ZOOM_STEP, 6);
      zoomIn.click(); // the click of that same tap, if the browser makes it
      expect(view.view.scale).toBeCloseTo(s0 * ZOOM_STEP, 6);
      // a mouse, a pen and the keyboard still act on the click
      q(view.root, 'map-zoom-out').click();
      expect(view.view.scale).toBeCloseTo(s0, 6);
    });

    it('pressing a button does not begin a drag of the map', () => {
      const x0 = view.view.x;
      q(view.root, 'map-zoom-in').dispatchEvent(pointer('pointerdown', 1, 700, 350));
      expect(view.root.dataset['dragging']).not.toBe('1');
      view.root.dispatchEvent(pointer('pointermove', 1, 760, 350));
      expect(view.view.x).toBe(x0);
    });
  });

  it('dispose takes it off the page and its listeners with it', () => {
    view.update(two(), { recentre: true });
    const x0 = view.view.x;
    const root = view.root;
    view.dispose();
    expect(parent.querySelector('.map-view')).toBeNull();
    root.dispatchEvent(pointer('pointerdown', 1, 10, 10));
    root.dispatchEvent(pointer('pointermove', 1, 90, 10));
    expect(view.view.x).toBe(x0);
  });
});
