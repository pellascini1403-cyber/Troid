import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Scenario } from '../scenario';
import { frames } from '../frames';
import { centreOf, TouchScreen } from '../touch';

/**
 * Contextual interaction in the browser (docs/PROMPT5-LOG.md S17, GAME-SPEC-2D §12), with REAL keyboard and real touches: there is NO
 * permanent interaction button — the icon exists only over the object in reach, floats over it, says the key of the device in
 * use (and nothing on touch), names its verb in the language of the player, and is the button on touch. A card is taken, a lever
 * opens the door of its room, the nearest object wins; R1 has nothing to take and the Spirit Bolt card lies on R3's ledge.
 */
const attr = (page: Page, id: string, name: string): Promise<string | null> => page.locator(`[data-testid="${id}"]`).getAttribute(name);
const css = (page: Page, id: string, prop: string): Promise<string> => page.locator(`[data-testid="${id}"]`).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const VERBS: Record<string, Record<string, string>> = { pickup: { es: 'Recoger', en: 'Pick up' }, activate: { es: 'Activar', en: 'Activate' } };

/** The icon is DOM and follows the camera frame by frame: wait for frames, then read what it shows. */
async function icon(page: Page): Promise<{ active: boolean; object: string | null; kind: string | null; label: string | null; glyph: string }> {
  await frames(page, 6);
  return {
    active: (await attr(page, 'prompt-hit', 'data-active')) === '1',
    object: await attr(page, 'prompt-hit', 'data-object'),
    kind: await attr(page, 'prompt-hit', 'data-kind'),
    label: await attr(page, 'prompt-hit', 'aria-label'),
    glyph: (await page.locator('[data-testid="prompt-glyph"]').textContent()) ?? '',
  };
}

