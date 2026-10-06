// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import type { TouchSettings } from '@/save/SettingsData';
import { languageName, SettingsMenu, type SettingsMenuHost } from '@/ui/settings/SettingsMenu';

/**
 * The pause / settings menu (docs/GAME-SPEC-2D.md §17): the language, each in its own name, and — only where a touch layer
 * exists — the size and opacity of the touch controls. It owns no text and no state: the host holds the settings, the menu reports.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;

describe('languageName', () => {
  it('a language is named in ITSELF, capitalised, by the platform (not a translation, not a literal)', () => {
    expect(languageName('es')).toBe('Español');
    expect(languageName('en')).toBe('English');
  });

  it('a code the engine does not know is still readable', () => {
    expect(languageName('qq').length).toBeGreaterThan(0);
  });
});

describe('settings menu', () => {
  let host: HTMLDivElement;
  let menu: SettingsMenu;
  let state: { language: string; touch: TouchSettings };
  let calls: string[];
  let touchAvailable: boolean;
  const tr = createTranslator(CATALOGS, 'es');

  const hostApi = (): SettingsMenuHost => ({
    languages: ['es', 'en'],
    touchAvailable: () => touchAvailable,
    current: () => ({ language: state.language, touch: { ...state.touch } }),
    setLanguage: (language) => {
      calls.push(`lang:${language}`);
      state.language = language;
      tr.setLocale(language);
    },
    setTouch: (patch) => {
      calls.push(`touch:${JSON.stringify(patch)}`);
      state.touch = { ...state.touch, ...patch };
    },
    close: () => calls.push('close'),
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    state = { language: 'es', touch: { scale: 1, opacity: 1 } };
    calls = [];
    touchAvailable = true;
    tr.setLocale('es');
    menu = new SettingsMenu(host, tr, hostApi());
  });
  afterEach(() => {
    menu.dispose();
    tr.setLocale('es');
  });

  it('is closed until it is opened, and a dialog for the screen reader', () => {
    expect(menu.isOpen).toBe(false);
    expect(getComputedStyle(menu.root).display).toBe('none');
    expect(menu.root.getAttribute('role')).toBe('dialog');
    expect(menu.root.getAttribute('aria-modal')).toBe('true');
    expect(menu.root.hasAttribute('data-ui-block')).toBe(true);
    menu.open();
    expect(menu.isOpen).toBe(true);
    expect(getComputedStyle(menu.root).display).toBe('flex');
    menu.close();
    expect(menu.isOpen).toBe(false);
  });

  it('is modal: it catches every pointer over the whole screen (the interface layer lets everything through except what asks for it)', () => {
    menu.open();
    expect(getComputedStyle(menu.root).pointerEvents).toBe('auto');
    expect(getComputedStyle(menu.root).position).toBe('absolute');
  });

  it('every word is a translator key: Spanish and English, and it changes with the language', () => {
    menu.open();
    expect(q(host, 'settings-title').textContent).toBe('Pausa');
    expect(q(host, 'settings-resume').textContent).toBe('Continuar');
    expect(q(host, 'settings-touch').textContent).toContain('Controles táctiles');
    expect(q(host, 'settings-touch').textContent).toContain('Tamaño');
    expect(q(host, 'settings-touch').textContent).toContain('Opacidad');
    tr.setLocale('en');
    expect(q(host, 'settings-title').textContent).toBe('Paused');
    expect(q(host, 'settings-resume').textContent).toBe('Resume');
    expect(q(host, 'settings-touch').textContent).toContain('Touch controls');
    expect(q(host, 'settings-touch').textContent).toContain('Size');
    expect(q(host, 'settings-touch').textContent).toContain('Opacity');
    expect(menu.root.getAttribute('aria-label')).toBe('Paused');
  });

  it('offers each language in its own name and marks the one in force', () => {
    menu.open();
    expect(q(host, 'settings-lang-es').textContent).toBe('Español');
    expect(q(host, 'settings-lang-en').textContent).toBe('English');
    expect(q(host, 'settings-lang-es').getAttribute('aria-pressed')).toBe('true');
    expect(q(host, 'settings-lang-en').getAttribute('aria-pressed')).toBe('false');
    expect(q(host, 'settings-lang-en').lang).toBe('en');
  });

  it('choosing a language reports it, and the menu follows (the pressed one, its own texts)', () => {
    menu.open();
    q(host, 'settings-lang-en').click();
    expect(calls).toEqual(['lang:en']);
    expect(q(host, 'settings-lang-en').getAttribute('aria-pressed')).toBe('true');
    expect(q(host, 'settings-lang-es').getAttribute('aria-pressed')).toBe('false');
    expect(q(host, 'settings-title').textContent).toBe('Paused');
    q(host, 'settings-lang-es').click();
    expect(q(host, 'settings-title').textContent).toBe('Pausa');
  });

  it('the sliders show what is saved and report what the player does, live, within the limits of the settings', () => {
    state.touch = { scale: 1.25, opacity: 0.6 };
    menu.open();
    const size = q(host, 'settings-touch-size') as HTMLInputElement;
    const opacity = q(host, 'settings-touch-opacity') as HTMLInputElement;
    expect([size.value, opacity.value]).toEqual(['1.25', '0.6']);
    expect([size.min, size.max, opacity.min, opacity.max]).toEqual(['0.8', '1.4', '0.3', '1']);
    size.value = '1.1';
    size.dispatchEvent(new Event('input', { bubbles: true }));
    opacity.value = '0.45';
    opacity.dispatchEvent(new Event('input', { bubbles: true }));
    expect(calls).toEqual(['touch:{"scale":1.1}', 'touch:{"opacity":0.45}']);
  });

  it('reads the settings fresh every time it opens (nothing is cached in the menu)', () => {
    menu.open();
    menu.close();
    state = { language: 'en', touch: { scale: 0.9, opacity: 0.5 } };
    tr.setLocale('en');
    menu.open();
    expect(q(host, 'settings-lang-en').getAttribute('aria-pressed')).toBe('true');
    expect((q(host, 'settings-touch-size') as HTMLInputElement).value).toBe('0.9');
  });

  it('the touch section only exists where there is a touch layer (a desktop with a keyboard never sees it)', () => {
    touchAvailable = false;
    menu.open();
    expect(q(host, 'settings-touch').style.display).toBe('none');
    menu.close();
    touchAvailable = true;
    menu.open();
    expect(q(host, 'settings-touch').style.display).toBe('');
  });

  it('Resume asks the game to close it', () => {
    menu.open();
    q(host, 'settings-resume').click();
    expect(calls).toEqual(['close']);
  });

  it('opening puts the focus on Resume (a keyboard player can leave at once)', () => {
    menu.open();
    expect(document.activeElement).toBe(q(host, 'settings-resume'));
  });

  it('dispose removes it and its listeners', () => {
    menu.open();
    const en = q(host, 'settings-lang-en');
    menu.dispose();
    en.click();
    expect(calls).toEqual([]);
    expect(host.querySelector('.troid-settings')).toBeNull();
  });
});
