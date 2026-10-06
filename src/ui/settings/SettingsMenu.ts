import { listen } from '@/app/dom';
import { DisposableStore } from '@/core/lifecycle';
import type { Translator } from '@/i18n/translator';
import { cssHex, PALETTE } from '@/presentation/palette';
import { TOUCH_LIMITS, type TouchSettings } from '@/save/SettingsData';

/** What the menu needs from the game, and nothing more: it reads values, reports a choice, and asks to close. */
export interface SettingsMenuHost {
  /** The languages offered, in the order shown. */
  languages: readonly string[];
  /** Is there a touch layer to adjust? (A desktop with a keyboard never shows one: its settings would mean nothing.) */
  touchAvailable(): boolean;
  current(): { language: string; touch: TouchSettings };
  setLanguage(language: string): void;
  setTouch(patch: Partial<TouchSettings>): void;
  close(): void;
}

const STYLE_ID = 'troid-settings-style';
const rgba = (hex: number, a: number): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

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
  const rim = rgba(PALETTE.energyCore, 0.45);
  const panel = rgba(PALETTE.uiPanel, 0.94);
  return `
.troid-settings { position:absolute; inset:0; z-index:45; display:none; pointer-events:auto; align-items:center; justify-content:center; background:${rgba(PALETTE.worldVoid, 0.78)}; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:${white}; user-select:none; -webkit-user-select:none; }
.troid-settings[data-open="1"] { display:flex; }
.troid-settings .settings-panel { width:min(420px, 90vw); max-height:88vh; overflow:auto; box-sizing:border-box; padding:18px 20px 20px; border-radius:10px; border:1px solid ${rim}; background:${panel}; box-shadow:0 0 28px ${rgba(PALETTE.energyGlow, 0.25)}; }
.troid-settings .settings-title { font-size:1.35rem; font-weight:300; letter-spacing:0.14em; text-align:center; margin:0 0 14px; text-shadow:0 0 14px ${core}88; }
.troid-settings .settings-section { margin:0 0 14px; }
.troid-settings .settings-label { font-size:0.8rem; letter-spacing:0.08em; opacity:0.75; margin:0 0 6px; }
.troid-settings .settings-row { display:flex; gap:8px; }
.troid-settings .settings-button { flex:1; min-height:44px; box-sizing:border-box; font:inherit; font-size:1rem; color:${white}; background:${rgba(PALETTE.uiPanel, 0.9)}; border:1px solid ${rgba(PALETTE.energyCore, 0.3)}; border-radius:8px; cursor:pointer; padding:0 12px; }
.troid-settings .settings-button[aria-pressed="true"] { border-color:${glow}; box-shadow:0 0 10px ${rgba(PALETTE.energyGlow, 0.5)}; color:${glow}; }
.troid-settings .settings-button:focus-visible, .troid-settings .settings-range:focus-visible { outline:2px solid ${glow}; outline-offset:2px; }
.troid-settings .settings-slider { display:grid; grid-template-columns:7rem 1fr; align-items:center; gap:10px; min-height:44px; }
.troid-settings .settings-range { width:100%; accent-color:${core}; }
.troid-settings .settings-resume { width:100%; margin-top:4px; }
`;
}

/**
 * The pause / settings menu (DOM, docs/GAME-SPEC-2D.md §17 "menú de pausa mínimo"): the language (each in its own name), and — only
 * where a touch layer exists — the size and opacity of the touch controls. It owns no text (every word is a translator key), keeps
 * no state of its own (the host holds the settings; the menu reads them every time it opens) and decides nothing: it reports a
 * choice, the game applies it and saves it. It is a separate chunk: a player's first load does not carry it until the menu is asked for.
 */
export class SettingsMenu {
  readonly root: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly title: HTMLElement;
  private readonly labels = new Map<string, HTMLElement>();
  private readonly languageButtons = new Map<string, HTMLButtonElement>();
  private readonly touchSection: HTMLElement;
  private readonly size: HTMLInputElement;
  private readonly opacity: HTMLInputElement;
  private readonly resume: HTMLButtonElement;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
    private readonly host: SettingsMenuHost,
  ) {
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

    this.touchSection = el('div', 'settings-section', 'settings-touch');
    this.touchSection.appendChild(this.label(doc, 'settings.touch'));
    this.size = this.slider(doc, el, 'settings.touchSize', 'settings-touch-size', TOUCH_LIMITS.scale, (value) => host.setTouch({ scale: value }));
    this.opacity = this.slider(doc, el, 'settings.touchOpacity', 'settings-touch-opacity', TOUCH_LIMITS.opacity, (value) => host.setTouch({ opacity: value }));

    this.resume = el('button', 'settings-button settings-resume', 'settings-resume');
    this.resume.type = 'button';
    listen(this.store, this.resume, 'click', () => host.close());

    panel.append(this.title, language, this.touchSection, this.resume);
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

  /** Shows the menu with the settings as they are NOW, and puts the focus on Resume. */
  open(): void {
    this.refresh();
    this.root.dataset['open'] = '1';
    this.resume.focus({ preventScroll: true });
  }

  close(): void {
    this.root.dataset['open'] = '0';
    (this.root.ownerDocument.activeElement as HTMLElement | null)?.blur?.();
  }

  dispose(): void {
    this.store.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- internals

  /** Re-reads the values from the host: which language is chosen, where the sliders are, whether the touch section applies. */
  private refresh(): void {
    const cur = this.host.current();
    for (const [code, b] of this.languageButtons) b.setAttribute('aria-pressed', code === cur.language ? 'true' : 'false');
    this.touchSection.style.display = this.host.touchAvailable() ? '' : 'none';
    this.size.value = String(cur.touch.scale);
    this.opacity.value = String(cur.touch.opacity);
  }

  private label(doc: Document, key: string): HTMLElement {
    const l = doc.createElement('div');
    l.className = 'settings-label';
    this.labels.set(key, l);
    return l;
  }

  private slider(
    doc: Document,
    el: <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, testid?: string) => HTMLElementTagNameMap[K],
    key: string,
    testid: string,
    limits: { min: number; max: number },
    onInput: (value: number) => void,
  ): HTMLInputElement {
    const row = el('label', 'settings-slider');
    const name = doc.createElement('span');
    this.labels.set(key, name);
    const input = el('input', 'settings-range', testid);
    input.type = 'range';
    input.min = String(limits.min);
    input.max = String(limits.max);
    input.step = '0.05';
    listen(this.store, input, 'input', () => onInput(Number(input.value)));
    row.append(name, input);
    this.touchSection.appendChild(row);
    return input;
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
