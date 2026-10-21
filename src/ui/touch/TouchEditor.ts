import { listen } from '@/app/dom';
import { onPress } from '@/app/press';
import { DisposableStore } from '@/core/lifecycle';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import type { Translator } from '@/i18n/translator';
import { TOUCH_BUTTONS, TOUCH_LIMITS, type TouchButtonSetting } from '@/save/SettingsData';
import { ensureMenuStyle } from '../settings/menuStyle';
import { createButtonArt, type ButtonArt } from './art';
import { computeTouchLayout, touchFrame, type ButtonId, type ButtonPlacements, type Insets, type Rect, type TouchFrame, type TouchLayout } from './layout';

/** What the editor needs of the game: the window, the settings, and what to do with the choice. It reads values and reports one; it keeps no state of the game. */
export interface TouchEditorHost {
  /** The window now: its size, its safe area and the size the player chose for the HUD (the buttons keep out of it). */
  window(): { width: number; height: number; insets: Insets; hudScale: number };
  /** What the settings hold now: the size of all the buttons and where the player has put each one. */
  current(): { scale: number; buttons: ButtonPlacements };
  /** The player keeps what they did: the places (only the buttons they placed). The game applies it and saves it. */
  save(buttons: ButtonPlacements): void;
  /** The touch layer of the game steps aside while the editor has the screen, and comes back when it is done. */
  suspend(suspended: boolean): void;
  /** The editor is done (kept or not): the menu comes back. */
  done(): void;
}

/** The names of the buttons for the player: the keys of the game's own words for them. */
const NAME_KEYS: Readonly<Record<ButtonId, string>> = { attack: 'touch.attack', dash: 'touch.dash', ability: 'touch.ability' };
/** A size as a percentage: a number and a sign, not a word (so not a translation). */
const percent = (scale: number): string => String(Math.round(scale * 100)) + '%';
/** The placement (a fraction of the safe area, 4 decimals) that puts a button's centre at `(cx, cy)`. */
function placementOf(frame: TouchFrame, cx: number, cy: number, scale = 1): TouchButtonSetting {
  const w = frame.safe.x1 - frame.safe.x0;
  const h = frame.safe.y1 - frame.safe.y0;
  const unit = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 1e4) / 1e4;
  return { x: w > 0 ? unit((cx - frame.safe.x0) / w) : 0, y: h > 0 ? unit((cy - frame.safe.y0) / h) : 0, scale };
}
/** A step of the arrow keys, px; with Shift a bigger one. */
const NUDGE = 8;
/** How far a finger must go before it is a drag and not a tap that only chooses the button, px. */
const DRAG_FROM = 4;

interface EditorButton {
  id: ButtonId;
  hit: HTMLDivElement;
  art: ButtonArt;
}

interface Drag {
  id: ButtonId;
  pointerId: number;
  /** Where in the button the finger took hold: the button keeps that point under the finger. */
  grabX: number;
  grabY: number;
  startX: number;
  startY: number;
  moved: boolean;
  /** What the draft held for this button when the finger took hold: a cancelled touch puts it back. */
  before: TouchButtonSetting | undefined;
}

/**
 * THE EDITOR OF THE TOUCH BUTTONS (DOM, docs/PROMPT15-LOG.md): a mode of its own where the player puts the three buttons where their hands are comfortable. It has the screen over the game (which stays
 * stopped) and draws its own copy of each button from the artist's PNG — the same picture, by the same code (`art.ts`) — at the place the layout gives it; the real touch layer steps aside while it is open, and
 * nothing here ever reaches `TouchSource`: a finger on a button in the editor MOVES it, it never attacks, dashes or casts.
 *
 * Dragging a button takes it where the finger goes, never to a place the game cannot give it: the safe area, the HUD, the pause button, the room of the boss's bar and the other buttons (`layout.ts`) are
 * kept, and the button stops against them — shown here as the hatched areas. The size of the chosen button has a slider (as far as the window allows it); the arrow keys move it too; "swap sides" mirrors the three at
 * once (for the other hand). Nothing is saved until "Save"; "Cancel" and Escape drop it all. What is kept is the place of each button the player touched (a fraction of the safe area) and their sizes: the ones
 * they did not touch stay where the design has them.
 */
