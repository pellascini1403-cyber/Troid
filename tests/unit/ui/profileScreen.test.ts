// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import type { ProfileData } from '@/app/profile';
import { ProfileScreen } from '@/ui/settings/ProfileScreen';
import { stubScrollLayout } from '../../helpers/layout';
import { profileData } from '../../helpers/pauseHost';

/**
 * THE PROFILE (docs/PROMPT14-LOG.md): what the game being played has to say of the hero, and nothing it cannot back up. Every line comes from the host's data; the screen invents no level, no score and no
 * percentage of completion.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;

describe('the profile screen', () => {
  let parent: HTMLDivElement;
  let screen: ProfileScreen;
  let data: ProfileData;
  let backs: number;
  const tr = createTranslator(CATALOGS, 'es');
  for (const [lang, entries] of Object.entries(MENU_CATALOGS)) tr.extend(lang, entries);

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    parent = document.createElement('div');
    document.body.appendChild(parent);
    tr.setLocale('es');
    data = profileData();
    backs = 0;
    screen = new ProfileScreen(parent, tr, { profile: () => data, back: () => void backs++ });
  });
  afterEach(() => {
    screen.dispose();
    tr.setLocale('es');
  });

  it('is closed until it is opened, and a dialog for the screen reader that the game\'s input leaves alone', () => {
    expect(screen.isOpen).toBe(false);
    expect(screen.root.getAttribute('role')).toBe('dialog');
    expect(screen.root.getAttribute('aria-modal')).toBe('true');
    expect(screen.root.hasAttribute('data-ui-block')).toBe(true);
    screen.open();
    expect(screen.isOpen).toBe(true);
    expect(screen.root.getAttribute('aria-label')).toBe('Perfil');
    expect(document.activeElement).toBe(q(parent, 'profile-back'));
  });

  it('its middle scrolls and says so: the scroll area tells the stylesheet whether there is more below, looked at when the screen opens (it has a size only then)', () => {
    const body = q(parent, 'profile-screen').querySelector('.settings-body') as HTMLElement;
    expect(body.dataset['more']).toBe('0');
    stubScrollLayout(body, { scroll: 529, client: 278 });
    screen.open();
    expect(body.dataset['more']).toBe('1');
  });

  it('shows what the host says, line by line: the game, the time, the zone, the rooms, the abilities, the cards, the bottles, the bosses, the life and the counts', () => {
    data = profileData({ slot: 2, ticks: 60 * 3725, zoneKey: 'room.r3.name', rooms: { visited: 3, total: 4 }, deaths: 7, kills: 31, lifeMax: 6, bottles: { slots: 4, max: 4 } });
    screen.open();
    const text = (id: string): string | null => q(parent, `profile-${id}`).textContent;
    expect(text('slot')).toBe('2');
    expect(text('time')).toBe('1:02:05');
    expect(text('zone')).toBe('Cámara del Sello');
    expect(text('rooms')).toBe('3 de 4');
    expect(text('abilities')).toBe('Esquiva');
    expect(text('cards')).toBe('Proyectil espiritual');
    expect(text('bottles')).toBe('4 de 4');
    expect(text('bosses')).toBe('0 de 1');
    expect(text('life')).toBe('6');
    expect(text('deaths')).toBe('7');
    expect(text('kills')).toBe('31');
  });

  it('says whether the adventure has been taken to its end: a fact the world remembers, not a percentage', () => {
    screen.open();
    expect(q(parent, 'profile-status').textContent).toBe('En curso');
    data = profileData({ completed: true });
    screen.open();
    expect(q(parent, 'profile-status').textContent).toBe('Completada');
    tr.setLocale('en');
    expect(q(parent, 'profile-status').textContent).toBe('Completed');
    expect(q(parent, 'profile-grid').textContent).not.toMatch(/%/);
  });

  it('what the hero does not have yet is "ninguna", not a blank and not a zero', () => {
    data = profileData({ abilities: [], cards: [] });
    screen.open();
    expect(q(parent, 'profile-abilities').textContent).toBe('ninguna');
    expect(q(parent, 'profile-cards').textContent).toBe('ninguna');
  });

  it('lists every ability and every card the hero has, by name', () => {
    data = profileData({ abilities: ['ability.dash', 'ability.airDash', 'ability.magicAttack'] });
    screen.open();
    expect(q(parent, 'profile-abilities').textContent).toBe('EsquivaEsquiva aéreaProyectil espiritual');
    expect(q(parent, 'profile-abilities').querySelectorAll('br')).toHaveLength(2);
  });

  it('names the guardians beaten under the count', () => {
    data = profileData({ bosses: { beaten: ['enemy.warden.name'], total: 1 } });
    screen.open();
    expect(q(parent, 'profile-bosses').textContent).toContain('1 de 1');
    expect(q(parent, 'profile-bosses').querySelector('.profile-list')?.textContent).toBe('Custodio de Tinta');
  });

  it('a place the content gave no name to is "ninguna", not a bare key', () => {
    data = profileData({ zoneKey: null });
    screen.open();
    expect(q(parent, 'profile-zone').textContent).toBe('ninguna');
  });

  it('is read from the host every time it opens: what it said before is not kept', () => {
    screen.open();
    expect(q(parent, 'profile-deaths').textContent).toBe('2');
    screen.close();
    data = profileData({ deaths: 9 });
    screen.open();
    expect(q(parent, 'profile-deaths').textContent).toBe('9');
  });

  it('says that everything comes from the game, on this device, and that there is no account', () => {
    screen.open();
    expect(q(parent, 'profile-note').textContent).toBe('Lo que ves aquí sale de tu partida, en este dispositivo. No hay cuenta ni servidor.');
    tr.setLocale('en');
    expect(q(parent, 'profile-note').textContent).toContain('no account and no server');
  });

  it('invents nothing: no level, no score, no percentage of completion', () => {
    screen.open();
    const text = (screen.root.textContent ?? '').toLowerCase();
    for (const word of ['nivel', 'level', 'puntos', 'score', 'completado', 'completion', '%']) expect(text, word).not.toContain(word);
  });

  it('where nothing is saved (a playground) it says so instead of showing numbers', () => {
    data = profileData({ slot: null });
    screen.open();
    expect(q(parent, 'profile-playground').textContent).toBe('Este modo de prueba no guarda un perfil.');
    expect(q(parent, 'profile-grid')).toBeNull();
  });

  it('follows the language, in every line', () => {
    data = profileData({ bosses: { beaten: ['enemy.warden.name'], total: 1 } });
    screen.open();
    tr.setLocale('en');
    expect(screen.root.getAttribute('aria-label')).toBe('Profile');
    expect(q(parent, 'profile-zone').textContent).toBe('Ruins Gate');
    expect(q(parent, 'profile-rooms').textContent).toBe('2 of 4');
    expect(q(parent, 'profile-abilities').textContent).toBe('Dash');
    expect(q(parent, 'profile-grid').textContent).toContain('Time played');
    expect(q(parent, 'profile-back').textContent).toBe('Back');
    expect(screen.root.textContent).not.toMatch(/\b(profile|ability|settings)\.[a-zA-Z]+/);
  });

  it('Back asks the host to leave the screen', () => {
    screen.open();
    q(parent, 'profile-back').click();
    expect(backs).toBe(1);
  });

  it('dispose removes it and its listeners', () => {
    screen.open();
    const back = q(parent, 'profile-back');
    screen.dispose();
    back.click();
    expect(backs).toBe(0);
    expect(parent.querySelector('.troid-settings')).toBeNull();
  });
});
