import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Ctx, Scenario } from '../scenario';
import { frames } from '../frames';
import { centreOf } from '../touch';

/**
 * The language and the settings (docs/PROMPT5-LOG.md S18, GAME-SPEC-2D §18): the menu is one small icon at the top centre, it is
 * not even downloaded until asked for, it pauses the game, and the language the player picks is applied at once and SURVIVES a
 * reload, a second tab, a new browser session and a change of scene; `?lang=` overrides without overwriting; the touch controls'
 * size and opacity are kept too; and a damaged saved value never stops the game from starting.
 */
const KEY = 'troid.settings';
const saved = async (page: Page): Promise<Record<string, unknown> | null> => {
  const raw = (await page.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`)) as string | null;
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
};
/** The settings are written a moment after the click (a few async steps): wait for them. */
async function savedLanguage(page: Page, expected: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if ((await saved(page))?.['language'] === expected) return;
    await page.waitForTimeout(50);
  }
  assert.equal((await saved(page))?.['language'], expected, `the language "${expected}" was saved`);
}
const life = (page: Page): Promise<string | null> => page.locator('[data-testid="hud-life"]').getAttribute('aria-label');
const lang = (page: Page): Promise<string> => page.evaluate('window.__troid.state().lang') as Promise<string>;
const tick = (page: Page): Promise<number> => page.evaluate('window.__troid.state().tick') as Promise<number>;
const menuOpen = (page: Page): Promise<string | null> => page.locator('[data-testid="settings-menu"]').getAttribute('data-open').catch(() => null);

/** A page that was just loaded (or reloaded): wait for the game and stop its clock, as `ctx.open` does. */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
  await page.evaluate('window.__troid.pause()');
  await page.waitForTimeout(150);
}

async function waitFor(page: Page, expr: string, what: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate(expr)) return;
    await page.waitForTimeout(50);
  }
  assert.fail(what);
}

export const language: Scenario = {
  name: 'language',
  async run(ctx: Ctx) {
    // ================================================================== a fresh visitor: the device's language, nothing saved, the menu not even downloaded
    await ctx.open('room=movement_test', { width: 844, height: 390 });
    let page = ctx.page;
    assert.equal(await lang(page), 'en', 'this browser speaks English');
    assert.equal(await page.evaluate('document.documentElement.lang'), 'en');
    assert.equal(await life(page), 'Life');
    assert.equal(await saved(page), null, 'a new player leaves nothing behind until they choose');
    assert.equal(await page.locator('[data-testid="settings-menu"]').count(), 0, 'the menu is not built until it is asked for');
    assert.equal(
      ((await page.evaluate(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /SettingsMenu/.test(n))`)) as string[]).length,
      0,
      'and its code is not requested by a normal load',
    );

    // ---- the entry: ONE small icon at the TOP CENTRE, not on the right
    const pb = await centreOf(page, 'pause-button');
    assert.ok(Math.abs(pb.x - 422) < 2, `centred (${pb.x})`);
    assert.ok(pb.y < 60, `at the top (${pb.y})`);
    assert.ok(pb.w >= 44 && pb.h >= 44, 'a finger-sized target');
    assert.equal(await page.locator('[data-testid="pause-button"]').getAttribute('tabindex'), '-1', 'never focusable: Space would click it');
    assert.equal(await page.locator('[data-testid="pause-button"]').getAttribute('aria-label'), 'Pause and settings');

    // ================================================================== open it: the game pauses, the language buttons are in their own names
    await page.evaluate('window.__troid.resume()'); // let the clock run so the pause is visible
    await frames(page, 6);
    const running = await tick(page);
    await page.waitForTimeout(250);
    assert.ok((await tick(page)) > running, 'the game is running');
    await page.locator('[data-testid="pause-button"]').click();
    await waitFor(page, `document.querySelector('[data-testid="settings-menu"]')?.dataset.open === '1'`, 'the menu opens');
    const frozen = await tick(page);
    await page.waitForTimeout(400);
    assert.equal(await tick(page), frozen, 'a paused game does not advance');
    await ctx.step(5);
    assert.equal(await tick(page), frozen, 'not even when a test hook asks for ticks');
    assert.equal(await page.locator('[data-testid="settings-title"]').textContent(), 'Paused');
    assert.equal(await page.locator('[data-testid="settings-lang-es"]').textContent(), 'Español');
    assert.equal(await page.locator('[data-testid="settings-lang-en"]').textContent(), 'English');
    assert.equal(await page.locator('[data-testid="settings-lang-en"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-testid="settings-touch"]').evaluate((e) => getComputedStyle(e).display), 'none', 'no touch layer on a desktop: no touch settings');
    await ctx.shot('01-menu');

    // ================================================================== choosing Spanish: applied at once, saved
    await page.locator('[data-testid="settings-lang-es"]').click();
    assert.equal(await lang(page), 'es', 'applied at once');
    assert.equal(await life(page), 'Vida', 'the HUD re-reads its names');
    assert.equal(await page.evaluate('document.documentElement.lang'), 'es');
    assert.equal(await page.locator('[data-testid="settings-title"]').textContent(), 'Pausa');
    assert.equal(await page.locator('[data-testid="pause-button"]').getAttribute('aria-label'), 'Pausa y ajustes');
    await savedLanguage(page, 'es');
    assert.deepEqual((await saved(page))!['touch'], { scale: 1, opacity: 1, side: 'right', offsetX: 0, offsetY: 0 }, 'the touch settings saved are the designed ones (S30 added the side and the position)');
    await page.locator('[data-testid="settings-resume"]').click();
    await waitFor(page, `document.querySelector('[data-testid="settings-menu"]').dataset.open === '0'`, 'Resume closes the menu');
    const after = await tick(page);
    await page.waitForTimeout(300);
    assert.ok((await tick(page)) > after, 'and the game goes on');

    // ---- the keys that pause: Escape opens it and Escape closes it
    await page.keyboard.press('Escape');
    await waitFor(page, `document.querySelector('[data-testid="settings-menu"]').dataset.open === '1'`, 'Escape opens the menu');
    await page.keyboard.press('Escape');
    await waitFor(page, `document.querySelector('[data-testid="settings-menu"]').dataset.open === '0'`, 'Escape closes it');
    assert.equal(await menuOpen(page), '0');

    // ================================================================== it SURVIVES: a reload, a second tab, a new browser session, a change of scene
    await page.reload();
    await ready(page);
    assert.equal(await lang(page), 'es', 'after a reload (no ?lang=)');
    assert.equal(await life(page), 'Vida');

    const tab = await page.context().newPage();
    tab.on('pageerror', (e) => ctx.errors.push(`pageerror: ${e.message}`));
    await tab.goto(page.url(), { waitUntil: 'load' });
    await ready(tab);
    assert.equal(await lang(tab), 'es', 'in a second tab');
    await tab.close();

    const storageState = await page.context().storageState();
    const browser = page.context().browser()!;
    const fresh = await browser.newContext({ storageState, viewport: { width: 844, height: 390 } });
    const session = await fresh.newPage();
    session.on('pageerror', (e) => ctx.errors.push(`pageerror: ${e.message}`));
    await session.goto(page.url(), { waitUntil: 'load' });
    await ready(session);
    assert.equal(await lang(session), 'es', 'in a new browser session');
    assert.equal(await life(session), 'Vida');
    await fresh.close();

    await page.evaluate(`window.__troid.session.loadRoom('crouch_test')`);
    await ctx.step(2);
    assert.equal(await lang(page), 'es', 'across a change of room');
    assert.equal(await life(page), 'Vida');

    // ---- `?lang=` is a one-off: it wins for that visit and does not overwrite what the player chose
    const base = page.url().split('?')[0]!;
    await page.goto(`${base}?hooks=1&room=movement_test&lang=en`, { waitUntil: 'load' });
    await ready(page);
    assert.equal(await lang(page), 'en', '?lang=en wins for this visit');
    assert.equal((await saved(page))!['language'], 'es', 'but it is not saved over the player\'s choice');
    await page.goto(`${base}?hooks=1&room=movement_test`, { waitUntil: 'load' });
    await ready(page);
    assert.equal(await lang(page), 'es', 'the next plain visit is Spanish again');

    // ================================================================== a damaged saved value never stops the game
    await page.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, '{"version":1,"lang')`);
    await page.reload();
    await ready(page);
    assert.equal(await lang(page), 'en', 'unreadable settings: the device\'s language (and the game starts)');
    assert.equal(await page.evaluate(`localStorage.getItem(${JSON.stringify(`${KEY}.corrupt`)})`), '{"version":1,"lang', 'the damaged text is kept, not thrown away');
    await page.evaluate('window.__troid.resume()');
    await page.locator('[data-testid="pause-button"]').click();
    await waitFor(page, `document.querySelector('[data-testid="settings-menu"]')?.dataset.open === '1'`, 'the menu still opens');
    await page.locator('[data-testid="settings-lang-es"]').click();
    await savedLanguage(page, 'es');
    assert.equal((await saved(page))!['version'], 2, 'and a new choice is saved properly, as the current version of the settings (2 since S30)');

    // a value from a LATER game is kept aside, never overwritten silently
    await page.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, '{"version":9,"language":"es"}')`);
    await page.reload();
    await ready(page);
    assert.equal(await page.evaluate(`localStorage.getItem(${JSON.stringify(`${KEY}.corrupt`)})`), '{"version":9,"language":"es"}');

    // ================================================================== touch: size and opacity persist and apply at once
    await ctx.open('room=movement_test&touch=1&lang=en', { width: 844, height: 390, touch: true });
    page = ctx.page;
    await page.evaluate('window.__troid.resume()');
    await page.locator('[data-testid="pause-button"]').click();
    await waitFor(page, `document.querySelector('[data-testid="settings-menu"]')?.dataset.open === '1'`, 'the menu opens on a touch screen');
    assert.notEqual(await page.locator('[data-testid="settings-touch"]').evaluate((e) => getComputedStyle(e).display), 'none', 'the touch layer exists: its settings are offered');
    const before = (await page.evaluate('window.__troid.touch().layout.controlScale')) as number;
    await page.evaluate(`(() => {
      const set = (id, v) => { const e = document.querySelector('[data-testid="' + id + '"]'); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); };
      set('settings-touch-size', 1.3);
      set('settings-touch-opacity', 0.5);
    })()`);
    const after2 = (await page.evaluate('window.__troid.touch().layout.controlScale')) as number;
    assert.ok(Math.abs(after2 / before - 1.3) < 0.01, `the controls grew by 30 % at once (${before} → ${after2})`);
    assert.equal(await page.locator('[data-testid="touch-layer"]').evaluate((e) => (e as HTMLElement).style.opacity), '0.5', 'and fade at once');
    for (let i = 0; i < 40 && ((await saved(page))?.['touch'] as { scale?: number } | undefined)?.scale !== 1.3; i++) await page.waitForTimeout(50);
    assert.deepEqual((await saved(page))!['touch'], { scale: 1.3, opacity: 0.5, side: 'right', offsetX: 0, offsetY: 0 }, 'what the player chose, and the designed side and position');
    await page.locator('[data-testid="settings-resume"]').click();
    await page.reload();
    await ready(page);
    const kept = (await page.evaluate('window.__troid.touch().layout.controlScale')) as number;
    assert.ok(Math.abs(kept / before - 1.3) < 0.01, 'after a reload the controls are still 30 % bigger');
    assert.equal(await page.locator('[data-testid="touch-layer"]').evaluate((e) => (e as HTMLElement).style.opacity), '0.5');
    await ctx.shot('02-touch-settings');
  },
};
