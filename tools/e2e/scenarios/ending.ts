import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { COMPLETED_FLAG } from '@/progression/adventure';
import { DEFAULT_TOUCH } from '@/input/gestures/TouchConfig';
import type { TouchLayout } from '@/ui/touch/layout';
import { reload, seed, stored } from '../bossKit';
import { frames } from '../frames';
import type { Ctx, Scenario } from '../scenario';
import { centreOf, TouchScreen } from '../touch';

/**
 * THE END OF THE ADVENTURE, in a real browser (docs/PROMPT20-LOG.md): a hero who has done everything walks out of the world, and the game answers the way a finished game does — it holds the world, saves the game as
 * COMPLETED before anything is shown, opens the closing (the end, what the game counted, the credits) and offers the two ways on. Nothing typed or touched reaches the world meanwhile; the key that leaves the closing goes back
 * into the world, where the way out is spent for this visit and is announced again on the next; a game that is loaded is still completed, says so on the saved-games card and in the profile; and a new game, in the same slot
 * or in another, starts clean without touching the completed one.
 *
 *  - desktop, with the keyboard: the way out, the closing, the held world, the saved flag, Escape, the pause map, a reload, the second visit, the saved games and a new game in another slot;
 *  - a phone held sideways, with fingers: the credits roll on their own and a wheel / a finger stops them, the closing fits the screen with fingers' buttons, and a tap on "keep exploring" gives the world back;
 *  - a player who asked the system for less motion: nothing rolls.
 */
const DESKTOP = { width: 1280, height: 720, dpr: 1 };
const PHONE = { width: 844, height: 390, dpr: 2, touch: true };

/** A hero who has done everything: both slimes down, the card taken, the seal broken, the Warden fallen and the Air Dash in hand — standing at the west door of R4. A version-1 file on purpose (it migrates). */
const DONE = {
  saveVersion: 1,
  at: { room: 'r4_sanctum', entry: 'west' },
  checkpoint: { room: 'r1_gate', entry: 'start' },
  flags: ['broken:r3_seal', 'defeated:r1_slime', 'defeated:r2_slime', 'defeated:r4_boss', 'taken:air_dash', 'taken:card_spirit_bolt'],
  abilities: ['air_dash', 'dash', 'magic_attack'],
  cards: { owned: ['card_spirit_bolt'], equipped: 'card_spirit_bolt' },
  bottleSlots: 3,
};

const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);
const text = (page: Page, id: string): Promise<string> => q(page, id).evaluate((e) => e.textContent ?? '');

