import { listen } from '@/app/dom';
import { DisposableStore } from '@/core/lifecycle';
import type { TouchSource, TouchTarget } from '@/input/sources/TouchSource';
import type { Translator } from '@/i18n/translator';
import { cssHex, PALETTE } from '@/presentation/palette';
import { createIcon } from '../icons';
import { createButtonArt, type ButtonArt } from './art';
import { computeTouchLayout, NO_INSETS, type ButtonPlacements, type Disc, type Insets, type TouchLayout } from './layout';

type ControlId = 'attack' | 'dash' | 'ability' | 'chip';

/** The fixed controls as data: what a finger on each one does, and the key of its accessible name. The three buttons are the artist's PNGs (`art.ts`); the chip is a small disc with the bottle. */
const CONTROLS: Readonly<Record<ControlId, { target: TouchTarget; labelKey: string; shown: boolean }>> = {
  attack: { target: 'attack', labelKey: 'touch.attack', shown: true },
  dash: { target: 'dash', labelKey: 'touch.dash', shown: true },
  // hidden until there is something to do with them: a card is equipped / a bottle would help now
  ability: { target: 'ability', labelKey: 'touch.ability', shown: false },
  chip: { target: 'bottle', labelKey: 'touch.bottle', shown: false },
};

/** What the player sees of a touch button. */
interface Control {
  /** The touch area: a circle, the size of the disc of the layout. */
  hit: HTMLDivElement;
  /** What is seen, inside it: the box of the artist's PNG, or the disc of the chip. Its `data-pressed` says whether a finger is on it. */
  face: HTMLElement;
  /** The PNG of the button (`null` for the chip). */
  art: ButtonArt | null;
  /** The bottle on the chip (`null` for the buttons: their glyph is in their PNG). */
  icon: SVGSVGElement | null;
  /** Translation key of its accessible name. */
  labelKey: string;
}

export interface TouchControlsOptions {
  /** Size preference of the buttons (Settings), 0.8 … 1.4. */
  scale?: number;
  /** Opacity of what is drawn (Settings), 0.3 … 1. */
  opacity?: number;
  /** Where the player put each button (Settings): a button that is not here is where the design has it. */
  buttons?: ButtonPlacements;
  /** The size the player chose for the HUD (Settings, accessibility): the buttons are kept off the room it takes. */
  hudScale?: number;
}

