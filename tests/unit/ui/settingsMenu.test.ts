// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { applyKeyMap } from '@/input/remap';
import { controlsReference } from '@/input/controlsReference';
import type { KeyMap } from '@/input/remap';
import { DEFAULT_AUDIO_LEVELS, type AudioLevels } from '@/presentation/audioMix';
import { QUALITY_SETTINGS, type QualitySetting } from '@/presentation/viewport';
import { defaultSettings, HUD_SCALE_LIMITS, type AccessibilitySettings, type TouchSettings } from '@/save/SettingsData';
import { languageName, SettingsMenu, type SettingsMenuHost, type SettingsScreen } from '@/ui/settings/SettingsMenu';
import { TOUCH_ART } from '@/ui/touch/art';
import { computeTouchLayout } from '@/ui/touch/layout';
import { stubScrollLayout } from '../../helpers/layout';

/**
 * The pause / settings menu (docs/GAME-SPEC-2D.md §17; docs/PROMPT6-LOG.md S30): the language, each in its own name; the volume (prepared); the quality
 * profile; the keys of the main actions, where a keyboard exists; and the size and opacity of the touch controls, a small picture of where their buttons are and the way into the
 * editor, where a touch layer exists. It owns no text and no state: the host holds the settings, the menu reports.
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

const TOUCH: TouchSettings = { scale: 1, opacity: 1, buttons: {} };

describe('settings menu', () => {
  let host: HTMLDivElement;
  let menu: SettingsMenu;
  let state: { language: string; volume: AudioLevels; quality: QualitySetting; keys: KeyMap; touch: TouchSettings; accessibility: AccessibilitySettings };
  let calls: string[];
  let touchAvailable: boolean;
  let keyboardAvailable: boolean;
  const tr = createTranslator(CATALOGS, 'es');

  const hostApi = (): SettingsMenuHost => ({
    languages: ['es', 'en'],
    touchAvailable: () => touchAvailable,
    keyboardAvailable: () => keyboardAvailable,
    current: () => ({ language: state.language, volume: state.volume, quality: state.quality, keys: { ...state.keys }, touch: { ...state.touch }, accessibility: { ...state.accessibility } }),
    reference: () => controlsReference(applyKeyMap(DEFAULT_BINDINGS, state.keys)),
    setLanguage: (language) => {
      calls.push(`lang:${language}`);
      state.language = language;
      tr.setLocale(language);
    },
    setVolume: (category, level) => {
      calls.push(`volume:${category}:${level}`);
      state.volume = { ...state.volume, [category]: level };
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
    // the layout of the design on the reference screen, or the one the test sets: what the small picture draws
    touchPreview: () => (touchAvailable ? { width: 844, height: 390, layout: computeTouchLayout(844, 390, undefined, { scale: state.touch.scale, buttons: state.touch.buttons }) } : null),
    editTouch: () => void calls.push('edit-touch'),
    setAccessibility: (patch) => {
      calls.push(`access:${JSON.stringify(patch)}`);
      state.accessibility = { ...state.accessibility, ...patch };
    },
    close: () => calls.push('close'),
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    state = { language: 'es', volume: { ...DEFAULT_AUDIO_LEVELS }, quality: 'auto', keys: {}, touch: { ...TOUCH }, accessibility: { ...defaultSettings().accessibility } };
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
    state = { language: 'en', volume: { ...DEFAULT_AUDIO_LEVELS, master: 0.3, music: 0.2 }, quality: 'high', keys: { attack: 'KeyF' }, touch: { ...TOUCH, scale: 0.9, opacity: 0.5, buttons: { attack: { x: 0.2, y: 0.7, scale: 1 } } }, accessibility: { ...defaultSettings().accessibility } };
    tr.setLocale('en');
    menu.open();
    expect(q(host, 'settings-lang-en').getAttribute('aria-pressed')).toBe('true');
    expect((q(host, 'settings-touch-size') as HTMLInputElement).value).toBe('0.9');
    expect((q(host, 'settings-volume') as HTMLInputElement).value).toBe('0.3');
    expect((q(host, 'settings-volume-music') as HTMLInputElement).value).toBe('0.2');
    expect(q(host, 'settings-quality-high').getAttribute('aria-pressed')).toBe('true');
    expect(q(host, 'settings-key-attack').textContent).toBe('F');
    expect(Number.parseFloat(q(host, 'settings-touch-preview-attack').style.left), 'the small picture follows the layout').toBeCloseTo(computeTouchLayout(844, 390, undefined, { scale: 0.9, buttons: state.touch.buttons }).attack.cx * Math.min(260 / 844, 150 / 390), 3);
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

  it('its middle scrolls and says so: the scroll area tells the stylesheet whether there is more below, looked at when the menu opens (it has a size only then)', () => {
    const body = menu.root.querySelector('.settings-body') as HTMLElement;
    expect(body.dataset['more']).toBe('0');
    const layout = stubScrollLayout(body, { scroll: 529, client: 278 });
    menu.open();
    expect(body.dataset['more']).toBe('1');
    menu.close();
    layout.client = 800; // a bigger window: it all fits
    menu.open();
    expect(body.dataset['more']).toBe('0');
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

  describe('the volumes: the general one and one for the music, the effects and the ambience', () => {
    const slider = (id: string): HTMLInputElement => q(host, id) as HTMLInputElement;

    it('are four sliders from 0 to 1 that show the saved levels and their percentage, and say so for the screen reader', () => {
      menu.open();
      for (const [id, level, text] of [['settings-volume', '0.8', '80%'], ['settings-volume-music', '0.7', '70%'], ['settings-volume-sfx', '0.9', '90%'], ['settings-volume-ambience', '0.8', '80%']] as const) {
        const v = slider(id);
        expect([v.min, v.max, v.value], id).toEqual(['0', '1', level]);
        expect(v.getAttribute('aria-valuetext'), id).toBe(text);
      }
      const section = q(host, 'settings-volume-section').textContent ?? '';
      for (const name of ['Sonido', 'Volumen general', 'Música', 'Efectos', 'Ambiente']) expect(section, name).toContain(name);
    });

    it('report the category and the level the player moves it to, live, each to its own category', () => {
      menu.open();
      input('settings-volume', '0.35');
      input('settings-volume-music', '0.1');
      input('settings-volume-sfx', '1');
      input('settings-volume-ambience', '0.55');
      expect(calls).toEqual(['volume:master:0.35', 'volume:music:0.1', 'volume:sfx:1', 'volume:ambience:0.55']);
      expect(slider('settings-volume').getAttribute('aria-valuetext')).toBe('35%');
      expect(q(host, 'settings-volume-section').textContent).toContain('55%');
    });

    it('say MUTED, not 0 %, at zero — silence is a state — and say nothing is heard when the general one is at zero', () => {
      menu.open();
      const status = q(host, 'settings-volume-status');
      expect(status.style.display, 'the general volume is up: nothing to warn about').toBe('none');
      input('settings-volume-music', '0');
      expect(slider('settings-volume-music').getAttribute('aria-valuetext')).toBe('Silenciado');
      expect(slider('settings-volume-music').dataset['muted']).toBe('1');
      expect(q(host, 'settings-volume-section').textContent).toContain('Silenciado');
      expect(status.style.display).toBe('none');
      input('settings-volume', '0');
      expect(status.style.display).toBe('');
      expect(status.textContent).toContain('no se oye nada');
      input('settings-volume', '0.5');
      expect(status.style.display).toBe('none');
      expect(slider('settings-volume').dataset['muted']).toBe('0');
    });

    it('can be moved from the keyboard: Home is silence, End is full', () => {
      menu.open();
      const v = slider('settings-volume-sfx');
      v.focus();
      v.value = '0';
      v.dispatchEvent(new Event('input', { bubbles: true }));
      v.value = '1';
      v.dispatchEvent(new Event('input', { bubbles: true }));
      expect(calls).toEqual(['volume:sfx:0', 'volume:sfx:1']);
    });

    it('say what a volume at zero means, in both languages', () => {
      menu.open();
      expect(q(host, 'settings-volume-note').textContent).toContain('silencia');
      tr.setLocale('en');
      expect(q(host, 'settings-volume-note').textContent).toContain('mutes');
      const section = q(host, 'settings-volume-section').textContent ?? '';
      for (const name of ['Sound', 'Master volume', 'Music', 'Effects', 'Ambience']) expect(section, name).toContain(name);
      input('settings-volume-music', '0');
      expect(slider('settings-volume-music').getAttribute('aria-valuetext')).toBe('Muted');
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

  describe('the touch controls: a small picture of the buttons, size, opacity, and the editor (docs/PROMPT15-LOG.md)', () => {
    it('shows the three buttons where the layout has them: the artist\'s PNGs scaled down, in the same arrangement as the screen', () => {
      menu.open();
      const preview = q(host, 'settings-touch-preview');
      expect(preview.hidden).toBe(false);
      expect(preview.getAttribute('role')).toBe('img');
      expect(preview.getAttribute('aria-label')).toBe('Dónde están los tres botones en tu pantalla');
      const l = computeTouchLayout(844, 390);
      const k = Math.min(260 / 844, 150 / 390);
      expect(Number.parseFloat(preview.style.width)).toBeCloseTo(844 * k, 3);
      expect(Number.parseFloat(preview.style.height)).toBeCloseTo(390 * k, 3);
      for (const id of ['attack', 'dash', 'ability'] as const) {
        const box = q(host, `settings-touch-preview-${id}`);
        expect(Number.parseFloat(box.style.left), id).toBeCloseTo(l[id].cx * k, 3);
        expect(Number.parseFloat(box.style.top), id).toBeCloseTo(l[id].cy * k, 3);
        const img = box.querySelector('img');
        expect(img, id).not.toBeNull();
        expect(img!.getAttribute('src'), id).toBe(TOUCH_ART[id]);
        // the plate is the layout's, scaled down in the same proportion
        expect(Number.parseFloat((box.firstElementChild as HTMLElement).style.height), id).toBeCloseTo(l[id].visual * k, 3);
      }
      tr.setLocale('en');
      expect(preview.getAttribute('aria-label')).toBe('Where the three buttons are on your screen');
    });

    it('follows what the player does: a size or a place changed in the game changes the picture the next time it is read', () => {
      menu.open();
      const before = Number.parseFloat(q(host, 'settings-touch-preview-attack').style.left);
      state.touch = { ...state.touch, buttons: { attack: { x: 0.2, y: 0.7, scale: 1 } } };
      menu.sync();
      expect(Number.parseFloat(q(host, 'settings-touch-preview-attack').style.left)).toBeLessThan(before / 2);
      input('settings-touch-size', '1.3');
      expect(calls).toEqual(['touch:{"scale":1.3}']);
      // …and the picture grows with the slider, as it moves (not only the next time the menu opens)
      const k = Math.min(260 / 844, 150 / 390);
      expect(Number.parseFloat((q(host, 'settings-touch-preview-dash').firstElementChild as HTMLElement).style.height)).toBeCloseTo(computeTouchLayout(844, 390, undefined, { scale: 1.3, buttons: state.touch.buttons }).dash.visual * k, 3);
    });

    it('there is no preview where there is no touch layer (the whole section is hidden)', () => {
      touchAvailable = false;
      menu.open();
      expect(q(host, 'settings-touch').style.display).toBe('none');
      expect(q(host, 'settings-touch-preview').hidden).toBe(true);
    });

    it('"Edit layout" opens the editor (the menu does not edit anything itself); after it, the menu is read again and the focus returns to the button that opened it', () => {
      menu.open();
      const edit = q(host, 'settings-touch-edit') as HTMLButtonElement;
      expect(edit.textContent).toBe('Editar disposición');
      edit.click();
      expect(calls).toEqual(['edit-touch']);
      state.touch = { ...state.touch, buttons: { dash: { x: 0.3, y: 0.8, scale: 1 } } };
      menu.sync();
      expect(document.activeElement).toBe(edit);
      expect(Number.parseFloat(q(host, 'settings-touch-preview-dash').style.left)).toBeLessThan(844 * 0.5);
    });

    it('there are no longer a side or two offset sliders: the editor replaces them', () => {
      menu.open();
      for (const id of ['settings-touch-side', 'settings-touch-side-right', 'settings-touch-side-left', 'settings-touch-offset-x', 'settings-touch-offset-y']) expect(q(host, id), id).toBeNull();
    });

    it('Restore default layout puts the size, the opacity and every button back to the design, in one change', () => {
      state.touch = { scale: 1.3, opacity: 0.5, buttons: { attack: { x: 0.2, y: 0.7, scale: 1.3 }, ability: { x: 0.9, y: 0.2, scale: 0.8 } } };
      menu.open();
      q(host, 'settings-touch-reset').click();
      expect(calls).toEqual(['touch:{"scale":1,"opacity":1,"buttons":{}}']);
      expect(state.touch).toEqual(TOUCH);
      expect((q(host, 'settings-touch-size') as HTMLInputElement).value).toBe('1');
      // …and the picture shows the design again
      const l = computeTouchLayout(844, 390);
      expect(Number.parseFloat(q(host, 'settings-touch-preview-attack').style.left)).toBeCloseTo(l.attack.cx * Math.min(260 / 844, 150 / 390), 3);
    });

    it('its words are in both languages', () => {
      menu.open();
      const es = q(host, 'settings-touch').textContent ?? '';
      for (const w of ['Editar disposición', 'Restaurar disposición', 'Arrastra cada botón']) expect(es, w).toContain(w);
      tr.setLocale('en');
      const en = q(host, 'settings-touch').textContent ?? '';
      for (const w of ['Edit layout', 'Restore default layout', 'Drag each button']) expect(en, w).toContain(w);
    });
  });

  describe('accessibility: each choice changes something the game really does', () => {
    it('two switches and a size, showing what is saved: off, off and 100 % until the player chooses', () => {
      menu.open();
      const flashes = q(host, 'settings-flashes');
      const shake = q(host, 'settings-shake');
      expect([flashes.getAttribute('role'), flashes.getAttribute('aria-checked'), flashes.textContent]).toEqual(['switch', 'false', 'Desactivado']);
      expect([shake.getAttribute('role'), shake.getAttribute('aria-checked'), shake.textContent]).toEqual(['switch', 'false', 'Desactivado']);
      const size = q(host, 'settings-hud-size') as HTMLInputElement;
      expect([size.min, size.max, size.value]).toEqual([String(HUD_SCALE_LIMITS.min), String(HUD_SCALE_LIMITS.max), '1']);
      expect(q(host, 'settings-accessibility').textContent).toContain('100%');
    });

    it('pressing a switch reports the new state, and the menu reads it back from the game', () => {
      menu.open();
      q(host, 'settings-flashes').click();
      expect(calls).toEqual(['access:{"reduceFlashes":true}']);
      expect(q(host, 'settings-flashes').getAttribute('aria-checked')).toBe('true');
      expect(q(host, 'settings-flashes').textContent).toBe('Activado');
      q(host, 'settings-shake').click();
      q(host, 'settings-flashes').click();
      expect(calls).toEqual(['access:{"reduceFlashes":true}', 'access:{"reduceShake":true}', 'access:{"reduceFlashes":false}']);
      expect([q(host, 'settings-flashes').getAttribute('aria-checked'), q(host, 'settings-shake').getAttribute('aria-checked')]).toEqual(['false', 'true']);
    });

    it('the size of the interface is a slider within the limits of the settings, reported live', () => {
      menu.open();
      input('settings-hud-size', '1.25');
      expect(calls).toEqual(['access:{"hudScale":1.25}']);
      expect(q(host, 'settings-accessibility').textContent).toContain('125%');
    });

    it('shows the choices already made when it opens', () => {
      state.accessibility = { reduceFlashes: true, reduceShake: false, hudScale: 1.2 };
      menu.open();
      expect(q(host, 'settings-flashes').getAttribute('aria-checked')).toBe('true');
      expect(q(host, 'settings-shake').getAttribute('aria-checked')).toBe('false');
      expect((q(host, 'settings-hud-size') as HTMLInputElement).value).toBe('1.2');
    });

    it('says what each one does, in both languages (a switch with no explanation is a guess)', () => {
      menu.open();
      expect(q(host, 'settings-flashes-note').textContent).toContain('pulsos');
      expect(q(host, 'settings-shake-note').textContent).toContain('cámara');
      tr.setLocale('en');
      expect(q(host, 'settings-flashes-note').textContent).toContain('pulses');
      expect(q(host, 'settings-shake-note').textContent).toContain('camera');
      expect(q(host, 'settings-flashes').textContent).toBe('Off');
    });
  });

  describe('as screens of the pause menu', () => {
    let second: HTMLDivElement;
    const screen = (which: SettingsScreen): SettingsMenu => {
      second = document.createElement('div');
      document.body.appendChild(second);
      return new SettingsMenu(second, tr, hostApi(), { screen: which });
    };

    it('the settings screen has the language, the sound, the quality and accessibility — and none of the controls', () => {
      const m = screen('settings');
      m.open();
      expect(q(second, 'settings-screen')).toBeTruthy();
      expect(q(second, 'settings-screen-title').textContent).toBe('Ajustes');
      for (const id of ['settings-languages', 'settings-volume-section', 'settings-quality', 'settings-accessibility']) expect(q(second, id), id).toBeTruthy();
      for (const id of ['settings-controls', 'settings-touch', 'settings-controls-body', 'settings-reference-keyboard']) expect(q(second, id), id).toBeNull();
      m.dispose();
    });

    it('the controls screen has the reference, the keys and the touch layout — and none of the settings', () => {
      const m = screen('controls');
      m.open();
      expect(q(second, 'controls-screen')).toBeTruthy();
      expect(q(second, 'controls-screen-title').textContent).toBe('Controles');
      for (const id of ['settings-reference-keyboard', 'settings-reference-gamepad', 'settings-reference-touch', 'settings-controls', 'settings-touch']) expect(q(second, id), id).toBeTruthy();
      for (const id of ['settings-languages', 'settings-volume-section', 'settings-quality', 'settings-accessibility']) expect(q(second, id), id).toBeNull();
      m.dispose();
    });

    it('their way out says "Back" (not "Resume") and asks the host to close, each with its own test id', () => {
      const a = screen('settings');
      const aRoot = second;
      const b = screen('controls');
      a.open();
      q(aRoot, 'settings-back').click();
      b.open();
      q(second, 'controls-back').click();
      expect(calls).toEqual(['close', 'close']);
      expect(q(aRoot, 'settings-back').textContent).toBe('Volver');
      tr.setLocale('en');
      expect(q(second, 'controls-back').textContent).toBe('Back');
      a.dispose();
      b.dispose();
    });

    it('both can exist at once without a repeated test id (the pause menu holds one of each)', () => {
      const pair = document.createElement('div');
      document.body.appendChild(pair);
      const a = new SettingsMenu(pair, tr, hostApi(), { screen: 'settings' });
      const b = new SettingsMenu(pair, tr, hostApi(), { screen: 'controls' });
      const ids = [...pair.querySelectorAll('[data-testid]')].map((e) => (e as HTMLElement).dataset['testid']);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
      a.dispose();
      b.dispose();
      pair.remove();
    });
  });

  describe('the list of controls (what each one does, from the bindings in force)', () => {
    let second: HTMLDivElement;
    const controls = (): SettingsMenu => {
      second = document.createElement('div');
      document.body.appendChild(second);
      return new SettingsMenu(second, tr, hostApi(), { screen: 'controls' });
    };
    const rows = (block: string): string[] => [...q(second, 'settings-controls-body').querySelectorAll('.settings-reference-block')].filter((b) => b.querySelector('.settings-label')?.textContent === block).flatMap((b) => [...b.querySelectorAll('.settings-reference-rows > span.settings-keyname')].map((n) => n.textContent ?? ''));

    it('lists the keyboard, the pad and the touch layer, each in its own block, in the language in force', () => {
      const m = controls();
      m.open();
      const labels = [...q(second, 'settings-controls-body').querySelectorAll('.settings-reference-block > .settings-label')].map((n) => n.textContent);
      expect(labels).toEqual(['Teclado y ratón', 'Mando', 'Pantalla táctil']);
      expect(rows('Teclado y ratón')).toContain('Saltar');
      tr.setLocale('en');
      expect([...q(second, 'settings-controls-body').querySelectorAll('.settings-reference-block > .settings-label')].map((n) => n.textContent)).toEqual(['Keyboard and mouse', 'Gamepad', 'Touch screen']);
      m.dispose();
    });

    it('shows the keys the player chose, not the defaults', () => {
      state.keys = { attack: 'KeyF' };
      const m = controls();
      m.open();
      const attack = [...q(second, 'settings-controls-body').querySelectorAll('.settings-reference-rows')][0]?.textContent ?? '';
      expect(attack).toContain('F');
      m.dispose();
    });

    it('follows a remap made on the same screen', () => {
      const m = controls();
      m.open();
      q(second, 'settings-key-attack').click();
      (q(second, 'settings-key-attack').closest('.troid-settings') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true, cancelable: true }));
      const first = [...q(second, 'settings-controls-body').querySelectorAll('.settings-reference-rows')][0]?.textContent ?? '';
      expect(first).toContain('F');
      m.dispose();
    });

    it('a desktop without a touch layer lists no touch block; a phone without a keyboard lists no keyboard block', () => {
      touchAvailable = false;
      let m = controls();
      m.open();
      expect([...q(second, 'settings-controls-body').querySelectorAll('.settings-reference-block > .settings-label')].map((n) => n.textContent)).toEqual(['Teclado y ratón', 'Mando']);
      m.dispose();
      touchAvailable = true;
      keyboardAvailable = false;
      m = controls();
      m.open();
      // on a touch screen the touch layer comes first: it is what is being used
      expect([...q(second, 'settings-controls-body').querySelectorAll('.settings-reference-block > .settings-label')].map((n) => n.textContent)).toEqual(['Pantalla táctil', 'Mando']);
      m.dispose();
    });

    it('each device\'s list is followed by its own settings, and the device in use goes first', () => {
      const order = (): string[] => [...q(second, 'settings-controls-body').children].map((c) => (c as HTMLElement).dataset['testid'] ?? '');
      let m = controls();
      m.open();
      expect(order()).toEqual(['settings-reference-keyboard', 'settings-controls', 'settings-reference-gamepad', 'settings-reference-touch', 'settings-touch']);
      m.dispose();
      keyboardAvailable = false;
      m = controls();
      m.open();
      expect(order()).toEqual(['settings-reference-touch', 'settings-touch', 'settings-reference-gamepad', 'settings-reference-keyboard', 'settings-controls']);
      m.dispose();
    });

    it('is honest about the pad: its buttons cannot be changed, and it says so', () => {
      const m = controls();
      m.open();
      expect(q(second, 'controls.padNote-text').textContent).toBe('Los botones del mando no se pueden reasignar.');
      m.dispose();
    });

    it('the touch lines describe gestures and buttons that exist: movement, jump, crouch, drop, buttons, bottle, interact, pause', () => {
      const m = controls();
      m.open();
      const names = [...q(second, 'settings-controls-body').querySelectorAll('.settings-touchline > b')].map((n) => n.textContent);
      expect(names).toEqual(['Moverse', 'Saltar', 'Agacharse', 'Atravesar una plataforma', 'Atacar, esquivar y habilidad', 'Beber una botella', 'Interactuar', 'Pausa']);
      m.dispose();
    });
  });
});
