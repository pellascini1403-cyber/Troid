import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * THE PAUSE in a real browser (docs/PROMPT14-LOG.md): the menu that opens when the hero stops — and what "stopped" means. The simulation does not advance, and neither does anything that belongs
 * to the world: the hero's animation, the camera's shake, the scenery, the HUD's own animations. The ways in and out are the ones a player has — the button, Escape, P, the page going to the
 * background — each screen's way out is a step back, and what was held when it opened is not held when it closes. Nothing leaks: open it ten times and the page has what it had.
 */
const SIZE = { width: 1280, height: 720, dpr: 1 };
const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);
const attr = (page: Page, id: string, name: string): Promise<string | null> => q(page, id).getAttribute(name).catch(() => null);

async function waitFor(page: Page, expr: string, what: string, tries = 160): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(expr)) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what} (${expr})`);
}
const menuIs = (page: Page, open: boolean): Promise<void> =>
  waitFor(page, `document.querySelector('[data-testid="pause-menu"]')?.dataset.open === '${open ? '1' : '0'}'`, `the menu is ${open ? 'open' : 'closed'}`);
const screenIs = (page: Page, screen: string): Promise<void> =>
  waitFor(page, `document.querySelector('[data-testid="pause-menu"]')?.dataset.screen === '${screen}' && document.querySelector('[data-testid="pause-menu"]')?.dataset.open === '1'`, `the menu is on its ${screen} screen`);

/** What the world is doing: the sim clock, the hero, the camera and how the hero is drawn. */
async function world(ctx: Ctx): Promise<{ now: number; x: number; anim: string; frame: string | null; camera: number; trauma: number }> {
  const s: GameState = await ctx.state();
  return { now: s.now ?? -1, x: s.x, anim: s.anim, frame: s.sprite?.frame ?? null, camera: s.camera?.x ?? 0, trauma: s.trauma ?? 0 };
}

export const pause: Scenario = {
  name: 'pause',
  async run(ctx) {
    await ctx.open('room=movement_test', SIZE);
    let page = ctx.page;
    const dom = (): Promise<number> => page.evaluate('document.getElementsByTagName("*").length') as Promise<number>;

    // ================================================================================================ the game runs in real time, and its hero is drawn moving
    await page.evaluate('window.__troid.resume()'); // the loop runs: what follows is a player's game, not a test stepping ticks
    const t0 = (await world(ctx)).now;
    await waitFor(page, `window.__troid.state().now > ${t0 + 30}`, 'the simulation advances by itself');
    await page.keyboard.down('KeyD');
    const frames = new Set<string | null>();
    for (let i = 0; i < 14; i++) {
      frames.add((await world(ctx)).frame);
      await page.waitForTimeout(110);
    }
    assert.ok(frames.size > 1, `the hero's run is animated while the game runs (${[...frames].join(', ')})`);
    assert.notEqual(await attr(page, 'hud', 'data-paused'), '1', 'the HUD is not paused');

    // ================================================================================================ the button opens it: the world stops — all of it
    const before = await world(ctx);
    await q(page, 'pause-button').click();
    await menuIs(page, true);
    await screenIs(page, 'main');
    assert.equal((await ctx.state()).menuOpen, true);
    assert.equal(await attr(page, 'hud', 'data-paused'), '1', 'the HUD stops what it animates by itself');
    assert.equal(await q(page, 'pause-button').evaluate((e) => getComputedStyle(e).visibility), 'hidden', 'the button steps out of the way');
    await ctx.shot('a-01-paused');
    // a playground saves nothing: it has neither saved games nor a profile to show
    assert.equal(await q(page, 'pause-saves').isVisible(), false, 'a playground offers no saved games');
    assert.equal(await q(page, 'pause-profile').isVisible(), false, 'and no profile');
    assert.equal(await q(page, 'pause-settings').isVisible(), true);
    assert.equal(await q(page, 'pause-controls').isVisible(), true);
    const frozen = await world(ctx);
    assert.ok(frozen.now > before.now - 1, 'it stopped where it was');
    await page.keyboard.up('KeyD');
    // the hero stays as they were, and so does the clock, the camera and the way the hero is drawn
    await page.evaluate('window.__troid.shake(0.8)'); // a blow's jolt, raised while the menu is up: it must not decay while the world waits
    const shaken = (await world(ctx)).trauma;
    assert.ok(shaken > 0.7, `the camera was jolted (${shaken})`);
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(150);
      const w = await world(ctx);
      assert.equal(w.now, frozen.now, `the simulation clock does not move (sample ${i})`);
      assert.equal(w.x, frozen.x, 'the hero does not move');
      assert.equal(w.frame, frozen.frame, `the hero\'s animation does not advance (${w.frame} vs ${frozen.frame})`);
      assert.equal(w.camera, frozen.camera, 'the camera does not move');
      assert.equal(w.trauma, shaken, 'the shake of the camera waits too: it does not decay');
    }
    // a test asking for ticks is refused as well: a paused game does not advance, whoever asks
    await ctx.step(10);
    assert.equal((await world(ctx)).now, frozen.now, 'not even a test hook advances a paused game');

    // ================================================================================================ the keys typed into it are the menu\'s: none of them reaches the game
    await page.keyboard.press('KeyJ'); // attack
    await page.keyboard.press('KeyK'); // ability
    await page.keyboard.press('KeyL'); // bottle
    await page.keyboard.press('KeyD'); // movement
    assert.equal((await world(ctx)).now, frozen.now);
    assert.equal(await attr(page, 'pause-menu', 'data-open'), '1', 'and the menu is where it was');

    // ================================================================================================ Continue: it runs again from where it stopped — no catch-up for the time spent
    const waited = Date.now();
    await q(page, 'pause-resume').click();
    await menuIs(page, false);
    await waitFor(page, `window.__troid.state().now > ${frozen.now + 20}`, 'the game goes on');
    const ran = (await world(ctx)).now - frozen.now;
    const wall = (Date.now() - waited) / 1000;
    assert.ok(ran <= wall * 60 + 12, `no burst of the time spent paused: ${ran} ticks in ${wall.toFixed(2)} s`);
    assert.equal(await attr(page, 'hud', 'data-paused'), '0', 'the HUD moves again');
    assert.equal(await q(page, 'pause-button').evaluate((e) => getComputedStyle(e).visibility), 'visible', 'and the button is back');
    await waitFor(page, `window.__troid.state().trauma < ${shaken - 0.2}`, 'the camera\'s shake runs out again once the world moves');
    assert.ok(Math.abs((await world(ctx)).x - frozen.x) < 3, 'the hero is where they were (nothing was held down: no run away)');

    // ================================================================================================ pressing the button is never an attack, and the keys of the game are never a click on it
    await page.waitForTimeout(250);
    const box = await q(page, 'pause-button').boundingBox();
    assert.ok(box, 'the button is on screen');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(400); // the loop runs ticks while the button is held: a mouse press on it must not be the attack button
    assert.equal((await ctx.state()).combat?.attack, null, 'a press on the pause button is not an attack');
    await page.mouse.up();
    await menuIs(page, true);
    await q(page, 'pause-resume').click();
    await menuIs(page, false);
    await page.keyboard.press('Space'); // the jump: it must not "click" the button, which has no focus to take
    await page.waitForTimeout(300);
    assert.equal(await attr(page, 'pause-menu', 'data-open'), '0', 'Space jumps; it never presses the pause button');
    assert.equal(await q(page, 'pause-button').getAttribute('tabindex'), '-1');

    // ================================================================================================ Escape and P, in a real game (it has saved games and a profile): in, one step back from a screen, out
    await ctx.open('new=1', SIZE);
    page = ctx.page;
    await page.evaluate('window.__troid.resume()');
    await waitFor(page, 'window.__troid.state().now > 20', 'the game runs');
    await page.keyboard.press('Escape');
    await menuIs(page, true);
    assert.equal(await q(page, 'pause-saves').isVisible(), true, 'a game offers its saved games');
    assert.equal(await q(page, 'pause-profile').isVisible(), true, 'and its profile');
    await q(page, 'pause-controls').click();
    await screenIs(page, 'controls');
    await page.keyboard.press('Escape');
    await screenIs(page, 'main');
    assert.equal((await ctx.state()).menuOpen, true, 'Escape on a screen goes back to the list: the game is still waiting');
    await q(page, 'pause-saves').click();
    await screenIs(page, 'saves');
    await page.keyboard.press('Escape');
    await screenIs(page, 'main');
    await q(page, 'pause-profile').click();
    await screenIs(page, 'profile');
    await page.keyboard.press('Escape');
    await screenIs(page, 'main');
    await page.keyboard.press('Escape');
    await menuIs(page, false);
    assert.equal((await ctx.state()).menuOpen, false, 'Escape on the list resumes');
    await page.keyboard.press('KeyP');
    await menuIs(page, true);
    await page.keyboard.press('KeyP');
    await menuIs(page, false);

    // ================================================================================================ the page going to the background: it comes back waiting
    await page.evaluate(`(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    })()`);
    await menuIs(page, true);
    const away = (await world(ctx)).now;
    await page.evaluate(`(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    })()`);
    await page.waitForTimeout(500);
    assert.equal((await ctx.state()).menuOpen, true, 'it was waiting when the page came back: the player resumes when they are ready');
    assert.equal((await world(ctx)).now, away, 'and nothing happened to the hero in the meantime');
    await q(page, 'pause-resume').click();
    await menuIs(page, false);
    await waitFor(page, `window.__troid.state().now > ${away + 10}`, 'it goes on after Continue');

    // ================================================================================================ nothing leaks: open it ten times and the page is as it was after the first
    const cycle = async (): Promise<void> => {
      await page.keyboard.press('Escape');
      await menuIs(page, true);
      await q(page, 'pause-settings').click();
      await screenIs(page, 'settings');
      await page.keyboard.press('Escape');
      await screenIs(page, 'main');
      await page.keyboard.press('Escape');
      await menuIs(page, false);
    };
    await cycle(); // the first time builds what the menu needs (its screens are built when they are first opened)
    const nodes = await dom();
    const screens = await page.locator('.troid-settings').count();
    for (let i = 0; i < 10; i++) await cycle();
    assert.equal(await q(page, 'pause-menu').count(), 1, 'one menu, however many times it was opened');
    assert.equal(await page.locator('.troid-settings').count(), screens, 'and the same screens: they are built once');
    assert.equal(await dom(), nodes, 'the same number of nodes: nothing piled up');
    assert.equal(await page.locator('style#troid-menu-style').count(), 1, 'one stylesheet for the whole menu');
    assert.equal((await ctx.state()).menuOpen, false);
    await ctx.shot('a-02-after');
    await page.evaluate('window.__troid.pause()');

    // ================================================================================================ a menu that cannot be fetched (no network, a file that is gone) does not trap the game
    await ctx.open('new=1', {
      ...SIZE,
      prepare: async (context) => {
        await context.route(/\/(app\/menu\.ts|assets\/menu-[^/]+\.js)(\?.*)?$/, (route) => route.abort());
      },
    });
    page = ctx.page;
    await page.evaluate('window.__troid.resume()');
    await waitFor(page, 'window.__troid.state().now > 20', 'the game runs');
    await q(page, 'pause-button').click();
    // it tried, failed, and let the game go on rather than wait for a menu that is not coming
    await waitFor(page, `window.__troid.state().menuOpen === false && document.querySelector('[data-testid="pause-button"]').style.visibility === 'visible'`, 'the game to be released');
    const after = (await world(ctx)).now;
    await waitFor(page, `window.__troid.state().now > ${after + 30}`, 'the world goes on');
    assert.equal(await q(page, 'pause-menu').count(), 0, 'there is no menu');
    assert.equal(await attr(page, 'hud', 'data-paused'), '0', 'and the HUD was let go');
    await page.keyboard.press('Escape'); // the key does not trap either
    await page.waitForTimeout(800);
    assert.equal((await ctx.state()).menuOpen, false);
    await waitFor(page, `window.__troid.state().now > ${after + 60}`, 'the world still goes on');
    ctx.errors.splice(0); // the failed request IS the console error this part asked for
    await page.evaluate('window.__troid.pause()');

    // ================================================================================================ the code of the saved games' actions cannot be fetched (the connection was lost after the menu came): the screen says so, the way back works, and the cause is in the log
    const lost: string[] = [];
    await ctx.open('new=1', {
      ...SIZE,
      prepare: async (context) => {
        await context.route(/\/(app\/saveActions\.ts|assets\/saveActions-[^/]+\.js)(\?.*)?$/, (route) => route.abort());
      },
    });
    page = ctx.page;
    page.on('console', (m) => {
      if (m.type() === 'warning') lost.push(m.text());
    });
    await q(page, 'pause-button').click();
    await menuIs(page, true); // the menu itself came: only the code of the saves' actions is missing
    await q(page, 'pause-saves').click();
    await page.waitForSelector('[data-testid="saves-screen"][data-open="1"][data-ready="1"]', { timeout: 15000 });
    const said = (await q(page, 'saves-status').textContent()) ?? '';
    assert.match(said, /could not be read.*reload the page/, `the screen says what happened and what to do (${said})`);
    assert.equal(await q(page, 'saves-status').getAttribute('data-tone'), 'warn');
    assert.equal(await page.locator('[data-testid^="saves-slot-"]').count(), 0, 'and shows no game as if there were none');
    assert.ok(lost.some((m) => m.includes("the saved games' actions could not be loaded")), `the cause went to the log (${JSON.stringify(lost)})`);
    await q(page, 'saves-back').click();
    await screenIs(page, 'main');
    await q(page, 'pause-resume').click();
    await menuIs(page, false);
    ctx.errors.splice(0); // the failed request IS the console error this part asked for
    await page.evaluate('window.__troid.pause()');
    console.log('  pause: the world waits (clock, hero, camera, HUD) · Escape / P / the page in the background · no burst on return · no leaks · a menu that cannot be fetched does not trap the game · the code of the saves that cannot be fetched is said, not hidden');
  },
};
