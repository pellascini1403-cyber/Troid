import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * THE SAVED GAMES in a real browser (docs/PROMPT14-LOG.md): the screen of the pause menu that lists the three slots — what each holds, and what can be done with each. Through the screen, the way a person
 * does: a game is saved by hand, another slot is started and the first is still there, the first is played again with what it held, a delete asks and can be called off, an unreadable game is shown
 * as such and kept until the player decides, a copy is taken out (a real download) and put in (a real file chooser), and a browser that keeps nothing says so. The storage is read directly to check that
 * what the screen says is what is stored.
 */
const SIZE = { width: 1280, height: 720, dpr: 1 };
const KEYS = { 1: 'troid.progress', 2: 'troid.progress.2', 3: 'troid.progress.3' } as const;

const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);
const text = async (page: Page, id: string): Promise<string> => ((await q(page, id).textContent()) ?? '').replace(/\s+/g, ' ').trim();
const read = (page: Page, key: string): Promise<string | null> => page.evaluate(`localStorage.getItem(${JSON.stringify(key)})`) as Promise<string | null>;
const keys = (page: Page, prefix: string): Promise<string[]> => page.evaluate(`Object.keys(localStorage).filter((k) => k.startsWith(${JSON.stringify(prefix)})).sort()`) as Promise<string[]>;
const json = async (page: Page, key: string): Promise<Record<string, any> | null> => {
  const raw = await read(page, key);
  return raw === null ? null : (JSON.parse(raw) as Record<string, any>);
};

