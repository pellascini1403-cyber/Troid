// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { PauseMenu } from '@/ui/settings/PauseMenu';
import { pauseProbe, profileData, shippedScene, type PauseProbe } from '../../helpers/pauseHost';

/**
 * THE PAUSE MENU (docs/PROMPT14-LOG.md, docs/PROMPT19-LOG.md): the map of the world in the main panel — the view it opens on — and the column of options at its side (Continue, Map, Controls, Sound, Settings, Saved
 * games, Profile); each option opens a screen of its own in the main panel and the way out of every screen is the way back to the map. It owns no text and no data: the host decides what resuming means, what the
 * map shows and what each screen reads and asks.
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

  it('lists Continue, Map, Controls, Sound, Settings, Saved games and Profile, in that order, in the language in force', () => {
    menu.open();
    const entries = [...menu.root.querySelectorAll('.pm-entry')] as HTMLElement[];
    expect(entries.map((e) => e.dataset['id'])).toEqual(['resume', 'map', 'controls', 'sound', 'settings', 'saves', 'profile']);
    expect(entries.map((e) => e.textContent)).toEqual(['Continuar', 'Mapa', 'Controles', 'Sonido', 'Ajustes', 'Partidas', 'Perfil']);
    expect(q(menu.root, 'pause-title').textContent).toBe('Pausa');
    tr.setLocale('en');
    expect(entries.map((e) => e.textContent)).toEqual(['Resume', 'Map', 'Controls', 'Sound', 'Settings', 'Saved games', 'Profile']);
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
      for (const id of ['settings-screen', 'sound-screen', 'controls-screen', 'saves-screen', 'profile-screen']) expect(q(menu.root, id), id).toBeNull();
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

  describe('the map: the view the menu opens on (docs/PROMPT19-LOG.md)', () => {
    const panelOfMap = (): HTMLElement => q(menu.root, 'pause-map-panel');

    it('opens on the map, in the main panel, with the column of options after it (at its right)', () => {
      menu.open();
      expect(menu.screen).toBe('main');
      expect(panelOfMap().hidden).toBe(false);
      expect(q(menu.root, 'map')).toBeTruthy();
      const stage = q(menu.root, 'pause-stage');
      const side = q(menu.root, 'pause-side');
      expect(stage.contains(q(menu.root, 'map'))).toBe(true);
      expect(side.contains(q(menu.root, 'pause-resume'))).toBe(true);
      // the frame lays them out left to right: the stage (the map) first, the column second
      const frame = stage.parentElement!;
      expect([...frame.children].indexOf(stage)).toBeLessThan([...frame.children].indexOf(side));
      expect(getComputedStyle(frame).display).toBe('grid');
    });

    it('is the map of the host\'s scene, asked for each time the menu opens and not before — what the player has discovered now, not what they had before', () => {
      expect(probe.map.asked).toBe(0);
      menu.open();
      expect(probe.map.asked).toBe(1);
      expect(menu.mapView.shown.rooms.map((r) => r.id)).toEqual(['r1_gate']);
      menu.close();
      probe.map.scene = shippedScene(['r1_gate', 'r2_hall'], ['defeated:r1_slime']);
      menu.open();
      expect(probe.map.asked).toBe(2);
      expect(menu.mapView.shown.rooms.map((r) => r.id)).toEqual(['r1_gate', 'r2_hall']);
      expect(q(menu.root, 'map-room-r2_hall')).toBeTruthy();
      expect(q(menu.root, 'map-room-r3_chamber')).toBeNull(); // what the hero has not been to is not there to see
    });

    it('marks the Map entry as the one shown, and the entry of an open screen instead', () => {
      menu.open();
      const current = (): string[] => [...menu.root.querySelectorAll('.pm-entry[aria-current="page"]')].map((e) => (e as HTMLElement).dataset['id']!);
      expect(current()).toEqual(['map']);
      q(menu.root, 'pause-controls').click();
      expect(current()).toEqual(['controls']);
      q(menu.root, 'pause-sound').click();
      expect(current()).toEqual(['sound']);
      q(menu.root, 'pause-map').click();
      expect(current()).toEqual(['map']);
    });

    it('an option opens its screen IN the main panel, in the place of the map, and the column stays where it is', () => {
      menu.open();
      const stage = q(menu.root, 'pause-stage');
      for (const [entry, screen] of [['controls', 'controls-screen'], ['sound', 'sound-screen'], ['settings', 'settings-screen'], ['profile', 'profile-screen']] as const) {
        q(menu.root, `pause-${entry}`).click();
        expect(stage.contains(q(menu.root, screen)), `${screen} is in the main panel`).toBe(true);
        expect(q(menu.root, screen).dataset['open']).toBe('1');
        expect(panelOfMap().hidden, `the map makes way for ${screen}`).toBe(true);
        expect(q(menu.root, 'pause-side').contains(q(menu.root, `pause-${entry}`))).toBe(true);
        expect(q(menu.root, `pause-${entry}`).hidden).toBe(false);
      }
    });

    it('the Map entry, the screen\'s own Back and the pause key all bring the map back — and the focus goes to where the player came from', () => {
      menu.open();
      q(menu.root, 'pause-sound').click();
      q(menu.root, 'pause-map').click();
      expect(menu.screen).toBe('main');
      expect(panelOfMap().hidden).toBe(false);
      expect(q(menu.root, 'sound-screen').dataset['open']).toBe('0');
      q(menu.root, 'pause-controls').click();
      expect(menu.back()).toBe(true);
      expect(menu.screen).toBe('main');
      expect(document.activeElement).toBe(q(menu.root, 'pause-controls'));
      q(menu.root, 'pause-settings').click();
      q(menu.root, 'settings-back').click();
      expect(menu.screen).toBe('main');
      expect(panelOfMap().hidden).toBe(false);
    });

    it('keeps the map as the player left it while another screen is open (it is hidden, not closed), and sets it to its opening view only when the menu opens', () => {
      menu.mapView.resize(800, 400);
      menu.open();
      const opening = { ...menu.mapView.view };
      menu.mapView.zoomBy(1.8);
      menu.mapView.panBy(-60, 25);
      const moved = { ...menu.mapView.view };
      expect(moved.scale).not.toBeCloseTo(opening.scale, 3);
      q(menu.root, 'pause-sound').click();
      q(menu.root, 'pause-map').click();
      expect(menu.mapView.view.scale).toBeCloseTo(moved.scale, 6);
      expect(menu.mapView.view.x).toBeCloseTo(moved.x, 6);
      expect(menu.mapView.view.y).toBeCloseTo(moved.y, 6);
      menu.close();
      menu.open();
      expect(menu.mapView.view.scale).toBeCloseTo(opening.scale, 6);
      expect(menu.mapView.view.x).toBeCloseTo(opening.x, 6);
    });

    it('a page with no map (a playground) says so, and still has all of its options', () => {
      menu.dispose();
      const bare = pauseProbe();
      delete bare.host.map;
      menu = new PauseMenu(parent, tr, bare.host);
      menu.open();
      expect(q(menu.root, 'map-empty').hidden).toBe(false);
      expect(q(menu.root, 'map-empty').textContent).toBe('No hay mapa de este lugar.');
      expect(menu.root.querySelectorAll('[data-testid^="map-room-"]')).toHaveLength(0);
      expect(q(menu.root, 'pause-controls').hidden).toBe(false);
    });

    it('says where the hero is above the map, and what its marks mean below it, in the language in force', () => {
      menu.open();
      expect(panelOfMap().contains(q(menu.root, 'pause-where'))).toBe(true);
      expect(panelOfMap().contains(q(menu.root, 'pause-map-legend'))).toBe(true);
      expect(q(menu.root, 'pause-map-legend').textContent).toContain('Descanso');
      expect(q(menu.root, 'pause-map-legend').textContent).toContain('Guardián');
      tr.setLocale('en');
      expect(q(menu.root, 'pause-map-legend').textContent).toContain('Rest');
      expect(q(menu.root, 'pause-map-legend').textContent).toContain('Guardian');
    });

    it('a finger acts on an option when it LIFTS: the browser makes no click of a tap that follows a drag or a pinch on the map (docs/PROMPT15-LOG.md §6.4, docs/PROMPT19-LOG.md §7) — and the click that does come is not a second press', () => {
      menu.open();
      const touch = (type: string, id: number, target: Element): boolean => target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
      const tap = (id: number, target: Element): void => {
        touch('pointerdown', id, target);
        touch('pointerup', id, target);
      };
      // a finger on the map, then straight to Sound: no click comes after that tap
      const map = q(menu.root, 'map');
      touch('pointerdown', 1, map);
      touch('pointerup', 1, map);
      tap(2, q(menu.root, 'pause-sound'));
      expect(menu.screen, 'the tap opened the sound screen').toBe('sound');
      tap(3, q(menu.root, 'pause-map'));
      expect(menu.screen, 'and the next one took it back to the map').toBe('main');
      // Continue asks the host once, however many events the one tap makes
      tap(4, q(menu.root, 'pause-resume'));
      q(menu.root, 'pause-resume').click(); // the click of that same tap, if the browser makes it
      expect(probe.calls).toEqual(['resume']);
      // a mouse, a pen and the keyboard still act on the click
      q(menu.root, 'pause-controls').click();
      expect(menu.screen).toBe('controls');
    });

    it('a finger that is on the map when an option puts it away is not left on it: the drag that comes after is a drag, not a pinch with a ghost', () => {
      menu.mapView.resize(800, 400);
      menu.open();
      const touch = (type: string, id: number, target: Element, x = 0, y = 0): boolean => target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
      const map = q(menu.root, 'map');
      touch('pointerdown', 1, map, 300, 200); // a thumb rests on the map…
      touch('pointerdown', 2, q(menu.root, 'pause-sound')); // …and another finger presses Sound
      touch('pointerup', 2, q(menu.root, 'pause-sound'));
      expect(menu.screen).toBe('sound');
      // (the thumb lifts with the map out of sight, and a map out of sight need not be told)
      touch('pointerdown', 3, q(menu.root, 'pause-map'));
      touch('pointerup', 3, q(menu.root, 'pause-map'));
      expect(menu.screen).toBe('main');
      const before = { ...menu.mapView.view };
      touch('pointerdown', 4, map, 500, 200);
      touch('pointermove', 4, map, 540, 200);
      expect(menu.mapView.view.scale).toBeCloseTo(before.scale, 9);
      expect(menu.mapView.view.x).toBeCloseTo(before.x + 40, 6);
    });

    it('a press on the map (a drag, a zoom button) is a press of the menu: the game\'s input leaves it alone and nothing closes', () => {
      menu.open();
      expect(menu.root.hasAttribute('data-ui-block')).toBe(true);
      expect(q(menu.root, 'map').closest('[data-ui-block]')).toBe(menu.root);
      q(menu.root, 'map-zoom-in').click();
      expect(menu.isOpen).toBe(true);
      expect(probe.calls).toEqual([]); // nothing was asked of the game
      expect(probe.sounds).toEqual(['tap']);
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
      q(menu.root, 'pause-settings').focus();
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
      expect(order()).toBe('map');
      for (let i = 0; i < 5; i++) press('ArrowDown');
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

    it('the arrows do nothing inside a screen (they belong to its sliders): only in the column do they move the focus', () => {
      menu.open();
      q(menu.root, 'pause-sound').click();
      q(menu.root, 'settings-volume').focus();
      expect(press('ArrowDown').defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(q(menu.root, 'settings-volume'));
      // …and the column still answers while a screen is open: the focus is in it
      q(menu.root, 'pause-sound').focus();
      expect(press('ArrowDown').defaultPrevented).toBe(true);
      expect((document.activeElement as HTMLElement).dataset['id']).toBe('settings');
    });
  });

  describe('the sound of the menu (docs/PROMPT18-LOG.md)', () => {
    const slide = (id: string, value: string): void => {
      const input = q(menu.root, id) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    it('a button taps; going back into the game does not (the page makes the sound of the menu closing)', () => {
      menu.open();
      q(menu.root, 'pause-settings').click();
      q(menu.root, 'settings-back').click();
      expect(probe.sounds).toEqual(['tap', 'tap']);
      q(menu.root, 'pause-resume').click();
      expect(probe.sounds, 'Continue is silent here').toEqual(['tap', 'tap']);
    });

    it('a language or a quality button taps', () => {
      menu.open();
      q(menu.root, 'pause-settings').click();
      probe.sounds.length = 0;
      (menu.root.querySelector('[data-testid^="settings-quality-"]') as HTMLElement).click();
      expect(probe.sounds).toEqual(['tap']);
    });

    it('a slider that moves is heard on every step, and says nothing else', () => {
      menu.open();
      q(menu.root, 'pause-sound').click();
      probe.sounds.length = 0;
      slide('settings-volume', '0.5');
      slide('settings-volume-music', '0.25');
      slide('settings-volume-sfx', '0.6');
      slide('settings-volume-ambience', '0.4');
      expect(probe.sounds).toEqual(['slider', 'slider', 'slider', 'slider']);
      expect(probe.calls.filter((c) => c.startsWith('volume:'))).toEqual(['volume:master:0.5', 'volume:music:0.25', 'volume:sfx:0.6', 'volume:ambience:0.4']);
    });

    it('a switch says which way it went — read as it was left, not as it was', () => {
      // (a host whose settings follow the change, as the game's do)
      const settings = probe.host.settings;
      const was = settings.current();
      const accessibility = { ...was.accessibility };
      settings.current = () => ({ ...was, accessibility: { ...accessibility } });
      settings.setAccessibility = (patch) => void Object.assign(accessibility, patch);
      menu.open();
      q(menu.root, 'pause-settings').click();
      probe.sounds.length = 0;
      const sw = menu.root.querySelector('[role="switch"]') as HTMLElement;
      const before = sw.getAttribute('aria-checked');
      sw.click();
      const after = sw.getAttribute('aria-checked');
      expect(after).not.toBe(before);
      expect(probe.sounds).toEqual([after === 'true' ? 'on' : 'off']);
      sw.click();
      expect(probe.sounds).toEqual([after === 'true' ? 'on' : 'off', before === 'true' ? 'on' : 'off']);
    });

    it('a menu on a page with no sound asks for none (and does not break)', () => {
      menu.dispose();
      const silent = pauseProbe();
      delete silent.host.sound;
      menu = new PauseMenu(parent, tr, silent.host);
      menu.open();
      q(menu.root, 'pause-sound').click();
      slide('settings-volume', '0.3');
      q(menu.root, 'pause-settings').click();
      (menu.root.querySelector('[role="switch"]') as HTMLElement).click();
      expect(silent.sounds).toEqual([]);
      expect(silent.calls).toContain('volume:master:0.3');
    });

    it('a disposed menu is silent', () => {
      menu.open();
      const resume = q(menu.root, 'pause-settings');
      menu.dispose();
      resume.click();
      expect(probe.sounds).toEqual([]);
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
