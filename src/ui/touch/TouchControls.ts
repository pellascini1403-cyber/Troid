import { listen } from '@/app/dom';
import { DisposableStore } from '@/core/lifecycle';
import type { TouchSource, TouchTarget } from '@/input/sources/TouchSource';
import type { Translator } from '@/i18n/translator';
import { cssHex, PALETTE } from '@/presentation/palette';
import { createIcon } from '../icons';
import { computeTouchLayout, NO_INSETS, type Disc, type Insets, type TouchLayout } from './layout';

type ControlId = 'attack' | 'dash' | 'ability' | 'chip';

/** The fixed controls as data: what a finger on each one does, its glyph, and the key of its accessible name. */
const CONTROLS: Readonly<Record<ControlId, { target: TouchTarget; icon: string; labelKey: string; shown: boolean }>> = {
  attack: { target: 'attack', icon: 'attack', labelKey: 'touch.attack', shown: true },
  dash: { target: 'dash', icon: 'dash', labelKey: 'touch.dash', shown: true },
  // hidden until there is something to do with them: a card is equipped / a bottle would help now
  ability: { target: 'ability', icon: 'spirit_bolt', labelKey: 'touch.ability', shown: false },
  chip: { target: 'bottle', icon: 'bottle', labelKey: 'touch.bottle', shown: false },
};

/** What the player sees of a touch button. */
interface Control {
  id: ControlId;
  target: TouchTarget;
  hit: HTMLDivElement;
  disc: HTMLDivElement;
  icon: SVGSVGElement | null;
  /** Translation key of its accessible name. */
  labelKey: string;
}

export interface TouchControlsOptions {
  /** Size preference of the buttons (Settings), 0.8 … 1.4. */
  size?: number;
  /** Opacity of what is drawn (Settings), 0.3 … 1. */
  opacity?: number;
}