async function waitFor(page: Page, expr: string, what: string, tries = 200): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(expr)) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what} (${expr})`);
}
const screenIs = (page: Page, screen: string): Promise<void> =>
  waitFor(page, `document.querySelector('[data-testid="pause-menu"]')?.dataset.screen === '${screen}' && document.querySelector('[data-testid="pause-menu"]')?.dataset.open === '1'`, `the menu is on its ${screen} screen`);
const menuClosed = (page: Page): Promise<void> => waitFor(page, `document.querySelector('[data-testid="pause-menu"]')?.dataset.open !== '1' && !window.__troid.state().menuOpen`, 'the menu is closed');

/** A page the game opened again by itself (a new game, another slot): wait for the game and every cosmetic chunk, and stop its clock, as `ctx.open` does. */
async function reloading(page: Page, press: () => Promise<unknown>): Promise<void> {
  const loaded = page.waitForEvent('load', { timeout: 30000 });
  await press();
  await loaded;
  await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
  await page.waitForFunction('window.__troid.effectsReady()', undefined, { timeout: 30000 });
  await page.evaluate('window.__troid.pause()');
  await page.waitForTimeout(150);
}

/**
 * A clock the test holds: `performance.now()` stands still until the test moves it. The closing waits a moment after it opens before its buttons answer (a last jump must not skip it), and the test — not the speed of a
 * software renderer — decides when that moment is over.
 */
const freezeClock = (page: Page): Promise<void> => page.evaluate(`(() => { const real = performance.now.bind(performance); const c = (window.__clock = { value: real(), real }); performance.now = () => c.value; })()`);
const moveClock = (page: Page, ms: number): Promise<void> => page.evaluate(`window.__clock.value += ${ms}`);
const thawClock = (page: Page): Promise<void> => page.evaluate('performance.now = window.__clock.real');

/** What the world is doing: the simulation clock and the hero. */
async function world(ctx: Ctx): Promise<{ now: number; x: number; y: number }> {
  const s = await ctx.state();
  return { now: s.now ?? -1, x: s.x, y: s.y };
}

/** A game that was completed, loaded: the page reloaded on it, paused at its first tick. */
async function loadDone(ctx: Ctx, query: string, size: typeof DESKTOP | typeof PHONE, prepare?: (page: Page) => Promise<void>): Promise<void> {
  await ctx.open(query, size);
  await prepare?.(ctx.page);
  await seed(ctx, DONE);
  await ctx.page.evaluate('window.__troid.pause()');
  const s = await ctx.state();
  assert.equal(s.room, 'r4_sanctum', 'the saved game continues in R4');
  assert.ok(!s.flags!.includes(COMPLETED_FLAG), 'it has not been completed yet');
  assert.ok(s.flags!.includes('defeated:r4_boss'), 'the Warden is gone: the way out is open');
}

/** Holds the right key and runs ticks until the closing opens (the real keyboard: the same events a player makes). */
async function walkOut(ctx: Ctx): Promise<void> {
  // the room is built again, as walking back in from R3 would (the way out is spent for a visit to a room: the next visit finds it fresh)
  await ctx.page.evaluate('window.__troid.session.loadRoom("r4_sanctum", "west")');
  await ctx.teleport(91, 0);
  await ctx.page.keyboard.down('KeyD');
  let ticks = 0;
  for (; ticks < 400 && !(await ctx.state()).menuOpen; ticks += 6) await ctx.step(6);
  await ctx.page.keyboard.up('KeyD');
  const after = await ctx.state();
  assert.ok(after.menuOpen, `the way out of the world opened the closing (${ticks} ticks; room ${after.room}, x ${after.x.toFixed(2)}, exits ${JSON.stringify(after.exits)}, state ${after.state}, flags ${JSON.stringify(after.flags)}, health ${after.health})`);
}

export const ending: Scenario = {
  name: 'ending',
  async run(ctx) {
    // ================================================================================================ desktop: the way out, the closing, the world held
    await loadDone(ctx, 'paused=1&lang=es', DESKTOP);
    let page = ctx.page;
    assert.equal((await ctx.state()).menuOpen, false);
    assert.equal(await q(page, 'ending-screen').count(), 0, 'the closing costs nothing until the hero gets there: it is not even built');

    await freezeClock(page);
    await walkOut(ctx);
    await screenIs(page, 'ending');
    let s = await ctx.state();
    assert.deepEqual(s.exits, ['east'], 'the way out was touched…');
    assert.ok(s.flags!.includes(COMPLETED_FLAG), '…and the world remembers it');
    assert.ok(s.x > 94.5, `the hero stands in the way out (x ${s.x.toFixed(2)})`);
    assert.equal(await text(page, 'ending-title'), 'FIN');
    assert.equal(await text(page, 'ending-lead'), 'Has llegado al final de la aventura.');
    assert.equal(await q(page, 'ending-continue').evaluate((e) => (e as HTMLElement).innerText), 'Seguir explorando');
    assert.equal(await q(page, 'ending-saves').evaluate((e) => (e as HTMLElement).innerText), 'Partidas');
    assert.equal(await page.evaluate('document.activeElement && document.activeElement.dataset.testid'), 'ending-continue', 'the focus is on the way on');
    assert.equal(await text(page, 'ending-deaths'), '0');
    assert.match(await text(page, 'ending-time'), /^\d+:\d\d$/);
    assert.equal(await text(page, 'ending-bosses'), '1 de 1', 'the Warden is counted');
    assert.ok((await text(page, 'ending-credits')).includes('Créditos') && (await text(page, 'ending-credits')).includes('PixiJS') && (await text(page, 'ending-credits')).includes('Gracias por jugar.'), 'the credits are there');
    assert.equal(await q(page, 'pause-resume').isVisible(), true, 'the column of options is still at its side');
    await frames(page, 30);
    await ctx.shot('a-desktop');

    // the Space of a last jump, a moment after the closing opened, must not press the button that has the focus and skip the end unread
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await screenIs(page, 'ending');
    assert.equal((await ctx.state()).menuOpen, true, 'Space and Enter in the first instants answer nothing');
    await moveClock(page, 400); // still inside the moment (700 ms)
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    await screenIs(page, 'ending');

    // the world is held: nothing that moves, and nothing typed reaches it
    const held = await world(ctx);
    for (const key of ['KeyJ', 'KeyK', 'KeyL', 'KeyD', 'KeyA', 'ArrowRight', 'ShiftLeft']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(40);
    }
    await ctx.step(20);
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(120);
      assert.deepEqual(await world(ctx), held, `the world does not move (sample ${i})`);
    }
    assert.equal((await ctx.state()).combat?.attack, null, 'and the hero did not swing');

    // saved as completed BEFORE the player does anything: the game on disk knows
    let saved = await stored(page);
    for (let i = 0; i < 100 && !saved?.flags.includes(COMPLETED_FLAG); i++) {
      await page.waitForTimeout(50);
      saved = await stored(page);
    }
    assert.ok(saved?.flags.includes(COMPLETED_FLAG), 'the saved game says the adventure is completed');
    assert.equal(saved!.flags.filter((f) => f === COMPLETED_FLAG).length, 1);
    assert.equal(saved!.at.room, 'r4_sanctum', 'and it continues in the world, not on the way out');

    // once the moment is over the same Space presses the button that has the focus — keep exploring, with the keyboard
    await moveClock(page, 400);
    await page.keyboard.press('Space');
    await menuClosed(page);
    assert.ok((await world(ctx)).now >= held.now, 'the world is given back');
    await thawClock(page);
    // the closing again (the way out is spent for this visit; a new visit announces it): this time Escape leaves it
    await walkOut(ctx);
    await screenIs(page, 'ending');
    await page.waitForTimeout(800);

    // ================================================================================================ Escape: back into the world, where the way out is spent
    await page.keyboard.press('Escape');
    await menuClosed(page);
    await ctx.step(40);
    s = await ctx.state();
    assert.ok(s.now! > held.now + 30, 'the world runs again');
    assert.equal(await page.evaluate('document.querySelector("[data-testid=\\"pause-menu\\"]").dataset.open'), '0', 'and the closing did not come back by itself');
    assert.deepEqual(s.exits, ['east'], 'the way out is spent for this visit');
    await ctx.step(30);
    assert.equal((await ctx.state()).menuOpen, false, 'standing in it, the closing does not come back');
    // the pause menu opens on the MAP, as always — the closing is not an entry of the list
    await page.keyboard.press('KeyP');
    await ctx.step(1); // (the loop is held by the test: the next tick is what hears the key)
    await screenIs(page, 'main');
    assert.equal(await q(page, 'ending-screen').evaluate((e) => (e as HTMLElement).dataset.open), '0');
    await page.keyboard.press('KeyP');
    await menuClosed(page);

    // ================================================================================================ a game that is loaded is still completed — and says so
    await reload(page);
    s = await ctx.state();
    assert.equal(s.room, 'r4_sanctum');
    assert.ok(s.flags!.includes(COMPLETED_FLAG), 'the loaded game is completed');
    assert.equal(s.menuOpen, false, 'loading it does not end it again');
    await ctx.step(30);
    assert.equal((await ctx.state()).menuOpen, false);
    await page.keyboard.press('KeyP');
    await ctx.step(1); // (the loop is held by the test: the next tick is what hears the key)
    await screenIs(page, 'main');
    await q(page, 'pause-profile').click();
    assert.equal(await text(page, 'profile-status'), 'Completada', 'the profile says it');
    await q(page, 'profile-back').click();
    await q(page, 'pause-saves').click();
    await waitFor(page, `document.querySelector('[data-testid="saves-screen"]')?.dataset.ready === '1'`, 'the games are read');
    assert.equal(await q(page, 'saves-slot-1').locator('.saves-chip[data-kind="completed"]').count(), 1, 'the saved-games card of the slot says Completada');
    assert.equal(await text(page, 'saves-slot-1').then((t) => t.includes('Completada') && t.includes('En curso')), true);
    assert.equal(await q(page, 'saves-slot-2').locator('.saves-chip').count(), 0, 'and the empty slots claim nothing');
    await ctx.shot('b-saves');
    await q(page, 'saves-back').click();
    await page.keyboard.press('Escape');
    await menuClosed(page);

    // ================================================================================================ the second visit: announced again, the memory written once
    const flagsBefore = (await ctx.state()).flags!;
    await walkOut(ctx);
    await screenIs(page, 'ending');
    assert.deepEqual((await ctx.state()).flags, flagsBefore, 'the flags are the same: the memory of the end was written once');
    // keep exploring (the button, once the closing has had its moment): the world is given back
    await page.waitForTimeout(800);
    await q(page, 'ending-continue').click();
    await menuClosed(page);
    const back = (await world(ctx)).now;
    await ctx.step(20);
    assert.ok((await world(ctx)).now > back, 'the world runs again after "keep exploring"');

    // ================================================================================================ the saved games: a new game in ANOTHER slot starts clean and leaves the completed one alone
    await walkOut(ctx);
    await screenIs(page, 'ending');
    await page.waitForTimeout(800);
    await q(page, 'ending-saves').click();
    await screenIs(page, 'saves');
    await waitFor(page, `document.querySelector('[data-testid="saves-screen"]')?.dataset.ready === '1'`, 'the games are read');
    await reloading(page, () => q(page, 'saves-new-2').click()); // nothing in slot 2: it starts at once, with nothing to ask
    s = await ctx.state();
    assert.equal(s.room, 'r1_gate', 'slot 2 is a NEW game: the first room');
    assert.deepEqual(s.flags, [], 'with nothing won');
    assert.equal(s.slot, 2);
    assert.equal(s.menuOpen, false);
    assert.equal(s.stats!.deaths + s.stats!.kills, 0);
    assert.equal(await page.evaluate(`JSON.parse(localStorage.getItem('troid.progress')).flags.includes(${JSON.stringify(COMPLETED_FLAG)})`), true, 'slot 1 still holds the completed game');
    await page.keyboard.press('KeyP');
    await ctx.step(1); // (the loop is held by the test: the next tick is what hears the key)
    await screenIs(page, 'main');
    await q(page, 'pause-profile').click();
    assert.equal(await text(page, 'profile-status'), 'En curso', 'the new game is not completed');
    await q(page, 'profile-back').click();
    await q(page, 'pause-saves').click();
    await waitFor(page, `document.querySelector('[data-testid="saves-screen"]')?.dataset.ready === '1'`, 'the games are read');
    assert.equal(await q(page, 'saves-slot-1').locator('.saves-chip[data-kind="completed"]').count(), 1, 'slot 1 is still completed');
    assert.equal(await q(page, 'saves-slot-2').locator('.saves-chip[data-kind="completed"]').count(), 0, 'and slot 2 is not');
    assert.equal(await q(page, 'saves-slot-2').getAttribute('data-active'), '1');

    // ================================================================================================ a phone held sideways, with fingers
    await loadDone(ctx, 'paused=1&touch=1&lang=en', PHONE);
    page = ctx.page;
    const screen = await new TouchScreen(page).init();
    const layout = ((await page.evaluate('window.__troid.touch()')) as { layout: TouchLayout }).layout;
    /** A firm drag on the movement zone takes the hero from the vestibule of the last room out of the world. */
    const fingerOut = async (): Promise<void> => {
      await page.evaluate('window.__troid.session.loadRoom("r4_sanctum", "west")');
      await ctx.teleport(91, 0);
      await screen.touch(1, layout.zone.x + layout.zone.w * 0.4, 250);
      await screen.drag(1, DEFAULT_TOUCH.rx * layout.gestureScale * 1.6, 0, 4, 8);
      for (let i = 0; i < 80 && !(await ctx.state()).menuOpen; i++) await ctx.step(6);
      await screen.lift(1);
      assert.ok((await ctx.state()).menuOpen, 'a finger took the hero out of the world');
      await screenIs(page, 'ending');
    };
    await fingerOut();
    assert.equal(await text(page, 'ending-title'), 'THE END');
    assert.equal(await text(page, 'ending-lead'), 'You have reached the end of the adventure.');
    await frames(page, 20);
    // it fits the screen, and the buttons are as tall as a finger
    const stage = await q(page, 'pause-stage').boundingBox();
    const panel = await q(page, 'ending-screen').boundingBox();
    assert.ok(stage && panel);
    assert.ok(panel.x >= stage.x - 1 && panel.x + panel.width <= stage.x + stage.width + 1 && panel.y >= 0 && panel.y + panel.height <= PHONE.height + 1, `the closing fits the screen (${JSON.stringify(panel)})`);
    for (const id of ['ending-continue', 'ending-saves']) {
      const b = await centreOf(page, id);
      assert.ok(b.h >= 38, `${id} is as tall as a finger (${b.h} px)`);
      assert.ok(b.x - b.w / 2 >= 0 && b.x + b.w / 2 <= PHONE.width, `${id} is on the screen`);
    }
    await ctx.shot('c-phone');

    // the credits roll on their own (a real clock: after a moment's calm, at a walking pace) and end where they end…
    const body = q(page, 'ending-body');
    const over = await body.evaluate((e) => e.scrollHeight - e.clientHeight);
    assert.ok(over > 40, `on a phone the credits are longer than the screen (${over} px)`);
    await waitFor(page, `document.querySelector('[data-testid="ending-body"]').scrollTop > 8`, 'the credits roll by themselves', 400);
    await waitFor(page, `(() => { const b = document.querySelector('[data-testid="ending-body"]'); return b.scrollTop >= b.scrollHeight - b.clientHeight - 1; })()`, 'and roll to their end', 600);

    // the world is held under the touch layer: a finger on the buttons of the game does nothing
    const held2 = await world(ctx);
    if (await q(page, 'touch-attack').isVisible()) {
      const attack = await centreOf(page, 'touch-attack');
      await screen.tap(3, attack.x, attack.y);
    }
    await ctx.step(10);
    assert.deepEqual(await world(ctx), held2, 'the world does not move under the closing');

    // "keep exploring", with a tap: the world is given back, and the touch controls work again
    await page.waitForTimeout(800);
    const keep = await centreOf(page, 'ending-continue');
    await screen.tap(4, keep.x, keep.y);
    await menuClosed(page);
    const before = (await world(ctx)).now;
    await ctx.step(10);
    assert.ok((await world(ctx)).now > before, 'the world runs again');

    // …and a finger on them stops that for good: the second time the hero gets there, the first thing a finger does with the credits makes them its own
    await fingerOut();
    await waitFor(page, `document.querySelector('[data-testid="ending-body"]').scrollTop > 6`, 'the credits begin to roll', 400);
    const there = await body.boundingBox();
    assert.ok(there);
    await screen.tap(2, there.x + there.width / 2, there.y + there.height / 2); // (a drag would also fling the list on by itself: the finger's own momentum, not the roll)
    const stopped = await body.evaluate((e) => e.scrollTop);
    assert.ok(stopped < over - 8, `the roll was stopped on its way, not at its end (${stopped} of ${over})`);
    await page.waitForTimeout(1200);
    assert.equal(await body.evaluate((e) => e.scrollTop), stopped, 'a finger on the credits stops the roll: they are the player\'s now');

    // ================================================================================================ less motion: nothing rolls
    await loadDone(ctx, 'paused=1&lang=en', DESKTOP, async (p) => {
      await p.emulateMedia({ reducedMotion: 'reduce' });
    });
    page = ctx.page;
    await page.setViewportSize({ width: 844, height: 390 }); // small enough that the credits are longer than the screen
    await walkOut(ctx);
    await screenIs(page, 'ending');
    const long = await q(page, 'ending-body').evaluate((e) => e.scrollHeight - e.clientHeight);
    assert.ok(long > 20, `the credits are longer than the screen (${long} px)`);
    await page.waitForTimeout(4200); // longer than the calm before a roll, and the roll would be well on its way
    assert.equal(await q(page, 'ending-body').evaluate((e) => e.scrollTop), 0, 'a player who asked the system for less motion gets a still list');
    const list = await q(page, 'ending-body').boundingBox();
    assert.ok(list);
    await page.mouse.move(list.x + list.width / 2, list.y + list.height / 2);
    await page.mouse.wheel(0, 120);
    await waitFor(page, `document.querySelector('[data-testid="ending-body"]').scrollTop > 20`, 'and they scroll it themselves');
  },
};
