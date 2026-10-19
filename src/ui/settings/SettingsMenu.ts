import { listen } from '@/app/dom';
import { DisposableStore } from '@/core/lifecycle';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import type { Translator } from '@/i18n/translator';
import type { ControlInput, ControlsReference } from '@/input/controlsReference';
import { keyLabel } from '@/input/glyphs';
import { assignKey, effectiveKeys, REMAPPABLE, type KeyMap, type Remappable } from '@/input/remap';
import type { QualitySetting } from '@/presentation/viewport';
import { ensureMenuStyle } from './menuStyle';
import { HUD_SCALE_LIMITS, TOUCH_LIMITS, VOLUME_LIMITS, type AccessibilitySettings, type TouchSettings } from '@/save/SettingsData';

/** What the menu needs from the game, and nothing more: it reads values, reports a choice, and asks to close. */
export interface SettingsMenuHost {
  /** The languages offered, in the order shown. */
  languages: readonly string[];
  /** Is there a touch layer to adjust? (A desktop with a keyboard never shows one: its settings would mean nothing.) */
  touchAvailable(): boolean;
  /** Is there a keyboard whose keys can be changed? (A phone that never saw one does not offer them.) */
  keyboardAvailable(): boolean;
  current(): { language: string; volume: number; quality: QualitySetting; keys: KeyMap; touch: TouchSettings; accessibility: AccessibilitySettings };
  /** The controls as they are now (the bindings in force), for the reference list of the controls screen. */
  reference(): ControlsReference;
  setLanguage(language: string): void;
  setVolume(level: number): void;
  setQuality(quality: QualitySetting): void;
  /** The whole map of keys (the menu works out the swaps and the refusals; the game applies and saves what it is given). */
  setKeys(keys: KeyMap): void;
  setTouch(patch: Partial<TouchSettings>): void;
  setAccessibility(patch: Partial<AccessibilitySettings>): void;
  /** Leaves this screen: the whole menu when it is the only one, back to the list of the pause menu when it is one of its screens. */
  close(): void;
}

/**
 * Which part of the settings a menu shows. `all` is everything in one panel (what the menu was before the pause menu had screens of its own); the pause menu uses `settings` (the language, the
 * sound, the quality, accessibility) and `controls` (the keys, the touch layout and the list of what each control does).
 */
export type SettingsScreen = 'all' | 'settings' | 'controls';

export interface SettingsMenuOptions {
  screen?: SettingsScreen;
}


/** The test ids that tell the screens apart (the E2E and the unit tests find them by these). */
const SCREEN_IDS: Readonly<Record<SettingsScreen, { root: string; title: string; back: string }>> = {
  all: { root: 'settings-menu', title: 'settings-title', back: 'settings-resume' },
  settings: { root: 'settings-screen', title: 'settings-screen-title', back: 'settings-back' },
  controls: { root: 'controls-screen', title: 'controls-screen-title', back: 'controls-back' },
};

/** What each remappable action is called, as a translator key (literals: the catalogs are checked against them). */
const ACTION_LABELS: Readonly<Record<Remappable, string>> = {
  jump: 'action.jump',
  attack: 'action.attack',
  dash: 'action.dash',
  ability: 'action.ability',
  bottle: 'action.bottle',
  interact: 'action.interact',
  down: 'action.crouch',
};
const QUALITY_LABELS: Readonly<Record<QualitySetting, string>> = { auto: 'settings.qualityAuto', low: 'settings.qualityLow', high: 'settings.qualityHigh' };
/** The profiles offered, in order (a test holds this to the settings' own list: the menu must not need the runtime of the renderer's module to know them). */
const QUALITIES = ['auto', 'low', 'high'] as const satisfies readonly QualitySetting[];

/** A level as a percentage: a number and a sign, not a word (so not a translation). */
const percent = (level: number): string => String(Math.round(level * 100)) + '%';
/** "Attack: F": the name of an action and what it is on now, for the screen reader (both parts come from the translator and the key labels). */
const named = (name: string, value: string): string => name + ': ' + value;

