import { listen } from '@/app/dom';
import type { ProfileData } from '@/app/profile';
import { DisposableStore } from '@/core/lifecycle';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import type { Translator } from '@/i18n/translator';
import { createMenuIcon, type MenuIconId } from './menuIcons';
import { formatClock } from './menuFormat';
import { ensureMenuStyle } from './menuStyle';
import { ProfileScreen } from './ProfileScreen';
import { SavesScreen, type SavesHost } from './SavesScreen';
import { SettingsMenu, type SettingsMenuHost } from './SettingsMenu';

/** The screens of the pause menu: its list, and the four it opens. */
export type PauseScreen = 'main' | 'settings' | 'controls' | 'saves' | 'profile';

/**
 * What the pause menu needs from the game. The screens it opens each have a host of their own (what they read and what they ask for); the menu adds the way back to its list, so none of them has to
 * know it exists.
 */
export interface PauseHost {
  settings: Omit<SettingsMenuHost, 'close'>;
  /** The saved games. `null` where nothing is saved (a playground: `?room=`): the menu offers neither the games nor the profile there. */
  saves: Omit<SavesHost, 'back'> | null;
  /** The data of the game being played, now: the summary beside the list and the profile screen read it each time they are shown. */
  profile(): ProfileData;
  /** Closes the menu and lets the game go on. */
  resume(): void;
}

interface Entry {
  id: Exclude<PauseScreen, 'main'> | 'resume';
  icon: MenuIconId;
  /** The translator key of its name. */
  label: string;
  /** Only where the game saves. */
  needsSaves?: boolean;
}

/** The list, in order: the way back into the game first, then what can be looked at or changed. */
const ENTRIES: readonly Entry[] = [
  { id: 'resume', icon: 'resume', label: 'settings.resume' },
  { id: 'settings', icon: 'settings', label: 'pause.settings' },
  { id: 'controls', icon: 'controls', label: 'pause.controls' },
  { id: 'saves', icon: 'saves', label: 'pause.saves', needsSaves: true },
  { id: 'profile', icon: 'profile', label: 'pause.profile', needsSaves: true },
];

/**
 * THE PAUSE MENU (DOM, docs/PROMPT14-LOG.md): what the game shows while it waits. A short list — Continue, Settings, Controls, Saved games, Profile — beside a card that says where the hero is, for how
 * long they have played and in which saved game; each entry opens a screen of its own, and the way out of every screen is the way back to the list. The game is already stopped when this opens (the loop
 * runs no tick while the menu is up); the menu itself decides nothing, owns no data and no text: every word is a translator key and every choice is the host's.
 *
 * There is no "main menu" and no "quit" here on purpose: a web page has neither a title screen to go back to nor a process to end (the page IS the game; closing the tab is leaving it, and the game is saved
 * when the page is hidden). The screens are built the first time they are opened, so the menu costs nothing until it is used.
 *
 * Keyboard: Tab and Shift+Tab move through the controls of a screen; ↑ ↓ (and Home / End) move through the list; Enter or Space press. Escape — the game's pause key — goes back one screen, and resumes from the list.
 */
