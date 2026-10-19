// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPauseMenu, type MenuDeps } from '@/app/menu';
import { GameSaves, type SaveNotice, type SavePlatform } from '@/app/gameSaves';
import { BOSSES, ROOMS } from '@/content';
import { CATALOGS, createTranslator } from '@/i18n';
import { PlayStats } from '@/gameplay/PlayStats';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { applyKeyMap } from '@/input/remap';
import { parseProgress } from '@/save/ProgressData';
import { SaveSlots, slotKey } from '@/save/SaveSlots';
import { SettingsStore } from '@/save/SettingsStore';
import { MemoryStorage } from '@/save/StorageAdapter';
import type { PauseMenu } from '@/ui/settings/PauseMenu';
import { driver } from '../helpers/sim';

/**
 * THE PAUSE MENU OVER THE REAL GAME (docs/PROMPT14-LOG.md): the menu is wired to a real session, the real counts, the real settings store and the real saved games — nothing is a stand-in. What the screens
 * show is what the game holds, and what they ask for is done: the profile reads the session, the games screen reads and writes the slots, a change in the settings reaches the setter the game has.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const idle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

function fakePlatform(): SavePlatform & { reloads: number } {
  return {
    reloads: 0,
    now: () => 1_760_000_000_000,
    reload() {
      this.reloads++;
    },
    onLeave: () => () => undefined,
    every: () => () => undefined,
  };
}

describe('the pause menu over the real game', () => {
  let parent: HTMLDivElement;
  let menu: PauseMenu;
  let saves: GameSaves | null;
  let storage: MemoryStorage;
  let d: ReturnType<typeof driver>;
  let stats: PlayStats;
  let settings: SettingsStore;
  let changes: string[];
  let resumed: number;
  let notices: SaveNotice[];
  let platform: ReturnType<typeof fakePlatform>;
  const tr = createTranslator(CATALOGS, 'es');

  async function build(over: { playground?: boolean; touch?: boolean; keyboard?: boolean } = {}): Promise<void> {
    storage = new MemoryStorage();
    const slots = new SaveSlots(storage);
    settings = new SettingsStore(storage);
    await settings.load();
    platform = fakePlatform();
    notices = [];
    stats = new PlayStats();
    d = driver({ room: ROOMS.r2_hall!, entry: 'west', unlocked: ['dash'], extra: { rooms: ROOMS } });
    d.settle();
    stats.attach(d.session.bus, d.session.room.id);
    saves = over.playground ? null : new GameSaves({ slots, settings, slot: 1, stats, durable: true, platform, notify: (n) => void notices.push(n) });
    saves?.attach(d.session);
    changes = [];
    resumed = 0;
    const deps: MenuDeps = {
      parent,
      translator: tr,
      settings,
      session: d.session,
      stats,
      saves,
      bindings: () => applyKeyMap(DEFAULT_BINDINGS, settings.value.keys),
      touchAvailable: () => over.touch ?? false,
      keyboardInUse: () => over.keyboard ?? true,
      change: {
        language: (l) => void changes.push(`language:${l}`),
        volume: (v) => void changes.push(`volume:${v}`),
        quality: (qq) => void changes.push(`quality:${qq}`),
        keys: (k) => void changes.push(`keys:${JSON.stringify(k)}`),
        touch: (p) => void changes.push(`touch:${JSON.stringify(p)}`),
        accessibility: (p) => void changes.push(`access:${JSON.stringify(p)}`),
      },
      resume: () => void resumed++,
    };
    menu = createPauseMenu(deps);
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    parent = document.createElement('div');
    document.body.appendChild(parent);
    tr.setLocale('es');
  });
  afterEach(() => {
    menu.dispose();
    saves?.dispose();
    tr.setLocale('es');
  });

  it('the summary beside the list is the zone the hero is in and the time they have played — the session\'s own clock, counted in ticks', async () => {
    await build();
    d.step(60 * 75);
    menu.open();
    expect(q(parent, 'pause-zone').textContent).toBe('Galería de Raíces');
    expect(q(parent, 'pause-time').textContent).toBe('1:15');
    expect(q(parent, 'pause-slot').textContent).toBe('1');
  });

  it('the time played is what the save already had plus this session — not the time the page has been open', async () => {
    await build();
    stats = new PlayStats({ ticks: 60 * 3600, deaths: 0, kills: 0, rooms: [] });
    menu.dispose();
    const slots = new SaveSlots(storage);
    saves?.dispose();
    saves = new GameSaves({ slots, settings, slot: 1, stats, durable: true, platform, notify: () => undefined });
    menu = createPauseMenu({
      parent, translator: tr, settings, session: d.session, stats, saves,
      bindings: () => DEFAULT_BINDINGS, touchAvailable: () => false, keyboardInUse: () => true,
      change: { language: () => undefined, volume: () => undefined, quality: () => undefined, keys: () => undefined, touch: () => undefined, accessibility: () => undefined },
      resume: () => undefined,
    });
    d.step(60 * 30);
    menu.open();
    expect(q(parent, 'pause-time').textContent).toBe('1:00:30');
  });

  it('a playground (no saved games) shows the place and neither the games nor the profile', async () => {
    await build({ playground: true });
    menu.open();
    expect(q(parent, 'pause-zone').textContent).toBe('Galería de Raíces');
    expect(q(parent, 'pause-saves').hidden).toBe(true);
    expect(q(parent, 'pause-profile').hidden).toBe(true);
    expect(q(parent, 'pause-slot')).toBeNull();
  });

  describe('the profile', () => {
    it('shows what the session holds: the abilities it has, the cards it carries, the bottles, the life', async () => {
      await build();
      d.session.loadout.acquire('card_spirit_bolt');
      menu.open();
      q(parent, 'pause-profile').click();
      expect(q(parent, 'profile-abilities').textContent).toBe('EsquivaProyectil espiritual');
      expect(q(parent, 'profile-cards').textContent).toBe('Proyectil espiritual');
      expect(q(parent, 'profile-bottles').textContent).toBe(`${d.session.bottles.slots.length} de ${d.session.bottles.maxSlots}`);
      expect(q(parent, 'profile-life').textContent).toBe(String(d.session.player.health.max));
      expect(q(parent, 'profile-zone').textContent).toBe('Galería de Raíces');
    });

    it('counts the rooms the hero has been in, out of the rooms the world has — from the events, not from a guess', async () => {
      await build();
      d.session.loadRoom('r3_chamber');
      d.session.loadRoom('r2_hall');
      menu.open();
      q(parent, 'pause-profile').click();
      expect(q(parent, 'profile-rooms').textContent).toBe('2 de 4');
    });

    it('counts the defeats and the enemies beaten from the events the simulation raises', async () => {
      await build();
      d.session.bus.emit('actor:died', { id: 'a', team: 'enemy', x: 0, y: 0 });
      d.session.bus.emit('actor:died', { id: 'b', team: 'enemy', x: 0, y: 0 });
      d.session.bus.emit('actor:died', { id: 'seal', team: 'neutral', x: 0, y: 0 });
      d.session.bus.emit('death:started', { x: 0, y: 0 });
      menu.open();
      q(parent, 'pause-profile').click();
      expect(q(parent, 'profile-kills').textContent).toBe('2');
      expect(q(parent, 'profile-deaths').textContent).toBe('1');
    });

    it('lists a guardian as beaten only when the world says so (its flag is set), and by name', async () => {
      await build();
      menu.open();
      q(parent, 'pause-profile').click();
      expect(q(parent, 'profile-bosses').textContent).toBe('0 de 1');
      q(parent, 'profile-back').click();
      const boss = Object.values(ROOMS).flatMap((r) => r.bosses ?? [])[0]!;
      d.session.flags.set(boss.defeatFlag);
      q(parent, 'pause-profile').click();
      expect(q(parent, 'profile-bosses').textContent).toBe(`1 de 1${tr.t(BOSSES[boss.guardian]!.nameKey)}`);
    });

    it('is not shown for a game that invented a level: there is no level, no score, no percentage', async () => {
      await build();
      menu.open();
      q(parent, 'pause-profile').click();
      expect(q(parent, 'profile-screen').textContent).not.toMatch(/nivel|puntos|%/i);
    });
  });

  describe('the saved games', () => {
    it('reads the real slots: the one being played is new until something is saved, then it holds the zone and the time', async () => {
      await build();
      menu.open();
      q(parent, 'pause-saves').click();
      await idle();
      expect(q(parent, 'saves-slot-1').dataset['state']).toBe('empty');
      expect(q(parent, 'saves-info-1').textContent).toBe('Partida nueva, todavía sin guardar');
      d.step(60 * 20);
      q(parent, 'saves-save-now').click();
      await idle();
      expect(q(parent, 'saves-status').textContent).toBe('Partida guardada.');
      expect(q(parent, 'saves-slot-1').dataset['state']).toBe('ok');
      expect(q(parent, 'saves-info-1').textContent).toContain('Galería de Raíces');
      expect(q(parent, 'saves-info-1').textContent).toContain('Tiempo 0:20');
      const written = parseProgress((await storage.get(slotKey(1))) ?? '');
      expect(written?.at.room).toBe('r2_hall');
      expect(written?.stats.ticks).toBe(60 * 20);
      expect(notices).toEqual([{ kind: 'saved', slot: 1 }]);
    });

    it('another slot holds what is stored under its own key, and playing it saves this game first and opens the page on it', async () => {
      await build();
      await new SaveSlots(storage).store(2).save({ ...parseProgress(JSON.stringify({ saveVersion: 2, at: { room: 'r3_chamber', entry: 'west' }, checkpoint: { room: 'r1_gate', entry: 'start' }, flags: [], abilities: ['dash'], cards: { owned: [], equipped: null }, bottleSlots: 3, stats: { ticks: 7200, deaths: 0, kills: 0, rooms: ['r3_chamber'] }, savedAt: 1_700_000_000_000 }))! });
      menu.open();
      q(parent, 'pause-saves').click();
      await idle();
      expect(q(parent, 'saves-slot-2').dataset['state']).toBe('ok');
      expect(q(parent, 'saves-info-2').textContent).toContain('Cámara del Sello');
      expect(q(parent, 'saves-info-2').textContent).toContain('Tiempo 2:00');
      d.session.flags.set('lever:here');
      q(parent, 'saves-play-2').click();
      await idle();
      expect(platform.reloads).toBe(1);
      expect((await settings.value).slot).toBe(2);
      expect(parseProgress((await storage.get(slotKey(1))) ?? '')?.flags).toContain('lever:here');
      expect(saves?.stopped).toBe(true);
    });

    it('a delete asks first and removes the game and every copy of it from the storage', async () => {
      await build();
      d.session.flags.set('lever:here');
      await idle();
      expect(storage.keys()).toContain('troid.progress');
      menu.open();
      q(parent, 'pause-saves').click();
      await idle();
      q(parent, 'saves-more-1').click();
      q(parent, 'saves-delete-1').click();
      await idle();
      expect(storage.keys()).toContain('troid.progress');
      q(parent, 'saves-yes-1').click();
      await idle();
      expect(storage.keys().filter((k) => k.startsWith('troid.progress'))).toEqual([]);
      expect(platform.reloads, 'the game being played was the one deleted: the page opens again on a new game').toBe(1);
    });

    it('a copy taken out is a real file with the real game in it', async () => {
      await build();
      d.session.flags.set('lever:here');
      await idle();
      const blobs: Blob[] = [];
      vi.spyOn(window.URL, 'createObjectURL').mockImplementation((b) => (blobs.push(b as Blob), 'blob:test/0'));
      vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
      const names: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download);
      });
      menu.open();
      q(parent, 'pause-saves').click();
      await idle();
      q(parent, 'saves-more-1').click();
      q(parent, 'saves-export-1').click();
      await idle();
      expect(names).toEqual(['troid-partida-1-2025-10-09.json']);
      const text = await blobs[0]!.text();
      expect(parseProgress(text)?.flags).toEqual(['lever:here']);
      expect(q(parent, 'saves-status').textContent).toBe('Copia exportada.');
      vi.restoreAllMocks();
    });

    it('says where the games live and what that means — nothing about a cloud', async () => {
      await build();
      menu.open();
      q(parent, 'pause-saves').click();
      await idle();
      const text = q(parent, 'saves-screen').textContent ?? '';
      expect(text).toContain('Las partidas se guardan en este navegador');
      expect(text).toContain('No se sincronizan');
      expect(text.toLowerCase()).not.toContain('nube');
      expect(text.toLowerCase()).not.toContain('cloud');
    });
  });

  describe('the settings and the controls', () => {
    it('a choice reaches the setter the game has, and the screen reads what the store holds', async () => {
      await build();
      await settings.update({ accessibility: { reduceShake: true } });
      menu.open();
      q(parent, 'pause-settings').click();
      expect(q(parent, 'settings-shake').getAttribute('aria-checked')).toBe('true');
      expect(q(parent, 'settings-flashes').getAttribute('aria-checked')).toBe('false');
      q(parent, 'settings-flashes').click();
      q(parent, 'settings-quality-low').click();
      q(parent, 'settings-lang-en').click();
      expect(changes).toEqual(['access:{"reduceFlashes":true}', 'quality:low', 'language:en']);
    });

    it('the controls screen lists the keys in force: a key the player chose is the one it shows', async () => {
      await build();
      await settings.update({ keys: { attack: 'KeyF' } });
      menu.open();
      q(parent, 'pause-controls').click();
      const attack = [...q(parent, 'settings-reference-keyboard').querySelectorAll('.settings-reference-rows > span.settings-keyname')].find((n) => n.textContent === 'Atacar');
      expect(attack?.nextElementSibling?.textContent).toContain('F');
      expect(attack?.nextElementSibling?.textContent).not.toContain('J');
    });

    it('a phone that has never seen a keyboard is offered the touch controls and not the keys', async () => {
      menu?.dispose();
      await build({ touch: true, keyboard: false });
      menu.open();
      q(parent, 'pause-controls').click();
      expect(q(parent, 'settings-controls').style.display).toBe('none');
      expect(q(parent, 'settings-touch').style.display).toBe('');
      expect(q(parent, 'settings-controls-body').firstElementChild?.getAttribute('data-testid')).toBe('settings-reference-touch');
    });

    it('Continue is the game\'s own resume', async () => {
      await build();
      menu.open();
      q(parent, 'pause-resume').click();
      expect(resumed).toBe(1);
    });
  });
});
