import { onPress } from '@/app/press';
import { listen } from '@/app/dom';
import { DisposableStore } from '@/core/lifecycle';
import type { Translator } from '@/i18n/translator';
import { EMPTY_SCENE, STUB_LENGTH, type MapScene, type SceneDoor, type ScenePoi, type SceneRoom } from '@/world/worldMap';
import { mapGlyph, mapIconSvg, type MapIconId } from './mapIcons';
import { clampView, FIT_PAD, KEEP_IN_VIEW, openingView, PAN_STEP, panBy, pinchOf, TOOLS_CORNER, toScreen, wheelFactor, ZOOM, ZOOM_STEP, zoomAbout, type Point, type Size, type View } from './viewport';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The text key of the name of a zone (a literal for each, so the catalogs can be held to them). A zone with no entry here has no name on the map. */
export const REGION_KEYS: Readonly<Record<string, string>> = {
  ancient_forest_ruins: 'region.ruins.name',
  ancient_forest_sanctum: 'region.sanctum.name',
};

/** A name is written inside its room only when the room is at least this wide on the screen (px): narrower, it would be written over its neighbour. */
const LABEL_MIN_WIDTH = 84;
/** The size of the marks on the screen (px): they do not grow with the zoom. */
const MARK = { poi: 17, door: 13, hero: 7 } as const;

function svg<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/**
 * THE MAP (DOM + SVG, docs/PROMPT19-LOG.md): the world the player has discovered, drawn from a `MapScene` (the pure description `world/worldMap` makes of what the game holds), seen through a view that can be
 * dragged and zoomed. Rooms, their terrain, the connections between them and the gates that shut them are drawn in the map's own units under one transform; names, doors, places of interest and the hero are marks on
 * the screen, placed by the same view, that stay the size of a finger however far in or out the map is.
 *
 * It decides nothing and owns no data: the scene comes in whole, the words come from the translator. It is moved by a mouse (drag, wheel), by fingers (drag, pinch), by a keyboard (arrows, + and −, 0) and by three
 * buttons (closer, farther, centre on the hero), and it never lets the map be dragged out of the panel altogether. A view the player has moved is kept when the scene is drawn again; the first view of a menu
 * that opens is the opening one (everything discovered if it can be read, else the hero's surroundings).
 */