/**
 * The touch layer (DOM, docs/ARCHITECTURE-2D.md §6.4): the invisible movement zone and the fixed buttons Attack, Dash and
 * Ability — and, only when something can be done with it, the contextual bottle chip. No joystick, no jump button: the jump
 * is a gesture of the zone.
 *
 * It does not decide anything: its elements translate DOM pointer events into `TouchSource` calls (down / move / up) and the
 * source owns every finger. Each element captures ITS pointer (`setPointerCapture`), so a finger keeps its owner from touch
 * down until it lifts, however far it drifts. `pointercancel`, lost capture, window blur, the app being hidden, a rotation or
 * a resize release everything.
 *
 * Texts are accessible names only, and come from the translator (`touch.*` keys): the interface holds no literals.
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  readonly zone: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly controls = new Map<ControlId, Control>();
  private readonly pointerElement = new Map<number, Control | 'zone'>();
  private layout: TouchLayout;
  private insets: Insets = NO_INSETS;
  private width = 0;
  private height = 0;
  private size: number;
  private visible = true;

  constructor(
    parent: HTMLElement,
    private readonly source: TouchSource,
    private readonly translator: Translator,
    options: TouchControlsOptions = {},
  ) {
    const doc = parent.ownerDocument;
    this.size = options.size ?? 1;
    this.layout = computeTouchLayout(0, 0);

    this.root = doc.createElement('div');
    this.root.dataset['testid'] = 'touch-layer';
    this.root.dataset['uiBlock'] = ''; // a mouse click here is never "attack": the touch layer handles its own pointers
    Object.assign(this.root.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      touchAction: 'none',
      userSelect: 'none',
      webkitUserSelect: 'none',
      webkitTapHighlightColor: 'transparent',
      opacity: String(options.opacity ?? 1),
      zIndex: '20',
    });

    this.zone = doc.createElement('div');
    this.zone.dataset['testid'] = 'touch-zone';
    Object.assign(this.zone.style, { position: 'absolute', pointerEvents: 'auto', touchAction: 'none', background: 'transparent' });
    this.root.appendChild(this.zone);
    this.bindPointer(this.zone, 'zone', 'zone');

    for (const id of Object.keys(CONTROLS) as ControlId[]) {
      const def = CONTROLS[id];
      const control = this.addControl(doc, id, def.target, def.icon, def.labelKey);
      if (!def.shown) control.hit.style.display = 'none';
    }

    parent.appendChild(this.root);
    this.refreshLabels();
    this.store.add(translator.changed.subscribe(() => this.refreshLabels()));

    // nothing may stay pressed when the window loses the fingers' context
    const win = doc.defaultView;
    if (win) {
      listen(this.store, win, 'blur', () => this.releaseAll());
      listen(this.store, win, 'orientationchange', () => this.releaseAll());
    }
    listen(this.store, doc, 'visibilitychange', () => {
      if (doc.hidden) this.releaseAll();
    });
  }

  /** The scale the gestures use: `uiScale` of the current window. */
  get gestureScale(): number {
    return this.layout.gestureScale;
  }

  get current(): Readonly<TouchLayout> {
    return this.layout;
  }

  /** Places everything for a window of `width × height` css px with the given safe insets. Call on start and on every resize. */
  place(width: number, height: number, insets: Insets): void {
    const changed = width !== this.width || height !== this.height;
    this.width = width;
    this.height = height;
    this.insets = insets;
    this.layout = computeTouchLayout(width, height, insets, this.size);
    if (changed) this.releaseAll(); // the fingers are no longer where they were
    this.applyLayout();
  }

  setSize(size: number): void {
    this.size = size;
    this.layout = computeTouchLayout(this.width, this.height, this.insets, size);
    this.applyLayout();
  }

  setOpacity(opacity: number): void {
    this.root.style.opacity = String(opacity);
  }

  /** The whole layer (a desktop with a mouse and a keyboard never sees it; the first touch brings it). */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.style.display = visible ? '' : 'none';
    if (!visible) this.releaseAll();
  }
  get isVisible(): boolean {
    return this.visible;
  }

  /** The Ability button exists only while a card is equipped (GAME-SPEC-2D §4.3.4): `iconId` is the card's skill icon. */
  setAbility(shown: boolean, iconId?: string, ready = true): void {
    const c = this.controls.get('ability');
    if (!c) return;
    c.hit.style.display = shown ? '' : 'none';
    if (!shown) {
      this.releasePointersOf(c);
      return;
    }
    if (iconId !== undefined) this.setIcon(c, iconId);
    c.disc.dataset['ready'] = ready ? '1' : '0';
    c.disc.style.opacity = ready ? '1' : '0.45';
  }

  /** The contextual bottle chip: shown only when a bottle is ready and it would help now. */
  setChip(shown: boolean): void {
    const c = this.controls.get('chip');
    if (!c) return;
    c.hit.style.opacity = shown ? '1' : '0';
    c.hit.style.pointerEvents = shown ? 'auto' : 'none';
    c.hit.style.display = shown ? '' : 'none';
    if (!shown) this.releasePointersOf(c);
  }

  /** Lets go of every finger and clears the pressed look. */
  releaseAll(): void {
    this.source.releaseAll();
    this.pointerElement.clear();
    for (const c of this.controls.values()) c.disc.dataset['pressed'] = '0';
    this.styleAll();
  }

  dispose(): void {
    this.source.releaseAll();
    this.store.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- internals

  private addControl(doc: Document, id: ControlId, target: TouchTarget, iconId: string, labelKey: string): Control {
    const hit = doc.createElement('div');
    hit.dataset['testid'] = `touch-${id}`;
    hit.setAttribute('role', 'button');
    Object.assign(hit.style, {
      position: 'absolute',
      borderRadius: '50%',
      pointerEvents: 'auto',
      touchAction: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: id === 'chip' ? 'opacity 120ms linear' : 'none',
    });
    const disc = doc.createElement('div');
    disc.dataset['pressed'] = '0';
    Object.assign(disc.style, {
      borderRadius: '50%',
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      color: cssHex(PALETTE.energyGlow),
      border: `1.5px solid ${cssHex(PALETTE.energyCore)}8c`,
      background: `${cssHex(PALETTE.uiPanel)}8c`,
      boxShadow: `0 0 14px ${cssHex(PALETTE.energyCore)}33`,
      transition: 'transform 60ms linear, background 60ms linear, border-color 60ms linear',
    });
    hit.appendChild(disc);
    const control: Control = { id, target, hit, disc, icon: null, labelKey };
    this.setIcon(control, iconId);
    this.controls.set(id, control);
    this.root.appendChild(hit);
    this.bindPointer(hit, target, control);
    return control;
  }

  private setIcon(c: Control, iconId: string): void {
    c.icon?.remove();
    const size = Math.max(10, this.layout.controlScale * 30);
    c.icon = createIcon(c.hit.ownerDocument, iconId, size);
    c.disc.appendChild(c.icon);
  }

  private bindPointer(el: HTMLElement, target: TouchTarget, owner: Control | 'zone'): void {
    listen(this.store, el, 'pointerdown', (e) => {
      e.preventDefault();
      if (!this.source.down(e.pointerId, target, e.clientX, e.clientY, e.timeStamp)) return;
      this.pointerElement.set(e.pointerId, owner);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // a synthetic pointer (tests) cannot be captured: the source still owns it
      }
      if (owner !== 'zone') owner.disc.dataset['pressed'] = '1';
      this.styleAll();
    });
    listen(this.store, el, 'pointermove', (e) => {
      if (this.pointerElement.get(e.pointerId) === owner) this.source.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    });
    const end = (e: PointerEvent): void => {
      if (this.pointerElement.get(e.pointerId) !== owner) return;
      this.pointerElement.delete(e.pointerId);
      this.source.up(e.pointerId);
      if (owner !== 'zone') owner.disc.dataset['pressed'] = '0';
      this.styleAll();
    };
    listen(this.store, el, 'pointerup', end);
    listen(this.store, el, 'pointercancel', end);
    listen(this.store, el, 'lostpointercapture', end);
  }

  /** A control that disappears while a finger is on it: that finger lets go. */
  private releasePointersOf(c: Control): void {
    for (const [id, owner] of [...this.pointerElement]) {
      if (owner !== c) continue;
      this.pointerElement.delete(id);
      this.source.up(id);
    }
    c.disc.dataset['pressed'] = '0';
    this.styleAll();
  }

  private applyLayout(): void {
    const l = this.layout;
    Object.assign(this.zone.style, { left: `${l.zone.x}px`, top: `${l.zone.y}px`, width: `${l.zone.w}px`, height: `${l.zone.h}px` });
    const place = (c: Control, d: Disc): void => {
      Object.assign(c.hit.style, { left: `${d.cx - d.hit / 2}px`, top: `${d.cy - d.hit / 2}px`, width: `${d.hit}px`, height: `${d.hit}px` });
      Object.assign(c.disc.style, { width: `${d.visual}px`, height: `${d.visual}px` });
      const icon = c.icon;
      if (icon) {
        const size = Math.max(10, d.visual * 0.42);
        icon.setAttribute('width', String(size));
        icon.setAttribute('height', String(size));
      }
    };
    for (const [id, c] of this.controls) place(c, l[id]);
    this.styleAll();
  }

  private styleAll(): void {
    for (const c of this.controls.values()) {
      const down = c.disc.dataset['pressed'] === '1';
      c.disc.style.transform = down ? 'scale(0.93)' : 'scale(1)';
      c.disc.style.background = `${cssHex(down ? PALETTE.energyCore : PALETTE.uiPanel)}${down ? '47' : '8c'}`;
      c.disc.style.borderColor = `${cssHex(down ? PALETTE.energyGlow : PALETTE.energyCore)}${down ? 'e6' : '8c'}`;
    }
  }

  private refreshLabels(): void {
    for (const c of this.controls.values()) c.hit.setAttribute('aria-label', this.translator.t(c.labelKey));
  }
}