export const interaction: Scenario = {
  name: 'interaction',
  async run(ctx) {
    await ctx.open('room=interaction_test&unlock=dash', { width: 844, height: 390 });
    let { page } = ctx;
    await ctx.teleport(4, 0);
    await ctx.step(30);

    // ================================================================== nothing in reach: there is no icon and no button
    let i = await icon(page);
    assert.equal(i.active, false, 'nothing to interact with: no icon');
    assert.equal(await css(page, 'prompt-hit', 'pointer-events'), 'none', 'and it does not catch a finger');
    const shown = await page.locator('[data-testid^="touch-"]').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => (e as HTMLElement).dataset['testid']));
    assert.ok(!shown.some((t) => /interact|prompt/.test(String(t))), `no permanent interaction button (${shown.join(', ')})`);
    await page.keyboard.down('KeyE');
    await ctx.step(2);
    await page.keyboard.up('KeyE');
    await ctx.step(20);
    let s = await ctx.state();
    assert.equal(s.state, 'free', 'Interact with nothing in reach does nothing');
    assert.equal(s.card, null);

    // ================================================================== walking into reach: the icon appears over the card
    await page.keyboard.down('KeyD');
    let reachedAt = Number.NaN;
    for (let k = 0; k < 90; k++) {
      await ctx.step(1);
      s = await ctx.state();
      if (s.x >= 10.3) {
        reachedAt = s.x;
        break;
      }
    }
    await page.keyboard.up('KeyD');
    await ctx.step(25); // let him stop
    assert.ok(reachedAt >= 10.3 && reachedAt < 11, `walked up to the card (${reachedAt})`);
    i = await icon(page);
    assert.equal(i.active, true, 'within 1.6 m of the card: the icon is there');
    assert.equal(i.object, 'card_spirit_bolt');
    assert.equal(i.kind, 'pickup');
    s = await ctx.state();
    assert.equal(i.label, VERBS['pickup']![s.lang!], `the verb comes from the catalog of the player's language (${s.lang})`);
    assert.equal(i.glyph, 'E', 'with the keyboard it says the key');
    assert.notEqual(await css(page, 'prompt-hit', 'pointer-events'), 'none');
    // it floats just above the top of the object (12 m, 1.2 m up): 24 px of icon radius and a 10 px gap, scaled with the controls
    const target = (await page.evaluate('window.__troid.worldToScreen(12, 1.2)')) as { x: number; y: number };
    const gs = (await page.evaluate('window.__troid.touch().layout.gestureScale')) as number;
    const c = await centreOf(page, 'prompt-hit');
    assert.ok(Math.abs(c.x - target.x) < 2 && Math.abs(c.y - (target.y - 34 * gs)) < 2, `the icon is over the card (${c.x.toFixed(1)}, ${c.y.toFixed(1)} vs ${target.x.toFixed(1)}, ${(target.y - 34 * gs).toFixed(1)})`);
    await ctx.shot('01-icon');

    // ================================================================== the nearest object has the icon (before anything is taken)
    await ctx.teleport(13.4, 0);
    await ctx.step(3);
    i = await icon(page);
    assert.equal(i.object, 'bottle_slot', 'the bottle slot at 14 m is nearer than the card at 12 m');
    await ctx.teleport(11, 0);
    await ctx.step(3);
    i = await icon(page);
    assert.equal(i.object, 'card_spirit_bolt', 'and back by the card it is the card again');

    // ================================================================== the key performs it
    await page.keyboard.down('KeyE');
    await ctx.step(1);
    await page.keyboard.up('KeyE');
    s = await ctx.state();
    assert.equal(s.state, 'interact');
    assert.equal(s.anim, 'interact', 'the pose has its own animation state');
    assert.equal(s.card, 'card_spirit_bolt', 'the card is acquired and equipped');
    assert.ok(s.flags!.includes('taken:card_spirit_bolt'), 'and the world remembers it');
    await ctx.step(4);
    const x1 = (await ctx.state()).x;
    await page.keyboard.down('KeyD'); // the pose holds the control
    await ctx.step(5);
    await page.keyboard.up('KeyD');
    s = await ctx.state();
    assert.equal(s.x, x1, 'the stick does nothing while he takes it');
    assert.equal(s.state, 'interact');
    await ctx.step(3); // 4 + 5 + 3 = 12 ticks after the press tick
    assert.equal((await ctx.state()).state, 'free', '12 ticks, then he is free');
    i = await icon(page);
    assert.equal(i.active, false, 'taken: the icon is gone');
    assert.equal(await page.locator('[data-testid="hud-card"]').getAttribute('data-state'), 'ready', 'the HUD shows the card');
    await ctx.shot('02-taken');

    // ================================================================== a lever opens the door of its room
    await ctx.teleport(36, 0);
    await page.keyboard.down('KeyD');
    await ctx.step(140);
    await page.keyboard.up('KeyD');
    assert.ok((await ctx.state()).x < 40, 'the door stops him');
    await ctx.teleport(29, 0);
    await ctx.step(3);
    i = await icon(page);
    assert.equal(i.object, 'lever');
    assert.equal(i.kind, 'activate');
    assert.equal(i.label, VERBS['activate']![(await ctx.state()).lang!]);
    s = await ctx.state();
    assert.equal(s.gates!['door']!.open, false);
    await page.keyboard.down('KeyE');
    await ctx.step(1);
    await page.keyboard.up('KeyE');
    await ctx.step(14);
    s = await ctx.state();
    assert.equal(s.gates!['door']!.open, true, 'the lever opened the door');
    for (let k = 0; k < 40 && (await ctx.state()).gates!['door']!.alpha !== 0; k++) await page.waitForTimeout(100); // it dissolves in real time
    assert.equal((await ctx.state()).gates!['door']!.alpha, 0, 'and it is gone from the scene');
    await ctx.teleport(36, 0);
    await page.keyboard.down('KeyD');
    await ctx.step(140);
    await page.keyboard.up('KeyD');
    assert.ok((await ctx.state()).x > 42, 'and he walks through');

    // ================================================================== a door that opens when you interact with IT
    await ctx.teleport(44, 0);
    await ctx.step(3);
    i = await icon(page);
    assert.equal(i.object, 'door_b');
    assert.equal(i.kind, 'open');
    assert.equal(i.label, { es: 'Abrir', en: 'Open' }[(await ctx.state()).lang!]);
    assert.equal((await ctx.state()).gates!['door_b']!.open, false);
    await page.keyboard.down('KeyE');
    await ctx.step(1);
    await page.keyboard.up('KeyE');
    await ctx.step(14);
    assert.equal((await ctx.state()).gates!['door_b']!.open, true, 'interacting with the door opens it');
    await page.keyboard.down('KeyD');
    await ctx.step(100);
    await page.keyboard.up('KeyD');
    assert.ok((await ctx.state()).x > 48, 'and he walks through it');

    // ================================================================== touch: the icon IS the button, and says nothing on top of it
    await ctx.open('room=interaction_test&unlock=dash&touch=1', { width: 844, height: 390, touch: true });
    page = ctx.page;
    await ctx.teleport(4, 0);
    await ctx.step(30);
    i = await icon(page);
    assert.equal(i.active, false);
    const screen = await new TouchScreen(page).init();
    // a tap where the icon will be, with nothing in reach, falls through to the movement zone and does nothing
    await ctx.teleport(11, 0);
    await ctx.step(3);
    i = await icon(page);
    assert.equal(i.active, true);
    assert.equal(i.glyph, '', 'touch: the icon is the button, no key on it');
    const tc = await centreOf(page, 'prompt-hit');
    assert.ok(tc.w >= 44 && tc.h >= 44, `a finger-sized target (${tc.w}×${tc.h})`);
    await ctx.shot('03-touch-icon');
    await screen.tap(1, tc.x, tc.y);
    await ctx.step(1);
    s = await ctx.state();
    assert.equal(s.state, 'interact', 'a tap on the icon performs the object');
    assert.equal(s.device, 'touch');
    assert.equal(s.card, 'card_spirit_bolt');
    await ctx.step(14);
    i = await icon(page);
    assert.equal(i.active, false);

    // ================================================================== R1: nothing to pick up (S28 moved the card to R3)
    await ctx.open('', { width: 844, height: 390 }); // a new game: R1
    page = ctx.page;
    s = await ctx.state();
    assert.equal(s.room, 'r1_gate');
    await ctx.teleport(73.4, 0);
    await page.keyboard.down('ArrowDown');
    await ctx.step(10);
    i = await icon(page);
    assert.equal(i.active, false, 'inside the tunnel there is nothing to take any more: the card is in R3');
    await page.keyboard.down('KeyE');
    await ctx.step(1);
    await page.keyboard.up('KeyE');
    await ctx.step(14);
    await page.keyboard.up('ArrowDown');
    s = await ctx.state();
    assert.equal(s.card, null, 'Interact with nothing in reach gives nothing');
    assert.equal(s.state, 'crouch', 'and the hero stays as he was: no pose');
    await ctx.shot('04-r1-tunnel');

    // ================================================================== R3: the Spirit Bolt card on the ledge, by interacting; the Ability works at once
    await ctx.open('room=r3_chamber&unlock=dash', { width: 844, height: 390 });
    page = ctx.page;
    await ctx.teleport(34.5, 0); // under the card, on the lane: out of reach (the card is on the ledge, 4.8 m up)
    await ctx.step(10);
    assert.equal((await icon(page)).active, false, 'from the floor of the lane the card has no icon');
    await ctx.teleport(33.6, 4.8); // on the ledge (the climb is proven by physics, and walked for real by `progression`)
    await ctx.step(10);
    i = await icon(page);
    assert.equal(i.active, true, 'on the ledge the card has the icon');
    assert.equal(i.object, 'card_spirit_bolt');
    assert.equal(i.kind, 'pickup');
    await ctx.shot('05-r3-ledge');
    await page.keyboard.down('KeyE');
    await ctx.step(1);
    await page.keyboard.up('KeyE');
    await ctx.step(14);
    s = await ctx.state();
    assert.equal(s.card, 'card_spirit_bolt');
    assert.ok(s.flags!.includes('taken:card_spirit_bolt'));
    // and the Ability works at once
    await page.keyboard.down('KeyK');
    await ctx.step(1);
    await page.keyboard.up('KeyK');
    await ctx.step(10);
    assert.equal((await ctx.state()).magic, 70, 'the Spirit Bolt is cast');
  },
};
