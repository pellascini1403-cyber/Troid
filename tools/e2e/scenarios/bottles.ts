import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Scenario } from '../scenario';
import { centreOf, TouchScreen } from '../touch';

/**
 * The energy bottles in the browser (docs/PROMPT5-LOG.md S16, GAME-SPEC-2D §11), through REAL keyboard, an abstract gamepad and
 * real touches: three ready at the start; a request with full life is refused and shakes the row; drinking is a 24-tick channel
 * standing still whose effect (+2 life) lands on the last tick and which drains the vial; a hit in the middle spends nothing;
 * the bottles recharge one at a time, 60 s each; the contextual touch chip and the HUD icons ask for the next / a given bottle;
 * the fourth bottle is one more charge.
 */
const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
const attr = (page: Page, id: string, name: string): Promise<string | null> => page.locator(`[data-testid="${id}"]`).getAttribute(name);
const spawned = async (page: Page): Promise<number> => ((await page.evaluate('window.__troid.state()')) as { vfx: { spawned: number } }).vfx.spawned;

/**
 * Waits until the page is really drawing: `n` animation frames in a row. The first frames after a change can be very slow with
 * software GL (a long first draw), and the HUD plays its short transients in real time: an event that lands in the middle of
 * such a frame would be over before the next one.
 */
