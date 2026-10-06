import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Scenario } from '../scenario';
import { frames } from '../frames';

/**
 * The magic bar in the browser (docs/PROMPT5-LOG.md S15, GAME-SPEC-2D §10.1), with REAL keyboard: it is 0–100, it starts full and it is
 * on screen before any card; a cast takes exactly 30; it comes back GRADUALLY — 6 per second after one second without spending — and
 * never while casting (nor in the second that follows); it never goes past its two ends; a cast below 30 is refused: nothing is spent
 * and the bar and the card shake. (What the bolt itself does — flight, damage, devices — is the `bolt` scenario.)
 */
const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
const style = (page: Page, id: string, prop: string): Promise<string> => page.locator(`[data-testid="${id}"]`).evaluate((el, p) => (el as HTMLElement).style.getPropertyValue(p), prop);
const attr = (page: Page, id: string, name: string): Promise<string | null> => page.locator(`[data-testid="${id}"]`).getAttribute(name);

export const magic: Scenario = {
  name: 'magic',
  async run(ctx) {
    await ctx.open('room=movement_test&unlock=dash', { width: 844, height: 390 });
    const { page } = ctx;
    await ctx.teleport(90, 0);
    await ctx.step(30);
    const cast = async (): Promise<void> => {
      await page.keyboard.down('KeyK');
      await ctx.step(1);
      await page.keyboard.up('KeyK');
    };

    // ================================================================== the bar: 100 at the start, before any card
    let s = await ctx.state();
    assert.equal(s.magic, 100);
    assert.equal(s.card, null);
    await frames(page, 4);
    assert.equal(await attr(page, 'hud-magic', 'aria-valuenow'), '100');
    assert.equal(await style(page, 'hud-magic-fill', 'transform'), 'scaleX(1)', 'a full bar');
    assert.equal(await attr(page, 'hud-magic', 'data-regen'), '0', 'and nothing is coming back');
    await cast(); // no card: the Ability is not an action, and the bar is not touched
    await ctx.step(40);
    assert.equal((await ctx.state()).magic, 100);

    // ================================================================== a cast takes exactly 30
    await sess(page, 's.loadout.acquire("card_spirit_bolt");');
    await ctx.step(2);
    await cast();
    await ctx.step(6);
    assert.equal((await ctx.state()).magic, 100, 'nothing is spent while the cast is being prepared');
    await ctx.step(1); // the release
    s = await ctx.state();
    assert.equal(s.magic, 70, 'exactly 30');
    await frames(page, 4);
    assert.equal(await attr(page, 'hud-magic', 'aria-valuenow'), '70');
    assert.equal(await style(page, 'hud-magic-fill', 'transform'), 'scaleX(0.7)', 'the bar shows 70');
    assert.equal(await attr(page, 'hud-magic', 'data-regen'), '0', 'and it is not coming back yet: the second of delay');
    await ctx.shot('01-spent');

    // ================================================================== it comes back GRADUALLY: 1 s of delay (counted from the end of the cast), then 6 per second
    await ctx.step(3 + 15 + 60); // the cast ends 14 ticks after the press; the delay then runs 60 ticks
    s = await ctx.state();
    assert.ok(s.magic! > 70 && s.magic! < 72.5, `78 ticks after the release the delay has just run out (${s.magic})`);
    await frames(page, 4);
    assert.equal(await attr(page, 'hud-magic', 'data-regen'), '1', 'now it is coming back');
    const m0 = s.magic!;
    await ctx.step(60);
    const m1 = (await ctx.state()).magic!;
    assert.ok(Math.abs(m1 - (m0 + 6)) < 0.15, `six units per second (${m0} → ${m1})`);
    assert.ok(m1 < 100, 'and never an instant refill');
    await ctx.shot('02-regenerating');

    // ...and not a unit of it during the cast and the second after it: cast again from exactly 70 and look 50 ticks after the cast
    await sess(page, 's.magic.set(70); s.skills.reset();');
    await cast();
    await ctx.step(14 + 50); // the cast (14 ticks) and 50 ticks of the second after it
    assert.equal((await ctx.state()).magic, 40, 'no regeneration while casting and for a second after it (70 − 30 = 40)');
    await sess(page, 's.magic.restore();');
    await ctx.step(40);

    // ================================================================== three in a row, the fourth is refused
    for (let i = 0; i < 3; i++) {
      await cast();
      await ctx.step(40);
    }
    s = await ctx.state();
    assert.equal(s.magic, 10, 'three casts from a full bar leave 10');
    await cast();
    // the refusal shakes the bar and the card (real time: the page keeps rendering while the simulation is paused)
    let shook = false;
    for (let i = 0; i < 12 && !shook; i++) {
      await page.waitForTimeout(25);
      const t1 = await style(page, 'hud-magic', 'transform');
      const t2 = await style(page, 'hud-card', 'transform');
      shook = t1.includes('translateX') || t2.includes('translateX');
    }
    assert.ok(shook, 'a refused cast shakes the magic bar and the card');
    await ctx.step(30);
    s = await ctx.state();
    assert.equal(s.projectiles?.length, 0, 'no bolt was cast');
    assert.ok(s.magic! < 12, `and no magic was spent (${s.magic})`);
    await frames(page, 4);
    assert.equal(await attr(page, 'hud-card', 'data-state'), 'noMagic', 'the card is dimmed');
    await ctx.shot('03-refused');

    // ================================================================== the ends: never below 0, never above 100
    await sess(page, 's.magic.set(-40);');
    await ctx.step(1);
    await frames(page, 4);
    assert.equal((await ctx.state()).magic, 0);
    assert.equal(await attr(page, 'hud-magic', 'aria-valuenow'), '0');
    assert.equal(await style(page, 'hud-magic-fill', 'transform'), 'scaleX(0)', 'an empty bar');
    await sess(page, 's.magic.set(99.7);'); // the delay is over: it comes back at once, and stops at the end of the bar
    await ctx.step(40);
    assert.equal((await ctx.state()).magic, 100, 'it fills up to exactly 100 and no further');
    await sess(page, 's.magic.set(250);');
    await ctx.step(2);
    assert.equal((await ctx.state()).magic, 100);
    await frames(page, 4);
    assert.equal(await attr(page, 'hud-magic', 'aria-valuenow'), '100');
    assert.equal(await attr(page, 'hud-magic', 'data-regen'), '0', 'a full bar is not "regenerating"');
  },
};
