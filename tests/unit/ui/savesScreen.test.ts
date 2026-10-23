// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import { SavesScreen } from '@/ui/settings/SavesScreen';
import { stubScrollLayout } from '../../helpers/layout';
import { savesProbe, slotCard, type SavesProbe } from '../../helpers/pauseHost';

/**
 * THE SAVED GAMES SCREEN (docs/PROMPT14-LOG.md): the three slots with what each holds, and what can be done with each — play it, start over, take a copy out, put one in, delete it. It decides nothing:
 * every action is the host's, everything that destroys a game asks first (in the card itself, with the focus on the safe answer), and it is honest about what the saves are not.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;
/** Lets every chained promise of the screen finish (an action awaits the host, then reloads the cards, then draws). */
const idle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe('the saved games screen', () => {
  let parent: HTMLDivElement;
  let screen: SavesScreen;
  let probe: SavesProbe;
  let backs: number;
  const tr = createTranslator(CATALOGS, 'es');
  for (const [lang, entries] of Object.entries(MENU_CATALOGS)) tr.extend(lang, entries);

  const make = (): void => {
    screen?.dispose();
    screen = new SavesScreen(parent, tr, { ...probe.host, back: () => void backs++ });
  };
  const open = async (): Promise<void> => {
    await screen.open();
    await idle();
  };
  const click = async (id: string): Promise<void> => {
    q(parent, id).click();
    await idle();
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    parent = document.createElement('div');
    document.body.appendChild(parent);
    tr.setLocale('es');
    probe = savesProbe();
    backs = 0;
    make();
  });
  afterEach(() => {
    screen.dispose();
    tr.setLocale('es');
  });

  it('is closed until it is opened, and a dialog for the screen reader that the game\'s input leaves alone', async () => {
    expect(screen.isOpen).toBe(false);
    expect(screen.root.getAttribute('role')).toBe('dialog');
    expect(screen.root.getAttribute('aria-modal')).toBe('true');
    expect(screen.root.hasAttribute('data-ui-block')).toBe(true);
    await open();
    expect(screen.isOpen).toBe(true);
    expect(q(parent, 'saves-screen').querySelector('.settings-title')?.textContent).toBe('Partidas');
  });

  it('its middle scrolls and says so: the scroll area tells the stylesheet whether there is more below, looked at when the screen opens and again when the games are drawn', async () => {
    const body = q(parent, 'saves-screen').querySelector('.settings-body') as HTMLElement;
    expect(body.dataset['more']).toBe('0');
    stubScrollLayout(body, { scroll: 790, client: 278 });
    await open();
    expect(body.dataset['more']).toBe('1');
  });

  it('asks the host for the games every time it opens, and shows the three slots', async () => {
    await open();
    expect([1, 2, 3].map((n) => q(parent, `saves-slot-${n}`).dataset['state'])).toEqual(['ok', 'empty', 'empty']);
    expect(q(parent, 'saves-slot-1').dataset['active']).toBe('1');
    expect(q(parent, 'saves-slot-2').dataset['active']).toBe('0');
    probe.cards = [slotCard(1), slotCard(2, { state: 'ok', zoneKey: 'room.r3.name', ticks: 60 * 7200 }), slotCard(3, { state: 'damaged' })];
    screen.close();
    await open();
    expect([1, 2, 3].map((n) => q(parent, `saves-slot-${n}`).dataset['state'])).toEqual(['empty', 'ok', 'damaged']);
  });

  it('opening puts the focus on the way back', async () => {
    await open();
    expect(document.activeElement).toBe(q(parent, 'saves-back'));
    await click('saves-back');
    expect(backs).toBe(1);
  });

  describe('what each card says', () => {
    it('a good game: the zone, the time played and when it was saved, in the language in force', async () => {
      await open();
      const info = q(parent, 'saves-info-1').textContent ?? '';
      expect(info).toContain('Puerta de las Ruinas');
      expect(info).toContain('Tiempo 1:23');
      expect(info).toContain('Guardada');
      expect(info).toMatch(/2026/);
      tr.setLocale('en');
      expect(q(parent, 'saves-info-1').textContent).toContain('Ruins Gate');
      expect(q(parent, 'saves-info-1').textContent).toContain('Time 1:23');
    });

    it('a game with no date says so instead of inventing one', async () => {
      probe.cards = [slotCard(1, { state: 'ok', active: true, zoneKey: 'room.r1.name', ticks: 120, savedAt: 0 }), slotCard(2), slotCard(3)];
      await open();
      expect(q(parent, 'saves-info-1').textContent).toContain('sin fecha');
    });

    it('an empty slot says it is empty; the one being played, that it is a new game not saved yet', async () => {
      probe.cards = [slotCard(1, { active: true }), slotCard(2), slotCard(3)];
      await open();
      expect(q(parent, 'saves-info-1').textContent).toBe('Partida nueva, todavía sin guardar');
      expect(q(parent, 'saves-info-2').textContent).toBe('Vacía');
    });

    it('a game recovered from its backup says so, in the warning tone', async () => {
      probe.cards = [slotCard(1, { state: 'recovered', zoneKey: 'room.r1.name', ticks: 60 }), slotCard(2), slotCard(3)];
      await open();
      expect(q(parent, 'saves-info-1').textContent).toContain('Se recuperó de la copia anterior');
      expect(q(parent, 'saves-info-1').querySelector('[data-tone="warn"]')).toBeTruthy();
    });

    it('a game that cannot be read says so and that a copy is kept — it is never shown as empty', async () => {
      probe.cards = [slotCard(1), slotCard(2, { state: 'damaged' }), slotCard(3)];
      await open();
      expect(q(parent, 'saves-info-2').textContent).toBe('No se puede leer. Se conserva una copia por si se puede recuperar.');
      expect(q(parent, 'saves-info-2').dataset['tone']).toBe('warn');
      expect(q(parent, 'saves-slot-2').dataset['state']).toBe('damaged');
    });

    it('a game that was taken to the end of the adventure says so (a chip, in the language in force) — and one that was not, does not; an empty or damaged slot never claims it', async () => {
      probe.cards = [slotCard(1, { state: 'ok', active: true, zoneKey: 'room.r4.name', ticks: 600, savedAt: 1, completed: true }), slotCard(2, { state: 'ok', zoneKey: 'room.r1.name', ticks: 60, savedAt: 2 }), slotCard(3, { state: 'damaged', completed: true })];
      await open();
      const chips = (n: number): string[] => [...q(parent, `saves-slot-${n}`).querySelectorAll('.saves-chip')].map((c) => (c as HTMLElement).dataset['kind']!);
      expect(chips(1)).toEqual(['completed', 'active']);
      expect(q(parent, 'saves-slot-1').querySelector('.saves-chip[data-kind="completed"]')?.textContent).toBe('Completada');
      expect(chips(2)).toEqual([]);
      expect(chips(3)).toEqual([]);
      tr.setLocale('en');
      expect(q(parent, 'saves-slot-1').querySelector('.saves-chip[data-kind="completed"]')?.textContent).toBe('Completed');
    });

    it('marks the game being played', async () => {
      await open();
      expect(q(parent, 'saves-slot-1').textContent).toContain('En curso');
      expect(q(parent, 'saves-slot-2').textContent).not.toContain('En curso');
    });
  });

  describe('what can be done', () => {
    beforeEach(() => {
      probe.cards = [slotCard(1, { state: 'ok', active: true, zoneKey: 'room.r1.name', ticks: 600, savedAt: 1 }), slotCard(2, { state: 'ok', zoneKey: 'room.r3.name', ticks: 1200, savedAt: 2 }), slotCard(3)];
    });

    it('the game being played is saved by hand, and the host says whether it reached the storage', async () => {
      await open();
      await click('saves-save-now');
      expect(probe.calls).toEqual(['saveNow']);
      expect(q(parent, 'saves-status').textContent).toBe('Partida guardada.');
      expect(q(parent, 'saves-status').dataset['tone']).toBe('info');
      probe.answers.saveNow = 'failed';
      await click('saves-save-now');
      expect(q(parent, 'saves-status').textContent).toBe('No se pudo guardar.');
      expect(q(parent, 'saves-status').dataset['tone']).toBe('warn');
    });

    it('a save refused because another tab saved this game after this one says exactly that, not that the storage failed — and the screen keeps saying it and stops offering a save that cannot happen', async () => {
      probe.answers.saveNow = 'conflict';
      await open();
      await click('saves-save-now');
      expect(q(parent, 'saves-status').textContent).toBe('Otra pestaña guardó esta partida después que esta. Esta pestaña ya no guarda, para no pisar lo de la otra: recarga la página para seguir desde lo último que se guardó.');
      expect(q(parent, 'saves-status').dataset['tone']).toBe('warn');
      expect(q(parent, 'saves-conflict').dataset['tone'], 'and the screen keeps saying it, below').toBe('warn');
      expect(q(parent, 'saves-save-now'), 'there is nothing to press that cannot do what it says').toBeNull();
    });

    it('a page that has already stopped saving for that reason says so the moment the screen opens, without being asked to save, and offers no save', async () => {
      probe.answers.conflicted = true;
      await open();
      expect(q(parent, 'saves-conflict').textContent).toContain('Otra pestaña guardó esta partida');
      expect(q(parent, 'saves-save-now')).toBeNull();
      expect(q(parent, 'saves-more-1'), 'the options (a copy out, a game in) are still there').toBeTruthy();
      probe.answers.conflicted = false;
      screen.close();
      await open();
      expect(q(parent, 'saves-conflict')).toBeNull();
      expect(q(parent, 'saves-save-now')).toBeTruthy();
    });

    it('another game is played with one press — nothing is lost by it, the game left is saved first by the host', async () => {
      await open();
      await click('saves-play-2');
      expect(probe.calls).toEqual(['switchTo:2']);
    });

    it('an empty slot starts a new game at once (there is nothing there to lose)', async () => {
      await open();
      await click('saves-new-3');
      expect(probe.calls).toEqual(['startOver:3']);
      expect(q(parent, 'saves-confirm-3')).toBeNull();
    });

    it('a failed switch says so and changes nothing', async () => {
      probe.answers.switchTo = false;
      await open();
      await click('saves-play-2');
      expect(q(parent, 'saves-status').textContent).toBe('No se pudo guardar.');
    });

    it('the options of a card are folded away until asked for, and open one at a time', async () => {
      await open();
      expect(q(parent, 'saves-export-2')).toBeNull();
      await click('saves-more-2');
      expect(q(parent, 'saves-export-2')).toBeTruthy();
      expect(q(parent, 'saves-more-2').getAttribute('aria-expanded')).toBe('true');
      await click('saves-more-1');
      expect(q(parent, 'saves-export-2')).toBeNull();
      expect(q(parent, 'saves-export-1')).toBeTruthy();
      await click('saves-more-1');
      expect(q(parent, 'saves-export-1')).toBeNull();
    });

    it('a game that is not being played says that it is saved as it stands before changing', async () => {
      await open();
      await click('saves-more-2');
      expect(q(parent, 'saves-slot-2').textContent).toContain('se guarda tal como está antes de cambiar');
    });

    it('an empty slot offers to put a game in, and nothing to take out or delete', async () => {
      await open();
      await click('saves-more-3');
      expect(q(parent, 'saves-import-3')).toBeTruthy();
      expect(q(parent, 'saves-export-3')).toBeNull();
      expect(q(parent, 'saves-delete-3')).toBeNull();
    });

    it('buttons are off while an action runs, and a second press during it is ignored', async () => {
      let release: (v: 'saved') => void = () => undefined;
      probe.host.saveNow = () => new Promise<'saved'>((resolve) => void (release = resolve));
      make();
      await open();
      q(parent, 'saves-save-now').click();
      await idle();
      expect(q(parent, 'saves-save-now').hasAttribute('disabled')).toBe(true);
      q(parent, 'saves-save-now').click();
      release('saved');
      await idle();
      expect(q(parent, 'saves-status').textContent).toBe('Partida guardada.');
      expect(q(parent, 'saves-save-now').hasAttribute('disabled')).toBe(false);
    });

    it('a host that throws is a failure the player is told about, not a frozen screen', async () => {
      probe.host.saveNow = async () => {
        throw new Error('boom');
      };
      make();
      await open();
      await click('saves-save-now');
      expect(q(parent, 'saves-status').textContent).toBe('No se pudo guardar.');
      expect(q(parent, 'saves-save-now').hasAttribute('disabled')).toBe(false);
    });
  });

  describe('everything that destroys a game asks first, in the card, and the focus goes to the safe answer', () => {
    beforeEach(() => {
      probe.cards = [slotCard(1, { state: 'ok', active: true, zoneKey: 'room.r1.name', ticks: 600, savedAt: 1 }), slotCard(2, { state: 'ok', zoneKey: 'room.r3.name', ticks: 1200, savedAt: 2 }), slotCard(3, { state: 'damaged' })];
    });

    it('Delete asks, says what will be lost, and does nothing until the player agrees', async () => {
      await open();
      await click('saves-more-2');
      await click('saves-delete-2');
      expect(probe.calls).toEqual([]);
      expect(q(parent, 'saves-confirm-text-2').textContent).toBe('¿Borrar la partida 2? No se puede deshacer.');
      expect(document.activeElement, 'the safe answer has the focus').toBe(q(parent, 'saves-cancel-2'));
      await click('saves-yes-2');
      expect(probe.calls).toEqual(['erase:2']);
      expect(q(parent, 'saves-status').textContent).toBe('Partida borrada.');
      expect(q(parent, 'saves-confirm-2')).toBeNull();
    });

    it('Cancel drops the question and returns the focus to the options', async () => {
      await open();
      await click('saves-more-2');
      await click('saves-delete-2');
      await click('saves-cancel-2');
      expect(probe.calls).toEqual([]);
      expect(q(parent, 'saves-confirm-2')).toBeNull();
      expect(document.activeElement).toBe(q(parent, 'saves-more-2'));
    });

    it('a copy that cannot be read is named in the question: deleting it deletes the kept copy too', async () => {
      await open();
      await click('saves-more-3');
      await click('saves-delete-3');
      expect(q(parent, 'saves-confirm-text-3').textContent).toContain('copia dañada');
    });

    it('starting over in a slot that holds a game asks; the answer starts it', async () => {
      await open();
      await click('saves-more-2');
      await click('saves-newhere-2');
      expect(probe.calls).toEqual([]);
      expect(q(parent, 'saves-confirm-text-2').textContent).toBe('Esto sustituye la partida 2 por una nueva. No se puede deshacer.');
      await click('saves-yes-2');
      expect(probe.calls).toEqual(['startOver:2']);
    });

    it('a damaged slot is never started over without asking (the unreadable copy is all there is of it)', async () => {
      await open();
      await click('saves-newhere-3');
      expect(probe.calls).toEqual([]);
      expect(q(parent, 'saves-confirm-3')).toBeTruthy();
    });

    it('only one question at a time: asking about another game replaces it', async () => {
      await open();
      await click('saves-more-2');
      await click('saves-delete-2');
      await click('saves-more-1');
      await click('saves-delete-1');
      expect(q(parent, 'saves-confirm-1')).toBeTruthy();
      expect(q(parent, 'saves-confirm-2')).toBeNull();
    });

    it('leaving the screen forgets the question', async () => {
      await open();
      await click('saves-more-2');
      await click('saves-delete-2');
      screen.close();
      await open();
      expect(q(parent, 'saves-confirm-2')).toBeNull();
    });

    it('a failed delete is said, and the game is still there', async () => {
      probe.answers.erase = false;
      await open();
      await click('saves-more-2');
      await click('saves-delete-2');
      await click('saves-yes-2');
      expect(q(parent, 'saves-status').textContent).toBe('No se pudo guardar.');
      expect(q(parent, 'saves-slot-2').dataset['state']).toBe('ok');
    });
  });

  describe('taking a copy out', () => {
    beforeEach(() => {
      probe.cards = [slotCard(1, { state: 'ok', active: true, zoneKey: 'room.r1.name', ticks: 600, savedAt: 1 }), slotCard(2), slotCard(3)];
    });

    it('asks the host for the text, hands it to the browser as a file, and says so', async () => {
      await open();
      await click('saves-more-1');
      await click('saves-export-1');
      expect(probe.calls).toEqual(['export:1', 'download:troid-partida-1-2026-10-19.json:{"saveVersion":2}']);
      expect(q(parent, 'saves-status').textContent).toBe('Copia exportada.');
    });

    it('says when there is nothing readable to take out, and when the browser did not take the file', async () => {
      probe.answers.export = null;
      await open();
      await click('saves-more-1');
      await click('saves-export-1');
      expect(q(parent, 'saves-status').textContent).toBe('No hay una partida legible que exportar.');
      probe.answers.export = { filename: 'x.json', text: '{}' };
      probe.answers.download = false;
      await click('saves-export-1');
      expect(q(parent, 'saves-status').textContent).toBe('No se pudo crear el archivo.');
    });
  });

  describe('putting a copy in', () => {
    beforeEach(() => {
      probe.cards = [slotCard(1, { state: 'ok', active: true, zoneKey: 'room.r1.name', ticks: 600, savedAt: 1 }), slotCard(2), slotCard(3, { state: 'damaged' })];
    });

    it('into an empty slot goes in at once: there is nothing to lose', async () => {
      await open();
      await click('saves-more-2');
      await click('saves-import-2');
      expect(probe.calls).toEqual(['pickFile', 'import:2:{"saveVersion":2}']);
      expect(q(parent, 'saves-status').textContent).toBe('Partida importada.');
    });

    it('into a slot that holds a game asks first, KEEPS the file meanwhile, and imports it only if the player agrees', async () => {
      await open();
      await click('saves-more-1');
      await click('saves-import-1');
      expect(probe.calls).toEqual(['pickFile']);
      expect(q(parent, 'saves-confirm-text-1').textContent).toBe('Esto sustituye la partida 1 por el archivo elegido. No se puede deshacer.');
      expect(document.activeElement).toBe(q(parent, 'saves-cancel-1'));
      await click('saves-yes-1');
      expect(probe.calls).toEqual(['pickFile', 'import:1:{"saveVersion":2}']);
    });

    it('declining the question imports nothing', async () => {
      await open();
      await click('saves-more-1');
      await click('saves-import-1');
      await click('saves-cancel-1');
      expect(probe.calls).toEqual(['pickFile']);
    });

    it('into a damaged slot also asks (what is there is all there is of that game)', async () => {
      await open();
      await click('saves-more-3');
      await click('saves-import-3');
      expect(q(parent, 'saves-confirm-3')).toBeTruthy();
    });

    it('a dialog that was cancelled does nothing, and leaves the screen usable', async () => {
      probe.answers.picked = null;
      await open();
      await click('saves-more-2');
      await click('saves-import-2');
      expect(probe.calls).toEqual(['pickFile']);
      expect(q(parent, 'saves-status').textContent).toBe('');
      expect(q(parent, 'saves-save-now').hasAttribute('disabled')).toBe(false);
    });

    it('a dialog that never answers does not hold the screen: nothing is busy while it waits', async () => {
      probe.host.pickFile = () => new Promise(() => undefined);
      make();
      await open();
      await click('saves-more-2');
      q(parent, 'saves-import-2').click();
      await idle();
      expect(q(parent, 'saves-save-now').hasAttribute('disabled')).toBe(false);
      expect(q(parent, 'saves-more-2').hasAttribute('disabled')).toBe(false);
    });

    it('a file that is too big, or that the browser could not read, is refused with the reason, and nothing is imported', async () => {
      probe.answers.picked = { kind: 'tooBig' };
      await open();
      await click('saves-more-2');
      await click('saves-import-2');
      expect(q(parent, 'saves-status').textContent).toBe('Ese archivo es demasiado grande para ser una partida.');
      probe.answers.picked = { kind: 'unreadable' };
      await click('saves-import-2');
      expect(q(parent, 'saves-status').textContent).toBe('Ese archivo no es una partida de este juego.');
      expect(probe.calls.filter((c) => c.startsWith('import'))).toEqual([]);
    });

    it('what the host refuses is said with its reason: not a game of this one, too big, or the storage would not take it', async () => {
      await open();
      await click('saves-more-2');
      probe.answers.import = { ok: false, reason: 'unreadable' };
      await click('saves-import-2');
      expect(q(parent, 'saves-status').textContent).toBe('Ese archivo no es una partida de este juego.');
      probe.answers.import = { ok: false, reason: 'tooBig' };
      await click('saves-import-2');
      expect(q(parent, 'saves-status').textContent).toBe('Ese archivo es demasiado grande para ser una partida.');
      probe.answers.import = { ok: false, reason: 'storage' };
      await click('saves-import-2');
      expect(q(parent, 'saves-status').textContent).toBe('No se pudo guardar la partida importada.');
    });

    it('a file chosen after the screen was left is dropped', async () => {
      let give: (p: { kind: 'text'; text: string }) => void = () => undefined;
      probe.host.pickFile = () => new Promise((resolve) => void (give = resolve));
      make();
      await open();
      await click('saves-more-2');
      q(parent, 'saves-import-2').click();
      await idle();
      screen.close();
      give({ kind: 'text', text: '{}' });
      await idle();
      expect(probe.calls.filter((c) => c.startsWith('import'))).toEqual([]);
    });
  });

  describe('what the saves are NOT: said plainly', () => {
    it('they live in this browser, are not synced, and can be lost — in both languages', async () => {
      await open();
      expect(q(parent, 'saves-where').textContent).toContain('en este navegador');
      expect(q(parent, 'saves-where').textContent).toContain('No se sincronizan');
      expect(q(parent, 'saves-auto').textContent).toContain('se guarda sola');
      tr.setLocale('en');
      expect(q(parent, 'saves-where').textContent).toContain('not synced');
    });

    it('a browser that keeps nothing says the progress will be lost with the page', async () => {
      probe.answers.storage = { durable: false, persisted: null };
      await open();
      expect(q(parent, 'saves-unavailable').textContent).toContain('se perderá al cerrar la página');
      expect(q(parent, 'saves-unavailable').dataset['tone']).toBe('warn');
    });

    it('no word about protection when the browser does not say; with it, either the promise or the offer to ask for it', async () => {
      await open();
      expect(q(parent, 'saves-persisted')).toBeNull();
      expect(q(parent, 'saves-persist')).toBeNull();
      probe.answers.storage = { durable: true, persisted: true };
      screen.close();
      await open();
      expect(q(parent, 'saves-persisted').textContent).toContain('ha prometido');
      expect(q(parent, 'saves-persist')).toBeNull();
      probe.answers.storage = { durable: true, persisted: false };
      screen.close();
      await open();
      expect(q(parent, 'saves-persisted').textContent).toContain('puede borrarlas');
      expect(q(parent, 'saves-persist')).toBeTruthy();
    });

    it('asking the browser to protect them is a button, and the answer is told as it is (never promised)', async () => {
      probe.answers.storage = { durable: true, persisted: false };
      await open();
      await click('saves-persist');
      expect(probe.calls).toEqual(['persist']);
      expect(q(parent, 'saves-status').textContent).toBe('El navegador las protege ahora.');
      probe.answers.persistence = false;
      await click('saves-persist');
      expect(q(parent, 'saves-status').textContent).toBe('El navegador no ha concedido la protección.');
    });
  });

  it('a late answer to an older ask is dropped (the screen was closed meanwhile)', async () => {
    let give: (c: ReturnType<typeof slotCard>[]) => void = () => undefined;
    probe.host.cards = () => new Promise((resolve) => void (give = resolve));
    make();
    const opening = screen.open();
    screen.close();
    give([slotCard(1, { state: 'ok', zoneKey: 'room.r1.name' }), slotCard(2), slotCard(3)]);
    await opening;
    await idle();
    expect(q(parent, 'saves-slot-1')).toBeNull();
  });

  it('a host that cannot read the games (the code for it could not be fetched) is a message, not a screen that shows nothing and is silent — and the way back still works', async () => {
    probe.host.cards = () => Promise.reject(new Error('Failed to fetch dynamically imported module'));
    make();
    await open();
    expect(screen.root.dataset['ready']).toBe('1');
    expect(q(parent, 'saves-status').textContent).toBe('No se pudieron leer las partidas. Vuelve a abrir esta pantalla; si sigue igual, recarga la página.');
    expect(q(parent, 'saves-status').dataset['tone']).toBe('warn');
    expect(q(parent, 'saves-slot-1')).toBeNull();
    await click('saves-back');
    expect(backs).toBe(1);
  });

  it('opening the screen again asks again: what could not be read once can be the next time', async () => {
    let healthy = false;
    const working = probe.host.cards;
    probe.host.cards = () => (healthy ? working() : Promise.reject(new Error('could not read')));
    make();
    await open();
    expect(q(parent, 'saves-slot-1')).toBeNull();
    screen.close();
    healthy = true;
    await open();
    expect([1, 2, 3].map((n) => q(parent, `saves-slot-${n}`).dataset['state'])).toEqual(['ok', 'empty', 'empty']);
    expect(q(parent, 'saves-status').textContent, 'the message of the failed ask is gone').toBe('');
  });

  it('when the games cannot be read it still says what the page knows of itself: another tab holds the game, and this page has stopped saving', async () => {
    probe.answers.conflicted = true;
    probe.host.cards = () => Promise.reject(new Error('Failed to fetch dynamically imported module'));
    make();
    await open();
    expect(q(parent, 'saves-status').dataset['tone']).toBe('warn');
    expect(q(parent, 'saves-conflict').textContent).toContain('Otra pestaña guardó esta partida');
  });

  it('shows no game while it reads them again (a game deleted since the last time is never shown), and says when it is ready', async () => {
    let impl = probe.host.cards;
    screen.dispose();
    screen = new SavesScreen(parent, tr, { ...probe.host, cards: () => impl(), back: () => void backs++ });
    await open();
    expect(screen.root.dataset['ready']).toBe('1');
    expect(screen.root.hasAttribute('aria-busy')).toBe(false);
    expect(q(parent, 'saves-slot-1')).toBeTruthy();
    screen.close();
    let give: (c: ReturnType<typeof slotCard>[]) => void = () => undefined;
    impl = () => new Promise((resolve) => void (give = resolve));
    const opening = screen.open();
    expect(screen.root.dataset['ready']).toBe('0');
    expect(screen.root.getAttribute('aria-busy')).toBe('true');
    expect(q(parent, 'saves-slot-1'), 'nothing of the last time is shown').toBeNull();
    give([slotCard(1), slotCard(2), slotCard(3)]);
    await opening;
    await idle();
    expect(screen.root.dataset['ready']).toBe('1');
    expect(q(parent, 'saves-slot-1').dataset['state']).toBe('empty');
  });

  it('keeps the control the keyboard was on after drawing again (a press never throws the focus to the top of the page)', async () => {
    probe.cards = [slotCard(1, { state: 'ok', active: true, zoneKey: 'room.r1.name', ticks: 60, savedAt: 1 }), slotCard(2), slotCard(3)];
    await open();
    q(parent, 'saves-more-2').focus();
    await click('saves-more-2');
    expect(document.activeElement).toBe(q(parent, 'saves-more-2'));
    expect(q(parent, 'saves-more-2').getAttribute('aria-expanded')).toBe('true');
  });

  it('follows the language: every word is a translator key', async () => {
    await open();
    tr.setLocale('en');
    expect(q(parent, 'saves-screen').querySelector('.settings-title')?.textContent).toBe('Saved games');
    expect(q(parent, 'saves-save-now').textContent).toBe('Save now');
    expect(q(parent, 'saves-back').textContent).toBe('Back');
    expect(q(parent, 'saves-screen').textContent).not.toMatch(/\b(saves|settings)\.[a-zA-Z]+/);
  });

  it('dispose removes it and its listeners', async () => {
    await open();
    const save = q(parent, 'saves-save-now');
    screen.dispose();
    save.click();
    await idle();
    expect(probe.calls).toEqual([]);
    expect(parent.querySelector('.troid-settings')).toBeNull();
  });
});
