import { listen } from '@/app/dom';
import { onPress } from '@/app/press';
import type { ProfileData } from '@/app/profile';
import type { CreditSection } from '@/presentation/credits';
import { DisposableStore } from '@/core/lifecycle';
import type { Translator } from '@/i18n/translator';
import { CREDITS_ROLL, rollOffset } from './creditsRoll';
import { formatClock } from './menuFormat';
import { ensureMenuStyle } from './menuStyle';
import { ScrollHint } from './scrollHint';

/** What the closing needs of the game, and nothing more: what the hero did, what to roll, and the two ways on. */
export interface EndingHost {
  /** The game being played, now (the same numbers as the profile: every one is counted or held by the simulation). */
  profile(): ProfileData;
  credits: readonly CreditSection[];
  /** The credits roll by themselves (a player who asked the system for less motion gets a still list that they scroll). */
  rolls: boolean;
  /** Back into the world, exactly where the hero stands. */
  resume(): void;
  /** The saved games (where a new game is begun). `null` where nothing is saved. */
  saves: (() => void) | null;
  /** The page's frame callbacks (the credits move on them); the browser's by default, a fake in the tests. */
  frames?: { request(cb: (nowMs: number) => void): number; cancel(id: number): void };
  /** The page's clock in milliseconds (`performance.now()` by default): the ways on ignore a press for a moment after the closing opens. */
  now?: () => number;
}

/**
 * The closing opens at the very moment the hero touches the way out, when a keyboard player is likely to be jumping or a thumb tapping: a press in the first instants is the game's, not an answer. Without this the
 * Space of a last jump would press "Keep exploring" and the end of the whole adventure would be gone before it was read.
 */
export const ENDING_GRACE_MS = 700;

/**
 * THE CLOSING OF THE ADVENTURE (DOM, docs/PROMPT20-LOG.md): what the pause menu shows, in the place of the map, when the hero walks out of the world. "The end", what the game counted of the way — the time, the rooms, the
 * guardians, the falls — the credits, and the two ways on: keep exploring (back into the world where the hero stands, the game already saved as completed) or the saved games (where a new game is begun, asking first as
 * it always does). It is the pause menu's, so the world is held, nothing typed or touched reaches the game and the column of options stays at its side.
 *
 * The credits roll by themselves after a moment, at a walking pace, and the first wheel, finger or key stops that for good. It decides nothing and owns no data; every word is a translator key.
 */
