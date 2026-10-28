// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ABILITIES, ROOMS, WORLD } from '@/content';
import { UPGRADES } from '@/content/upgrades';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { applyKeyMap } from '@/input/remap';
import { CATALOGS, createTranslator } from '@/i18n';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import { OVERLAY_CATALOGS } from '@/i18n/overlayCatalogs';
import { ABILITY_NOTICE, AbilityNoticeModel } from '@/ui/overlays/abilityNoticeModel';
import { ABILITY_TEXT, AbilityNotice } from '@/ui/overlays/AbilityNotice';
import { ABILITY_KEYS } from '@/app/profile';

/**
 * WHAT THE PLAYER IS TOLD WHEN THEY LEARN SOMETHING (docs/PROMPT22-LOG.md §6): the Ground Slam asks for a combination (down and attack, in the air) that nobody finds by chance, and until Prompt 22 the game said nothing when it was given — only
 * a glow and a sound. The model is the clock; the view words it, for the device in use, from the bindings in force.
 */
describe('the clock of the notice', () => {
  it('is nothing until something is shown, comes in, holds, goes — and is nothing again', () => {
    const m = new AbilityNoticeModel();
    expect(m.update(1).id).toBeNull();
    m.show('double_jump');
    expect(m.update(0).opacity).toBe(0);
    expect(m.update(ABILITY_NOTICE.fade.in / 2).opacity).toBeCloseTo(0.5, 5);
    expect(m.update(ABILITY_NOTICE.fade.in).opacity).toBe(1);
    m.update(ABILITY_NOTICE.hold);
    expect(m.state.id).toBe('double_jump');
    expect(m.update(ABILITY_NOTICE.fade.out / 2).opacity).toBeCloseTo(0.5, 5);
    expect(m.update(ABILITY_NOTICE.fade.out).opacity).toBe(0);
    expect(m.state.id).toBeNull();
  });

  it('holds long enough to read a name and a line', () => {
    expect(ABILITY_NOTICE.hold).toBeGreaterThanOrEqual(5);
  });

  it('while the game is held (the menu is open) it stands still: it neither fades nor runs out, and is there when the player comes back', () => {
    const m = new AbilityNoticeModel();
    m.show('ground_slam');
    m.update(ABILITY_NOTICE.fade.in);
    const before = { ...m.state };
    for (let i = 0; i < 100; i++) m.update(1, true);
    expect(m.state).toEqual(before);
    m.update(ABILITY_NOTICE.hold - 0.5);
    expect(m.state.id).toBe('ground_slam');
  });

  it('two in a row are told one after the other, never on top of each other; the same one twice is told once', () => {
    const m = new AbilityNoticeModel();
    m.show('wall_jump');
    m.show('wall_jump');
    m.show('ground_slam');
    m.show('ground_slam');
    expect(m.state.id).toBe('wall_jump');
    m.update(ABILITY_NOTICE.fade.in + ABILITY_NOTICE.hold + 0.01);
    m.update(ABILITY_NOTICE.fade.out + 0.01);
    expect(m.state.id, 'the first has gone and the second has come').toBe('ground_slam');
    m.update(ABILITY_NOTICE.fade.in + ABILITY_NOTICE.hold + 0.01);
    m.update(ABILITY_NOTICE.fade.out + 0.01);
    expect(m.state.id).toBeNull();
  });

  it('a negative or a huge step never breaks it', () => {
    const m = new AbilityNoticeModel();
    m.show('air_dash');
    expect(m.update(-5).opacity).toBe(0);
    expect(m.update(1e9)).toMatchObject({ id: 'air_dash', opacity: 1 });
    expect(m.update(1e9).id).toBeNull();
  });
});

