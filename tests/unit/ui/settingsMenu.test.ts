// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import type { KeyMap } from '@/input/remap';
import { QUALITY_SETTINGS, type QualitySetting } from '@/presentation/viewport';
import type { TouchSettings } from '@/save/SettingsData';
import { languageName, SettingsMenu, type SettingsMenuHost } from '@/ui/settings/SettingsMenu';

/**
 * The pause / settings menu (docs/GAME-SPEC-2D.md §17; docs/PROMPT6-LOG.md S30): the language, each in its own name; the volume (prepared); the quality
 * profile; the keys of the main actions, where a keyboard exists; and the size, opacity, side and position of the touch controls, where a touch layer
 * exists. It owns no text and no state: the host holds the settings, the menu reports.
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

const TOUCH: TouchSettings = { scale: 1, opacity: 1, side: 'right', offsetX: 0, offsetY: 0 };

describe('settings menu', () => {
  let host: HTMLDivElement;
  let menu: SettingsMenu;
  let state: { language: string; volume: number; quality: QualitySetting; keys: KeyMap; touch: TouchSettings };
  let calls: string[];
  let touchAvailable: boolean;
  let keyboardAvailable: boolean;
  const tr = createTranslator(CATALOGS, 'es');

  const hostApi = (): SettingsMenuHost => ({
    languages: ['es', 'en'],
    touchAvailable: () => touchAvailable,
    keyboardAvailable: () => keyboardAvailable,
    current: () => ({ language: state.language, volume: state.volume, quality: state.quality, keys: { ...state.keys }, touch: { ...state.touch } }),
    setLanguage: (language) => {
      calls.push(`lang:${language}`);
      state.language = language;
      tr.setLocale(language);
    },
    setVolume: (level) => {
      calls.push(`volume:${level}`);
      state.volume = level;
    },
    setQuality: (quality) => {
      calls.push(`quality:${quality}`);
      state.quality = quality;
    },
    setKeys: (keys) => {
      calls.push(`keys:${JSON.stringify(keys)}`);
      state.keys = keys;
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
    state = { language: 'es', volume: 0.8, quality: 'auto', keys: {}, touch: { ...TOUCH } };
    calls = [];
    touchAvailable = true;
    keyboardAvailable = true;
    tr.setLocale('es');
    menu = new SettingsMenu(host, tr, hostApi());
  });
  afterEach(() => {
    menu.dispose();
    tr.setLocale('es');
  });

  const input = (id: string, value: string): void => {
    const el = q(host, id) as HTMLInputElement;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  /** A key typed in the menu: returns the event, so what it did can be looked at (was it kept from the page?). */
  const type = (code: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true, ...init });
    (document.activeElement && menu.root.contains(document.activeElement) ? document.activeElement : menu.root).dispatchEvent(e);
    return e;
  };

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

  it('there is no text in the menu that is not in both catalogs: nothing shows a bare key in either language', () => {
    for (const lang of ['es', 'en']) {
      tr.setLocale(lang);
      menu.open();
      const text = menu.root.textContent ?? '';
      expect(text, lang).not.toMatch(/\b(settings|action)\.[a-zA-Z]+/);
    }
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

  it('the touch sliders show what is saved and report what the player does, live, within the limits of the settings', () => {
    state.touch = { ...TOUCH, scale: 1.25, opacity: 0.6 };
    menu.open();
    const size = q(host, 'settings-touch-size') as HTMLInputElement;
    const opacity = q(host, 'settings-touch-opacity') as HTMLInputElement;
    expect([size.value, opacity.value]).toEqual(['1.25', '0.6']);
    expect([size.min, size.max, opacity.min, opacity.max]).toEqual(['0.8', '1.4', '0.3', '1']);
    input('settings-touch-size', '1.1');
    input('settings-touch-opacity', '0.45');
    expect(calls).toEqual(['touch:{"scale":1.1}', 'touch:{"opacity":0.45}']);
  });

  it('reads the settings fresh every time it opens (nothing is cached in the menu)', () => {
    menu.open();
    menu.close();
    state = { language: 'en', volume: 0.3, quality: 'high', keys: { attack: 'KeyF' }, touch: { ...TOUCH, scale: 0.9, opacity: 0.5, side: 'left' } };
    tr.setLocale('en');
    menu.open();
    expect(q(host, 'settings-lang-en').getAttribute('aria-pressed')).toBe('true');
    expect((q(host, 'settings-touch-size') as HTMLInputElement).value).toBe('0.9');
    expect((q(host, 'settings-volume') as HTMLInputElement).value).toBe('0.3');
    expect(q(host, 'settings-quality-high').getAttribute('aria-pressed')).toBe('true');
    expect(q(host, 'settings-key-attack').textContent).toBe('F');
    expect(q(host, 'settings-touch-side-left').getAttribute('aria-pressed')).toBe('true');
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

  describe('the volume (prepared: the game has no sound yet)', () => {
    it('is a slider from 0 to 1 that shows the saved level and its percentage, and says so for the screen reader', () => {
      menu.open();
      const v = q(host, 'settings-volume') as HTMLInputElement;
      expect([v.min, v.max, v.value]).toEqual(['0', '1', '0.8']);
      expect(q(host, 'settings-volume-section').textContent).toContain('Volumen');
      expect(q(host, 'settings-volume-section').textContent).toContain('80%');
      expect(v.getAttribute('aria-valuetext')).toBe('80%');
    });

    it('reports the level the player moves it to, live, and its percentage follows', () => {
      menu.open();
      input('settings-volume', '0.35');
      input('settings-volume', '0');
      expect(calls).toEqual(['volume:0.35', 'volume:0']);
      expect(q(host, 'settings-volume-section').textContent).toContain('0%');
    });

    it('is honest about it: a note says the sound comes later, in both languages', () => {
      menu.open();
      expect(q(host, 'settings-volume-note').textContent).toContain('sonido llegará');
      tr.setLocale('en');
      expect(q(host, 'settings-volume-note').textContent).toContain('Sound arrives');
      expect(q(host, 'settings-volume-section').textContent).toContain('Volume');
    });
  });

  describe('the quality', () => {
    it('three choices, Auto, Low and High, in the order of the settings, with the one in force pressed', () => {
      menu.open();
      const buttons = [...q(host, 'settings-quality').querySelectorAll('button')];
      expect(buttons.map((b) => b.dataset['quality'])).toEqual([...QUALITY_SETTINGS]);
      expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
      expect(buttons.map((b) => b.textContent)).toEqual(['Automática', 'Baja', 'Alta']);
      tr.setLocale('en');
      expect(buttons.map((b) => b.textContent)).toEqual(['Auto', 'Low', 'High']);
    });

    it('choosing one reports it and the menu shows it pressed at once', () => {
      menu.open();
      q(host, 'settings-quality-low').click();
      expect(calls).toEqual(['quality:low']);
      expect(q(host, 'settings-quality-low').getAttribute('aria-pressed')).toBe('true');
      expect(q(host, 'settings-quality-auto').getAttribute('aria-pressed')).toBe('false');
      q(host, 'settings-quality-high').click();
      q(host, 'settings-quality-auto').click();
      expect(calls).toEqual(['quality:low', 'quality:high', 'quality:auto']);
    });

    it('does not pretend to measure anything: the note says Auto is the balanced profile and the device is not measured yet', () => {
      menu.open();
      expect(q(host, 'settings-quality-note').textContent).toContain('Todavía no mide');
      tr.setLocale('en');
      expect(q(host, 'settings-quality-note').textContent).toContain('does not measure');
    });
  });

  describe('the keys of the main actions', () => {
    it('are shown only where there is a keyboard', () => {
      keyboardAvailable = false;
      menu.open();
      expect(q(host, 'settings-controls').style.display).toBe('none');
      menu.close();
      keyboardAvailable = true;
      menu.open();
      expect(q(host, 'settings-controls').style.display).toBe('');
    });

    it('a row for each action — jump, attack, dash, ability, bottle, interact, crouch — with its name and its key', () => {
      menu.open();
      const rows = [...q(host, 'settings-controls').querySelectorAll('button[data-action]')] as HTMLButtonElement[];
      expect(rows.map((b) => b.dataset['action'])).toEqual(['jump', 'attack', 'dash', 'ability', 'bottle', 'interact', 'down']);
      expect(rows.map((b) => b.textContent)).toEqual(['Space', 'J', 'Shift', 'K', 'L', 'E', 'S']);
      const text = q(host, 'settings-controls').textContent ?? '';
      for (const name of ['Saltar', 'Atacar', 'Esquiva', 'Habilidad', 'Botella', 'Interactuar', 'Agacharse']) expect(text, name).toContain(name);
      tr.setLocale('en');
      const english = q(host, 'settings-controls').textContent ?? '';
      for (const name of ['Jump', 'Attack', 'Dash', 'Ability', 'Bottle', 'Interact', 'Crouch']) expect(english, name).toContain(name);
    });

    it('shows the keys the player chose (the effective ones: an override over the default)', () => {
      state.keys = { attack: 'KeyF', dash: 'ArrowDown' };
      menu.open();
      expect(q(host, 'settings-key-attack').textContent).toBe('F');
      expect(q(host, 'settings-key-dash').textContent).toBe('↓');
      expect(q(host, 'settings-key-jump').textContent).toBe('Space');
    });

    it('pressing an action waits for its key: the button says so, and the menu says which one it waits for', () => {
      menu.open();
      expect(menu.awaiting).toBeNull();
      q(host, 'settings-key-attack').click();
      expect(menu.awaiting).toBe('attack');
      expect(q(host, 'settings-key-attack').dataset['listening']).toBe('1');
      expect(q(host, 'settings-key-attack').textContent).toBe('Pulsa una tecla…');
      expect(q(host, 'settings-key-dash').dataset['listening']).toBe('0');
      // pressing the same one again gives it up; another one takes over
      q(host, 'settings-key-attack').click();
      expect(menu.awaiting).toBeNull();
      q(host, 'settings-key-attack').click();
      q(host, 'settings-key-dash').click();
      expect(menu.awaiting).toBe('dash');
      expect(q(host, 'settings-key-attack').textContent).toBe('J');
    });

    it('the next key is the action\'s: reported as the whole map, and it never reaches the page (the game would take it for an action)', () => {
      menu.open();
      q(host, 'settings-key-attack').click();
      const e = type('KeyF');
      expect(e.defaultPrevented).toBe(true);
      expect(calls).toEqual(['keys:{"attack":"KeyF"}']);
      expect(menu.awaiting).toBeNull();
      expect(q(host, 'settings-key-attack').textContent).toBe('F');
      // and not waiting any more: the next key is the page's again
      expect(type('KeyG').defaultPrevented).toBe(false);
      expect(calls).toHaveLength(1);
    });

    it('does not let the key out of the menu while it waits: not even Escape (that is the pause of the game)', () => {
      menu.open();
      q(host, 'settings-key-dash').click();
      let seen = 0;
      const spy = (): void => void seen++;
      document.addEventListener('keydown', spy);
      window.addEventListener('keydown', spy);
      type('KeyG');
      q(host, 'settings-key-dash').click();
      type('Escape');
      expect(seen, 'neither the assigned key nor Escape went on to the page').toBe(0);
      document.removeEventListener('keydown', spy);
      window.removeEventListener('keydown', spy);
    });

    it('Escape cancels: nothing is reported, the menu stays open, and the key is as it was', () => {
      menu.open();
      q(host, 'settings-key-ability').click();
      const e = type('Escape');
      expect(e.defaultPrevented).toBe(true);
      expect(menu.awaiting).toBeNull();
      expect(menu.isOpen).toBe(true);
      expect(calls).toEqual([]);
      expect(q(host, 'settings-key-ability').textContent).toBe('K');
    });

    it('a key another action has makes the two SWAP, and the menu says so (in the language of the moment)', () => {
      menu.open();
      q(host, 'settings-key-attack').click();
      type('KeyK'); // the ability's
      expect(calls).toEqual(['keys:{"attack":"KeyK","ability":"KeyJ"}']);
      expect(q(host, 'settings-key-attack').textContent).toBe('K');
      expect(q(host, 'settings-key-ability').textContent).toBe('J');
      const msg = q(host, 'settings-keys-message');
      expect(msg.textContent).toBe('Habilidad usaba K: intercambian las teclas.');
      expect(msg.style.display).toBe('');
      tr.setLocale('en');
      expect(msg.textContent).toBe('K was used by Ability: they swap keys.');
    });

    it('a reserved key (movement, pause, the browser\'s) is refused: it keeps waiting, says why, and nothing is reported', () => {
      menu.open();
      q(host, 'settings-key-jump').click();
      for (const code of ['KeyD', 'ArrowLeft', 'KeyP', 'Tab', 'F5']) {
        const e = type(code);
        expect(e.defaultPrevented, code).toBe(true);
        expect(menu.awaiting, code).toBe('jump');
        expect(q(host, 'settings-keys-message').textContent, code).toBe('Esa tecla está reservada. Prueba con otra.');
        expect(q(host, 'settings-keys-message').dataset['tone'], code).toBe('warn');
      }
      expect(calls).toEqual([]);
      type('KeyH'); // a free key ends it
      expect(calls).toEqual(['keys:{"jump":"KeyH"}']);
      expect(q(host, 'settings-keys-message').style.display).toBe('none');
    });

    it('a key held down (auto-repeat) is not a second press', () => {
      menu.open();
      q(host, 'settings-key-bottle').click();
      type('KeyH');
      q(host, 'settings-key-bottle').click();
      type('KeyY', { repeat: true });
      expect(menu.awaiting, 'a repeated event does nothing: it is still waiting').toBe('bottle');
      expect(calls).toEqual(['keys:{"bottle":"KeyH"}']);
    });

    it('Space and Enter can be chosen too, and the click that follows them on the focused button does not ask for another key', () => {
      menu.open();
      const b = q(host, 'settings-key-attack');
      b.click();
      b.focus();
      type('Enter');
      expect(calls).toEqual(['keys:{"attack":"Enter"}']);
      b.click(); // the tail of the Enter that was just typed
      expect(menu.awaiting).toBeNull();
    });

    it('Restore default keys sends an empty map and shows the defaults again', () => {
      state.keys = { attack: 'KeyF', dash: 'KeyG' };
      menu.open();
      q(host, 'settings-keys-reset').click();
      expect(calls).toEqual(['keys:{}']);
      expect(q(host, 'settings-key-attack').textContent).toBe('J');
      expect(q(host, 'settings-key-dash').textContent).toBe('Shift');
    });

    it('leaving the menu while it waits for a key cancels the wait: the next time it opens nothing is pending', () => {
      menu.open();
      q(host, 'settings-key-interact').click();
      menu.close();
      expect(menu.awaiting).toBeNull();
      menu.open();
      expect(menu.awaiting).toBeNull();
      expect(q(host, 'settings-key-interact').dataset['listening']).toBe('0');
    });

    it('every key button has a name that says the action and its key', () => {
      state.keys = { attack: 'KeyF' };
      menu.open();
      expect(q(host, 'settings-key-attack').getAttribute('aria-label')).toBe('Atacar: F');
      tr.setLocale('en');
      expect(q(host, 'settings-key-attack').getAttribute('aria-label')).toBe('Attack: F');
    });
  });

  describe('the touch controls: size, opacity, side and position', () => {
    it('the side is a choice of two, the one in force pressed; choosing reports it', () => {
      menu.open();
      const right = q(host, 'settings-touch-side-right');
      const left = q(host, 'settings-touch-side-left');
      expect([right.textContent, left.textContent]).toEqual(['Derecha', 'Izquierda']);
      expect([right.getAttribute('aria-pressed'), left.getAttribute('aria-pressed')]).toEqual(['true', 'false']);
      left.click();
      expect(calls).toEqual(['touch:{"side":"left"}']);
      expect([right.getAttribute('aria-pressed'), left.getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    });

    it('the position has two sliders, 0 to 1, that show what is saved and report what the player does', () => {
      state.touch = { ...TOUCH, offsetX: 0.5, offsetY: 0.25 };
      menu.open();
      const x = q(host, 'settings-touch-offset-x') as HTMLInputElement;
      const y = q(host, 'settings-touch-offset-y') as HTMLInputElement;
      expect([x.min, x.max, x.value, y.min, y.max, y.value]).toEqual(['0', '1', '0.5', '0', '1', '0.25']);
      input('settings-touch-offset-x', '0.75');
      input('settings-touch-offset-y', '1');
      expect(calls).toEqual(['touch:{"offsetX":0.75}', 'touch:{"offsetY":1}']);
    });

    it('Restore default layout puts size, opacity, side and position back to the design, in one change', () => {
      state.touch = { scale: 1.3, opacity: 0.5, side: 'left', offsetX: 1, offsetY: 0.4 };
      menu.open();
      q(host, 'settings-touch-reset').click();
      expect(calls).toEqual(['touch:{"scale":1,"opacity":1,"side":"right","offsetX":0,"offsetY":0}']);
      expect(state.touch).toEqual(TOUCH);
      expect((q(host, 'settings-touch-size') as HTMLInputElement).value).toBe('1');
      expect(q(host, 'settings-touch-side-right').getAttribute('aria-pressed')).toBe('true');
    });

    it('its words are in both languages', () => {
      menu.open();
      const es = q(host, 'settings-touch').textContent ?? '';
      for (const w of ['Lado de los botones', 'Botones hacia dentro', 'Botones hacia arriba', 'Restaurar disposición']) expect(es, w).toContain(w);
      tr.setLocale('en');
      const en = q(host, 'settings-touch').textContent ?? '';
      for (const w of ['Side of the buttons', 'Buttons inwards', 'Buttons up', 'Restore default layout']) expect(en, w).toContain(w);
    });
  });
});
