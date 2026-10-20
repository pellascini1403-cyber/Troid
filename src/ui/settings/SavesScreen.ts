import { listen } from '@/app/dom';
import { DisposableStore } from '@/core/lifecycle';
import type { Translator } from '@/i18n/translator';
import { formatClock, formatSavedAt } from './menuFormat';
import { ensureMenuStyle } from './menuStyle';

/** One saved game as the screen shows it. */
export interface SlotCardView {
  slot: number;
  /** `empty`, a good game, one `recovered` from its backup, or one that cannot be read (`damaged`). */
  state: 'empty' | 'ok' | 'recovered' | 'damaged';
  /** This is the game being played. */
  active: boolean;
  /** Text key of the zone the game picks up in. */
  zoneKey: string | null;
  /** Simulation ticks lived (60 to the second). */
  ticks: number;
  /** When it was last written (milliseconds since 1970; 0: not known). */
  savedAt: number;
}

export type ImportOutcome = { ok: true } | { ok: false; reason: 'unreadable' | 'tooBig' | 'storage' };

/** A file the player chose: its text, or why it was not read (too big to be a saved game; the browser could not read it). */
export type PickedFile = { kind: 'text'; text: string } | { kind: 'tooBig' } | { kind: 'unreadable' };

/** How a save by hand ended: it reached the storage, it did not, or it was refused because another tab saved this game after this one (this page has stopped saving). */
export type SaveOutcome = 'saved' | 'failed' | 'conflict';

/** What the screen needs of the game, and nothing more: it reads, asks, and the game does it. */
export interface SavesHost {
  cards(): Promise<SlotCardView[]>;
  /** Saves the game being played now. */
  saveNow(): Promise<SaveOutcome>;
  /** Another tab saved this game after this page did, so this page no longer saves (the screen says so, and does not offer a save that cannot happen). */
  conflicted(): boolean;
  switchTo(slot: number): Promise<boolean>;
  startOver(slot: number): Promise<boolean>;
  erase(slot: number): Promise<boolean>;
  exportSlot(slot: number): Promise<{ filename: string; text: string } | null>;
  importInto(slot: number, text: string): Promise<ImportOutcome>;
  /** Hands the text of an exported game to the player (a download). Answers whether the browser took it. */
  download(filename: string, text: string): boolean;
  /** Lets the player choose a file (`null`: none chosen). Called straight from the press, which the browser needs to open its dialog. */
  pickFile(): Promise<PickedFile | null>;
  /** Whether what is saved outlives the page, and whether the browser has promised to keep it (`null`: it does not say). */
  storage(): Promise<{ durable: boolean; persisted: boolean | null }>;
  requestPersistence(): Promise<boolean>;
  /** The way out of this screen: back to the list of the pause menu. */
  back(): void;
}

type Pending = { slot: number; kind: 'delete' | 'new' | 'import'; text?: string };

/**
 * THE SAVED GAMES (DOM, docs/PROMPT14-LOG.md): the three slots with what each holds — the zone it picks up in, the time played, when it was saved — and what can be done with each: play it,
 * start a new game in it, take a copy out, put one in, delete it. It decides nothing and owns no data: every action is the host's, and everything that destroys a game asks first, in the card itself,
 * with what will be lost said plainly. It tells the player what the saves are NOT: they live in this browser, not on every device, and can be cleared with the site's data.
 *
 * Every word is a translator key; the dates are the platform's own, in the language in force.
 */
