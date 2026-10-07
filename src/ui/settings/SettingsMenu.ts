import { listen } from '@/app/dom';
import { DisposableStore } from '@/core/lifecycle';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import type { Translator } from '@/i18n/translator';
import { keyLabel } from '@/input/glyphs';
import { assignKey, effectiveKeys, REMAPPABLE, type KeyMap, type Remappable } from '@/input/remap';
import { cssHex, PALETTE } from '@/presentation/palette';
import type { QualitySetting } from '@/presentation/viewport';
import { TOUCH_LIMITS, VOLUME_LIMITS, type TouchSettings } from '@/save/SettingsData';

/** What the menu needs from the game, and nothing more: it reads values, reports a choice, and asks to close. */
export interface SettingsMenuHost {
  /** The languages offered, in the order shown. */
  languages: readonly string[];
  /** Is there a touch layer to adjust? (A desktop with a keyboard never shows one: its settings would mean nothing.) */
  touchAvailable(): boolean;
  /** Is there a keyboard whose keys can be changed? (A phone that never saw one does not offer them.) */
  keyboardAvailable(): boolean;
  current(): { language: string; volume: number; quality: QualitySetting; keys: KeyMap; touch: TouchSettings };
  setLanguage(language: string): void;
  setVolume(level: number): void;
  setQuality(quality: QualitySetting): void;
  /** The whole map of keys (the menu works out the swaps and the refusals; the game applies and saves what it is given). */
  setKeys(keys: KeyMap): void;
  setTouch(patch: Partial<TouchSettings>): void;
  close(): void;
}

const STYLE_ID = 'troid-settings-style';
const rgba = (hex: number, a: number): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

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

function menuCss(): string {
  const glow = cssHex(PALETTE.energyGlow);
  const white = cssHex(PALETTE.whiteHot);
  const core = cssHex(PALETTE.energyCore);
  const violet = cssHex(PALETTE.violetGlow);
  const rim = rgba(PALETTE.energyCore, 0.45);
  const panel = rgba(PALETTE.uiPanel, 0.94);
  return `
.troid-settings { position:absolute; inset:0; z-index:45; display:none; pointer-events:auto; align-items:center; justify-content:center; background:${rgba(PALETTE.worldVoid, 0.78)}; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:${white}; user-select:none; -webkit-user-select:none; }
.troid-settings[data-open="1"] { display:flex; }
.troid-settings .settings-panel { width:min(460px, 92vw); max-height:90vh; overflow:auto; box-sizing:border-box; padding:18px 20px 20px; border-radius:10px; border:1px solid ${rim}; background:${panel}; box-shadow:0 0 28px ${rgba(PALETTE.energyGlow, 0.25)}; }
.troid-settings .settings-title { font-size:1.35rem; font-weight:300; letter-spacing:0.14em; text-align:center; margin:0 0 14px; text-shadow:0 0 14px ${core}88; }
.troid-settings .settings-section { margin:0 0 14px; }
.troid-settings .settings-label { font-size:0.8rem; letter-spacing:0.08em; opacity:0.75; margin:0 0 6px; }
.troid-settings .settings-note { font-size:0.74rem; line-height:1.35; opacity:0.62; margin:6px 0 0; }
.troid-settings .settings-note[data-tone="warn"] { color:${violet}; opacity:0.95; }
.troid-settings .settings-row { display:flex; gap:8px; }
.troid-settings .settings-button { flex:1; min-height:44px; box-sizing:border-box; font:inherit; font-size:1rem; color:${white}; background:${rgba(PALETTE.uiPanel, 0.9)}; border:1px solid ${rgba(PALETTE.energyCore, 0.3)}; border-radius:8px; cursor:pointer; padding:0 12px; }
.troid-settings .settings-button[aria-pressed="true"] { border-color:${glow}; box-shadow:0 0 10px ${rgba(PALETTE.energyGlow, 0.5)}; color:${glow}; }
.troid-settings .settings-button:focus-visible, .troid-settings .settings-range:focus-visible { outline:2px solid ${glow}; outline-offset:2px; }
.troid-settings .settings-slider { display:grid; grid-template-columns:7.5rem 1fr 2.6rem; align-items:center; gap:10px; min-height:44px; }
.troid-settings .settings-slider output { font-size:0.82rem; opacity:0.75; text-align:right; font-variant-numeric:tabular-nums; }
.troid-settings .settings-range { width:100%; accent-color:${core}; }
.troid-settings .settings-keys { display:grid; grid-template-columns:1fr auto; gap:6px 10px; align-items:center; }
.troid-settings .settings-keys .settings-keyname { font-size:0.95rem; }
.troid-settings .settings-key { min-width:7.5rem; flex:none; font-variant-numeric:tabular-nums; }
.troid-settings .settings-key[data-listening="1"] { border-color:${violet}; color:${violet}; box-shadow:0 0 10px ${rgba(PALETTE.violetCore, 0.55)}; }
.troid-settings .settings-small { min-height:36px; font-size:0.85rem; margin-top:8px; }
.troid-settings .settings-resume { width:100%; margin-top:4px; }
`;
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
  /** The action waiting for its key, and the last thing the keys area told the player (a translator key and its parameters). */
  private listening: Remappable | null = null;
  private message: { key: string; tone: 'info' | 'warn'; swapped?: Remappable; code?: string } | null = null;
  /** Until when a click is the tail of the key just assigned (Space and Enter also "press" the button that has the focus). */
  private ignoreClicksUntil = 0;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
    private readonly host: SettingsMenuHost,
  ) {
    // its words come with it: a player who never opens the menu never downloads them
    for (const [lang, entries] of Object.entries(MENU_CATALOGS)) translator.extend(lang, entries);
    const doc = parent.ownerDocument;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.appendChild(doc.createTextNode(menuCss()));
      doc.head.appendChild(style);
    }
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, testid?: string): HTMLElementTagNameMap[K] => {
      const e = doc.createElement(tag);
      e.className = className;
      if (testid) e.dataset['testid'] = testid;
      return e;
    };
    this.root = el('div', 'troid-settings', 'settings-menu');
    this.root.dataset['uiBlock'] = '';
    this.root.dataset['open'] = '0';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    const panel = el('div', 'settings-panel');
    this.title = el('h2', 'settings-title', 'settings-title');

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

    this.resume = el('button', 'settings-button settings-resume', 'settings-resume');
    this.resume.type = 'button';
    listen(this.store, this.resume, 'click', () => host.close());

    panel.append(this.title, language, volume, quality, this.keysSection, this.touchSection, this.resume);
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

  private note(doc: Document, key: string, testid: string): HTMLElement {
    const n = doc.createElement('p');
    n.className = 'settings-note';
    n.dataset['testid'] = testid;
    this.labels.set(key, n);
    return n;
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
    listen(this.store, input, 'input', () => {
      const v = Number(input.value);
      if (input === this.volume) this.showVolume(v);
      onInput(v);
    });
    row.append(name, input, output);
    parent.appendChild(row);
    return { input, output };
  }

  /** Every word, from the translator: the language may have changed. */
  private refreshTexts(): void {
    const t = this.translator;
    this.title.textContent = t.t('settings.title');
    this.root.setAttribute('aria-label', t.t('settings.title'));
    this.resume.textContent = t.t('settings.resume');
    for (const [key, node] of this.labels) node.textContent = t.t(key);
  }
}
