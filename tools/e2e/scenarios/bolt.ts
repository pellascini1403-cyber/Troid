import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Scenario } from '../scenario';
import { countPixels, decodePng, isCyanLight } from '../png';
import { centreOf, TouchScreen } from '../touch';

/**
 * Magic and the Spirit Bolt in the browser (docs/PROMPT5-LOG.md S15, GAME-SPEC-2D §10.1), with REAL keyboard, an abstract gamepad
 * and real touches: no card = no Ability; with the card, a cast costs exactly 30 at the release (6 ticks of preparation), the
 * bolt flies 16 m/s over 12 m, hits for 2 and does not pierce; the magic regenerates 6/s after a second and never while casting;
 * a refused cast (below 30) shakes the bar and the card; the bolt is cyan with a white core.
 */
const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
const style = (page: Page, id: string, prop: string): Promise<string> => page.locator(`[data-testid="${id}"]`).evaluate((el, p) => (el as HTMLElement).style.getPropertyValue(p), prop);
const cyan = async (page: Page): Promise<number> => countPixels(decodePng(await page.screenshot()), isCyanLight, { x0: 250, y0: 100, x1: 840, y1: 330 });

export const bolt: Scenario = {
  name: 'bolt',
  async run(ctx) {
    await ctx.open('room=movement_test&unlock=dash', { width: 844, height: 390 });
    let { page } = ctx;
    await ctx.teleport(90, 0);
    await ctx.step(30);

    // ================================================================== no card: the Ability does nothing
    let s = await ctx.state();
    assert.equal(s.magic, 100);
    assert.equal(s.card, null, 'the hero starts with NO card');
    await page.keyboard.down('KeyK');
    await ctx.step(3);
    await page.keyboard.up('KeyK');
    await ctx.step(40);
    s = await ctx.state();
    assert.equal(s.state, 'free', 'Ability without a card is not an action');
    assert.equal(s.magic, 100);
    assert.equal(s.projectiles?.length, 0);

    // ================================================================== with the card: ready, and the cast
    await sess(page, 's.loadout.acquire("card_spirit_bolt");');
    await ctx.step(2);
    assert.equal((await ctx.state()).card, 'card_spirit_bolt');
    assert.equal(await page.locator('[data-testid="hud-card"]').getAttribute('data-state'), 'ready');
    assert.equal(await page.evaluate('window.__troid.session.abilities.has("magic_attack")'), true, 'the card taught the ability');
    const before = await cyan(page);

    await page.keyboard.down('KeyK');
    await ctx.step(1); // the press: the cast begins
    await page.keyboard.up('KeyK');
    s = await ctx.state();
    assert.equal(s.state, 'cast');
    assert.equal(s.anim, 'cast', 'the cast has its own animation state');
    await ctx.step(6); // 6 ticks of preparation: nothing paid yet
    s = await ctx.state();
    assert.equal(s.magic, 100, 'nothing is spent while the cast is being prepared');
    assert.equal(s.projectiles?.length, 0);
    await ctx.step(1); // the release
    s = await ctx.state();
    assert.equal(s.magic, 70, 'a cast costs exactly 30');
    await ctx.step(3);
    s = await ctx.state();
    assert.equal(s.projectiles?.length, 1, 'the bolt is in flight');
    assert.equal(await style(page, 'hud-magic-fill', 'transform'), 'scaleX(0.7)', 'the bar shows 70');
    assert.equal(await page.locator('[data-testid="hud-card"]').getAttribute('data-state'), 'cooldown', 'the card sweeps its 0.3 s cooldown');
    const flying = await cyan(page);
    assert.ok(flying > before + 60, `the bolt is cyan light on screen (${before} → ${flying} px)`);
    await ctx.shot('01-bolt');

    // ================================================================== flight: 16 m/s, 12 m, then gone
    const x1 = s.projectiles![0]!.x;
    await ctx.step(15);
    const x2 = (await ctx.state()).projectiles![0]!.x;
    assert.ok(Math.abs(x2 - x1 - 4) < 0.05, `16 m/s: 4 m in 15 ticks (${(x2 - x1).toFixed(2)})`);
    await ctx.step(60);
    assert.equal((await ctx.state()).projectiles?.length, 0, 'it fizzles out after 12 m');

    // ================================================================== the magic: 1 s of delay (counted from the end of the cast), then 6 per second
    s = await ctx.state();
    assert.ok(s.magic! > 70 && s.magic! < 72.5, `78 ticks after the release the delay has just run out (${s.magic})`);
    const m0 = s.magic!;
    await ctx.step(60);
    assert.ok(Math.abs((await ctx.state()).magic! - (m0 + 6)) < 0.15, 'six units per second');
    await sess(page, 's.magic.restore();');
    await ctx.step(1);
    // ...and not a unit of it during the cast and the second after it: cast again from exactly 70 and look 50 ticks after the cast
    await sess(page, 's.magic.set(70); s.skills.reset();');
    await page.keyboard.down('KeyK');
    await ctx.step(1);
    await page.keyboard.up('KeyK');
    await ctx.step(14 + 50); // the cast (14 ticks) and 50 ticks of the second after it
    assert.equal((await ctx.state()).magic, 40, 'no regeneration while casting and for a second after it (70 − 30 = 40)');
    await sess(page, 's.magic.restore();');
    await ctx.step(40);

    // ================================================================== three in a row, the fourth is refused
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('KeyK');
      await ctx.step(1);
      await page.keyboard.up('KeyK');
      await ctx.step(40);
    }
    s = await ctx.state();
    assert.equal(s.magic, 10, 'three casts from a full bar leave 10');
    await page.keyboard.down('KeyK');
    await ctx.step(1);
    await page.keyboard.up('KeyK');
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
    assert.equal(await page.locator('[data-testid="hud-card"]').getAttribute('data-state'), 'noMagic', 'the card is dimmed');
    await ctx.shot('02-refused');
    await sess(page, 's.magic.restore();');
    await ctx.step(40);

    // ================================================================== it hits for 2 and does not pierce
    await ctx.teleport(90, 0);
    await ctx.step(20);
    const near = await page.evaluate('window.__troid.spawnDummy(96, 0, 10)');
    const far = await page.evaluate('window.__troid.spawnDummy(99, 0, 10)');
    await ctx.step(3);
    await page.keyboard.down('KeyK');
    await ctx.step(1);
    await page.keyboard.up('KeyK');
    await ctx.step(40);
    s = await ctx.state();
    const dn = s.dummies!.find((d) => d.id === near)!;
    const df = s.dummies!.find((d) => d.id === far)!;
    assert.equal(dn.hp, 8, 'the first target loses 2');
    assert.equal(df.hp, 10, 'the second is not touched: it does not pierce');
    await ctx.shot('03-hit');

    // ================================================================== the same Ability from a gamepad and from a touch screen
    await sess(page, 's.magic.restore(); s.skills.reset();');
    await ctx.step(30);
    await page.evaluate('window.__troid.pad.set(0, 0, [3])'); // Y
    await ctx.step(1);
    await page.evaluate('window.__troid.pad.set(0, 0, [])');
    await ctx.step(8);
    assert.equal((await ctx.state()).magic, 70, 'Y casts it too');
    await page.evaluate('window.__troid.pad.remove()');

    await ctx.open('room=movement_test&unlock=dash&touch=1', { width: 844, height: 390, touch: true });
    page = ctx.page;
    await ctx.teleport(90, 0);
    await ctx.step(30);
    assert.equal(await page.locator('[data-testid="touch-ability"]').evaluate((e) => getComputedStyle(e).display), 'none', 'no card: no Ability button');
    await sess(page, 's.loadout.acquire("card_spirit_bolt");');
    await ctx.step(2);
    const screen = await new TouchScreen(page).init();
    const btn = await centreOf(page, 'touch-ability');
    await screen.tap(1, btn.x, btn.y);
    await ctx.step(9);
    s = await ctx.state();
    assert.equal(s.magic, 70, 'the Ability button casts the equipped card');
    assert.equal(s.device, 'touch');
    await ctx.step(30);
    await sess(page, 's.magic.set(10);');
    await ctx.step(1);
    assert.equal(await page.locator('[data-testid="touch-ability"] > div').evaluate((e) => (e as HTMLElement).style.opacity), '0.45', 'the button dims when the magic is short');
    await ctx.shot('04-touch-ability');

    // ================================================================== the card taken off: the button goes away and Ability stops
    await sess(page, 's.loadout.equip(null); s.magic.restore();');
    await ctx.step(2);
    assert.equal(await page.locator('[data-testid="touch-ability"]').evaluate((e) => getComputedStyle(e).display), 'none');
    await screen.tap(2, 700, 200);
    await ctx.step(20);
    assert.equal((await ctx.state()).magic, 100);
  },
};
