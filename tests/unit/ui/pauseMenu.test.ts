// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { PauseMenu } from '@/ui/settings/PauseMenu';
import { pauseProbe, profileData, type PauseProbe } from '../../helpers/pauseHost';

/**
 * THE PAUSE MENU (docs/PROMPT14-LOG.md): a list — Continue, Settings, Controls, Saved games, Profile — beside a card that says where the hero is; each entry opens a screen of its own and the way out of
 * every screen is the way back to the list. It owns no text and no data: the host decides what resuming means and what each screen reads and asks.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('the pause menu', () => {
  let parent: HTMLDivElement;
  let menu: PauseMenu;
  let probe: PauseProbe;
  const tr = createTranslator(CATALOGS, 'es');

  const make = (over: { playground?: boolean } = {}): void => {
    menu?.dispose();
    probe = pauseProbe(over);
    menu = new PauseMenu(parent, tr, probe.host);
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    parent = document.createElement('div');
    document.body.appendChild(parent);
    tr.setLocale('es');
    make();
  });
  afterEach(() => {
    menu.dispose();
    tr.setLocale('es');
  });

  const press = (code: string, target: Element = document.activeElement ?? menu.root): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { key: code, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };

  it('is closed until it is opened, and a modal dialog that the game\'s input leaves alone', () => {
    expect(menu.isOpen).toBe(false);
    expect(menu.screen).toBeNull();
    expect(menu.root.dataset['open']).toBe('0');
    expect(menu.root.hasAttribute('data-ui-block')).toBe(true);
    const dialog = menu.root.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    menu.open();
    expect(menu.isOpen).toBe(true);
    expect(menu.screen).toBe('main');
    expect(menu.root.dataset['open']).toBe('1');
  });

  it('is modal over the whole screen: it catches every pointer', () => {
    menu.open();
    expect(getComputedStyle(menu.root).pointerEvents).toBe('auto');
    expect(getComputedStyle(menu.root).position).toBe('absolute');
  });

  it('lists Continue, Settings, Controls, Saved games and Profile, in that order, in the language in force', () => {
    menu.open();
    const entries = [...menu.root.querySelectorAll('.pm-entry')] as HTMLElement[];
    expect(entries.map((e) => e.dataset['id'])).toEqual(['resume', 'settings', 'controls', 'saves', 'profile']);
    expect(entries.map((e) => e.textContent)).toEqual(['Continuar', 'Ajustes', 'Controles', 'Partidas', 'Perfil']);
    expect(q(menu.root, 'pause-title').textContent).toBe('Pausa');
    tr.setLocale('en');
    expect(entries.map((e) => e.textContent)).toEqual(['Resume', 'Settings', 'Controls', 'Saved games', 'Profile']);
    expect(q(menu.root, 'pause-title').textContent).toBe('Paused');
  });

  it('there is no "main menu" and no "quit": a web page has neither', () => {
    menu.open();
    const text = (menu.root.textContent ?? '').toLowerCase();
    for (const word of ['salir', 'quit', 'exit', 'menú principal', 'main menu']) expect(text, word).not.toContain(word);
  });

  it('every entry has an icon that is hidden from the screen reader and a name', () => {
    menu.open();
    for (const e of menu.root.querySelectorAll('.pm-entry')) {
      expect(e.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect((e.textContent ?? '').length).toBeGreaterThan(0);
    }
  });

  it('opening puts the focus on Continue (a keyboard player can go back to the game at once)', () => {
    menu.open();
    expect(document.activeElement).toBe(q(menu.root, 'pause-resume'));
  });

  it('Continue asks the host to resume and does not close anything itself (the game decides)', () => {
    menu.open();
    q(menu.root, 'pause-resume').click();
    expect(probe.calls).toEqual(['resume']);
    expect(menu.isOpen).toBe(true);
  });

  describe('the screens', () => {
    it('are not built until they are opened (the menu costs nothing until it is used)', () => {
      menu.open();
      for (const id of ['settings-screen', 'controls-screen', 'saves-screen', 'profile-screen']) expect(q(menu.root, id), id).toBeNull();
      q(menu.root, 'pause-settings').click();
      expect(q(menu.root, 'settings-screen')).toBeTruthy();
      expect(q(menu.root, 'controls-screen')).toBeNull();
    });

    it('Settings opens the settings screen, replaces the list, and its Back returns to it with the focus on where the player came from', () => {
      menu.open();
      q(menu.root, 'pause-settings').click();
      expect(menu.screen).toBe('settings');
      expect(menu.root.dataset['screen']).toBe('settings');
      expect(q(menu.root, 'settings-screen').dataset['open']).toBe('1');
      expect(q(menu.root, 'settings-screen-title').textContent).toBe('Ajustes');
      q(menu.root, 'settings-back').click();
      expect(menu.screen).toBe('main');
      expect(menu.root.dataset['screen']).toBe('main');
      expect(q(menu.root, 'settings-screen').dataset['open']).toBe('0');
      expect(document.activeElement).toBe(q(menu.root, 'pause-settings'));
    });

    it('Controls opens the controls screen, with the keys and the list of what each control does', () => {
      menu.open();
      q(menu.root, 'pause-controls').click();
      expect(menu.screen).toBe('controls');
      expect(q(menu.root, 'controls-screen').dataset['open']).toBe('1');
      expect(q(menu.root, 'controls-screen-title').textContent).toBe('Controles');
      expect(q(menu.root, 'settings-reference-keyboard').textContent).toContain('Saltar');
      q(menu.root, 'controls-back').click();
      expect(menu.screen).toBe('main');
      expect(document.activeElement).toBe(q(menu.root, 'pause-controls'));
    });

    it('Saved games opens the saved-games screen and asks the host for the games', async () => {
      menu.open();
      q(menu.root, 'pause-saves').click();
      await flush();
      expect(menu.screen).toBe('saves');
      expect(q(menu.root, 'saves-screen').dataset['open']).toBe('1');
      expect(q(menu.root, 'saves-slot-1')).toBeTruthy();
      expect(q(menu.root, 'saves-slot-3')).toBeTruthy();
      q(menu.root, 'saves-back').click();
      expect(menu.screen).toBe('main');
      expect(document.activeElement).toBe(q(menu.root, 'pause-saves'));
    });

    it('Profile opens the profile screen with the data of the game, read now', () => {
      menu.open();
      q(menu.root, 'pause-profile').click();
      expect(menu.screen).toBe('profile');
      expect(q(menu.root, 'profile-time').textContent).toBe('1:23');
      q(menu.root, 'profile-back').click();
      expect(menu.screen).toBe('main');
      probe.profile.data = profileData({ ticks: 60 * 600 });
      q(menu.root, 'pause-profile').click();
      expect(q(menu.root, 'profile-time').textContent).toBe('10:00');
    });

    it('only one screen is open at a time', () => {
      menu.open();
      q(menu.root, 'pause-settings').click();
      q(menu.root, 'settings-back').click();
      q(menu.root, 'pause-controls').click();
      const open = [...menu.root.querySelectorAll('.troid-settings[data-open="1"]')];
      expect(open.map((e) => (e as HTMLElement).dataset['testid'])).toEqual(['controls-screen']);
    });

    it('back() takes one step: from a screen to the list (true), from the list or when closed it does nothing (false) and the game closes the menu', () => {
      expect(menu.back()).toBe(false);
      menu.open();
      expect(menu.back()).toBe(false);
      q(menu.root, 'pause-settings').click();
      expect(menu.back()).toBe(true);
      expect(menu.screen).toBe('main');
      expect(menu.back()).toBe(false);
    });

    it('opening again always starts at the list, even if it was closed from a screen', () => {
      menu.open();
      q(menu.root, 'pause-controls').click();
      menu.close();
      expect(menu.isOpen).toBe(false);
      expect(menu.screen).toBeNull();
      expect(menu.root.querySelectorAll('.troid-settings[data-open="1"]')).toHaveLength(0);
      menu.open();
      expect(menu.screen).toBe('main');
      expect(document.activeElement).toBe(q(menu.root, 'pause-resume'));
    });

    it('a change made in a screen reaches the host (the settings screen is the real one)', () => {
      const record = probe.host.settings.setLanguage;
      probe.host.settings.setLanguage = (language) => {
        record(language);
        tr.setLocale(language); // what the game does with a language
      };
      menu.open();
      q(menu.root, 'pause-settings').click();
      q(menu.root, 'settings-flashes').click();
      q(menu.root, 'settings-lang-en').click();
      expect(probe.calls).toEqual(['access:{"reduceFlashes":true}', 'lang:en']);
      expect(q(menu.root, 'settings-screen-title').textContent).toBe('Settings');
    });
  });

  describe('where nothing is saved (a playground)', () => {
    beforeEach(() => make({ playground: true }));

    it('offers neither the saved games nor the profile', () => {
      menu.open();
      expect(q(menu.root, 'pause-saves').hidden).toBe(true);
      expect(q(menu.root, 'pause-profile').hidden).toBe(true);
      expect(q(menu.root, 'pause-settings').hidden).toBe(false);
      expect(q(menu.root, 'pause-controls').hidden).toBe(false);
    });

    it('the arrow keys skip what is not offered', () => {
      menu.open();
      q(menu.root, 'pause-controls').focus();
      press('ArrowDown');
      expect(document.activeElement).toBe(q(menu.root, 'pause-resume'));
    });

    it('the summary has the place and no game number', () => {
      menu.open();
      expect(q(menu.root, 'pause-zone').textContent).toBe('Puerta de las Ruinas');
      expect(q(menu.root, 'pause-slot')).toBeNull();
      expect(q(menu.root, 'pause-time')).toBeNull();
    });
  });

  describe('the card that says where the hero is', () => {
    it('shows the zone by its name, the time played and the game, from the host', () => {
      menu.open();
      expect(q(menu.root, 'pause-zone').textContent).toBe('Puerta de las Ruinas');
      expect(q(menu.root, 'pause-time').textContent).toBe('1:23');
      expect(q(menu.root, 'pause-slot').textContent).toBe('1');
      expect(q(menu.root, 'pause-where').textContent).toContain('Estás en');
    });

    it('is read again every time the list is shown (what the game says now, not what it said before)', () => {
      menu.open();
      probe.profile.data = profileData({ ticks: 60 * 3725, slot: 2, zoneKey: 'room.r3.name' });
      q(menu.root, 'pause-settings').click();
      q(menu.root, 'settings-back').click();
      expect(q(menu.root, 'pause-time').textContent).toBe('1:02:05');
      expect(q(menu.root, 'pause-slot').textContent).toBe('2');
      expect(q(menu.root, 'pause-zone').textContent).toBe('Cámara del Sello');
    });

    it('follows the language', () => {
      menu.open();
      tr.setLocale('en');
      expect(q(menu.root, 'pause-zone').textContent).toBe('Ruins Gate');
      expect(q(menu.root, 'pause-where').textContent).toContain('You are in');
    });
  });

  describe('the keyboard', () => {
    it('the arrows move through the list and wrap around; Home and End go to its ends', () => {
      menu.open();
      const order = (): string | undefined => (document.activeElement as HTMLElement | null)?.dataset['id'];
      expect(order()).toBe('resume');
      expect(press('ArrowDown').defaultPrevented).toBe(true);
      expect(order()).toBe('settings');
      press('ArrowDown');
      press('ArrowDown');
      press('ArrowDown');
      expect(order()).toBe('profile');
      press('ArrowDown');
      expect(order(), 'wraps to the first').toBe('resume');
      press('ArrowUp');
      expect(order(), 'and back to the last').toBe('profile');
      press('Home');
      expect(order()).toBe('resume');
      press('End');
      expect(order()).toBe('profile');
    });

    it('other keys are left alone (Tab, Enter and Space are the browser\'s), and so are arrows with a modifier', () => {
      menu.open();
      expect(press('Tab').defaultPrevented).toBe(false);
      expect(press('Enter').defaultPrevented).toBe(false);
      const e = new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true, cancelable: true });
      document.activeElement?.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    });

    it('the arrows do nothing inside a screen (they belong to its sliders)', () => {
      menu.open();
      q(menu.root, 'pause-settings').click();
      q(menu.root, 'settings-volume').focus();
      expect(press('ArrowDown').defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(q(menu.root, 'settings-volume'));
    });
  });

  it('dispose removes the menu, its screens and its listeners', () => {
    menu.open();
    q(menu.root, 'pause-settings').click();
    const resume = q(menu.root, 'pause-resume');
    menu.dispose();
    resume.click();
    expect(parent.querySelector('.troid-pausemenu')).toBeNull();
    expect(parent.querySelector('.troid-settings')).toBeNull();
    expect(probe.calls).toEqual([]);
  });
});