/** What the touch section goes back to (the design as shipped). */
const TOUCH_DEFAULTS: Readonly<TouchSettings> = Object.freeze({ scale: 1, opacity: 1, side: 'right', offsetX: 0, offsetY: 0 });

/**
 * The name of a language in ITSELF ("español", "English"), made by the platform: language names are not translations (they are the
 * same in every catalog), so they come from `Intl.DisplayNames`, never from a literal. An engine without it shows the code.
 */
export function languageName(code: string): string {
  let name = code.toUpperCase();
  try {
    name = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? name;
  } catch {
    // an engine without `Intl.DisplayNames` (or with an odd code): the code itself is a name a player can read
  }
  return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
}

/**
 * The pause / settings menu (DOM, docs/GAME-SPEC-2D.md §17 "menú de pausa mínimo"; docs/PROMPT6-LOG.md S30): the language (each in its own name), the
 * volume (prepared: there is no sound yet), the quality profile (Auto / Low / High), the keys of the main actions — where a keyboard exists — and,
 * where a touch layer exists, the size, opacity, side and position of the touch controls. It owns no text (every word is a translator key), keeps no
 * state of its own (the host holds the settings; the menu reads them every time it opens) and decides nothing: it reports a choice, the game applies
 * it and saves it. It is a separate chunk: a player's first load does not carry it until the menu is asked for.
 *
 * Changing a key: press the action's button — it says "press a key" — and then the key. Escape (or leaving the menu) cancels. A key that belongs to
 * movement, the pause or the browser is refused and the menu says so; a key another action has makes the two SWAP. Nothing else is configurable:
 * no combinations, no gamepad, no profiles.
 */