/**
 * The touch layer (DOM, docs/ARCHITECTURE-2D.md §6.4): the invisible movement zone and the fixed buttons Attack, Dash and
 * Magic — and, only when something can be done with it, the contextual bottle chip. No joystick, no jump button: the jump
 * is a gesture of the zone.
 *
 * It does not decide anything: its elements translate DOM pointer events into `TouchSource` calls (down / move / up) and the
 * source owns every finger. Each element captures ITS pointer (`setPointerCapture`), so a finger keeps its owner from touch
 * down until it lifts, however far it drifts. `pointercancel`, lost capture, window blur, the app being hidden, a rotation or
 * a resize release everything.
 *
 * Where each button is comes from `layout.ts` (the design's places, or the player's); how it looks is its PNG, untouched (`art.ts`).
 * While the player moves the buttons (`TouchEditor`) this layer steps aside (`setSuspended`) and the editor draws its own copies from the same
 * PNGs: nothing the player does there reaches `TouchSource`.
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
  private scale: number;
  private buttons: ButtonPlacements;
  /** The size the player chose for the HUD: the buttons keep off the room it takes. */
  private hudScale: number;
  private visible = true;
  private suspended = false;

  constructor(
    parent: HTMLElement,
    private readonly source: TouchSource,
    private readonly translator: Translator,
    options: TouchControlsOptions = {},
  ) {
    const doc = parent.ownerDocument;
    this.scale = options.scale ?? 1;
    this.hudScale = options.hudScale ?? 1;
    this.buttons = options.buttons ?? {};
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
      const control = this.addControl(doc, id, def.target, def.labelKey);
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

  /** The window the layout is for, css px (what the small picture of it in the settings is drawn from). */
  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Places everything for a window of `width × height` css px with the given safe insets. Call on start and on every resize. */
  place(width: number, height: number, insets: Insets): void {
    const changed = width !== this.width || height !== this.height;
    this.width = width;
    this.height = height;
    this.insets = insets;
    this.layout = this.compute();
    if (changed) this.releaseAll(); // the fingers are no longer where they were
    this.applyLayout();
    if (this.visible) this.loadArt();
  }

  /** The size of all the buttons together (Settings). */
  setScale(scale: number): void {
    this.scale = scale;
    this.relayout();
  }

  /** The player chose where each button goes (or went back to the design's places): they are laid out again. */
  setButtons(buttons: ButtonPlacements): void {
    this.buttons = buttons;
    this.relayout();
  }

  /** The player changed the size of the HUD: the buttons move out of its way (or back). */
  setHudScale(scale: number): void {
    this.hudScale = scale;
    this.relayout();
  }

  private compute(): TouchLayout {
    return computeTouchLayout(this.width, this.height, this.insets, { scale: this.scale, buttons: this.buttons, hudScale: this.hudScale });
  }

  /** The layout changed under the fingers (a setting, not a resize): a finger on a button that moved is no longer on it. */
  private relayout(): void {
    this.layout = this.compute();
    this.releaseAll();
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
    if (visible) this.loadArt();
    else this.releaseAll();
  }
  get isVisible(): boolean {
    return this.visible;
  }

  /**
   * The layer steps aside while the player moves the buttons: it is neither seen nor touched (the editor draws its own copies, which never reach the source). Everything it held is let go, and it does not
   * count as hidden for anything else — the settings still offer the layout, the boss's bar still keeps out of its way.
   */
  setSuspended(suspended: boolean): void {
    if (suspended === this.suspended) return;
    this.suspended = suspended;
    this.root.style.visibility = suspended ? 'hidden' : '';
    if (suspended) this.releaseAll();
  }

  /** The Dash button exists while the hero has the dash (GAME-SPEC-2D §4.3.4); `ready` is false while the dash recharges. */
  setDash(shown: boolean, ready = true): void {
    this.setAvailable('dash', shown, ready);
  }

  /** The Ability button exists only while a card is equipped (GAME-SPEC-2D §4.3.4); `ready` is false while there is not the magic for it or it recharges. */
  setAbility(shown: boolean, ready = true): void {
    this.setAvailable('ability', shown, ready);
  }

  private setAvailable(id: 'dash' | 'ability', shown: boolean, ready: boolean): void {
    const c = this.controls.get(id);
    if (!c) return;
    c.hit.style.display = shown ? 'flex' : 'none'; // (flex: it is what centres the picture in the touch area)
    if (!shown) {
      this.releasePointersOf(c);
      return;
    }
    c.face.style.opacity = ready ? '1' : '0.45';
  }

  /** The contextual bottle chip: shown only when a bottle is ready and it would help now. */
  setChip(shown: boolean): void {
    const c = this.controls.get('chip');
    if (!c) return;
    Object.assign(c.hit.style, { opacity: shown ? '1' : '0', pointerEvents: shown ? 'auto' : 'none', display: shown ? 'flex' : 'none' });
    if (!shown) this.releasePointersOf(c);
  }

  /** Lets go of every finger and clears the pressed look. */
  releaseAll(): void {
    this.source.releaseAll();
    this.pointerElement.clear();
    for (const c of this.controls.values()) c.face.dataset['pressed'] = '0';
    this.styleAll();
  }

  dispose(): void {
    this.source.releaseAll();
    this.store.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- internals

  private addControl(doc: Document, id: ControlId, target: TouchTarget, labelKey: string): Control {
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
    let face: HTMLElement;
    let art: ButtonArt | null = null;
    let icon: SVGSVGElement | null = null;
    if (id === 'chip') {
      face = doc.createElement('div');
      Object.assign(face.style, {
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
      icon = createIcon(doc, 'bottle', 30);
      face.appendChild(icon);
    } else {
      art = createButtonArt(doc, id);
      face = art.root;
      face.style.transition = 'transform 60ms linear, opacity 90ms linear';
    }
    face.dataset['pressed'] = '0';
    hit.appendChild(face);
    const control: Control = { hit, face, art, icon, labelKey };
    this.controls.set(id, control);
    this.root.appendChild(hit);
    this.bindPointer(hit, target, control);
    return control;
  }

  /** The pictures are asked for when the layer is first on screen: a desktop never shows it and never downloads them. */
  private loadArt(): void {
    for (const c of this.controls.values()) c.art?.load();
  }

  private bindPointer(el: HTMLElement, target: TouchTarget, owner: Control | 'zone'): void {
    listen(this.store, el, 'pointerdown', (e) => {
      e.preventDefault();
      if (this.suspended) return; // (a hidden element is not hit by a finger; this is the layer's own word that nothing reaches the source while the player moves the buttons)
      if (!this.source.down(e.pointerId, target, e.clientX, e.clientY, e.timeStamp)) return;
      this.pointerElement.set(e.pointerId, owner);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // a synthetic pointer (tests) cannot be captured: the source still owns it
      }
      if (owner !== 'zone') owner.face.dataset['pressed'] = '1';
      this.styleAll();
    });
    listen(this.store, el, 'pointermove', (e) => {
      if (this.pointerElement.get(e.pointerId) === owner) this.source.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    });
    const end = (e: PointerEvent): void => {
      if (this.pointerElement.get(e.pointerId) !== owner) return;
      this.pointerElement.delete(e.pointerId);
      this.source.up(e.pointerId);
      if (owner !== 'zone') owner.face.dataset['pressed'] = '0';
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
    c.face.dataset['pressed'] = '0';
    this.styleAll();
  }

  private applyLayout(): void {
    const l = this.layout;
    Object.assign(this.zone.style, { left: `${l.zone.x}px`, top: `${l.zone.y}px`, width: `${l.zone.w}px`, height: `${l.zone.h}px` });
    const place = (c: Control, d: Disc): void => {
      Object.assign(c.hit.style, { left: `${d.cx - d.hit / 2}px`, top: `${d.cy - d.hit / 2}px`, width: `${d.hit}px`, height: `${d.hit}px` });
      if (c.art) c.art.size(d.visual);
      else Object.assign(c.face.style, { width: `${d.visual}px`, height: `${d.visual}px` });
      if (c.icon) {
        const size = Math.max(10, d.visual * 0.42);
        c.icon.setAttribute('width', String(size));
        c.icon.setAttribute('height', String(size));
      }
    };
    for (const [id, c] of this.controls) place(c, l[id]);
    this.styleAll();
  }

  /** The pressed look: a little smaller while a finger is on it. (The chip also takes the colour of a pressed key; the three plates are the artist's and keep their pixels.) */
  private styleAll(): void {
    for (const c of this.controls.values()) {
      const down = c.face.dataset['pressed'] === '1';
      c.face.style.transform = down ? 'scale(0.93)' : 'scale(1)';
      if (c.art) continue;
      c.face.style.background = `${cssHex(down ? PALETTE.energyCore : PALETTE.uiPanel)}${down ? '47' : '8c'}`;
      c.face.style.borderColor = `${cssHex(down ? PALETTE.energyGlow : PALETTE.energyCore)}${down ? 'e6' : '8c'}`;
    }
  }

  private refreshLabels(): void {
    for (const c of this.controls.values()) c.hit.setAttribute('aria-label', this.translator.t(c.labelKey));
  }
}