export class MapView {
  readonly root: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly surface: SVGSVGElement;
  private readonly world: SVGGElement;
  private readonly marks: SVGGElement;
  private readonly summary: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly empty: HTMLElement;
  private readonly tools: HTMLElement;
  private readonly buttons: Record<'in' | 'out' | 'centre', HTMLButtonElement>;
  private scene: MapScene = EMPTY_SCENE;
  private size: Size = { width: 0, height: 0 };
  private current: View = { scale: 1, x: 0, y: 0 };
  /** The player has moved the view since the last time it was set to the opening one: a resize then keeps it instead of fitting again. */
  private moved = false;
  /** Marks that follow a point of the map, and the names that need room. */
  private pins: Array<{ el: SVGElement; at: Point; offset?: Point }> = [];
  private names: Array<{ el: SVGTextElement; room: SceneRoom }> = [];
  private regionNames: Array<{ el: SVGTextElement; x0: number; y0: number; x1: number }> = [];
  private readonly pointers = new Map<number, Point>();
  private pinch: { distance: number } | null = null;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
  ) {
    const doc = parent.ownerDocument;
    this.root = doc.createElement('div');
    this.root.className = 'map-view';
    this.root.dataset['testid'] = 'map';
    this.root.tabIndex = 0;
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-roledescription', 'map');

    this.surface = svg(doc, 'svg', { class: 'map-surface', 'aria-hidden': 'true', focusable: 'false' });
    this.world = svg(doc, 'g', { class: 'map-world' });
    this.marks = svg(doc, 'g', { class: 'map-marks' });
    this.surface.append(this.world, this.marks);

    this.summary = doc.createElement('p');
    this.summary.className = 'map-sr';
    this.summary.dataset['testid'] = 'map-summary';
    this.list = doc.createElement('ul');
    this.list.className = 'map-sr';
    this.list.dataset['testid'] = 'map-rooms';
    this.empty = doc.createElement('p');
    this.empty.className = 'map-empty';
    this.empty.dataset['testid'] = 'map-empty';
    this.empty.hidden = true;

    this.tools = doc.createElement('div');
    this.tools.className = 'map-tools';
    const tool = (icon: MapIconId, testid: string, act: () => void): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'map-tool';
      b.dataset['testid'] = testid;
      b.appendChild(mapIconSvg(doc, icon, 18));
      onPress(this.store, b, act); // (a tap right after a drag or a pinch on the map makes no click: the button acts when the finger lifts)
      this.tools.appendChild(b);
      return b;
    };
    this.buttons = {
      in: tool('zoomIn', 'map-zoom-in', () => this.zoomBy(ZOOM_STEP)),
      out: tool('zoomOut', 'map-zoom-out', () => this.zoomBy(1 / ZOOM_STEP)),
      centre: tool('centre', 'map-center', () => this.recentre()),
    };
    this.root.append(this.surface, this.summary, this.list, this.empty, this.tools);

    this.attachPointers();
    listen(this.store, this.root, 'wheel', (e) => this.onWheel(e), { passive: false });
    listen(this.store, this.root, 'keydown', (e) => this.onKey(e));
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => this.remeasure());
      observer.observe(this.root);
      this.store.add(() => observer.disconnect());
    }
    this.refreshTexts();
    this.store.add(translator.changed.subscribe(() => this.refreshTexts()));
    parent.appendChild(this.root);
  }

  // ----------------------------------------------------------------------------------------------- what is seen

  /** The view now (the scale in px per metre, and where the map's origin is on the screen). */
  get view(): Readonly<View> {
    return this.current;
  }

  /** The size of the panel it is drawn in (px). */
  get panel(): Readonly<Size> {
    return this.size;
  }

  get shown(): Readonly<MapScene> {
    return this.scene;
  }

  /**
   * Draws a scene. With `recentre` the view goes to the opening one (a menu that has just opened); without it the view the player has is kept, and only held inside the panel — what a player moved is not undone by
   * the map being drawn again.
   */
  update(scene: MapScene, options: { recentre?: boolean } = {}): void {
    this.scene = scene;
    this.rebuild();
    if (options.recentre === true || !this.moved) this.recentre();
    else this.setView(this.current, false);
    this.refreshTexts();
  }

  /** Sets the size of the panel it is drawn in. The resize observer calls it; a test calls it by hand (a page that is not laid out has no size). */
  resize(width: number, height: number): void {
    if (width === this.size.width && height === this.size.height) return;
    this.size = { width, height };
    if (this.moved) this.setView(this.current, false);
    else this.recentre();
  }

  /** The opening view: everything discovered, or the hero's surroundings when everything would be too small to read. */
  recentre(): void {
    this.moved = false;
    const b = this.scene.bounds;
    if (!b || this.size.width <= 0 || this.size.height <= 0) {
      this.setView({ scale: ZOOM.legible, x: 0, y: 0 }, false);
      return;
    }
    this.setView(openingView(b, this.scene.hero, this.size, FIT_PAD, TOOLS_CORNER), false);
  }

  zoomBy(factor: number, anchor: Point = { x: this.size.width / 2, y: this.size.height / 2 }): void {
    this.setView(zoomAbout(this.current, factor, anchor), true);
  }

  panBy(dx: number, dy: number): void {
    this.setView(panBy(this.current, dx, dy), true);
  }

  dispose(): void {
    this.store.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- drawing

  /** Reads the size of the panel now (the menu has just shown it: what it reads is what it will be drawn at). A panel that is hidden has none, and keeps the one it had. */
  remeasure(): void {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (w > 0 && h > 0) this.resize(w, h);
  }

  private setView(next: View, byPlayer: boolean): void {
    const bounds = this.scene.bounds;
    const clamped = bounds && this.size.width > 0 ? clampView(next, bounds, this.size, KEEP_IN_VIEW) : next;
    if (byPlayer) this.moved = true;
    this.current = clamped;
    this.world.setAttribute('transform', `translate(${clamped.x.toFixed(2)} ${clamped.y.toFixed(2)}) scale(${clamped.scale.toFixed(4)})`);
    this.root.dataset['scale'] = clamped.scale.toFixed(3);
    this.root.dataset['x'] = clamped.x.toFixed(1);
    this.root.dataset['y'] = clamped.y.toFixed(1);
    this.root.dataset['moved'] = this.moved ? '1' : '0';
    this.place();
    this.buttons.in.disabled = clamped.scale >= ZOOM.max - 1e-9;
    this.buttons.out.disabled = clamped.scale <= ZOOM.min + 1e-9;
  }

  /** Puts every mark where the view says its point of the map is on the screen. */
  private place(): void {
    const v = this.current;
    for (const p of this.pins) {
      const s = toScreen(v, p.at);
      p.el.setAttribute('transform', `translate(${(s.x + (p.offset?.x ?? 0)).toFixed(1)} ${(s.y + (p.offset?.y ?? 0)).toFixed(1)})`);
    }
    for (const n of this.names) {
      const wide = (n.room.rect.x1 - n.room.rect.x0) * v.scale >= LABEL_MIN_WIDTH;
      n.el.style.display = wide ? '' : 'none';
      const s = toScreen(v, { x: n.room.rect.x0, y: n.room.rect.y0 });
      n.el.setAttribute('x', (s.x + 8).toFixed(1));
      n.el.setAttribute('y', (s.y + 17).toFixed(1));
    }
    for (const r of this.regionNames) {
      const s = toScreen(v, { x: r.x0, y: r.y0 });
      r.el.setAttribute('x', s.x.toFixed(1));
      r.el.setAttribute('y', (s.y - 9).toFixed(1));
      r.el.style.display = (r.x1 - r.x0) * v.scale >= 120 ? '' : 'none';
    }
  }

  /** Draws the scene from nothing. A map of a few rooms: cheap enough to rebuild whenever the menu opens. */
  private rebuild(): void {
    const doc = this.root.ownerDocument;
    const s = this.scene;
    this.world.replaceChildren();
    this.marks.replaceChildren();
    this.pins = [];
    this.names = [];
    this.regionNames = [];
    const none = s.rooms.length === 0;
    this.root.dataset['empty'] = none ? '1' : '0';
    this.root.dataset['rooms'] = String(s.rooms.length);
    this.empty.hidden = !none;
    this.surface.style.display = none ? 'none' : '';
    this.tools.style.display = none ? 'none' : '';
    if (none) return;

    const links = svg(doc, 'g', { class: 'map-links' });
    const rooms = svg(doc, 'g', { class: 'map-rooms' });
    const stubs = svg(doc, 'g', { class: 'map-stubs' });
    for (const room of s.rooms) rooms.appendChild(this.drawRoom(doc, room));
    for (const l of s.links) {
      links.appendChild(svg(doc, 'line', { class: 'map-link', 'data-testid': `map-link-${l.id}`, 'data-locked': l.locked ? '1' : '0', x1: l.ax, y1: l.ay, x2: l.bx, y2: l.by }));
    }
    for (const room of s.rooms) {
      for (const d of room.doors) if (!d.known) stubs.appendChild(this.drawStub(doc, d));
    }
    this.world.append(rooms, links, stubs);

    for (const r of s.regions) {
      const key = REGION_KEYS[r.id];
      if (!key || !this.translator.has(key)) continue;
      const el = svg(doc, 'text', { class: 'map-region', 'data-region': r.id });
      el.textContent = this.translator.t(key);
      this.marks.appendChild(el);
      this.regionNames.push({ el, x0: r.rect.x0, y0: r.rect.y0, x1: r.rect.x1 });
    }
    for (const room of s.rooms) {
      const el = svg(doc, 'text', { class: 'map-name', 'data-room': room.id });
      el.textContent = this.roomName(room);
      this.marks.appendChild(el);
      this.names.push({ el, room });
    }
    for (const room of s.rooms) {
      for (const d of room.doors) this.marks.appendChild(this.pin(this.drawDoor(doc, d), { x: d.x, y: d.y }));
      for (const p of room.pois) this.marks.appendChild(this.pin(this.drawPoi(doc, p), { x: p.x, y: p.y }));
    }
    if (s.hero) {
      const hero = svg(doc, 'g', { class: 'map-hero', 'data-testid': 'map-hero', 'data-room': s.hero.room });
      hero.append(svg(doc, 'circle', { class: 'map-hero-ring', r: MARK.hero + 5 }), svg(doc, 'circle', { class: 'map-hero-dot', r: MARK.hero - 3.5 }));
      this.marks.appendChild(this.pin(hero, { x: s.hero.x, y: s.hero.y }));
    }
  }

  private pin<T extends SVGElement>(el: T, at: Point): T {
    this.pins.push({ el, at });
    return el;
  }

  private drawRoom(doc: Document, room: SceneRoom): SVGGElement {
    const w = room.rect.x1 - room.rect.x0;
    const h = room.rect.y1 - room.rect.y0;
    const g = svg(doc, 'g', { class: 'map-room', 'data-testid': `map-room-${room.id}`, 'data-room': room.id, 'data-region': room.regionId, 'data-current': room.current ? '1' : '0' });
    g.appendChild(svg(doc, 'rect', { class: 'map-room-body', x: room.rect.x0, y: room.rect.y0, width: w, height: h, rx: 1.6 }));
    for (const t of room.terrain) {
      g.appendChild(svg(doc, 'rect', { class: t.oneWay ? 'map-terrain map-oneway' : 'map-terrain', x: t.rect.x0, y: t.rect.y0, width: t.rect.x1 - t.rect.x0, height: Math.max(t.rect.y1 - t.rect.y0, 0.01) }));
    }
    for (const gate of room.gates) {
      if (gate.open) continue; // an open gate is a way, not a wall
      g.appendChild(svg(doc, 'rect', { class: 'map-gate', 'data-testid': `map-gate-${room.id}:${gate.id}`, x: gate.rect.x0, y: gate.rect.y0, width: gate.rect.x1 - gate.rect.x0, height: gate.rect.y1 - gate.rect.y0 }));
    }
    for (const p of room.pois) {
      if (p.kind === 'boss' && p.area) {
        g.appendChild(svg(doc, 'rect', { class: 'map-arena', 'data-done': p.done ? '1' : '0', x: p.area.x0, y: p.area.y0, width: p.area.x1 - p.area.x0, height: p.area.y1 - p.area.y0 }));
      }
    }
    return g;
  }

  /** The stub of a way into the unknown: a short dashed line out of the wall. */
  private drawStub(doc: Document, d: SceneDoor): SVGLineElement {
    const dx = d.side === 'east' ? STUB_LENGTH : d.side === 'west' ? -STUB_LENGTH : 0;
    const dy = d.side === 'south' ? STUB_LENGTH : d.side === 'north' ? -STUB_LENGTH : 0;
    return svg(doc, 'line', { class: 'map-stub', 'data-state': d.state, 'data-end': d.end ? '1' : '0', x1: d.x, y1: d.y, x2: d.x + dx, y2: d.y + dy });
  }

  /** The mark of a door on the wall: a lock while it is shut, an arrow for the way out of the world, a ring where it leads into the unknown, a dot where it joins two rooms. */
  private drawDoor(doc: Document, d: SceneDoor): SVGGElement {
    const g = svg(doc, 'g', { class: 'map-door', 'data-testid': `map-door-${d.id}`, 'data-door': d.id, 'data-state': d.state, 'data-known': d.known ? '1' : '0', 'data-end': d.end ? '1' : '0', 'data-side': d.side });
    if (d.state === 'locked') g.appendChild(mapGlyph(doc, 'lock', MARK.door));
    else if (d.end) g.appendChild(mapGlyph(doc, 'leave', MARK.door + 2));
    else g.appendChild(svg(doc, 'circle', { class: d.known ? 'map-door-dot' : 'map-door-ring', r: d.known ? 3 : 4.2 }));
    return g;
  }

  private drawPoi(doc: Document, p: ScenePoi): SVGGElement {
    const g = svg(doc, 'g', { class: `map-poi map-poi-${p.kind}`, 'data-testid': `map-poi-${p.id}`, 'data-kind': p.kind, 'data-done': p.done ? '1' : '0', 'data-active': p.active ? '1' : '0' });
    if (p.active) g.appendChild(svg(doc, 'circle', { class: 'map-poi-halo', r: MARK.poi * 0.72 }));
    g.appendChild(mapGlyph(doc, p.kind === 'rest' ? 'rest' : p.kind === 'seal' ? 'seal' : 'boss', MARK.poi));
    return g;
  }

  private roomName(room: SceneRoom): string {
    return room.nameKey && this.translator.has(room.nameKey) ? this.translator.t(room.nameKey) : room.name;
  }

  /** The words of the map and the description for a screen reader, from the translator and the scene as they are now. */
  private refreshTexts(): void {
    const t = this.translator;
    this.root.setAttribute('aria-label', t.t('map.label'));
    this.buttons.in.setAttribute('aria-label', t.t('map.zoomIn'));
    this.buttons.out.setAttribute('aria-label', t.t('map.zoomOut'));
    this.buttons.centre.setAttribute('aria-label', t.t('map.center'));
    for (const b of Object.values(this.buttons)) b.title = b.getAttribute('aria-label') ?? '';
    this.empty.textContent = t.t('map.empty');
    const s = this.scene;
    const here = s.rooms.find((r) => r.current);
    this.summary.textContent = s.rooms.length === 0 ? t.t('map.empty') : t.t('map.summary', { room: here ? this.roomName(here) : '—', found: s.discovered, total: s.total });
    const doc = this.root.ownerDocument;
    this.list.replaceChildren(
      ...s.rooms.map((r) => {
        const li = doc.createElement('li');
        li.textContent = r.current ? t.t('map.youAreIn', { room: this.roomName(r) }) : this.roomName(r);
        return li;
      }),
    );
    for (const n of this.names) n.el.textContent = this.roomName(n.room);
    for (const r of this.regionNames) {
      const id = r.el.getAttribute('data-region') ?? '';
      const key = REGION_KEYS[id];
      if (key) r.el.textContent = t.t(key);
    }
  }

  // ----------------------------------------------------------------------------------------------- input

  private local(e: { clientX: number; clientY: number }): Point {
    const box = this.root.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  private attachPointers(): void {
    listen(this.store, this.root, 'pointerdown', (e) => {
      if (e.target instanceof Element && e.target.closest('.map-tools')) return; // the buttons are pressed, not dragged
      this.pointers.set(e.pointerId, this.local(e));
      try {
        this.root.setPointerCapture(e.pointerId);
      } catch {
        // a pointer that is already gone: there is nothing to capture
      }
      this.root.dataset['dragging'] = '1';
      this.pinch = this.pointers.size === 2 ? { distance: this.pinchNow().distance } : null;
    });
    listen(this.store, this.root, 'pointermove', (e) => {
      const before = this.pointers.get(e.pointerId);
      if (!before) return;
      const now = this.local(e);
      if (this.pointers.size >= 2 && this.pinch) {
        const was = this.pinchNow();
        this.pointers.set(e.pointerId, now);
        const is = this.pinchNow();
        // the fingers' middle drags the map and their distance zooms it, about that middle
        let next = panBy(this.current, is.middle.x - was.middle.x, is.middle.y - was.middle.y);
        if (this.pinch.distance > 0 && is.distance > 0) next = zoomAbout(next, is.distance / this.pinch.distance, is.middle);
        this.pinch.distance = is.distance;
        this.setView(next, true);
        return;
      }
      this.pointers.set(e.pointerId, now);
      this.setView(panBy(this.current, now.x - before.x, now.y - before.y), true);
    });
    const release = (e: PointerEvent): void => {
      if (!this.pointers.delete(e.pointerId)) return;
      try {
        this.root.releasePointerCapture(e.pointerId);
      } catch {
        // already released with the pointer
      }
      this.pinch = this.pointers.size === 2 ? { distance: this.pinchNow().distance } : null;
      if (this.pointers.size === 0) this.root.dataset['dragging'] = '0';
    };
    listen(this.store, this.root, 'pointerup', release);
    listen(this.store, this.root, 'pointercancel', release);
    // the capture is let go of whatever the reason (the lift, a cancel, the map put away under a finger): the finger is not on the map any more
    listen(this.store, this.root, 'lostpointercapture', release);
  }

  /**
   * Forgets the fingers that are on the map: the menu has put the map away or closed while one was down, and a finger that is lifted out of sight must not stay as a ghost that turns the next drag into a
   * pinch.
   */
  cancelGestures(): void {
    for (const id of this.pointers.keys()) {
      try {
        this.root.releasePointerCapture(id);
      } catch {
        // gone already
      }
    }
    this.pointers.clear();
    this.pinch = null;
    this.root.dataset['dragging'] = '0';
  }

  private pinchNow(): { distance: number; middle: Point } {
    const [a, b] = [...this.pointers.values()];
    return a && b ? pinchOf(a, b) : { distance: 0, middle: a ?? { x: 0, y: 0 } };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault(); // the wheel zooms the map: it does not scroll the menu
    this.zoomBy(wheelFactor(e.deltaY, e.deltaMode, e.ctrlKey), this.local(e));
  }

  private onKey(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const { width, height } = this.size;
    const step = PAN_STEP;
    switch (e.key) {
      case 'ArrowLeft':
        this.panBy(width * step, 0);
        break;
      case 'ArrowRight':
        this.panBy(-width * step, 0);
        break;
      case 'ArrowUp':
        this.panBy(0, height * step);
        break;
      case 'ArrowDown':
        this.panBy(0, -height * step);
        break;
      case '+':
      case '=':
        this.zoomBy(ZOOM_STEP);
        break;
      case '-':
      case '_':
        this.zoomBy(1 / ZOOM_STEP);
        break;
      case '0':
      case 'Home':
        this.recentre();
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }
}