export class SettingsMenu {
  readonly root: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly title: HTMLElement;
  private readonly labels = new Map<string, HTMLElement>();
  private readonly languageButtons = new Map<string, HTMLButtonElement>();
  private readonly qualityButtons = new Map<QualitySetting, HTMLButtonElement>();
  private readonly sideButtons = new Map<TouchSettings['side'], HTMLButtonElement>();
  private readonly keyButtons = new Map<Remappable, HTMLButtonElement>();
  private readonly volume: HTMLInputElement;
  private readonly volumeValue: HTMLOutputElement;
  private readonly keysSection: HTMLElement;
  private readonly keysMessage: HTMLElement;
  private readonly touchSection: HTMLElement;
  private readonly size: HTMLInputElement;
  private readonly opacity: HTMLInputElement;
  private readonly offsetX: HTMLInputElement;
  private readonly offsetY: HTMLInputElement;
  private readonly resume: HTMLButtonElement;
  private readonly screen: SettingsScreen;
  private readonly flashes: HTMLButtonElement;
  private readonly shake: HTMLButtonElement;
  private readonly hudSize: HTMLInputElement;
  private readonly outputs = new Map<HTMLInputElement, HTMLOutputElement>();
  /** The controls screen: what each device's controls do (read-only lists, rebuilt from the bindings in force) and the body that holds them with the settings of each device. */
  private readonly refs: Record<'keyboard' | 'gamepad' | 'touch', HTMLElement>;
  private readonly controlsBody: HTMLElement;
  /** Which device comes first on the controls screen (`null`: not placed yet): the one the player is using. */
  private touchFirst: boolean | null = null;
  /** The action waiting for its key, and the last thing the keys area told the player (a translator key and its parameters). */
  private listening: Remappable | null = null;
  private message: { key: string; tone: 'info' | 'warn'; swapped?: Remappable; code?: string } | null = null;
  /** Until when a click is the tail of the key just assigned (Space and Enter also "press" the button that has the focus). */
  private ignoreClicksUntil = 0;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
    private readonly host: SettingsMenuHost,
    options: SettingsMenuOptions = {},
  ) {
    this.screen = options.screen ?? 'all';
    const sectionsOf = (name: 'settings' | 'controls'): boolean => this.screen === 'all' || this.screen === name;
    // its words come with it: a player who never opens the menu never downloads them
    for (const [lang, entries] of Object.entries(MENU_CATALOGS)) translator.extend(lang, entries);
    const doc = parent.ownerDocument;
    ensureMenuStyle(doc);
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, testid?: string): HTMLElementTagNameMap[K] => {
      const e = doc.createElement(tag);
      e.className = className;
      if (testid) e.dataset['testid'] = testid;
      return e;
    };
    // the test ids of the root, the title and the way out differ per screen: the pause menu holds two of these at once
    const ids = SCREEN_IDS[this.screen];
    this.root = el('div', 'troid-settings', ids.root);
    this.root.dataset['uiBlock'] = '';
    this.root.dataset['open'] = '0';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    const panel = el('div', 'settings-panel');
    this.title = el('h2', 'settings-title', ids.title);

    // ---- language ----
    const language = el('div', 'settings-section');
    language.appendChild(this.label(doc, 'settings.language'));
    const langRow = el('div', 'settings-row', 'settings-languages');
    for (const code of host.languages) {
      const b = el('button', 'settings-button', `settings-lang-${code}`);
      b.type = 'button';
      b.dataset['lang'] = code;
      b.lang = code; // the name is in ITS language: screen readers pronounce it right
      b.textContent = languageName(code);
      listen(this.store, b, 'click', () => {
        host.setLanguage(code);
        this.refresh();
      });
      this.languageButtons.set(code, b);
      langRow.appendChild(b);
    }
    language.appendChild(langRow);

    // ---- volume (prepared) ----
    const volume = el('div', 'settings-section', 'settings-volume-section');
    const vol = this.slider(doc, el, volume, 'settings.volume', 'settings-volume', VOLUME_LIMITS.master, (value) => host.setVolume(value));
    this.volume = vol.input;
    this.volumeValue = vol.output;
    volume.appendChild(this.note(doc, 'settings.volumeNote', 'settings-volume-note'));

    // ---- quality ----
    const quality = el('div', 'settings-section', 'settings-quality');
    quality.appendChild(this.label(doc, 'settings.quality'));
    const qualityRow = el('div', 'settings-row');
    for (const q of QUALITIES) {
      const b = el('button', 'settings-button', `settings-quality-${q}`);
      b.type = 'button';
      b.dataset['quality'] = q;
      this.labels.set(QUALITY_LABELS[q], b);
      listen(this.store, b, 'click', () => {
        host.setQuality(q);
        this.refresh();
      });
      this.qualityButtons.set(q, b);
      qualityRow.appendChild(b);
    }
    quality.append(qualityRow, this.note(doc, 'settings.qualityNote', 'settings-quality-note'));

    // ---- accessibility: each choice changes something the game really does ----
    const access = el('div', 'settings-section', 'settings-accessibility');
    access.appendChild(this.label(doc, 'settings.accessibility'));
    this.flashes = this.toggle(doc, el, access, 'settings.reduceFlashes', 'settings.reduceFlashesNote', 'settings-flashes', (on) => host.setAccessibility({ reduceFlashes: on }));
    this.shake = this.toggle(doc, el, access, 'settings.reduceShake', 'settings.reduceShakeNote', 'settings-shake', (on) => host.setAccessibility({ reduceShake: on }));
    this.hudSize = this.slider(doc, el, access, 'settings.hudSize', 'settings-hud-size', HUD_SCALE_LIMITS, (value) => host.setAccessibility({ hudScale: value })).input;

    // ---- keyboard controls ----
    this.keysSection = el('div', 'settings-section', 'settings-controls');
    this.keysSection.appendChild(this.label(doc, 'settings.controls'));
    const keys = el('div', 'settings-keys');
    for (const action of REMAPPABLE) {
      const name = el('span', 'settings-keyname');
      this.labels.set(ACTION_LABELS[action], name);
      const b = el('button', 'settings-button settings-key', `settings-key-${action}`);
      b.type = 'button';
      b.dataset['action'] = action;
      listen(this.store, b, 'click', () => {
        if (this.now() < this.ignoreClicksUntil) return;
        this.arm(action);
      });
      this.keyButtons.set(action, b);
      keys.append(name, b);
    }
    this.keysMessage = el('p', 'settings-note', 'settings-keys-message');
    this.keysMessage.setAttribute('role', 'status');
    this.keysMessage.setAttribute('aria-live', 'polite');
    const resetKeys = el('button', 'settings-button settings-small', 'settings-keys-reset');
    resetKeys.type = 'button';
    this.labels.set('settings.resetKeys', resetKeys);
    listen(this.store, resetKeys, 'click', () => {
      this.listening = null;
      this.message = null;
      host.setKeys({});
      this.refresh();
    });
    this.keysSection.append(keys, this.note(doc, 'settings.controlsHint', 'settings-keys-hint'), this.keysMessage, resetKeys);
    // while a key is awaited, EVERY key typed into the menu is for it (Escape cancels): it never reaches the game, which would take it for the pause
    listen(this.store, this.root, 'keydown', (e) => this.onKey(e));

    // ---- touch controls ----
    this.touchSection = el('div', 'settings-section', 'settings-touch');
    this.touchSection.appendChild(this.label(doc, 'settings.touch'));
    this.size = this.slider(doc, el, this.touchSection, 'settings.touchSize', 'settings-touch-size', TOUCH_LIMITS.scale, (value) => host.setTouch({ scale: value })).input;
    this.opacity = this.slider(doc, el, this.touchSection, 'settings.touchOpacity', 'settings-touch-opacity', TOUCH_LIMITS.opacity, (value) => host.setTouch({ opacity: value })).input;
    const sideRow = el('div', 'settings-row', 'settings-touch-side');
    sideRow.style.marginTop = '6px';
    for (const side of ['right', 'left'] as const) {
      const b = el('button', 'settings-button', `settings-touch-side-${side}`);
      b.type = 'button';
      b.dataset['side'] = side;
      this.labels.set(side === 'right' ? 'settings.sideRight' : 'settings.sideLeft', b);
      listen(this.store, b, 'click', () => {
        host.setTouch({ side });
        this.refresh();
      });
      this.sideButtons.set(side, b);
      sideRow.appendChild(b);
    }
    const sideLabel = this.label(doc, 'settings.touchSide');
    sideLabel.style.marginTop = '8px';
    this.touchSection.append(sideLabel, sideRow);
    this.offsetX = this.slider(doc, el, this.touchSection, 'settings.touchOffsetX', 'settings-touch-offset-x', TOUCH_LIMITS.offsetX, (value) => host.setTouch({ offsetX: value })).input;
    this.offsetY = this.slider(doc, el, this.touchSection, 'settings.touchOffsetY', 'settings-touch-offset-y', TOUCH_LIMITS.offsetY, (value) => host.setTouch({ offsetY: value })).input;
    const resetTouch = el('button', 'settings-button settings-small', 'settings-touch-reset');
    resetTouch.type = 'button';
    this.labels.set('settings.resetTouch', resetTouch);
    listen(this.store, resetTouch, 'click', () => {
      host.setTouch({ ...TOUCH_DEFAULTS });
      this.refresh();
    });
    this.touchSection.appendChild(resetTouch);

    // what each control does, as the bindings in force have it (the controls screen only: it is a list to read, not a setting)
    const list = (device: 'keyboard' | 'gamepad' | 'touch'): HTMLElement => el('div', 'settings-section settings-reference', `settings-reference-${device}`);
    this.refs = { keyboard: list('keyboard'), gamepad: list('gamepad'), touch: list('touch') };
    this.controlsBody = el('div', 'settings-controls-body', 'settings-controls-body');

    // the way out: on its own the menu resumes the game; as a screen of the pause menu it goes back to the list
    this.resume = el('button', 'settings-button settings-resume', ids.back);
    this.resume.type = 'button';
    listen(this.store, this.resume, 'click', () => host.close());

    // the title and the way out stay where they are; what lies between them scrolls
    const body = el('div', 'settings-body');
    const parts: HTMLElement[] = [];
    if (sectionsOf('settings')) parts.push(language, volume, quality, access);
    // the controls screen is laid out by `placeGroups` (the device in use first); the single panel keeps the keys and the touch layout, in that order
    if (this.screen === 'controls') parts.push(this.controlsBody);
    else if (sectionsOf('controls')) parts.push(this.keysSection, this.touchSection);
    body.append(...parts);
    panel.append(this.title, body, this.resume);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.refreshTexts();
    this.store.add(
      translator.changed.subscribe(() => {
        this.refreshTexts();
        this.refresh();
      }),
    );
  }

  get isOpen(): boolean {
    return this.root.dataset['open'] === '1';
  }

  /** The action that is waiting for a key, if any (for the tests and the E2E). */
  get awaiting(): Remappable | null {
    return this.listening;
  }

  /** Shows the menu with the settings as they are NOW, and puts the focus on Resume. */
  open(): void {
    this.listening = null;
    this.message = null;
    this.refresh();
    this.root.dataset['open'] = '1';
    this.resume.focus({ preventScroll: true });
  }

  close(): void {
    this.listening = null;
    this.message = null;
    this.root.dataset['open'] = '0';
    (this.root.ownerDocument.activeElement as HTMLElement | null)?.blur?.();
  }

  dispose(): void {
    this.store.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- internals

  /** Re-reads the values from the host: the language, the sliders, the profile, the keys, the side, and which sections apply. */
  private refresh(): void {
    const cur = this.host.current();
    for (const [code, b] of this.languageButtons) b.setAttribute('aria-pressed', code === cur.language ? 'true' : 'false');
    this.volume.value = String(cur.volume);
    this.showVolume(cur.volume);
    for (const [q, b] of this.qualityButtons) b.setAttribute('aria-pressed', q === cur.quality ? 'true' : 'false');
    this.keysSection.style.display = this.host.keyboardAvailable() ? '' : 'none';
    const eff = effectiveKeys(cur.keys);
    for (const [action, b] of this.keyButtons) {
      const waiting = this.listening === action;
      b.dataset['listening'] = waiting ? '1' : '0';
      b.setAttribute('aria-pressed', waiting ? 'true' : 'false');
      b.dataset['code'] = eff[action];
      b.textContent = waiting ? this.translator.t('settings.listening') : keyLabel(eff[action]);
      b.setAttribute('aria-label', named(this.translator.t(ACTION_LABELS[action]), waiting ? this.translator.t('settings.listening') : keyLabel(eff[action])));
    }
    this.showMessage();
    this.touchSection.style.display = this.host.touchAvailable() ? '' : 'none';
    this.size.value = String(cur.touch.scale);
    this.opacity.value = String(cur.touch.opacity);
    for (const [side, b] of this.sideButtons) b.setAttribute('aria-pressed', side === cur.touch.side ? 'true' : 'false');
    this.offsetX.value = String(cur.touch.offsetX);
    this.offsetY.value = String(cur.touch.offsetY);
    this.setSwitch(this.flashes, cur.accessibility.reduceFlashes);
    this.setSwitch(this.shake, cur.accessibility.reduceShake);
    this.hudSize.value = String(cur.accessibility.hudScale);
    for (const input of [this.size, this.opacity, this.offsetX, this.offsetY, this.hudSize]) {
      const out = this.outputs.get(input);
      if (out) out.textContent = percent(Number(input.value));
    }
    if (this.screen === 'controls') {
      this.renderReference();
      this.placeGroups();
    }
  }

  /**
   * The controls screen, in the order a player needs it: on a keyboard, the keyboard's list and its keys first, then the pad and the touch layer; on a touch screen with no keyboard, the touch layer
   * first. Each device's list sits right above its own settings. Only a change of order moves anything.
   */
  private placeGroups(): void {
    const touchFirst = !this.host.keyboardAvailable() && this.host.touchAvailable();
    if (touchFirst === this.touchFirst) return;
    this.touchFirst = touchFirst;
    const { keyboard, gamepad, touch } = this.refs;
    this.controlsBody.replaceChildren(...(touchFirst ? [touch, this.touchSection, gamepad, keyboard, this.keysSection] : [keyboard, this.keysSection, gamepad, touch, this.touchSection]));
  }

  private setSwitch(button: HTMLButtonElement, on: boolean): void {
    button.setAttribute('aria-checked', on ? 'true' : 'false');
    button.textContent = this.translator.t(on ? 'settings.on' : 'settings.off');
  }

  /** The list of what each control does, from the bindings in force: the keyboard (where there is one), the gamepad and the touch layer (where there is one). */
  private renderReference(): void {
    const doc = this.root.ownerDocument;
    const t = this.translator;
    const ref = this.host.reference();
    const inputs = (list: ControlInput[]): HTMLElement => {
      const wrap = doc.createElement('span');
      wrap.className = 'settings-inputs';
      for (const input of list) {
        const chip = doc.createElement('kbd');
        chip.textContent = typeof input === 'string' ? input : t.t(input.key);
        wrap.appendChild(chip);
      }
      return wrap;
    };
    const table = (titleKey: string, rows: ControlsReference['keyboard'], noteKey?: string): HTMLElement => {
      const box = doc.createElement('div');
      box.className = 'settings-reference-block';
      const h = doc.createElement('div');
      h.className = 'settings-label';
      h.textContent = t.t(titleKey);
      const grid = doc.createElement('div');
      grid.className = 'settings-reference-rows';
      for (const r of rows) {
        const name = doc.createElement('span');
        name.className = 'settings-keyname';
        name.textContent = t.t(r.action);
        grid.append(name, inputs(r.inputs));
      }
      box.append(h, grid);
      if (noteKey) box.appendChild(this.note(doc, noteKey, `${noteKey}-text`, false));
      return box;
    };
    this.refs.keyboard.replaceChildren(...(this.host.keyboardAvailable() ? [table('controls.keyboard', ref.keyboard)] : []));
    this.refs.gamepad.replaceChildren(table('controls.gamepad', ref.gamepad, 'controls.padNote'));
    if (!this.host.touchAvailable()) {
      this.refs.touch.replaceChildren();
      return;
    }
    const box = doc.createElement('div');
    box.className = 'settings-reference-block';
    const h = doc.createElement('div');
    h.className = 'settings-label';
    h.textContent = t.t('controls.touch');
    box.appendChild(h);
    for (const r of ref.touch) {
      const line = doc.createElement('div');
      line.className = 'settings-touchline';
      const name = doc.createElement('b');
      name.textContent = t.t(r.action);
      const how = doc.createElement('span');
      how.textContent = t.t(r.how);
      line.append(name, how);
      box.appendChild(line);
    }
    this.refs.touch.replaceChildren(box);
  }

  /** The player chose an action to change: the next key typed in the menu is its key. */
  private arm(action: Remappable): void {
    this.listening = this.listening === action ? null : action;
    this.message = null;
    this.refresh();
    this.keyButtons.get(action)?.focus({ preventScroll: true });
  }

  private onKey(e: KeyboardEvent): void {
    const action = this.listening;
    if (action === null) return; // not waiting for one: the keys are the page's (Tab, Enter and Space move through the buttons)
    // this key is for the action, whatever it is: it never goes on to the game (Escape there is the pause)
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') {
      this.listening = null;
      this.message = null;
      this.refresh();
      return;
    }
    const result = assignKey(this.host.current().keys, action, e.code);
    if (!result.ok) {
      // refused: it stays waiting, and says why
      this.message = { key: 'settings.keyReserved', tone: 'warn' };
      this.refresh();
      return;
    }
    this.listening = null;
    this.message = result.swapped ? { key: 'settings.keySwapped', tone: 'info', swapped: result.swapped, code: e.code } : null;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') this.ignoreClicksUntil = this.now() + 400;
    this.host.setKeys(result.map);
    this.refresh();
  }

  private now(): number {
    return this.root.ownerDocument.defaultView?.performance.now() ?? Date.now();
  }

  private showMessage(): void {
    const m = this.message;
    const params = m?.swapped && m.code ? { key: keyLabel(m.code), action: this.translator.t(ACTION_LABELS[m.swapped]) } : undefined;
    this.keysMessage.textContent = m ? this.translator.t(m.key, params) : '';
    this.keysMessage.dataset['tone'] = m?.tone ?? 'info';
    this.keysMessage.style.display = m ? '' : 'none';
  }

  private showVolume(level: number): void {
    this.volumeValue.textContent = percent(level);
    this.volume.setAttribute('aria-valuetext', percent(level));
  }

  private label(doc: Document, key: string): HTMLElement {
    const l = doc.createElement('div');
    l.className = 'settings-label';
    this.labels.set(key, l);
    return l;
  }

  /** A small paragraph under a control. `track`: it is one of the fixed texts of the panel, re-written when the language changes (the reference list is built again instead). */
  private note(doc: Document, key: string, testid: string, track = true): HTMLElement {
    const n = doc.createElement('p');
    n.className = 'settings-note';
    n.dataset['testid'] = testid;
    if (track) this.labels.set(key, n);
    else n.textContent = this.translator.t(key);
    return n;
  }

  /** A switch: its name, what it does in a note, and a button that says whether it is on. Pressing it reports the new state; the host applies it and the menu reads it back. */
  private toggle(
    doc: Document,
    el: <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, testid?: string) => HTMLElementTagNameMap[K],
    parent: HTMLElement,
    nameKey: string,
    noteKey: string,
    testid: string,
    onChange: (on: boolean) => void,
  ): HTMLButtonElement {
    const row = el('div', 'settings-toggle');
    const name = doc.createElement('span');
    this.labels.set(nameKey, name);
    const button = el('button', 'settings-button settings-switch', testid);
    button.type = 'button';
    button.setAttribute('role', 'switch');
    listen(this.store, button, 'click', () => {
      const on = button.getAttribute('aria-checked') !== 'true';
      onChange(on);
      this.refresh();
    });
    row.append(name, button);
    parent.append(row, this.note(doc, noteKey, `${testid}-note`));
    return button;
  }

  private slider(
    doc: Document,
    el: <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, testid?: string) => HTMLElementTagNameMap[K],
    parent: HTMLElement,
    key: string,
    testid: string,
    limits: { min: number; max: number },
    onInput: (value: number) => void,
  ): { input: HTMLInputElement; output: HTMLOutputElement } {
    const row = el('label', 'settings-slider');
    const name = doc.createElement('span');
    this.labels.set(key, name);
    const input = el('input', 'settings-range', testid);
    input.type = 'range';
    input.min = String(limits.min);
    input.max = String(limits.max);
    input.step = '0.05';
    const output = doc.createElement('output');
    this.outputs.set(input, output);
    listen(this.store, input, 'input', () => {
      const v = Number(input.value);
      if (input === this.volume) this.showVolume(v);
      else output.textContent = percent(v);
      onInput(v);
    });
    row.append(name, input, output);
    parent.appendChild(row);
    return { input, output };
  }

  /** Every word, from the translator: the language may have changed. */
  private refreshTexts(): void {
    const t = this.translator;
    const title = t.t(this.screen === 'settings' ? 'pause.settings' : this.screen === 'controls' ? 'pause.controls' : 'settings.title');
    this.title.textContent = title;
    this.root.setAttribute('aria-label', title);
    this.resume.textContent = t.t(this.screen === 'all' ? 'settings.resume' : 'settings.back');
    for (const [key, node] of this.labels) node.textContent = t.t(key);
  }
}