export class EndingScreen {
  readonly root: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly title: HTMLElement;
  private readonly lead: HTMLElement;
  private readonly body: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly credits: HTMLElement;
  private readonly keepGoing: HTMLButtonElement;
  private readonly saves: HTMLButtonElement;
  private readonly hint: ScrollHint;
  private readonly frames: NonNullable<EndingHost['frames']>;
  private readonly now: () => number;
  /** Until when a press on a way on is ignored. */
  private armedAt = 0;
  private frame: number | null = null;
  private openedAt = 0;
  private rolling = false;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
    private readonly host: EndingHost,
  ) {
    this.frames = host.frames ?? { request: (cb) => requestAnimationFrame(cb), cancel: (id) => cancelAnimationFrame(id) };
    this.now = host.now ?? (() => performance.now());
    const doc = parent.ownerDocument;
    ensureMenuStyle(doc);
    this.root = doc.createElement('div');
    this.root.className = 'troid-settings';
    this.root.dataset['testid'] = 'ending-screen';
    this.root.dataset['uiBlock'] = '';
    this.root.dataset['open'] = '0';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    const panel = doc.createElement('div');
    panel.className = 'settings-panel ending-panel';
    this.title = doc.createElement('h2');
    this.title.className = 'settings-title ending-title';
    this.title.dataset['testid'] = 'ending-title';
    this.lead = doc.createElement('p');
    this.lead.className = 'ending-lead';
    this.lead.dataset['testid'] = 'ending-lead';
    this.body = doc.createElement('div');
    this.body.className = 'settings-body';
    this.body.dataset['testid'] = 'ending-body';
    this.hint = this.store.add(new ScrollHint(this.body));
    this.stats = doc.createElement('dl');
    this.stats.className = 'profile-grid';
    this.stats.dataset['testid'] = 'ending-stats';
    this.credits = doc.createElement('section');
    this.credits.className = 'ending-credits';
    this.credits.dataset['testid'] = 'ending-credits';
    this.body.append(this.lead, this.stats, this.credits); // (the line under the title scrolls with the rest: on a phone held sideways every pixel of the middle counts)
    const actions = doc.createElement('div');
    actions.className = 'ending-actions';
    this.keepGoing = this.action(doc, 'ending-continue', () => host.resume());
    this.saves = this.action(doc, 'ending-saves', () => host.saves?.());
    this.saves.hidden = host.saves === null;
    actions.append(this.keepGoing, this.saves);
    panel.append(this.title, this.body, actions);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    // the first thing the player does with the credits stops them rolling: they are theirs from then on
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) listen(this.store, this.body, type, () => this.stopRolling(), { passive: true });
    this.render();
    this.store.add(translator.changed.subscribe(() => this.render()));
  }

  get isOpen(): boolean {
    return this.root.dataset['open'] === '1';
  }

  /** Is the credits' own roll going on now? */
  get isRolling(): boolean {
    return this.rolling;
  }

  /** Shows the closing with the game as it is NOW, the credits at their start. */
  open(): void {
    this.render();
    this.body.scrollTop = 0;
    // it fades in (the stylesheet does so only for a player who has not asked the system for less motion)
    this.root.classList.remove('ending-fade');
    void this.root.offsetWidth;
    this.root.classList.add('ending-fade');
    this.root.dataset['open'] = '1';
    this.armedAt = this.now() + ENDING_GRACE_MS;
    this.hint.update(); // it has a size now
    this.keepGoing.focus({ preventScroll: true });
    this.startRolling();
  }

  close(): void {
    this.stopRolling();
    this.root.dataset['open'] = '0';
  }

  dispose(): void {
    this.stopRolling();
    this.store.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- the roll

  private startRolling(): void {
    this.stopRolling();
    if (!this.host.rolls) return;
    this.rolling = true;
    this.openedAt = -1;
    const step = (nowMs: number): void => {
      this.frame = null;
      if (!this.rolling) return;
      if (this.openedAt < 0) this.openedAt = nowMs;
      const max = this.body.scrollHeight - this.body.clientHeight;
      this.body.scrollTop = rollOffset(nowMs - this.openedAt, { ...CREDITS_ROLL, max });
      // the end of the credits is the end of the roll
      if (max > 0 && this.body.scrollTop >= max - 0.5) {
        this.rolling = false;
        return;
      }
      this.frame = this.frames.request(step);
    };
    this.frame = this.frames.request(step);
  }

  private stopRolling(): void {
    this.rolling = false;
    if (this.frame !== null) this.frames.cancel(this.frame);
    this.frame = null;
  }

  // ----------------------------------------------------------------------------------------------- drawing

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translator.t(key, params);
  }

  private action(doc: Document, testid: string, run: () => void): HTMLButtonElement {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'settings-button';
    b.dataset['testid'] = testid;
    onPress(this.store, b, () => {
      if (this.now() >= this.armedAt) run();
    });
    return b;
  }

  private render(): void {
    const doc = this.root.ownerDocument;
    this.title.textContent = this.t('ending.title');
    this.lead.textContent = this.t('ending.lead');
    this.keepGoing.textContent = this.t('ending.continue');
    this.saves.textContent = this.t('ending.saves');
    this.root.setAttribute('aria-label', this.t('ending.title'));
    const p = this.host.profile();
    const none = this.t('profile.none');
    const rows: Array<[string, string, string]> = [
      ['time', 'profile.time', formatClock(p.ticks)],
      ['rooms', 'profile.rooms', this.t('profile.roomsValue', { visited: p.rooms.visited, total: p.rooms.total })],
      ['bosses', 'profile.bosses', p.bosses.total > 0 ? this.t('profile.bossesValue', { beaten: p.bosses.beaten.length, total: p.bosses.total }) : none],
      ['deaths', 'profile.deaths', String(p.deaths)],
      ['kills', 'profile.kills', String(p.kills)],
    ];
    this.stats.replaceChildren(
      ...rows.flatMap(([id, key, value]) => {
        const dt = doc.createElement('dt');
        dt.textContent = this.t(key);
        const dd = doc.createElement('dd');
        dd.dataset['testid'] = `ending-${id}`;
        dd.textContent = value;
        return [dt, dd];
      }),
    );
    const heading = doc.createElement('h3');
    heading.className = 'credits-title';
    heading.textContent = this.t('credits.title');
    const sections = this.host.credits.filter((s) => s.lines.length > 0).map((s) => {
      const section = doc.createElement('div');
      section.className = 'credits-section';
      const h = doc.createElement('h4');
      h.textContent = this.t(s.titleKey);
      const list = doc.createElement('ul');
      list.append(
        ...s.lines.map((line) => {
          const li = doc.createElement('li');
          const name = doc.createElement('span');
          name.className = 'credits-name';
          name.textContent = line.name;
          li.appendChild(name);
          if (line.roleKey) {
            const role = doc.createElement('span');
            role.className = 'credits-role';
            role.textContent = this.t(line.roleKey);
            li.appendChild(role);
          }
          return li;
        }),
      );
      section.append(h, list);
      return section;
    });
    const thanks = doc.createElement('p');
    thanks.className = 'credits-thanks';
    thanks.textContent = this.t('credits.thanks');
    this.credits.replaceChildren(heading, ...sections, thanks);
  }
}