export class TouchEditor {
  readonly root: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly buttons = new Map<ButtonId, EditorButton>();
  private readonly zoneBox: HTMLDivElement;
  private readonly zoneLabel: HTMLSpanElement;
  private readonly keeps: HTMLDivElement[] = [];
  private readonly panel: HTMLDivElement;
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly reserved: HTMLElement;
  private readonly sizeName: HTMLSpanElement;
  private readonly size: HTMLInputElement;
  private readonly sizeOut: HTMLOutputElement;
  private readonly actions = new Map<'mirror' | 'reset' | 'cancel' | 'save', HTMLButtonElement>();
  /** What the player has chosen so far in this session of the editor (only the buttons they placed). */
  private draft: Partial<Record<ButtonId, TouchButtonSetting>> = {};
  private selected: ButtonId = 'attack';
  private drag: Drag | null = null;
  private layout: TouchLayout;
  private isOpen = false;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
    private readonly host: TouchEditorHost,
  ) {
    // its words come with it, as the menu's do: a player who never edits the buttons never downloads them
    for (const [lang, entries] of Object.entries(MENU_CATALOGS)) translator.extend(lang, entries);
    const doc = parent.ownerDocument;
    ensureMenuStyle(doc);
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, testid?: string): HTMLElementTagNameMap[K] => {
      const e = doc.createElement(tag);
      e.className = className;
      if (testid) e.dataset['testid'] = testid;
      return e;
    };
    this.root = el('div', 'troid-touch-editor', 'touch-editor');
    this.root.dataset['uiBlock'] = ''; // a click here is never "attack" either
    this.root.dataset['open'] = '0';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    const scrim = el('div', 'te-scrim');
    this.zoneBox = el('div', 'te-zone', 'touch-editor-zone');
    this.zoneLabel = el('span', 'te-zone-label');
    this.zoneBox.appendChild(this.zoneLabel);
    this.root.append(scrim, this.zoneBox);
    for (const name of ['hud', 'pause', 'boss'] as const) {
      const keep = el('div', 'te-keep', `touch-editor-keep-${name}`);
      keep.setAttribute('aria-hidden', 'true');
      this.keeps.push(keep);
      this.root.appendChild(keep);
    }

    this.panel = el('div', 'te-panel', 'touch-editor-panel');
    this.title = el('h2', 'te-title', 'touch-editor-title');
    this.hint = el('p', 'te-hint', 'touch-editor-hint');
    this.reserved = el('p', 'te-hint te-reserved', 'touch-editor-reserved');
    const sizeRow = el('label', 'te-size', 'touch-editor-size-row');
    this.sizeName = doc.createElement('span');
    this.size = el('input', 'settings-range', 'touch-editor-size');
    this.size.type = 'range';
    this.size.min = String(TOUCH_LIMITS.button.min);
    this.size.max = String(TOUCH_LIMITS.button.max);
    this.size.step = '0.05';
    this.sizeOut = doc.createElement('output');
    sizeRow.append(this.sizeName, this.size, this.sizeOut);
    const row = el('div', 'te-actions');
    for (const [name, key] of [['mirror', 'settings.editorMirror'], ['reset', 'settings.editorReset'], ['cancel', 'settings.editorCancel'], ['save', 'settings.editorSave']] as const) {
      const b = el('button', name === 'save' ? 'settings-button te-save' : 'settings-button', `touch-editor-${name}`);
      b.type = 'button';
      b.dataset['key'] = key;
      this.actions.set(name, b);
      row.appendChild(b);
    }
    this.panel.append(this.title, this.hint, sizeRow, row, this.reserved);
    this.root.appendChild(this.panel);

    // the three buttons, above everything else of the editor: they can always be taken hold of
    for (const id of TOUCH_BUTTONS) {
      const hit = el('div', 'te-button', `touch-editor-${id}`);
      hit.setAttribute('role', 'button');
      hit.tabIndex = 0;
      hit.dataset['selected'] = '0';
      hit.dataset['dragging'] = '0';
      const art = createButtonArt(doc, id);
      art.root.dataset['pressed'] = '0';
      hit.appendChild(art.root);
      this.buttons.set(id, { id, hit, art });
      this.root.appendChild(hit);
      this.bindButton(hit, id);
    }
    parent.appendChild(this.root);

    listen(this.store, this.size, 'input', () => this.resize(Number(this.size.value)));
    // (a press a finger cannot lose: it acts on the lift — the first press of Save, right after a drag, would otherwise get no click)
    onPress(this.store, this.actions.get('mirror') as HTMLButtonElement, () => this.mirror());
    onPress(this.store, this.actions.get('reset') as HTMLButtonElement, () => this.restore());
    onPress(this.store, this.actions.get('cancel') as HTMLButtonElement, () => this.cancel());
    onPress(this.store, this.actions.get('save') as HTMLButtonElement, () => this.save());
    // Escape gives the editor up, and never reaches the game (where it is the pause key); the arrows move the button that is chosen
    listen(this.store, this.root, 'keydown', (e) => this.onKey(e));
    const win = doc.defaultView;
    if (win) listen(this.store, win, 'resize', () => this.isOpen && this.render());

    this.layout = computeTouchLayout(0, 0);
    this.refreshTexts();
    this.store.add(translator.changed.subscribe(() => this.refreshTexts()));
  }

  /** The editor has the screen. */
  get active(): boolean {
    return this.isOpen;
  }

  /** The button that is chosen (the one whose size the slider sets). */
  get chosen(): ButtonId {
    return this.selected;
  }

  /** Where the buttons are right now in the editor (the layout the game would draw for what has been chosen so far). */
  get current(): Readonly<TouchLayout> {
    return this.layout;
  }

  /** What would be kept if the player pressed Save now. */
  get pending(): ButtonPlacements {
    return { ...this.draft };
  }

  /** Opens the editor on the places the settings hold now; the real layer steps aside. */
  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.draft = { ...this.host.current().buttons };
    this.host.suspend(true);
    this.root.dataset['open'] = '1';
    this.select('attack');
    this.render();
    this.buttons.get(this.selected)?.hit.focus({ preventScroll: true });
  }

  /** Gives up: nothing is kept. */
  cancel(): void {
    this.finish(false);
  }

  /** Keeps what was chosen. */
  save(): void {
    this.finish(true);
  }

  dispose(): void {
    if (this.isOpen) this.host.suspend(false);
    this.isOpen = false;
    this.store.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- the choices

  private finish(keep: boolean): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.drag = null;
    this.root.dataset['open'] = '0';
    if (keep) this.host.save({ ...this.draft });
    this.host.suspend(false);
    this.host.done();
  }

  private select(id: ButtonId): void {
    this.selected = id;
    this.syncPanel();
    for (const b of this.buttons.values()) b.hit.dataset['selected'] = b.id === id ? '1' : '0';
  }

  /** The size of the chosen button, as far as the window lets it grow: when the layout cannot hold it exactly, it stops at the largest size that can be held. */
  private resize(value: number): void {
    const id = this.selected;
    const before = this.draft[id];
    const at = this.layout[id];
    const frame = this.frame();
    const asked = Math.min(TOUCH_LIMITS.button.max, Math.max(TOUCH_LIMITS.button.min, value));
    const was = before?.scale ?? 1;
    // from the size asked down to the one it had, in steps of a twentieth: the first one the window holds exactly
    let scale = asked;
    for (;;) {
      this.draft[id] = placementOf(frame, at.cx, at.cy, Math.round(scale * 100) / 100);
      const l = this.render(id);
      if (l.exact || scale <= was + 1e-9) break;
      scale = Math.max(was, scale - 0.05);
    }
    this.commit(id);
  }

  /** Puts the three buttons where the other hand would have them: the screen turned over from side to side. */
  private mirror(): void {
    const frame = this.frame();
    for (const id of TOUCH_BUTTONS) {
      const d = this.layout[id];
      this.draft[id] = placementOf(frame, frame.safe.x0 + frame.safe.x1 - d.cx, d.cy, this.draft[id]?.scale ?? 1);
    }
    this.render();
    for (const id of TOUCH_BUTTONS) this.commit(id);
  }

  /** Back to the places of the design (and the sizes): what the player chose is dropped. */
  private restore(): void {
    this.draft = {};
    this.render();
  }

  /** The place a button is at in the layout becomes its place, in the draft: what the player sees is what is kept (never a place the window could not give). */
  private commit(id: ButtonId): void {
    const d = this.layout[id];
    this.draft[id] = placementOf(this.frame(), d.cx, d.cy, this.draft[id]?.scale ?? 1);
    this.render();
  }

  private nudge(dx: number, dy: number): void {
    const id = this.selected;
    const d = this.layout[id];
    const frame = this.frame();
    this.draft[id] = placementOf(frame, d.cx + dx, d.cy + dy, this.draft[id]?.scale ?? 1);
    this.render(id);
    this.commit(id);
  }

  // ----------------------------------------------------------------------------------------------- fingers and keys

  private bindButton(hit: HTMLDivElement, id: ButtonId): void {
    listen(this.store, hit, 'pointerdown', (e) => {
      if (this.drag) return; // one hand at a time
      e.preventDefault();
      this.select(id);
      const box = this.root.getBoundingClientRect();
      const d = this.layout[id];
      this.drag = { id, pointerId: e.pointerId, grabX: e.clientX - box.left - d.cx, grabY: e.clientY - box.top - d.cy, startX: e.clientX, startY: e.clientY, moved: false, before: this.draft[id] };
      try {
        hit.setPointerCapture(e.pointerId);
      } catch {
        // a synthetic pointer (tests) cannot be captured: the events still come here
      }
      hit.dataset['dragging'] = '1';
    });
    listen(this.store, hit, 'pointermove', (e) => {
      const d = this.drag;
      if (!d || d.pointerId !== e.pointerId || d.id !== id) return;
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_FROM) return;
      d.moved = true;
      const box = this.root.getBoundingClientRect();
      const frame = this.frame();
      this.draft[id] = placementOf(frame, e.clientX - box.left - d.grabX, e.clientY - box.top - d.grabY, this.draft[id]?.scale ?? 1);
      this.render(id);
    });
    const end = (e: PointerEvent): void => {
      const d = this.drag;
      if (!d || d.pointerId !== e.pointerId || d.id !== id) return;
      this.drag = null;
      hit.dataset['dragging'] = '0';
      // a tap only chose the button; a cancelled touch is as if it had not been; a drag keeps the place the button is at
      if (d.moved && e.type !== 'pointercancel') {
        this.commit(id);
        return;
      }
      if (d.before) this.draft[id] = d.before;
      else delete this.draft[id];
      this.render();
    };
    listen(this.store, hit, 'pointerup', end);
    listen(this.store, hit, 'pointercancel', end);
    listen(this.store, hit, 'lostpointercapture', end);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.cancel();
      return;
    }
    const step = e.shiftKey ? NUDGE * 4 : NUDGE;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[e.code];
    // the arrows move the button that has the focus (or, with the focus elsewhere in the editor, the chosen one) — but never when they are for a slider
    if (!move || (e.target as HTMLElement).tagName === 'INPUT') return;
    e.preventDefault();
    e.stopPropagation();
    const focused = [...this.buttons.values()].find((b) => b.hit === (e.target as Element));
    if (focused) this.select(focused.id);
    this.nudge(move[0], move[1]);
  }

  // ----------------------------------------------------------------------------------------------- what is drawn

  private frame(): ReturnType<typeof touchFrame> {
    const w = this.host.window();
    return touchFrame(w.width, w.height, w.insets, w.hudScale);
  }

  /**
   * Lays everything out for the draft and draws it: the layout of the game itself (`computeTouchLayout`), with `last` — the button in the player's hand — placed after the others, so that it is the one
   * that gives way when it asks for a place that is taken. Returns the layout.
   */
  private render(last?: ButtonId): TouchLayout {
    const w = this.host.window();
    const order = last ? [...TOUCH_BUTTONS.filter((id) => id !== last), last] : TOUCH_BUTTONS;
    const layout = computeTouchLayout(w.width, w.height, w.insets, { scale: this.host.current().scale, buttons: this.draft, hudScale: w.hudScale, order });
    this.layout = layout;
    const frame = touchFrame(w.width, w.height, w.insets, w.hudScale);
    const place = (box: HTMLElement, r: Rect): void => {
      Object.assign(box.style, { left: `${r.x0}px`, top: `${r.y0}px`, width: `${r.x1 - r.x0}px`, height: `${r.y1 - r.y0}px` });
    };
    place(this.zoneBox, { x0: layout.zone.x, y0: 0, x1: layout.zone.x + layout.zone.w, y1: layout.zone.h });
    [frame.hud, frame.pause, frame.boss].forEach((r, i) => place(this.keeps[i] as HTMLElement, r));
    for (const b of this.buttons.values()) {
      const d = layout[b.id];
      Object.assign(b.hit.style, { left: `${d.cx - d.hit / 2}px`, top: `${d.cy - d.hit / 2}px`, width: `${d.hit}px`, height: `${d.hit}px` });
      b.art.load();
      b.art.size(d.visual);
    }
    // the panel goes at the top, to the right of the HUD, as wide as the window leaves it
    const right = w.width - w.insets.right - 8;
    const left = Math.max(w.insets.left + 8, Math.min(frame.hud.x1 + 8, right - 220));
    const width = Math.min(520, right - left);
    Object.assign(this.panel.style, { left: `${right - width}px`, top: `${w.insets.top + 8}px`, width: `${width}px` });
    this.syncPanel();
    return layout;
  }

  /** The slider shows the size of the chosen button; the buttons of the panel say what they do. */
  private syncPanel(): void {
    const t = this.translator;
    const id = this.selected;
    const own = this.draft[id]?.scale ?? 1;
    this.sizeName.textContent = t.t('settings.editorSize', { button: t.t(NAME_KEYS[id]) });
    this.size.value = String(own);
    this.size.setAttribute('aria-valuetext', percent(own));
    this.sizeOut.textContent = percent(own);
  }

  /** Every word, from the translator: the language may have changed. */
  private refreshTexts(): void {
    const t = this.translator;
    this.title.textContent = t.t('settings.editorTitle');
    this.hint.textContent = t.t('settings.editorHint');
    this.reserved.textContent = t.t('settings.editorReserved');
    this.zoneLabel.textContent = t.t('settings.editorZone');
    this.root.setAttribute('aria-label', t.t('settings.editorTitle'));
    for (const b of this.actions.values()) b.textContent = t.t(b.dataset['key'] ?? '');
    for (const b of this.buttons.values()) b.hit.setAttribute('aria-label', t.t('settings.editorMove', { button: t.t(NAME_KEYS[b.id]) }));
    this.syncPanel();
  }
}
