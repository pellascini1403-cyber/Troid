import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * THE PAUSE, THE SAVE AND THE CHANGE OF ZONE TOGETHER, in a real browser (docs/PROMPT14-LOG.md): the menu is opened in the middle of a fade between zones, while the world is held at the black waiting for
 * the next room's art (on a slow line), and in the middle of a defeat — and what is checked is what the player would be hurt by if it were wrong. The simulation stands where it was (not one tick when the
 * art arrives, nor when a game is saved by hand, nor when anything finishes loading behind the menu); a game saved while the world is held is a whole one — the room entered, at its entry; Continue lets
 * every one of them finish as if nothing had touched it.
 */
const SIZE = { width: 1280, height: 720, dpr: 1 };
const KEY = 'troid.progress';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);
const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
const stateOf = (page: Page): Promise<GameState & { arrival?: { blocking: boolean; stage: string } }> => page.evaluate('window.__troid.state()') as never;

async function waitFor(page: Page, expr: string, what: string, ms = 30000): Promise<void> {
  const t0 = Date.now();
  while (!(await page.evaluate(expr))) {
    if (Date.now() - t0 > ms) assert.fail(`timed out (${ms} ms) waiting for ${what} (${expr})`);
    await sleep(40);
  }
}
const stored = async (page: Page): Promise<{ at: { room: string; entry: string }; checkpoint: { room: string; entry: string }; flags: string[] } | null> => {
  const raw = (await page.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`)) as string | null;
  return raw === null ? null : JSON.parse(raw);
};
const overlay = (page: Page): Promise<number> => q(page, 'transition-overlay').evaluate((e) => (getComputedStyle(e).display === 'none' ? 0 : Number(getComputedStyle(e).opacity)));
async function openMenu(page: Page): Promise<void> {
  await q(page, 'pause-button').click();
  await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 15000 });
}
async function resume(page: Page): Promise<void> {
  await q(page, 'pause-resume').click();
  await page.waitForSelector('[data-testid="pause-menu"][data-open="0"]', { state: 'attached' });
}

export const pauseZone: Scenario = {
  name: 'pauseZone',
  async run(ctx: Ctx) {
    const net = { delay: 0 };
    await ctx.open('new=1', {
      ...SIZE,
      prepare: async (context) => {
        await context.route('**/art/**', async (route) => {
          if (net.delay > 0) await sleep(net.delay);
          await route.continue();
        });
      },
    });
    const { page } = ctx;
    await waitFor(page, `(() => { const s = window.__troid.state(); return s.roomArt !== null && s.arrival.blocking === false && s.transition.phase === 'none'; })()`, 'the first room to be dressed');

    // ================================================================================================ A · the menu opened in the middle of the fade between zones: the simulation stands in the middle of it
    await sess(page, 's.flags.set("defeated:r1_slime")');
    await ctx.step(2);
    await ctx.teleport(110, 0);
    await ctx.step(5);
    let s = await stateOf(page);
    assert.equal(s.transition?.phase, 'fadeOut', 'the exit started the fade');
    assert.equal(s.room, 'r1_gate');
    const life = s.health;
    await openMenu(page);
    const mid = await stateOf(page);
    const veil = await overlay(page);
    assert.ok(veil > 0.05 && veil < 0.95, `the screen is half way to black (${veil})`);
    await ctx.step(30); // a test asking for ticks is refused by a paused game
    await page.waitForTimeout(600);
    s = await stateOf(page);
    assert.deepEqual([s.transition?.phase, s.transition?.ticks, s.now, s.room], [mid.transition?.phase, mid.transition?.ticks, mid.now, mid.room], 'the fade is where it was: not one tick ran behind the menu');
    assert.equal(await overlay(page), veil, 'and so is the black that is drawn');
    assert.equal(s.menuOpen, true);
    await ctx.shot('a-01-paused-in-the-fade');
    await resume(page);
    await ctx.step(60);
    s = await stateOf(page);
    assert.equal(s.room, 'r2_hall', 'Continue lets the change of zone finish');
    assert.equal(s.transition?.phase, 'none');
    assert.equal(s.health, life, 'the hero is as they were');
    assert.equal(await page.locator('[data-testid="hud-life"]').getAttribute('aria-valuenow'), String(life), 'and the HUD says so');

    // ================================================================================================ B · the menu opened while the world is held at the black for the next room's art (a slow line)
    net.delay = 2500; // every art file of a room it has not seen waits this long
    await sess(page, 's.flags.set("defeated:r2_slime")');
    await ctx.step(2);
    await page.evaluate('window.__troid.resume()'); // the loop runs in real time: the change of zone, the wait and the art are a player's
    await ctx.teleport(89.5, 0);
    await waitFor(page, `window.__troid.arrival().blocking === true`, 'the world to be held at the black');
    // the pause KEY is heard while the world is held (no tick runs, so nobody samples the input: the page looks for it itself), and only that press is taken
    await page.keyboard.down('KeyJ'); // an attack press in the same moment: it must not be eaten by the look for the pause key
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 15000 });
    await page.keyboard.up('KeyJ');
    const held = await stateOf(page);
    assert.equal(held.room, 'r3_chamber', 'the simulation has swapped the room under the black');
    assert.equal(held.transition?.phase, 'hold');
    // the art arrives, the room is put on the stage, drawn out of sight… and the simulation does NOT move: the menu holds it
    await waitFor(page, `window.__troid.arrival().blocking === false`, 'the art to arrive and the wait to end', 40000);
    await page.waitForTimeout(1200);
    s = await stateOf(page);
    assert.ok(s.roomArt !== null, 'the room was dressed with its art behind the menu');
    assert.deepEqual([s.now, s.transition?.phase, s.transition?.ticks, s.room], [held.now, 'hold', held.transition?.ticks, 'r3_chamber'], 'not one tick ran when the wait ended: the black is still the black');
    assert.equal(s.menuOpen, true);

    // a game saved by hand while the world was held is a whole one: the room entered, at its entry, with what was won
    await q(page, 'pause-saves').click();
    await page.waitForSelector('[data-testid="saves-screen"][data-open="1"][data-ready="1"]', { timeout: 15000 });
    await q(page, 'saves-save-now').click();
    await waitFor(page, `document.querySelector('[data-testid="saves-status"]')?.textContent === 'Game saved.'`, 'the save by hand');
    const file = await stored(page);
    assert.deepEqual(file?.at, { room: 'r3_chamber', entry: 'west' }, 'it holds the room that was entered, at its entry — not a position in the middle of a change of zone');
    assert.deepEqual(file?.checkpoint, { room: 'r1_gate', entry: 'start' });
    assert.ok(file?.flags.includes('defeated:r2_slime'), 'with what was won');
    await page.waitForTimeout(600);
    assert.equal((await stateOf(page)).now, held.now, 'saving did not wake the simulation');
    await q(page, 'saves-back').click();
    await resume(page);
    await waitFor(page, `window.__troid.state().transition.phase === 'none'`, 'the change of zone to finish', 15000);
    s = await stateOf(page);
    assert.equal(s.room, 'r3_chamber');
    assert.ok(s.now! > held.now! + 10, 'the world goes on after Continue');
    assert.ok(s.roomArt !== null, 'whole');
    await ctx.shot('b-01-after-the-wait');
    assert.equal(await page.locator('[data-testid="pause-menu"]').getAttribute('data-open'), '0');
    await page.evaluate('window.__troid.pause()');
    net.delay = 0;

    // ================================================================================================ C · the menu opened in the middle of a defeat
    await ctx.teleport(40, 0);
    await sess(page, 's.player.health.damage(s.player.health.current - 1);');
    await page.evaluate('window.__troid.strikePlayer(1)');
    await ctx.step(3);
    s = await stateOf(page);
    assert.notEqual(s.death?.phase, 'none', 'the hero fell');
    await openMenu(page);
    const dying = await stateOf(page);
    await ctx.step(60);
    await page.waitForTimeout(500);
    s = await stateOf(page);
    assert.deepEqual([s.death?.phase, s.death?.ticks, s.now], [dying.death?.phase, dying.death?.ticks, dying.now], 'the defeat waits behind the menu');
    await resume(page);
    for (let i = 0; i < 400 && (await stateOf(page)).death?.phase !== 'none'; i++) await ctx.step(2);
    await ctx.step(10);
    s = await stateOf(page);
    assert.equal(s.death?.phase, 'none', 'Continue lets the defeat finish');
    assert.equal(s.room, 'r1_gate', 'and the hero is back at the checkpoint the game saved');
    assert.equal(s.health, s.maxHealth);
    console.log('  pauseZone: the menu in the middle of a fade, of the wait for the next room\'s art and of a defeat — the simulation stands, a game saved then is whole (the room entered, at its entry), Continue lets each finish');
  },
};
