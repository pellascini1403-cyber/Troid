import { listen } from '@/app/dom';
import type { ProfileData } from '@/app/profile';
import { DisposableStore } from '@/core/lifecycle';
import type { Translator } from '@/i18n/translator';
import { formatClock } from './menuFormat';
import { ensureMenuStyle } from './menuStyle';
import { ScrollHint } from './scrollHint';

/** What the profile needs of the game: the data of the game being played, now, and the way out. */
export interface ProfileHost {
  profile(): ProfileData;
  /** The way out of this screen: back to the list of the pause menu. */
  back(): void;
}

/**
 * THE PROFILE (DOM, docs/PROMPT14-LOG.md): what the game being played has to say of the hero, and nothing it cannot back up — the time played, where they are, how many rooms of the world they have been
 * in, what they can do, what they carry, the guardians they have beaten, how many times they fell and how many enemies fell to them. Every line is a number the simulation holds or the game counted
 * from its events (`PlayStats`); there is no level, no score and no percentage of "completion" because the game has nothing to compute them from — but whether the adventure has been taken to its end is a fact the world remembers, and it is shown. It is read every time the screen opens: nothing moves
 * while the game waits.
 *
 * Every word is a translator key. It owns no data and decides nothing.
 */
export class ProfileScreen {
  readonly root: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly hint: ScrollHint;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
    private readonly host: ProfileHost,
  ) {
    const doc = parent.ownerDocument;
    ensureMenuStyle(doc);
    this.root = doc.createElement('div');
    this.root.className = 'troid-settings';
    this.root.dataset['testid'] = 'profile-screen';
    this.root.dataset['uiBlock'] = '';
    this.root.dataset['open'] = '0';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    const panel = doc.createElement('div');
    panel.className = 'settings-panel';
    this.title = doc.createElement('h2');
    this.title.className = 'settings-title';
    this.body = doc.createElement('div');
    this.body.className = 'settings-body';
    this.hint = this.store.add(new ScrollHint(this.body));
    this.back = doc.createElement('button');
    this.back.type = 'button';
    this.back.className = 'settings-button settings-resume';
    this.back.dataset['testid'] = 'profile-back';
    listen(this.store, this.back, 'click', () => host.back());
    panel.append(this.title, this.body, this.back);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.render();
    this.store.add(translator.changed.subscribe(() => this.render()));
  }

  get isOpen(): boolean {
    return this.root.dataset['open'] === '1';
  }

  /** Shows the profile with the game as it is NOW. */
  open(): void {
    this.render();
    this.root.dataset['open'] = '1';
    this.hint.update(); // it has a size now
    this.back.focus({ preventScroll: true });
  }

  close(): void {
    this.root.dataset['open'] = '0';
  }

  dispose(): void {
    this.store.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- drawing

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translator.t(key, params);
  }

  private render(): void {
    const doc = this.root.ownerDocument;
    this.title.textContent = this.t('profile.title');
    this.back.textContent = this.t('settings.back');
    this.root.setAttribute('aria-label', this.t('profile.title'));
    const p = this.host.profile();
    const out: HTMLElement[] = [];
    if (p.slot === null) {
      out.push(this.note(doc, this.t('profile.playground'), 'profile-playground'));
    } else {
      const grid = doc.createElement('dl');
      grid.className = 'profile-grid';
      grid.dataset['testid'] = 'profile-grid';
      const row = (id: string, key: string, value: string | string[], names?: string[]): void => {
        const dt = doc.createElement('dt');
        dt.textContent = this.t(key);
        const dd = doc.createElement('dd');
        dd.dataset['testid'] = `profile-${id}`;
        if (typeof value === 'string') dd.textContent = value;
        else dd.append(...value.flatMap((v, i) => (i === 0 ? [doc.createTextNode(v)] : [doc.createElement('br'), doc.createTextNode(v)])));
        if (names && names.length > 0) {
          const list = doc.createElement('span');
          list.className = 'profile-list';
          list.append(...names.flatMap((v, i) => (i === 0 ? [doc.createTextNode(v)] : [doc.createElement('br'), doc.createTextNode(v)])));
          dd.append(doc.createElement('br'), list);
        }
        grid.append(dt, dd);
      };
      const none = this.t('profile.none');
      const named = (keys: readonly string[]): string[] => keys.map((k) => this.t(k));
      row('slot', 'profile.slot', String(p.slot));
      row('status', 'profile.status', this.t(p.completed ? 'profile.statusDone' : 'profile.statusPlaying'));
      row('time', 'profile.time', formatClock(p.ticks));
      row('zone', 'profile.zone', p.zoneKey ? this.t(p.zoneKey) : none);
      row('rooms', 'profile.rooms', this.t('profile.roomsValue', { visited: p.rooms.visited, total: p.rooms.total }));
      row('abilities', 'profile.abilities', p.abilities.length > 0 ? named(p.abilities) : none);
      row('cards', 'profile.cards', p.cards.length > 0 ? named(p.cards) : none);
      row('bottles', 'profile.bottles', this.t('profile.bottlesValue', { slots: p.bottles.slots, max: p.bottles.max }));
      row('bosses', 'profile.bosses', this.t('profile.bossesValue', { beaten: p.bosses.beaten.length, total: p.bosses.total }), named(p.bosses.beaten));
      row('life', 'profile.life', String(p.lifeMax));
      row('deaths', 'profile.deaths', String(p.deaths));
      row('kills', 'profile.kills', String(p.kills));
      out.push(grid, this.note(doc, this.t('profile.note'), 'profile-note'));
    }
    this.body.replaceChildren(...out);
  }

  private note(doc: Document, text: string, testid: string): HTMLElement {
    const n = doc.createElement('p');
    n.className = 'settings-note';
    n.dataset['testid'] = testid;
    n.textContent = text;
    return n;
  }
}
