import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * TWO TABS OF THE SAME GAME in a real browser (docs/PROMPT14-LOG.md): the saved games live in the browser's storage, which every tab of the game shares. A tab that saves over what another tab saved
 * after it — without ever seeing it — would throw that progress away, so it is refused: it says so, stops saving, and the other tab's game is left whole. A tab that opened the game AFTER the other's
 * save knows of it and saves normally; reloading the stopped tab brings the latest game back and it saves again.
 */
const KEY = 'troid.progress';
const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);

async function ready(page: Page): Promise<void> {
  await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
  await page.waitForFunction('window.__troid.effectsReady()', undefined, { timeout: 30000 });
  await page.evaluate('window.__troid.pause()');
  await page.waitForTimeout(150);
}
const stored = async (page: Page): Promise<{ flags: string[]; savedAt: number } | null> => {
  const raw = (await page.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`)) as string | null;
  return raw === null ? null : (JSON.parse(raw) as { flags: string[]; savedAt: number });
};
async function waitFor(page: Page, expr: string, what: string, tries = 160): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(expr)) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what} (${expr})`);
}
const win = async (page: Page, flag: string): Promise<void> => {
  await page.evaluate(`(() => { window.__troid.session.flags.set(${JSON.stringify(flag)}); window.__troid.step(2); })()`);
};
const state = (page: Page): Promise<GameState> => page.evaluate('window.__troid.state()') as Promise<GameState>;

export const tabs: Scenario = {
  name: 'tabs',
  async run(ctx: Ctx) {
    await ctx.open('new=1', { width: 1280, height: 720, dpr: 1 });
    const a = ctx.page;
    const context = a.context();

    // ================================================================================================ tab A plays and saves
    await win(a, 'lever:a1');
    await waitFor(a, `window.__troid.state().notice.kind === 'saved'`, 'tab A saved');
    assert.deepEqual((await stored(a))?.flags, ['lever:a1']);

    // ================================================================================================ tab B opens the game: it loads A's save, so it knows of it, and saves normally
    const b = await context.newPage();
    b.on('pageerror', (e) => ctx.errors.push(`pageerror: ${e.message}`));
    b.on('console', (m) => {
      if (m.type() === 'error') ctx.errors.push(`console.error: ${m.text()}`);
    });
    await b.setViewportSize({ width: 1280, height: 720 });
    const url = new URL(a.url());
    url.searchParams.delete('new');
    await b.goto(url.toString(), { waitUntil: 'load' });
    await ready(b);
    assert.deepEqual((await state(b)).flags, ['lever:a1'], 'tab B started from what tab A saved');
    await win(b, 'lever:b1');
    await waitFor(b, `window.__troid.state().notice.kind === 'saved'`, 'tab B saved');
    assert.deepEqual((await stored(b))?.flags, ['lever:a1', 'lever:b1'], 'both are in the one saved game');
    assert.equal(await b.evaluate('window.__troid.saves().conflicted'), false, 'tab B was not refused: it knew of the save it loaded');

    // ================================================================================================ tab A, which never saw that, is refused: it says so, stops, and tab B's game is whole
    const before = await stored(b);
    await win(a, 'lever:a2');
    await waitFor(a, `window.__troid.state().notice.kind === 'conflict'`, 'tab A is told');
    assert.equal(await a.evaluate('window.__troid.saves().conflicted'), true);
    assert.equal(await a.evaluate('window.__troid.saves().stopped'), true, 'and it has stopped saving');
    assert.deepEqual(await stored(a), before, 'the saved game is exactly what tab B left: nothing was written over it');
    await waitFor(a, `/saved from another tab.*stopped saving/.test(window.__troid.state().notice.text)`, 'the notice says what happened and what to do');
    await a.screenshot({ path: '.shots/e2e/tabs-a-01-conflict-notice.png' });
    // nothing tab A does afterwards writes: not progress, not a quiet save, not leaving
    await win(a, 'lever:a3');
    await a.evaluate('window.__troid.step(2000)');
    await a.evaluate(`window.dispatchEvent(new Event('pagehide'))`);
    await a.waitForTimeout(300);
    assert.deepEqual(await stored(a), before, 'a stopped tab never writes again');

    // ================================================================================================ the pause menu of tab A says it too, and does not offer a save that cannot happen as if it could
    await q(a, 'pause-button').click();
    await a.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 15000 });
    await q(a, 'pause-saves').click();
    await a.waitForSelector('[data-testid="saves-screen"][data-open="1"][data-ready="1"]', { timeout: 15000 });
    assert.match((await q(a, 'saves-conflict').textContent()) ?? '', /Another tab saved this game after this one/);
    assert.equal(await q(a, 'saves-save-now').count(), 0, 'and it offers no save by hand: it could not do what it says');
    assert.deepEqual(await stored(a), before);
    await a.screenshot({ path: '.shots/e2e/tabs-a-02-conflict-screen.png' });

    // ================================================================================================ tab B goes on as if nothing had happened
    await win(b, 'lever:b2');
    await waitFor(b, `window.__troid.state().notice.kind === 'saved'`, 'tab B saves again');
    assert.deepEqual((await stored(b))?.flags, ['lever:a1', 'lever:b1', 'lever:b2']);

    // ================================================================================================ reloading tab A brings the latest game back, and it saves again
    await a.reload();
    await ready(a);
    assert.deepEqual((await state(a)).flags, ['lever:a1', 'lever:b1', 'lever:b2'], 'tab A starts from the latest save');
    assert.equal(await a.evaluate('window.__troid.saves().conflicted'), false);
    await win(a, 'lever:a4');
    await waitFor(a, `window.__troid.state().notice.kind === 'saved'`, 'tab A saves after the reload');
    assert.deepEqual((await stored(a))?.flags, ['lever:a1', 'lever:a4', 'lever:b1', 'lever:b2']);
    // …and now it is tab B that has not seen it
    await win(b, 'lever:b3');
    await waitFor(b, `window.__troid.state().notice.kind === 'conflict'`, 'tab B is the one told now');
    assert.ok(!(await stored(b))?.flags.includes('lever:b3'), 'and its progress did not overwrite');

    console.log('  tabs: a tab that saves over what another saved after it (unseen) is refused, says so and stops — the other game is whole · a tab that opened after knows of it · a reload brings the latest back');
  },
};