async function waitFor(page: Page, expr: string, what: string, tries = 160): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(expr)) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what} (${expr})`);
}
/** A page just loaded (or reloaded by the game itself): wait for the game and every cosmetic chunk, and stop its clock, as `ctx.open` does. */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
  await page.waitForFunction('window.__troid.effectsReady()', undefined, { timeout: 30000 });
  await page.evaluate('window.__troid.pause()');
  await page.waitForTimeout(150);
}
/** Presses something that makes the game open its page again, and waits for the new page to be ready. */
async function reloading(page: Page, press: () => Promise<unknown>): Promise<void> {
  const loaded = page.waitForEvent('load', { timeout: 30000 });
  await press();
  await loaded;
  await ready(page);
}
async function openSaves(page: Page): Promise<void> {
  if ((await page.locator('[data-testid="pause-menu"]').getAttribute('data-open').catch(() => null)) !== '1') {
    await q(page, 'pause-button').click();
    await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 15000 });
  }
  await q(page, 'pause-saves').click();
  await page.waitForSelector('[data-testid="saves-screen"][data-open="1"][data-ready="1"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="saves-slot-3"]', { timeout: 15000 });
}
async function leaveMenu(page: Page): Promise<void> {
  await q(page, 'saves-back').click();
  await q(page, 'pause-resume').click();
  await page.waitForSelector('[data-testid="pause-menu"][data-open="0"]', { state: 'attached' });
}
const status = (page: Page): Promise<string> => text(page, 'saves-status');
/** The options of a card, open (a press on "Options" folds them away if they were open). */
async function ensureOptions(page: Page, slot: number): Promise<void> {
  if ((await q(page, `saves-import-${slot}`).count()) === 0) await q(page, `saves-more-${slot}`).click();
}
const stateOf = (page: Page, slot: number): Promise<string | null> => q(page, `saves-slot-${slot}`).getAttribute('data-state');

export const slots: Scenario = {
  name: 'slots',
  async run(ctx: Ctx) {
    await ctx.open('new=1', SIZE);
    let page = ctx.page;
    const sess = (code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
    const state = (): Promise<GameState> => ctx.state();
    const bump = async (flag: string): Promise<void> => {
      await sess(`s.flags.set(${JSON.stringify(flag)})`);
      await ctx.step(2);
      await page.waitForTimeout(150);
    };

    // ================================================================================================ a new game: slot 1 is being played and holds nothing yet; the other two are empty
    let s = await state();
    assert.equal(s.slot, 1);
    assert.deepEqual(await keys(page, 'troid.progress'), [], 'a new game leaves nothing behind until something is won');
    await openSaves(page);
    assert.deepEqual([await stateOf(page, 1), await stateOf(page, 2), await stateOf(page, 3)], ['empty', 'empty', 'empty']);
    assert.equal(await text(page, 'saves-info-1'), 'A new game, not saved yet');
    assert.equal(await text(page, 'saves-info-2'), 'Empty');
    assert.equal(await q(page, 'saves-slot-1').getAttribute('data-active'), '1');
    assert.match(await text(page, 'saves-slot-1'), /In progress/);
    // what the saves ARE NOT, said plainly (no cloud, no sync, lost with the site's data)
    assert.match(await text(page, 'saves-where'), /kept in this browser.*not synced between devices.*lost if you clear the site's data/);
    assert.match(await text(page, 'saves-auto'), /saves itself when you win something.*rest at a shrine.*every half minute of play.*page is closed/);
    await ctx.shot('a-01-new-game');

    // ================================================================================================ saving by hand, and what the card says of it
    await q(page, 'saves-save-now').click();
    await waitFor(page, `document.querySelector('[data-testid="saves-status"]')?.textContent === 'Game saved.'`, 'saving by hand says it');
    const first = await json(page, KEYS[1]);
    assert.ok(first, 'there is a game in slot 1 now');
    assert.equal(first['saveVersion'], 2);
    assert.ok(first['savedAt'] > 1.7e12, 'stamped with the browser\'s clock');
    await waitFor(page, `document.querySelector('[data-testid="saves-slot-1"]')?.dataset.state === 'ok'`, 'the card now holds a game');
    const info = await text(page, 'saves-info-1');
    assert.match(info, /Ruins Gate/, 'the zone it picks up in');
    assert.match(info, /Time \d+:\d\d/, 'the time played');
    assert.match(info, /Saved .*20\d\d/, 'and when it was saved, in the language of the page');
    await ctx.shot('a-02-saved-by-hand');
    await leaveMenu(page);

    // ================================================================================================ progress is saved as it happens, into the slot being played
    await bump('lever:first');
    const afterFlag = await json(page, KEYS[1]);
    assert.ok(afterFlag?.['flags'].includes('lever:first'), 'slot 1 holds what was won');
    assert.deepEqual(await keys(page, 'troid.progress'), ['troid.progress'], 'and only slot 1 exists');

    // ================================================================================================ a new game in slot 2: the page opens on it, and slot 1 is still there, untouched
    await openSaves(page);
    await q(page, 'saves-new-2').click(); // nothing in slot 2: it starts at once, with nothing to ask
    await page.waitForEvent('load', { timeout: 30000 });
    await ready(page);
    s = await state();
    assert.equal(s.slot, 2, 'the page opened on slot 2');
    assert.equal(s.room, 'r1_gate');
    assert.deepEqual(s.flags, [], 'a new game: none of slot 1\'s flags');
    const slot1 = await json(page, KEYS[1]);
    assert.ok(slot1?.['flags'].includes('lever:first'), 'slot 1 kept what it had');
    assert.deepEqual(await keys(page, 'troid.progress'), ['troid.progress'], 'slot 2 holds nothing until something is won there');
    assert.equal((await json(page, 'troid.settings'))?.['slot'], 2, 'the game being played is a setting, and it was kept');
    await bump('lever:second');
    assert.deepEqual(await keys(page, 'troid.progress'), ['troid.progress', 'troid.progress.2'], 'slot 2 has its own key');
    assert.ok((await json(page, KEYS[2]))?.['flags'].includes('lever:second'));
    assert.ok(!(await json(page, KEYS[2]))?.['flags'].includes('lever:first'), 'and none of slot 1\'s');
    const slot1Again = await json(page, KEYS[1]);
    assert.ok(!slot1Again?.['flags'].includes('lever:second'), 'playing slot 2 never wrote into slot 1');
    assert.deepEqual(slot1Again?.['flags'], slot1?.['flags']);

    // ================================================================================================ back to slot 1: it comes back with what it held, and slot 2 keeps its own
    await openSaves(page);
    assert.equal(await q(page, 'saves-slot-2').getAttribute('data-active'), '1');
    assert.equal(await stateOf(page, 1), 'ok');
    assert.match(await text(page, 'saves-info-1'), /Ruins Gate/);
    assert.match(await text(page, 'saves-slot-1'), /Play this game/);
    await ctx.shot('a-03-two-games');
    await reloading(page, () => q(page, 'saves-play-1').click());
    s = await state();
    assert.equal(s.slot, 1);
    assert.ok(s.flags?.includes('lever:first') && !s.flags?.includes('lever:second'), 'slot 1\'s game, not slot 2\'s');
    assert.ok((await json(page, KEYS[2]))?.['flags'].includes('lever:second'), 'and slot 2 was saved as it stood when it was left');

    // ================================================================================================ a delete asks first, says what is lost, and can be called off
    await openSaves(page);
    await q(page, 'saves-more-2').click();
    await q(page, 'saves-delete-2').click();
    assert.equal(await text(page, 'saves-confirm-text-2'), 'Delete game 2? This cannot be undone.');
    assert.equal(await page.evaluate(`document.activeElement?.dataset.testid`), 'saves-cancel-2', 'the safe answer has the focus');
    await q(page, 'saves-cancel-2').click();
    assert.equal(await q(page, 'saves-confirm-2').count(), 0);
    assert.notEqual(await read(page, KEYS[2]), null, 'calling it off deleted nothing');
    await q(page, 'saves-delete-2').click();
    await q(page, 'saves-yes-2').click();
    await waitFor(page, `document.querySelector('[data-testid="saves-slot-2"]')?.dataset.state === 'empty'`, 'the card is empty');
    assert.equal(await status(page), 'Game deleted.');
    assert.deepEqual(await keys(page, 'troid.progress.2'), [], 'the game and every copy of it are gone');
    assert.deepEqual(await keys(page, 'troid.progress'), ['troid.progress'], 'and slot 1 is where it was');
    await ctx.shot('a-04-deleted');

    // ================================================================================================ taking a copy out: a real download, readable, and importable
    await q(page, 'saves-more-1').click();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), q(page, 'saves-export-1').click()]);
    assert.match(download.suggestedFilename(), /^troid-partida-1-\d{4}-\d{2}-\d{2}\.json$/, 'named for the game and the day');
    const path = await download.path();
    assert.ok(path, 'the file was written');
    const { readFileSync } = await import('node:fs');
    const exported = readFileSync(path, 'utf8');
    const copy = JSON.parse(exported) as Record<string, any>;
    assert.equal(copy['saveVersion'], 2);
    assert.ok(copy['flags'].includes('lever:first'), 'it holds the game');
    await waitFor(page, `document.querySelector('[data-testid="saves-status"]')?.textContent === 'Copy exported.'`, 'the screen says it');

    // ================================================================================================ putting a copy in: into an empty slot at once; garbage and giants are refused; into a game, only after asking
    await ensureOptions(page, 2);
    const choose = async (name: string, body: string | Buffer): Promise<void> => {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), q(page, 'saves-import-2').click()]);
      await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(body) });
    };
    await choose('not-a-game.json', 'this is not a saved game');
    await waitFor(page, `document.querySelector('[data-testid="saves-status"]')?.textContent === 'That file is not a game of this title.'`, 'a file that is not a game is refused');
    assert.equal(await read(page, KEYS[2]), null, 'and nothing was stored');
    await choose('future.json', JSON.stringify({ saveVersion: 99, hello: 'from the future' }));
    await waitFor(page, `document.querySelector('[data-testid="saves-status"]')?.textContent === 'That file is not a game of this title.'`, 'a game from a later version is not read either');
    assert.equal(await read(page, KEYS[2]), null);
    await choose('giant.json', ' '.repeat(70_000));
    await waitFor(page, `document.querySelector('[data-testid="saves-status"]')?.textContent === 'That file is too big to be a game.'`, 'a giant is refused without being read');
    assert.equal(await read(page, KEYS[2]), null);
    await choose('partida.json', exported);
    await waitFor(page, `document.querySelector('[data-testid="saves-status"]')?.textContent === 'Game imported.'`, 'a copy of a game goes in');
    await waitFor(page, `document.querySelector('[data-testid="saves-slot-2"]')?.dataset.state === 'ok'`, 'and the slot holds it');
    const imported = await json(page, KEYS[2]);
    assert.ok(imported?.['flags'].includes('lever:first'), 'with what the copy held');
    assert.deepEqual(await keys(page, 'troid.progress.2'), ['troid.progress.2'], 'and no stray copies');
    // into a slot that holds a game: it asks, and keeps the file while it does
    await ensureOptions(page, 2);
    const before2 = await read(page, KEYS[2]);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), q(page, 'saves-import-2').click()]);
    await chooser.setFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from(exported.replace('lever:first', 'lever:other')) });
    await page.waitForSelector('[data-testid="saves-confirm-2"]', { timeout: 15000 });
    assert.equal(await text(page, 'saves-confirm-text-2'), 'This replaces game 2 with the chosen file. It cannot be undone.');
    await q(page, 'saves-cancel-2').click();
    assert.equal(await read(page, KEYS[2]), before2, 'calling it off imported nothing');
    await ctx.shot('a-05-imported');

    // ================================================================================================ a game that cannot be read: shown as such, never thrown away, and the page does not break
    await page.evaluate(`localStorage.setItem(${JSON.stringify(KEYS[3])}, '{"saveVersion":2,"at":{"room":"r1_g')`);
    await q(page, 'saves-back').click();
    await openSaves(page);
    assert.equal(await stateOf(page, 3), 'damaged');
    assert.equal(await text(page, 'saves-info-3'), 'It cannot be read. A copy is kept in case it can be recovered.');
    assert.equal(await q(page, 'saves-play-3').count(), 0, 'it cannot be played');
    assert.equal(await q(page, 'saves-export-3').count(), 0, 'nor taken out (there is nothing readable to take)');
    await ctx.shot('a-06-damaged');
    await q(page, 'saves-newhere-3').click();
    assert.match(await text(page, 'saves-confirm-text-3'), /replaces game 3 with a new one/, 'a new game there asks first');
    await q(page, 'saves-cancel-3').click();
    assert.equal(await read(page, KEYS[3]), '{"saveVersion":2,"at":{"room":"r1_g', 'calling it off left the unreadable text exactly as it was');
    await q(page, 'saves-more-3').click();
    await q(page, 'saves-delete-3').click();
    assert.match(await text(page, 'saves-confirm-text-3'), /damaged copy/, 'deleting it says the kept copy goes too');
    await q(page, 'saves-cancel-3').click();
    // a new game over it: the page opens on slot 3 and the unreadable text is kept aside, not destroyed
    await q(page, 'saves-newhere-3').click();
    await reloading(page, () => q(page, 'saves-yes-3').click());
    s = await state();
    assert.equal(s.slot, 3);
    assert.equal(s.room, 'r1_gate', 'a new game, with no black screen and no error');
    assert.equal(await read(page, KEYS[3]), null, 'a new game: nothing saved yet');
    assert.equal(await read(page, KEYS[3] + '.corrupt'), '{"saveVersion":2,"at":{"room":"r1_g', 'the unreadable text was kept aside, not destroyed');

    // ================================================================================================ the page opened on a slot that cannot be read: a new game, a notice, no black screen
    await page.evaluate(`localStorage.setItem(${JSON.stringify(KEYS[3])}, 'broken beyond repair')`);
    await page.evaluate('window.__troid.saves().dispose()'); // (the page that is open writes what it played when it is left: it stops, as a closed page would)
    await page.reload();
    await ready(page);
    s = await state();
    assert.equal(s.slot, 3);
    assert.equal(s.room, 'r1_gate', 'a new game');
    assert.equal(s.notice?.kind, 'damaged', 'the player is told, discreetly');
    assert.equal(await read(page, KEYS[3] + '.corrupt'), 'broken beyond repair', 'and the text is still there');

    // ================================================================================================ a browser that keeps nothing says so — and does not pretend to save
    await ctx.open('new=1', {
      ...SIZE,
      prepare: async (context) => {
        await context.addInitScript(() => {
          Object.defineProperty(window, 'localStorage', {
            get() {
              throw new DOMException('blocked', 'SecurityError');
            },
          });
        });
      },
    });
    page = ctx.page;
    s = await state();
    assert.equal(s.notice?.kind, 'unavailable', 'the player is told at the start');
    await openSaves(page);
    assert.match(await text(page, 'saves-unavailable'), /does not allow saving.*lost when you close the page/);
    await q(page, 'saves-save-now').click();
    await waitFor(page, `document.querySelector('[data-testid="saves-status"]')?.textContent === 'Could not save.'`, 'saving by hand is NOT announced as done');
    assert.equal(await q(page, 'saves-persist').count(), 0, 'and there is nothing to ask the browser to protect');

    console.log('  slots: three independent games · saved by hand · played, started, deleted (asking first) · exported as a real file and imported through a real chooser · unreadable games kept aside · no storage said plainly');
  },
};