const frames = (page: Page, n = 8): Promise<unknown> =>
  page.evaluate(`new Promise((resolve) => { let k = 0; const f = () => (++k >= ${n} ? resolve(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);

/**
 * A shake lasts 0.28 s of REAL time and the HUD plays it frame by frame, so a poll can miss it when the browser has one slow
 * frame (software GL: the first frames after a change). An observer records ANY frame in which the element moved: arm it
 * before the thing that should shake it, ask afterwards.
 */
async function armShake(page: Page, id: string): Promise<void> {
  await page.evaluate(`(() => {
    const el = document.querySelector('[data-testid="${id}"]');
    window.__shakeSeen = false;
    if (window.__shakeObserver) window.__shakeObserver.disconnect();
    window.__shakeObserver = new MutationObserver(() => { if (el.style.transform.includes('translateX')) window.__shakeSeen = true; });
    window.__shakeObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
  })()`);
}
async function shook(page: Page): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    if ((await page.evaluate('window.__shakeSeen')) === true) return true;
    await page.waitForTimeout(25);
  }
  return false;
}

export const bottles: Scenario = {
  name: 'bottles',
  async run(ctx) {
    await ctx.open('room=movement_test&unlock=dash', { width: 844, height: 390 });
    let { page } = ctx;
    await ctx.teleport(90, 0);
    await ctx.step(30);

    // ================================================================== the start, and a drink that would not help
    let s = await ctx.state();
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready']);
    assert.equal(s.health, 5);
    assert.equal(await page.locator('[data-testid^="hud-bottle-"]').count(), 3, 'three vials on the HUD');
    assert.deepEqual(await page.locator('[data-testid^="hud-bottle-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['state'])), ['ready', 'ready', 'ready']);
    await frames(page);
    await armShake(page, 'hud-bottles');
    await page.keyboard.down('KeyL');
    await ctx.step(1);
    await page.keyboard.up('KeyL');
    assert.ok(await shook(page), 'a drink refused at full life shakes the row of bottles');
    await ctx.step(30);
    s = await ctx.state();
    assert.equal(s.state, 'free', 'the hero did not even stop');
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready'], 'nothing was spent');

    // ================================================================== the channel: 24 ticks, the effect on the last one
    await sess(page, 's.player.health.damage(2);');
    await ctx.step(1);
    const x0 = (await ctx.state()).x;
    const fx0 = await spawned(page);
    await page.keyboard.down('KeyL');
    await ctx.step(1); // the press tick
    await page.keyboard.up('KeyL');
    s = await ctx.state();
    assert.equal(s.state, 'drink');
    assert.equal(s.anim, 'drink', 'drinking has its own animation state');
    await ctx.step(12); // half way
    await page.waitForTimeout(120); // the HUD draws in real time
    assert.equal(await attr(page, 'hud-bottle-0', 'data-drinking'), '1', 'the vial being drunk glows');
    const drained = await page.locator('[data-testid="hud-bottle-0"] .hud-liquid').evaluate((e) => (e as HTMLElement).style.transform);
    const level = Number(/scaleY\(([\d.]+)\)/.exec(drained)?.[1]);
    assert.ok(level > 0.35 && level < 0.65, `half way through the channel the vial is half drained (${drained})`);
    assert.equal(await attr(page, 'hud-life', 'aria-valuenow'), '3', 'the life has not come back yet');
    await ctx.shot('01-drinking');
    await ctx.step(11); // 23 ticks after the press
    s = await ctx.state();
    assert.equal(s.state, 'drink');
    assert.equal(s.health, 3, 'the effect lands on the LAST tick, not before');
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready'], 'and the bottle is spent then, not before');
    await ctx.step(1);
    s = await ctx.state();
    assert.equal(s.health, 5, '+2 life');
    assert.deepEqual(s.bottles, ['recharging', 'ready', 'ready'], 'the first bottle is used and recharging');
    assert.equal(s.state, 'free');
    assert.equal(s.x, x0, 'he stood still all along');
    assert.ok((await spawned(page)) > fx0, 'the ring and the heal burst played');
    await page.waitForTimeout(120);
    assert.deepEqual(
      await page.locator('[data-testid^="hud-bottle-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['state'])),
      ['recharging', 'ready', 'ready'],
      'the HUD shows used / recharging, ready, ready',
    );
    assert.equal(await attr(page, 'hud-life', 'aria-valuenow'), '5');
    await ctx.shot('02-healed');

    // ================================================================== a hit in the middle costs nothing
    await sess(page, 's.player.health.damage(2);');
    await ctx.step(1);
    await page.keyboard.down('KeyQ'); // the other key of the same action
    await ctx.step(1);
    await page.keyboard.up('KeyQ');
    assert.equal((await ctx.state()).state, 'drink');
    await ctx.step(10);
    await page.evaluate('window.__troid.strikePlayer(1)');
    await ctx.step(1);
    s = await ctx.state();
    assert.equal(s.state, 'hurt', 'the hit broke the channel');
    assert.equal(s.health, 2, 'only the hit counted: 3 − 1, no +2');
    assert.deepEqual(s.bottles, ['recharging', 'ready', 'ready'], 'no bottle was spent');
    await ctx.step(60);
    assert.equal((await ctx.state()).state, 'free');

    // ================================================================== the same action from a gamepad (LB)
    await page.evaluate('window.__troid.pad.set(0, 0, [4])');
    await ctx.step(1);
    await page.evaluate('window.__troid.pad.set(0, 0, [])');
    s = await ctx.state();
    assert.equal(s.state, 'drink', 'LB drinks the next ready bottle');
    assert.equal(s.device, 'gamepad');
    await ctx.step(24);
    s = await ctx.state();
    assert.equal(s.health, 4, 'the same +2 (2 → 4)');
    assert.deepEqual(s.bottles, ['recharging', 'empty', 'ready'], 'the second one is used and waits its turn: they recharge ONE at a time');
    await page.evaluate('window.__troid.pad.remove()');

    // ================================================================== the recharge: 60 s each, in order
    const left = (await page.evaluate('window.__troid.session.bottles.rechargeLength - window.__troid.session.bottles.slots[0].progress')) as number;
    assert.ok(left > 3000 && left <= 3600, `the first one is still charging (${left} ticks to go)`);
    await ctx.step(left - 1);
    assert.deepEqual((await ctx.state()).bottles, ['recharging', 'empty', 'ready']);
    await ctx.step(1);
    assert.deepEqual((await ctx.state()).bottles, ['ready', 'recharging', 'ready'], 'the first is back after its minute, and only then the second starts');
    await ctx.step(3600);
    assert.deepEqual((await ctx.state()).bottles, ['ready', 'ready', 'ready'], 'another minute and they are all back');

    // ================================================================== touch: the contextual chip, the HUD icons and a fourth bottle
    await ctx.open('room=movement_test&unlock=dash&touch=1', { width: 844, height: 390, touch: true });
    page = ctx.page;
    await ctx.teleport(90, 0);
    await ctx.step(30);
    const screen = await new TouchScreen(page).init();
    const chip = (): Promise<string> => page.locator('[data-testid="touch-chip"]').evaluate((e) => getComputedStyle(e).display);
    assert.equal(await chip(), 'none', 'full life: there is no chip');
    await sess(page, 's.player.health.damage(3);');
    await ctx.step(1);
    await page.waitForTimeout(100);
    assert.notEqual(await chip(), 'none', 'hurt with a bottle ready: the chip appears');
    const c = await centreOf(page, 'touch-chip');
    await screen.tap(1, c.x, c.y);
    await ctx.step(1);
    s = await ctx.state();
    assert.equal(s.state, 'drink', 'tapping the chip drinks the next bottle');
    assert.equal(s.device, 'touch');
    await ctx.step(24);
    s = await ctx.state();
    assert.equal(s.health, 4);
    assert.deepEqual(s.bottles, ['recharging', 'ready', 'ready']);

    // a HUD icon names ITS bottle: the third one
    await sess(page, 's.player.health.damage(3);');
    await ctx.step(1);
    await page.waitForTimeout(100);
    const v2 = await centreOf(page, 'hud-bottle-2');
    await screen.tap(2, v2.x, v2.y);
    await ctx.step(1);
    assert.equal((await ctx.state()).state, 'drink');
    await ctx.step(24);
    s = await ctx.state();
    assert.deepEqual(s.bottles, ['recharging', 'ready', 'empty'], 'the third one was spent (it waits its turn), the second is untouched');

    // a tap on a vial that is not ready is refused (the row shakes) and drinks nothing, however hurt he is
    assert.equal(s.health, 3);
    const v0 = await centreOf(page, 'hud-bottle-0');
    await frames(page);
    await armShake(page, 'hud-bottles');
    await screen.tap(3, v0.x, v0.y);
    await ctx.step(1);
    assert.ok(await shook(page), 'a tap on a used bottle shakes the row');
    await ctx.step(30);
    assert.equal((await ctx.state()).state, 'free');

    // the fourth bottle, a reward, is one more charge
    await sess(page, 's.bottles.addSlot("energy_bottle");');
    await ctx.step(2);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-testid^="hud-bottle-"]').count(), 4, 'four vials');
    const v3 = await centreOf(page, 'hud-bottle-3');
    await screen.tap(4, v3.x, v3.y);
    await ctx.step(1);
    assert.equal((await ctx.state()).state, 'drink');
    await ctx.step(24);
    s = await ctx.state();
    assert.equal(s.bottles?.length, 4);
    assert.equal(s.bottles?.[3], 'empty', 'the fourth was drunk like the others');
    await ctx.shot('03-touch-four');
  },
};
