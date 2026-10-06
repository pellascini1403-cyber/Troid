import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Scenario } from '../scenario';
import { centreOf, TouchScreen } from '../touch';

/**
 * The HUD (docs/PROMPT5-LOG.md S14, GAME-SPEC-2D §17): life, magic, card slot and bottles as DOM at the top left, inside the
 * safe area, on every aspect ratio; reacting to the simulation through the status snapshot; separate from the Pixi world.
 * The resources are driven through the session the test hooks expose (the controlled way to put the game in a state).
 */
const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const box = async (page: Page, id: string): Promise<Box> => {
  const b = await page.locator(`[data-testid="${id}"]`).boundingBox();
  if (!b) throw new Error(`no box for ${id}`);
  return b;
};
const attr = (page: Page, id: string, name: string): Promise<string | null> => page.locator(`[data-testid="${id}"]`).getAttribute(name);
const style = (page: Page, id: string, prop: string): Promise<string> => page.locator(`[data-testid="${id}"]`).evaluate((el, p) => (el as HTMLElement).style.getPropertyValue(p), prop);

export const hud: Scenario = {
  name: 'hud',
  async run(ctx) {
    await ctx.open('touch=1', { width: 844, height: 390, touch: true });
    let { page } = ctx;
    await ctx.step(20);

    // ================================================================== what is on screen: all of it DOM
    const segs = await page.$$eval('[data-testid^="hud-life-seg-"]', (els) => els.map((e) => (e as HTMLElement).dataset['state']));
    assert.deepEqual(segs, ['full', 'full', 'full', 'full', 'full'], 'five full life segments');
    assert.equal(await style(page, 'hud-magic-fill', 'transform'), 'scaleX(1)', 'a full magic bar');
    assert.equal(await attr(page, 'hud-card', 'data-state'), 'empty', 'the card slot is EMPTY: the hero starts with no ability');
    assert.equal(await page.locator('[data-testid="hud-card"] svg').count(), 0, 'no icon in an empty slot');
    const vials = await page.$$eval('[data-testid^="hud-bottle-"]', (els) => els.map((e) => (e as HTMLElement).dataset['state']));
    assert.deepEqual(vials, ['ready', 'ready', 'ready'], 'three ready bottles');
    assert.equal(await page.evaluate('document.getElementById("ui").contains(document.querySelector("[data-testid=hud]"))'), true, 'the HUD lives in the DOM layer, not in the canvas');
    assert.equal(await page.locator('canvas').count(), 1, 'one canvas: the world');
    const text = await page.evaluate('document.querySelector("[data-testid=hud]").textContent');
    assert.equal(String(text).trim(), '', 'the HUD draws no text of its own');
    await ctx.shot('01-hud');

    // ================================================================== placement: top left, inside the screen, above the touch zone
    const layout = ((await page.evaluate('window.__troid.hud().layout')) as { scale: number; x: number; y: number });
    const card = await box(page, 'hud-card');
    assert.ok(Math.abs(card.x - layout.x) < 1 && Math.abs(card.y - layout.y) < 1, `the card is at the top left (${card.x}, ${card.y})`);
    assert.ok(Math.abs(card.height - 68 * layout.scale) < 1.5 && Math.abs(card.width - 52 * layout.scale) < 1.5, 'the card is 52 × 68 dp at the window scale');
    const b0 = await box(page, 'hud-bottle-0');
    assert.ok(b0.width >= 30 * layout.scale && b0.height >= 43 * layout.scale, `a bottle icon has a real touch area (${b0.width.toFixed(1)} × ${b0.height.toFixed(1)})`);
    const hit = await page.evaluate(`document.elementFromPoint(${b0.x + b0.width / 2}, ${b0.y + b0.height / 2})?.closest('[data-testid]')?.getAttribute('data-testid')`);
    assert.match(String(hit), /^hud-bottle-0$/, 'the bottle icon is ABOVE the movement zone: a finger on it is a bottle, not a run');
    const zoneHit = await page.evaluate('document.elementFromPoint(300, 300)?.getAttribute("data-testid")');
    assert.equal(zoneHit, 'touch-zone', 'and the rest of the left side is still the movement zone');

    // ================================================================== life: a point lost = a segment emptied, a ghost that fades
    await page.evaluate('window.__troid.strikePlayer(1)');
    await ctx.step(2);
    const after = await page.$$eval('[data-testid^="hud-life-seg-"]', (els) => els.map((e) => (e as HTMLElement).dataset['state']));
    assert.deepEqual(after, ['full', 'full', 'full', 'full', 'empty'], 'one point of life lost: the last segment empties');
    const ghost = async (): Promise<number> => Number.parseFloat(await page.locator('[data-testid="hud-life-seg-4"] > div').evaluate((e) => (e as HTMLElement).style.opacity || '0'));
    assert.ok((await ghost()) > 0, 'the lost segment leaves a ghost');
    await ctx.shot('02-life-lost');
    await page.waitForTimeout(700);
    assert.equal(await ghost(), 0, 'the ghost fades out within about half a second');
    assert.equal(await attr(page, 'hud-life', 'aria-valuenow'), '4');
    await ctx.step(80); // the hit's invulnerability and stun are over
    await sess(page, 's.player.health.damage(3);');
    await ctx.step(1);
    assert.equal(await page.locator('[data-testid="hud"]').getAttribute('data-critical'), '1', 'one point left: critical (the last segment pulses)');
    await sess(page, 's.player.health.restore();');
    await ctx.step(1);

    // ================================================================== magic: a bar that follows the number, continuously
    await sess(page, 's.magic.spend(50);');
    await ctx.step(1);
    assert.equal(await style(page, 'hud-magic-fill', 'transform'), 'scaleX(0.5)', 'half the bar after spending 50');
    assert.equal(await attr(page, 'hud-magic', 'data-regen'), '0', 'no glow during the 1 s delay');
    await ctx.step(70);
    assert.equal(await attr(page, 'hud-magic', 'data-regen'), '1', 'it glows while it regenerates');
    await ctx.step(60);
    const f = Number.parseFloat((await style(page, 'hud-magic-fill', 'transform')).replace('scaleX(', ''));
    assert.ok(f > 0.55 && f < 0.6, `about +6 units after a further second (${f})`);
    await ctx.shot('03-magic');
    await sess(page, 's.magic.restore();');
    await ctx.step(1);
    assert.equal(await style(page, 'hud-magic-fill', 'transform'), 'scaleX(1)');
    assert.equal(await attr(page, 'hud-magic', 'data-regen'), '0');

    // ================================================================== bottles: ready / empty / recharging, one at a time
    await sess(page, 's.bottles.consume(0);');
    await ctx.step(1);
    const state = (): Promise<string[]> => page.$$eval('[data-testid^="hud-bottle-"]', (els) => els.map((e) => (e as HTMLElement).dataset['state'] ?? ''));
    assert.deepEqual(await state(), ['recharging', 'ready', 'ready']);
    await ctx.step(1800);
    const half = Number.parseFloat((await page.locator('[data-testid="hud-bottle-0"] .hud-liquid').evaluate((e) => (e as HTMLElement).style.transform)).replace('scaleY(', ''));
    assert.ok(Math.abs(half - 0.5) < 0.02, `the vial refills as it recharges (${half})`);
    await sess(page, 's.bottles.consume(1);');
    await ctx.step(1);
    assert.deepEqual(await state(), ['recharging', 'empty', 'ready'], 'a second drink waits its turn: only one recharges at a time');
    await ctx.shot('04-bottles');
    await ctx.step(1800);
    assert.deepEqual(await state(), ['ready', 'recharging', 'ready'], 'the first is back after a minute and the next one starts');
    await sess(page, 's.bottles.refillAll(); s.bottles.addSlot("energy_bottle");');
    await ctx.step(1);
    assert.equal((await state()).length, 4, 'a fourth bottle (the reward) appears');
    assert.equal(await page.locator('[data-testid="hud-bottle-3"]').count(), 1);

    // ================================================================== the card slot and the Ability button
    assert.equal(await page.locator('[data-testid="touch-ability"]').evaluate((e) => getComputedStyle(e).display), 'none', 'no card: the Ability button is not drawn');
    await sess(page, 's.loadout.acquire("card_spirit_bolt");');
    await ctx.step(1);
    assert.equal(await attr(page, 'hud-card', 'data-state'), 'ready');
    assert.equal(await page.locator('[data-testid="hud-card"] svg').count(), 1, 'the card shows its icon');
    assert.notEqual(await page.locator('[data-testid="touch-ability"]').evaluate((e) => getComputedStyle(e).display), 'none', 'a card: the Ability button appears');
    await ctx.shot('05-card');
    await sess(page, 's.loadout.equip(null);');
    await ctx.step(1);
    assert.equal(await attr(page, 'hud-card', 'data-state'), 'empty');
    assert.equal(await page.locator('[data-testid="touch-ability"]').evaluate((e) => getComputedStyle(e).display), 'none', 'card taken off: the button goes away again');

    // ================================================================== the contextual bottle chip: only when drinking would help
    const chip = (): Promise<string> => page.locator('[data-testid="touch-chip"]').evaluate((e) => getComputedStyle(e).display);
    assert.equal(await chip(), 'none', 'full life: no chip');
    await sess(page, 's.player.health.damage(2);');
    await ctx.step(1);
    assert.notEqual(await chip(), 'none', 'hurt and a bottle ready: the chip appears');
    await sess(page, 's.player.health.restore();');
    await ctx.step(1);
    assert.equal(await chip(), 'none', 'healed: it goes away');

    // ================================================================== a finger on a bottle icon belongs to the bottle
    const screen = await new TouchScreen(page).init();
    const v1 = await centreOf(page, 'hud-bottle-1');
    await screen.touch(1, v1.x, v1.y);
    assert.equal(await page.evaluate('window.__troid.touch().active'), 1, 'one finger, owned by the bottle');
    const gesture = (await page.evaluate('window.__troid.touch().gesture')) as { pointer: number | null };
    assert.equal(gesture.pointer, null, 'and the movement zone did not take it');
    await screen.lift(1);
    assert.equal(await page.evaluate('window.__troid.touch().active'), 0);

    // ================================================================== every aspect ratio: top left, on screen, clear of the controls
    for (const [w, h] of [[1024, 768], [1280, 720], [844, 390], [1260, 540], [667, 375]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(120);
      const hb = await box(page, 'hud-block');
      const l = ((await page.evaluate('window.__troid.hud().layout')) as { scale: number });
      assert.ok(hb.x >= 0 && hb.y >= 0 && hb.x + hb.width <= w && hb.y + hb.height <= h, `${w}×${h}: the HUD is entirely on screen (${JSON.stringify(hb)})`);
      assert.ok(hb.x < w * 0.25 && hb.y < h * 0.25, `${w}×${h}: and at the top left`);
      assert.ok(Math.abs(hb.x - 16 * l.scale) < 1.5, `${w}×${h}: 16 dp from the left edge, scaled (${hb.x} vs ${16 * l.scale})`);
      const attack = await box(page, 'touch-attack');
      assert.ok(hb.x + hb.width < attack.x || hb.y + hb.height < attack.y, `${w}×${h}: clear of the touch controls`);
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(120);

    // ================================================================== the safe area: a notch and a home indicator
    await ctx.open('touch=1&safe=44,47,21,47', { width: 844, height: 390, touch: true });
    page = ctx.page;
    await ctx.step(5);
    const notch = await box(page, 'hud-card');
    const ls = ((await page.evaluate('window.__troid.hud().layout')) as { scale: number });
    assert.ok(notch.x >= 47 + 16 * ls.scale - 1, `47 px of notch on the left push the HUD in (${notch.x})`);
    assert.ok(notch.y >= 44 + 16 * ls.scale - 1, `44 px at the top too (${notch.y})`);
    await ctx.shot('06-notch');

    // ================================================================== the HUD speaks the player's language
    await ctx.open('lang=en', { width: 844, height: 390 });
    assert.equal(await attr(ctx.page, 'hud-life', 'aria-label'), 'Life');
    assert.equal(await attr(ctx.page, 'hud-bottle-0', 'aria-label'), 'Bottle 1: ready');
    assert.equal(await attr(ctx.page, 'hud-card', 'aria-label'), 'No ability equipped');
    await ctx.open('lang=es', { width: 844, height: 390 });
    assert.equal(await attr(ctx.page, 'hud-life', 'aria-label'), 'Vida');
    assert.equal(await attr(ctx.page, 'hud-bottle-0', 'aria-label'), 'Botella 1: lista');
    // a desktop sees the HUD too (it is not part of the touch layer)
    assert.equal(await ctx.page.locator('[data-testid="hud"]').isVisible(), true);
  },
};