export class PauseMenu {
  readonly root: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly title: HTMLElement;
  private readonly entries = new Map<Entry['id'], HTMLButtonElement>();
  private readonly head: HTMLElement;
  private readonly zone: HTMLElement;
  private readonly facts: HTMLElement;
  private readonly screens: { settings?: SettingsMenu; controls?: SettingsMenu; saves?: SavesScreen; profile?: ProfileScreen } = {};
  private current: PauseScreen | null = null;
  /** The entry the player came from, so the focus returns to it. */
  private lastEntry: Entry['id'] = 'resume';

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
    private readonly host: PauseHost,
  ) {
    // its words come with it: a player who never opens the menu never downloads them
    for (const [lang, entries] of Object.entries(MENU_CATALOGS)) translator.extend(lang, entries);
    const doc = parent.ownerDocument;
    ensureMenuStyle(doc);
    this.root = doc.createElement('div');
    this.root.className = 'troid-pausemenu';
    this.root.dataset['testid'] = 'pause-menu';
    this.root.dataset['uiBlock'] = '';
    this.root.dataset['open'] = '0';
    this.root.dataset['screen'] = 'main';
    const frame = doc.createElement('div');
    frame.className = 'pm-frame';
    frame.setAttribute('role', 'dialog');
    frame.setAttribute('aria-modal', 'true');
    const main = doc.createElement('nav');
    main.className = 'pm-main';
    this.title = doc.createElement('h2');
    this.title.className = 'pm-title';
    this.title.dataset['testid'] = 'pause-title';
    main.appendChild(this.title);
    for (const e of ENTRIES) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'pm-entry';
      b.dataset['id'] = e.id;
      b.dataset['testid'] = `pause-${e.id}`;
      if (e.id === 'resume') b.dataset['primary'] = '1';
      const icon = createMenuIcon(doc, e.icon, 22);
      icon.setAttribute('aria-hidden', 'true');
      const label = doc.createElement('span');
      b.append(icon, label);
      listen(this.store, b, 'click', () => this.choose(e.id));
      this.entries.set(e.id, b);
      main.appendChild(b);
    }
    const where = doc.createElement('aside');
    where.className = 'pm-where';
    where.dataset['testid'] = 'pause-where';
    this.head = doc.createElement('div');
    this.head.className = 'pm-where-head';
    this.zone = doc.createElement('div');
    this.zone.className = 'pm-zone';
    this.zone.dataset['testid'] = 'pause-zone';
    this.facts = doc.createElement('dl');
    where.append(this.head, this.zone, this.facts);
    frame.append(main, where);
    this.root.appendChild(frame);
    parent.appendChild(this.root);
    listen(this.store, main, 'keydown', (e) => this.onListKey(e));
    this.refreshTexts();
    this.store.add(translator.changed.subscribe(() => this.refreshTexts()));
  }

  get isOpen(): boolean {
    return this.root.dataset['open'] === '1';
  }

  /** The screen being shown (`null`: the menu is closed). */
  get screen(): PauseScreen | null {
    return this.current;
  }

  /** Shows the menu on its list, with the game as it is NOW. */
  open(): void {
    this.lastEntry = 'resume';
    this.root.dataset['open'] = '1';
    this.show('main');
  }

  /** Hides the menu and every screen of it. */
  close(): void {
    this.hideScreens();
    this.current = null;
    this.root.dataset['open'] = '0';
    (this.root.ownerDocument.activeElement as HTMLElement | null)?.blur?.();
  }

  /**
   * One step back: from a screen to the list. Answers whether it took the step; from the list (or closed) it does nothing and answers false — the caller closes the menu then, which is resuming the game.
   */
  back(): boolean {
    if (this.current === null || this.current === 'main') return false;
    this.show('main');
    return true;
  }

  dispose(): void {
    this.store.dispose();
    for (const s of [this.screens.settings, this.screens.controls, this.screens.saves, this.screens.profile]) s?.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- internals

  private choose(id: Entry['id']): void {
    if (id === 'resume') {
      this.host.resume();
      return;
    }
    this.lastEntry = id;
    this.show(id);
  }

  /** Shows one screen and hides the others; the focus goes to the screen's way out, or — on the list — to the entry the player came from. */
  private show(screen: PauseScreen): void {
    this.hideScreens();
    this.current = screen;
    this.root.dataset['screen'] = screen;
    if (screen === 'main') {
      this.refreshTexts();
      this.entries.get(this.visible(this.lastEntry))?.focus({ preventScroll: true });
      return;
    }
    const back = (): void => void this.show('main');
    if (screen === 'settings' || screen === 'controls') {
      const menu = (this.screens[screen] ??= new SettingsMenu(this.root, this.translator, { ...this.host.settings, close: back }, { screen }));
      menu.open();
    } else if (screen === 'saves') {
      const saves = this.host.saves;
      if (!saves) return this.show('main');
      const view = (this.screens.saves ??= new SavesScreen(this.root, this.translator, { ...saves, back }));
      void view.open();
    } else {
      const profile = (this.screens.profile ??= new ProfileScreen(this.root, this.translator, { profile: () => this.host.profile(), back }));
      profile.open();
    }
  }

  private hideScreens(): void {
    this.screens.settings?.close();
    this.screens.controls?.close();
    this.screens.saves?.close();
    this.screens.profile?.close();
  }

  /** The entry the focus can go to: the one asked for if the list has it, else the way back into the game. */
  private visible(id: Entry['id']): Entry['id'] {
    const b = this.entries.get(id);
    return b && !b.hidden ? id : 'resume';
  }

  private onListKey(e: KeyboardEvent): void {
    if (this.current !== 'main' || e.altKey || e.ctrlKey || e.metaKey) return;
    const shown = ENTRIES.filter((x) => !this.entries.get(x.id)?.hidden);
    const at = shown.findIndex((x) => this.entries.get(x.id) === this.root.ownerDocument.activeElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = at < 0 ? 0 : (at + 1) % shown.length;
    else if (e.key === 'ArrowUp') next = at < 0 ? shown.length - 1 : (at - 1 + shown.length) % shown.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = shown.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = shown[next];
    if (target) this.entries.get(target.id)?.focus({ preventScroll: true });
  }

  /** Every word, from the translator (the language may have changed), and the summary card from the game as it is now. */
  private refreshTexts(): void {
    const t = this.translator;
    const doc = this.root.ownerDocument;
    this.title.textContent = t.t('settings.title');
    this.root.setAttribute('aria-label', t.t('settings.title'));
    this.root.firstElementChild?.setAttribute('aria-label', t.t('settings.title'));
    for (const e of ENTRIES) {
      const b = this.entries.get(e.id);
      if (!b) continue;
      b.hidden = e.needsSaves === true && this.host.saves === null;
      const label = b.lastElementChild;
      if (label) label.textContent = t.t(e.label);
    }
    const p = this.host.profile();
    this.head.textContent = t.t('pause.where');
    this.zone.textContent = p.zoneKey ? t.t(p.zoneKey) : '';
    const rows: Array<[string, string, string]> = [];
    if (p.slot !== null) {
      rows.push(['time', t.t('profile.time'), formatClock(p.ticks)]);
      rows.push(['slot', t.t('profile.slot'), String(p.slot)]);
    }
    this.facts.replaceChildren(
      ...rows.flatMap(([id, name, value]) => {
        const dt = doc.createElement('dt');
        dt.textContent = name;
        const dd = doc.createElement('dd');
        dd.dataset['testid'] = `pause-${id}`;
        dd.textContent = value;
        return [dt, dd];
      }),
    );
  }
}