export class SavesScreen {
  readonly root: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly title: HTMLElement;
  private readonly status: HTMLElement;
  private readonly list: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly back: HTMLButtonElement;
  private cards: SlotCardView[] = [];
  private conflict = false;
  private storageInfo: { durable: boolean; persisted: boolean | null } = { durable: true, persisted: null };
  private expanded: number | null = null;
  private pending: Pending | null = null;
  private message: { key: string; tone: 'info' | 'warn' } | null = null;
  private busy = false;
  private serial = 0;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
    private readonly host: SavesHost,
  ) {
    const doc = parent.ownerDocument;
    ensureMenuStyle(doc);
    this.root = doc.createElement('div');
    this.root.className = 'troid-settings';
    this.root.dataset['testid'] = 'saves-screen';
    this.root.dataset['uiBlock'] = '';
    this.root.dataset['open'] = '0';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    const panel = doc.createElement('div');
    panel.className = 'settings-panel';
    this.title = doc.createElement('h2');
    this.title.className = 'settings-title';
    this.status = doc.createElement('p');
    this.status.className = 'saves-status';
    this.status.dataset['testid'] = 'saves-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.list = doc.createElement('div');
    this.list.className = 'saves-list';
    this.foot = doc.createElement('div');
    this.foot.className = 'saves-foot';
    this.back = doc.createElement('button');
    this.back.type = 'button';
    this.back.className = 'settings-button settings-resume';
    this.back.dataset['testid'] = 'saves-back';
    listen(this.store, this.back, 'click', () => host.back());
    // the title, the line that says what just happened and the way out stay where they are; the games and the notes between them scroll
    const body = doc.createElement('div');
    body.className = 'settings-body';
    body.append(this.list, this.foot);
    panel.append(this.title, this.status, body, this.back);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.refreshTexts();
    this.store.add(translator.changed.subscribe(() => this.render()));
  }

  get isOpen(): boolean {
    return this.root.dataset['open'] === '1';
  }

  /** Shows the screen with the games as they are NOW. */
  async open(): Promise<void> {
    this.expanded = null;
    this.pending = null;
    this.message = null;
    this.cards = []; // what it showed last time may be gone by now: nothing stale is shown while the games are read again
    this.root.dataset['open'] = '1';
    this.root.dataset['ready'] = '0';
    this.root.setAttribute('aria-busy', 'true');
    this.render();
    this.back.focus({ preventScroll: true });
    await this.reload();
  }

  close(): void {
    this.serial++;
    this.root.dataset['open'] = '0';
    this.pending = null;
  }

  dispose(): void {
    this.store.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- reading

  /** Asks the game for the slots and for what the browser says of keeping them (a late answer to an older ask is dropped). */
  private async reload(): Promise<void> {
    const mine = ++this.serial;
    const [cards, storage] = await Promise.all([this.host.cards(), this.host.storage()]);
    if (mine !== this.serial || !this.isOpen) return;
    this.cards = cards;
    this.storageInfo = storage;
    this.conflict = this.host.conflicted();
    this.root.dataset['ready'] = '1';
    this.root.removeAttribute('aria-busy');
    this.render();
  }

  // ----------------------------------------------------------------------------------------------- drawing

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translator.t(key, params);
  }

  private refreshTexts(): void {
    this.title.textContent = this.t('saves.title');
    this.back.textContent = this.t('settings.back');
    this.root.setAttribute('aria-label', this.t('saves.title'));
  }

  /** Draws the screen again from what it holds. The control the keyboard was on is found again afterwards (it is rebuilt, not kept), so a press never throws the focus back to the top of the page. */
  private render(): void {
    this.refreshTexts();
    const doc = this.root.ownerDocument;
    const focused = doc.activeElement;
    const kept = focused instanceof HTMLElement && this.root.contains(focused) ? focused.dataset['testid'] : undefined;
    this.status.textContent = this.message ? this.t(this.message.key) : '';
    this.status.dataset['tone'] = this.message?.tone ?? 'info';
    this.list.replaceChildren(...this.cards.map((c) => this.card(doc, c)));
    this.foot.replaceChildren(...this.footer(doc));
    if (kept && this.focusOn(kept)) return;
    // the control that had the focus is gone because a question took its place: the focus goes to the question's safe answer
    if (kept && this.pending) this.focusOn(`saves-cancel-${this.pending.slot}`);
  }

  /** Puts the focus on the control with this test id, if the screen has it now. */
  private focusOn(testid: string): boolean {
    const target = this.root.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
    if (!target || target.hasAttribute('disabled')) return false;
    target.focus({ preventScroll: true });
    return true;
  }

  private button(doc: Document, key: string, testid: string, onClick: () => void, pressed?: boolean): HTMLButtonElement {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'settings-button';
    b.dataset['testid'] = testid;
    b.textContent = this.t(key);
    b.disabled = this.busy;
    if (pressed !== undefined) b.setAttribute('aria-expanded', pressed ? 'true' : 'false');
    listen(this.store, b, 'click', onClick);
    return b;
  }

  private card(doc: Document, c: SlotCardView): HTMLElement {
    const box = doc.createElement('div');
    box.className = 'saves-card';
    box.dataset['testid'] = `saves-slot-${c.slot}`;
    box.dataset['state'] = c.state;
    box.dataset['active'] = c.active ? '1' : '0';
    const head = doc.createElement('div');
    head.className = 'saves-head';
    const name = doc.createElement('b');
    name.textContent = this.t('saves.slot', { n: c.slot });
    head.appendChild(name);
    if (c.active) {
      const chip = doc.createElement('span');
      chip.className = 'saves-chip';
      chip.textContent = this.t('saves.active');
      head.appendChild(chip);
    }
    const info = doc.createElement('div');
    info.className = 'saves-info';
    info.dataset['testid'] = `saves-info-${c.slot}`;
    if (c.state === 'damaged') {
      info.dataset['tone'] = 'warn';
      info.textContent = this.t('saves.damaged');
    } else if (c.state === 'empty') {
      info.textContent = this.t(c.active ? 'saves.emptyActive' : 'saves.empty');
    } else {
      const when = formatSavedAt(c.savedAt, this.translator.locale);
      const parts = [c.zoneKey ? this.t(c.zoneKey) : '', `${this.t('saves.time')} ${formatClock(c.ticks)}`, `${this.t('saves.savedAt')} ${when === '' ? this.t('saves.unknown') : when}`];
      info.textContent = parts.filter((p) => p !== '').join(' · ');
      if (c.state === 'recovered') {
        const note = doc.createElement('div');
        note.dataset['tone'] = 'warn';
        note.textContent = this.t('saves.recovered');
        info.appendChild(note);
      }
    }
    box.append(head, info);

    const pending = this.pending?.slot === c.slot ? this.pending : null;
    if (pending) {
      box.appendChild(this.confirm(doc, c, pending));
      return box;
    }

    const actions = doc.createElement('div');
    actions.className = 'saves-actions';
    const has = c.state === 'ok' || c.state === 'recovered';
    if (c.active && (has || c.state === 'empty')) {
      // a page that has stopped saving (another tab saved the game after it) offers no save: it would be a button that cannot do what it says; the screen says why, below
      if (!this.conflict) actions.appendChild(this.button(doc, 'saves.saveNow', 'saves-save-now', () => void this.run(() => this.saveNow())));
    } else if (has) actions.appendChild(this.button(doc, 'saves.play', `saves-play-${c.slot}`, () => void this.run(() => this.play(c.slot))));
    else if (c.state === 'empty') actions.appendChild(this.button(doc, 'saves.new', `saves-new-${c.slot}`, () => void this.run(() => this.newGame(c.slot))));
    else actions.appendChild(this.button(doc, 'saves.newHere', `saves-newhere-${c.slot}`, () => this.ask({ slot: c.slot, kind: 'new' })));
    const open = this.expanded === c.slot;
    actions.appendChild(this.button(doc, open ? 'saves.less' : 'saves.more', `saves-more-${c.slot}`, () => this.toggleMore(c.slot), open));
    box.appendChild(actions);

    if (open) {
      const more = doc.createElement('div');
      more.className = 'saves-more';
      if (has) more.appendChild(this.button(doc, 'saves.export', `saves-export-${c.slot}`, () => void this.run(() => this.exportSlot(c.slot))));
      more.appendChild(this.button(doc, 'saves.import', `saves-import-${c.slot}`, () => void this.chooseFile(c, has || c.state === 'damaged')));
      if (has) more.appendChild(this.button(doc, 'saves.newHere', `saves-newhere-${c.slot}`, () => this.ask({ slot: c.slot, kind: 'new' })));
      if (c.state !== 'empty') more.appendChild(this.button(doc, 'saves.delete', `saves-delete-${c.slot}`, () => this.ask({ slot: c.slot, kind: 'delete' })));
      box.appendChild(more);
      if (!c.active && has) {
        const note = doc.createElement('p');
        note.className = 'settings-note';
        note.textContent = this.t('saves.switchNote');
        box.appendChild(note);
      }
    }
    return box;
  }

  /** What is about to be lost, said plainly, with the way back. */
  private confirm(doc: Document, c: SlotCardView, p: Pending): HTMLElement {
    const box = doc.createElement('div');
    box.className = 'saves-confirm';
    box.dataset['testid'] = `saves-confirm-${c.slot}`;
    const text = doc.createElement('p');
    text.dataset['testid'] = `saves-confirm-text-${c.slot}`;
    const key = p.kind === 'delete' ? (c.state === 'damaged' ? 'saves.confirmDeleteDamaged' : 'saves.confirmDelete') : p.kind === 'import' ? 'saves.confirmImport' : 'saves.confirmNew';
    text.textContent = this.t(key, { n: c.slot });
    const row = doc.createElement('div');
    row.className = 'saves-confirm-buttons';
    row.append(
      this.button(doc, 'saves.cancel', `saves-cancel-${c.slot}`, () => this.cancel()),
      this.button(doc, 'saves.confirm', `saves-yes-${c.slot}`, () => void this.run(() => this.doPending(p))),
    );
    box.append(text, row);
    return box;
  }

  private footer(doc: Document): HTMLElement[] {
    const out: HTMLElement[] = [];
    const note = (key: string, testid: string, tone?: 'warn'): HTMLElement => {
      const p = doc.createElement('p');
      p.className = 'settings-note';
      p.dataset['testid'] = testid;
      if (tone) p.dataset['tone'] = tone;
      p.textContent = this.t(key);
      return p;
    };
    if (this.conflict) out.push(note('saves.conflict', 'saves-conflict', 'warn'));
    if (!this.storageInfo.durable) out.push(note('saves.unavailable', 'saves-unavailable', 'warn'));
    out.push(note('saves.where', 'saves-where'), note('saves.auto', 'saves-auto'));
    const s = this.storageInfo;
    if (s.durable && s.persisted !== null) {
      out.push(note(s.persisted ? 'saves.persisted' : 'saves.notPersisted', 'saves-persisted'));
      if (!s.persisted) out.push(this.button(doc, 'saves.persistAsk', 'saves-persist', () => void this.run(() => this.persist())));
    }
    return out;
  }

  // ----------------------------------------------------------------------------------------------- doing

  private toggleMore(slot: number): void {
    this.expanded = this.expanded === slot ? null : slot;
    this.render();
  }

  /** A question is put to the player: the focus goes to its safe answer, so that a key pressed by habit cancels instead of destroying. */
  private ask(p: Pending): void {
    this.pending = p;
    this.render();
    this.focusOn(`saves-cancel-${p.slot}`);
  }

  private cancel(): void {
    const slot = this.pending?.slot;
    this.pending = null;
    this.render();
    if (slot !== undefined) this.focusOn(`saves-more-${slot}`);
  }

  /**
   * One action at a time: the buttons are off while it runs, and the screen is drawn again when it ends. The question an action was answering ends with it; one the action itself raised (a file
   * chosen for a slot that holds a game) stays, for the player to answer.
   */
  private async run(action: () => Promise<{ key: string; tone: 'info' | 'warn' } | null>): Promise<void> {
    if (this.busy) return;
    const answering = this.pending;
    this.busy = true;
    this.render();
    try {
      this.message = await action();
    } catch {
      this.message = { key: 'saves.saveFailed', tone: 'warn' };
    } finally {
      this.busy = false;
    }
    if (this.pending === answering) this.pending = null;
    await this.reload();
    this.render();
  }

  private async saveNow(): Promise<{ key: string; tone: 'info' | 'warn' }> {
    const outcome = await this.host.saveNow();
    if (outcome === 'conflict') return { key: 'saves.conflict', tone: 'warn' };
    return outcome === 'saved' ? { key: 'saves.savedNow', tone: 'info' } : { key: 'saves.saveFailed', tone: 'warn' };
  }

  private async play(slot: number): Promise<{ key: string; tone: 'warn' } | null> {
    return (await this.host.switchTo(slot)) ? null : { key: 'saves.saveFailed', tone: 'warn' };
  }

  private async newGame(slot: number): Promise<{ key: string; tone: 'warn' } | null> {
    return (await this.host.startOver(slot)) ? null : { key: 'saves.saveFailed', tone: 'warn' };
  }

  private async exportSlot(slot: number): Promise<{ key: string; tone: 'info' | 'warn' }> {
    const out = await this.host.exportSlot(slot);
    if (!out) return { key: 'saves.exportNone', tone: 'warn' };
    return this.host.download(out.filename, out.text) ? { key: 'saves.exported', tone: 'info' } : { key: 'saves.exportFailed', tone: 'warn' };
  }

  /**
   * The player pressed Import: the dialog opens straight from the press (the browser requires it) and the screen is NOT held while it is open — a browser that never says it was cancelled would otherwise
   * leave every button off. When a file comes: if there is a game in the slot it asks first, with the file kept until the player answers; otherwise it goes in.
   */
  private async chooseFile(c: SlotCardView, occupied: boolean): Promise<void> {
    if (this.busy) return;
    const mine = this.serial;
    const picked = await this.host.pickFile();
    if (picked === null || !this.isOpen || mine !== this.serial) return; // cancelled, or the screen was left meanwhile
    if (picked.kind !== 'text') {
      this.message = { key: picked.kind === 'tooBig' ? 'saves.importTooBig' : 'saves.importUnreadable', tone: 'warn' };
      this.render();
      return;
    }
    if (occupied) {
      this.message = null;
      this.ask({ slot: c.slot, kind: 'import', text: picked.text });
      return;
    }
    await this.run(() => this.finishImport(c.slot, picked.text));
  }

  private async finishImport(slot: number, text: string): Promise<{ key: string; tone: 'info' | 'warn' }> {
    const r = await this.host.importInto(slot, text);
    if (r.ok) return { key: 'saves.importDone', tone: 'info' };
    return { key: r.reason === 'tooBig' ? 'saves.importTooBig' : r.reason === 'storage' ? 'saves.importStorage' : 'saves.importUnreadable', tone: 'warn' };
  }

  private async doPending(p: Pending): Promise<{ key: string; tone: 'info' | 'warn' } | null> {
    if (p.kind === 'delete') return (await this.host.erase(p.slot)) ? { key: 'saves.deleted', tone: 'info' } : { key: 'saves.saveFailed', tone: 'warn' };
    if (p.kind === 'import') return this.finishImport(p.slot, p.text ?? '');
    return (await this.host.startOver(p.slot)) ? null : { key: 'saves.saveFailed', tone: 'warn' };
  }

  private async persist(): Promise<{ key: string; tone: 'info' | 'warn' }> {
    return (await this.host.requestPersistence()) ? { key: 'saves.persistGranted', tone: 'info' } : { key: 'saves.persistDenied', tone: 'warn' };
  }
}