describe('the notice on the page', () => {
  let parent: HTMLDivElement;
  let notice: AbilityNotice;
  const tr = createTranslator(CATALOGS, 'es');
  for (const [lang, entries] of Object.entries(OVERLAY_CATALOGS)) tr.extend(lang, entries);
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    parent = document.createElement('div');
    document.body.appendChild(parent);
    tr.setLocale('es');
    notice = new AbilityNotice(parent, tr);
    notice.place(844, 390, { top: 10, right: 20, bottom: 0, left: 0 }, 1);
  });
  afterEach(() => notice.dispose());
  const el = (): HTMLElement => parent.querySelector('[data-testid="ability-notice"]') as HTMLElement;
  const name = (): string => (parent.querySelector('[data-testid="ability-notice-name"]') as HTMLElement).textContent ?? '';
  const how = (): string => (parent.querySelector('[data-testid="ability-notice-how"]') as HTMLElement).textContent ?? '';
  const kicker = (): string => (el().querySelector('.ability-kicker') as HTMLElement).textContent ?? '';
  const learn = (id: string, device: 'keyboard' | 'gamepad' | 'touch' = 'keyboard', bindings = DEFAULT_BINDINGS): void => {
    notice.show(id, device, bindings);
    notice.update(0.5, false);
  };

  it('is a polite status region, takes no touch, and is closed until something is learned', () => {
    expect(el().getAttribute('role')).toBe('status');
    expect(el().getAttribute('aria-live')).toBe('polite');
    expect(el().dataset['open']).toBe('0');
    expect(getComputedStyle(el()).pointerEvents).toBe('none');
  });

  it('names the ability and says how it is done with the KEYS in use — the Ground Slam asks for down and attack', () => {
    learn('ground_slam');
    expect(el().dataset['open']).toBe('1');
    expect(kicker()).toBe('Nueva habilidad');
    expect(name()).toBe('Golpe al suelo');
    expect(how()).toBe('En el aire, mantén S y pulsa J: cae en picado y rompe lo que el suelo esconde.');
    tr.setLocale('en');
    expect(name()).toBe('Ground Slam');
    expect(how()).toBe('In the air, hold S and press J: dive and break what the ground hides.');
  });

  it('says it in the buttons of the pad when the pad is the device in use', () => {
    tr.setLocale('en');
    learn('double_jump', 'gamepad');
    expect(how()).toBe('In the air, press A again.');
    notice.update(100, false);
    notice.update(100, false);
    learn('ground_slam', 'gamepad');
    expect(how()).toBe('In the air, hold ↓ and press X: dive and break what the ground hides.');
  });

  it('says it in the gestures of the fingers on a touch screen — there is no key to name', () => {
    tr.setLocale('en');
    learn('double_jump', 'touch');
    expect(how()).toBe('In the air, bring your thumb back down and drag it up again.');
    expect(how()).not.toMatch(/Space|press/i);
  });

  it('follows a remapped key: the words are made from the bindings in force', () => {
    tr.setLocale('en');
    learn('wall_jump', 'keyboard', applyKeyMap(DEFAULT_BINDINGS, { jump: 'KeyZ' }));
    expect(how()).toBe('In the air, lean on a wall to slide down it, and press Z to kick off.');
  });

  it('a relic works by itself: it says what it does, and is a "new relic"', () => {
    tr.setLocale('en');
    learn('relic_brew', 'touch');
    expect(kicker()).toBe('New relic');
    expect(name()).toBe('Strong Brew');
    expect(how()).toBe('A bottle heals one point more.');
  });

  it('something it has no words for is not told (and does not break the page)', () => {
    notice.show('grapple', 'keyboard', DEFAULT_BINDINGS);
    notice.update(0.5, false);
    expect(el().dataset['open']).toBe('0');
  });

  it('is out of sight while the menu is up, and there when the player comes back', () => {
    learn('air_dash');
    expect(el().dataset['open']).toBe('1');
    notice.update(5, true);
    expect(el().dataset['open']).toBe('0');
    notice.update(0.1, false);
    expect(el().dataset['open']).toBe('1');
    expect(notice.current.id).toBe('air_dash');
  });

  it('closes itself when it is done and is worded again, in the language in force by then, the next time', () => {
    learn('air_dash');
    notice.update(ABILITY_NOTICE.hold, false);
    notice.update(ABILITY_NOTICE.fade.out + 0.1, false);
    expect(el().dataset['open']).toBe('0');
    tr.setLocale('en');
    learn('air_dash');
    expect(name()).toBe('Air Dash');
  });

  it('sits in the free space at the top, between the HUD and the pause button, on a phone held sideways', () => {
    notice.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }, 1);
    const m = /translate\((-?\d+)px, (-?\d+)px\)/.exec(el().style.transform);
    expect(m).not.toBeNull();
    const cx = Number(m![1]);
    expect(cx).toBeGreaterThan(300);
    expect(cx).toBeLessThan(600);
    expect(Number(m![2])).toBeLessThan(40);
  });
});

describe('what it can say is what the game can teach', () => {
  const abilityIdsTaught = (): string[] => {
    const ids = new Set<string>();
    for (const id of WORLD.rooms) for (const i of ROOMS[id]?.interactables ?? []) for (const a of i.actions) if (a.type === 'unlockAbility') ids.add(a.abilityId);
    for (const u of Object.values(UPGRADES)) if ('abilityId' in u && typeof u.abilityId === 'string') ids.add(u.abilityId);
    return [...ids];
  };

  it('every ability that a pickup of the world teaches has its words — a new one cannot be given without them', () => {
    const taught = abilityIdsTaught();
    expect(taught.length, 'the scan is not vacuous').toBeGreaterThanOrEqual(8);
    expect(taught.filter((id) => !ABILITY_TEXT[id])).toEqual([]);
  });

  it('every ability the profile names (the ones with behaviour) is told, except the dash the hero begins with', () => {
    const named = Object.keys(ABILITY_KEYS).filter((id) => id !== 'dash');
    expect(named.filter((id) => !ABILITY_TEXT[id])).toEqual([]);
    for (const id of Object.keys(ABILITY_TEXT)) expect(ABILITIES.find((a) => a.id === id)?.implemented, `${id} is an ability that works`).toBe(true);
  });

  it('the names are those of the profile and the pause menu, in both languages', () => {
    for (const lang of Object.keys(OVERLAY_CATALOGS)) {
      for (const [id, text] of Object.entries(ABILITY_TEXT)) {
        const profileKey = ABILITY_KEYS[id];
        expect(profileKey, id).toBeDefined();
        expect(OVERLAY_CATALOGS[lang]![text.name], `${lang}:${id}`).toBe(MENU_CATALOGS[lang]![profileKey!]);
      }
    }
  });

  it('what is done has a line for the keys and one for the fingers; what works by itself says what it does', () => {
    for (const [id, text] of Object.entries(ABILITY_TEXT)) {
      if (id.startsWith('relic_')) expect(text.what, id).toBeDefined();
      else {
        expect(text.how, id).toBeDefined();
        expect(text.touch, id).toBeDefined();
      }
    }
  });
});
