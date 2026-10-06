import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Driver } from '../../../tests/helpers/sim';
import { freshR1, playDefeat, playWin } from '../../../tests/helpers/vertical';
import { frames } from '../frames';
import { record, replay, type Recording } from '../replay';
import type { GameState, Scenario } from '../scenario';
import { centreOf, TouchScreen } from '../touch';

/** A playthrough from the shared scripts (tests/helpers/vertical.ts, asserted on by tests/integration/vertical.test.ts), recorded. */
function recorded(play: (d: Driver) => void): Recording {
  const d = freshR1();
  return record(d, () => play(d));
}

const dom = (page: Page, id: string, attr: string): Promise<string | null> => page.locator(`[data-testid="${id}"]`).getAttribute(attr);
const display = (page: Page, id: string): Promise<string> => page.locator(`[data-testid="${id}"]`).evaluate((e) => getComputedStyle(e).display);

/**
 * R1 COMPLETE (docs/PROMPT5-LOG.md S19): the first room of the vertical slice played end to end with everything Prompt 5 added —
 * movement, the crawl tunnel, the CARD taken by INTERACTING, the Spirit Bolt and its magic, a BOTTLE drunk to heal, the slime beaten,
 * the door, the exit — and lost once on purpose to see what a defeat keeps.
 *
 * Two halves, both in headless Chromium:
 *
 *  1 · KEYBOARD, bit for bit. The WIN (every new system, to the exit) and the DEFEAT (taking the card, drinking a bottle, losing to the
 *      slime) are RECORDED in Node on the pure simulation and REPLAYED through the browser's real keyboard, tick by tick, comparing
 *      a digest of the whole simulation — now including the magic, every bottle, the card and the object with the icon — every 50
 *      ticks. The browser plays the same game as the simulation, to the bit, with the new layer included.
 *  2 · TOUCH. The same room from the crawl tunnel to the exit with REAL touches: a drag crawls through the tunnel, a tap on the
 *      interaction icon takes the card (and only then does the Ability button appear), taps on the Ability button beat the slime
 *      with the Spirit Bolt, a hit makes the bottle chip appear and a tap on it drinks, five hits lose, and what the defeat keeps
 *      is checked on screen.
 *
 * (The jumps, the pit and the first sections are proven by physics in `r1.test.ts` and played for real by `room`.)
 */
export const vertical: Scenario = {
  name: 'vertical',
  async run(ctx) {
    const win = recorded(playWin);
    const lose = recorded(playDefeat);
    console.log(`  recorded in Node: win ${win.total} ticks (${win.runs.length} key changes), defeat ${lose.total} ticks (${lose.runs.length})`);
    assert.ok(win.total > 1200 && lose.total > 1000);
    let worst = 0;
    const note = (s: GameState): void => {
      worst = Math.max(worst, s.drawsMax ?? 0);
    };

    // =================================================================================================== 1a · the win, by keyboard
    await ctx.open('paused=1', { width: 844, height: 390, dpr: 1 });
    let page = ctx.page;
    let s = await ctx.state();
    assert.equal(s.now, 0, 'not one tick has run: the replay starts from tick 0');
    assert.equal(s.card, null, 'the hero starts with NO card (no initial ability)');
    assert.equal(await dom(page, 'hud-card', 'data-state'), 'empty', 'the card slot is the empty one');
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready']);

    const seen = new Set<string>();
    const once = new Set<string>();
    const look = async (name: string, when: boolean, action?: () => Promise<void>): Promise<void> => {
      if (!when || once.has(name)) return;
      once.add(name);
      if (action) await action();
      await ctx.shot(name);
    };
    await replay(ctx, win, {
      chunk: 4,
      observe: async (st) => {
        note(st);
        if (st.state === 'interact') seen.add('interact');
        if (st.state === 'cast') seen.add('cast');
        if (st.state === 'drink') seen.add('drink');
        if (st.state === 'cast' && st.magic === 70) seen.add('bolt-paid'); // the first bolt left the hand: 30 magic gone (it hits a slime within reach at once, so it is not "in flight" for long)
        if (st.state === 'crouch' && st.x > 73) seen.add('crouch-at-the-card');
        if (st.flags?.includes('defeated:r1_slime')) seen.add('slime-defeated');
        // the icon over the card, before it is taken: DOM that follows the camera, so let the page draw
        await look('c-01-icon', !!st.crouched && st.x > 73.1 && st.state === 'crouch' && !st.card, async () => {
          await frames(page, 40); // the camera follows in real time while the replay runs ahead of it: let it catch up with the hero
          assert.equal(await dom(page, 'prompt-hit', 'data-active'), '1', 'the icon is over the card');
          assert.equal(await dom(page, 'prompt-hit', 'data-object'), 'card_spirit_bolt');
          assert.equal((await page.locator('[data-testid="prompt-glyph"]').textContent()) ?? '', 'E', 'with the keyboard it says E');
          // it floats just above the top of the card (74.5 m, 1.2 m up), where the camera now shows it: not clamped to an edge of the screen
          const target = (await page.evaluate('window.__troid.worldToScreen(74.5, 1.2)')) as { x: number; y: number };
          const gs = (await page.evaluate('window.__troid.touch().layout.gestureScale')) as number;
          const c = await centreOf(page, 'prompt-hit');
          assert.ok(target.x > 40 && target.x < 804, `the card is on screen (${target.x.toFixed(0)})`);
          assert.ok(Math.abs(c.x - target.x) < 3 && Math.abs(c.y - (target.y - 34 * gs)) < 3, `the icon is over the card (${c.x.toFixed(1)}, ${c.y.toFixed(1)} vs ${target.x.toFixed(1)}, ${(target.y - 34 * gs).toFixed(1)})`);
        });
        await look('c-02-card', st.card === 'card_spirit_bolt' && st.state === 'crouch' && st.x > 73, async () => {
          await frames(page, 6);
          assert.equal(await dom(page, 'hud-card', 'data-state'), 'ready', 'the HUD shows the card');
          assert.equal(await dom(page, 'prompt-hit', 'data-active'), '0', 'and the icon is gone');
        });
        await look('c-03-bolt', st.state === 'cast' && st.magic === 70, async () => {
          await frames(page, 4);
          assert.equal(await page.locator('[data-testid="hud-magic-fill"]').evaluate((e) => (e as HTMLElement).style.transform), 'scaleX(0.7)', 'the bar shows 70');
        });
        await look('c-04-drink', st.state === 'drink', async () => {
          await frames(page, 4);
          assert.equal(await dom(page, 'hud-bottle-0', 'data-drinking'), '1', 'the vial being drunk glows');
        });
      },
    });
    s = await ctx.state();
    note(s);
    for (const what of ['interact', 'cast', 'bolt-paid', 'drink', 'crouch-at-the-card', 'slime-defeated']) assert.ok(seen.has(what), `the run showed "${what}" (saw ${[...seen].join(', ')})`);
    assert.equal(s.card, 'card_spirit_bolt');
    assert.deepEqual(s.flags, ['defeated:r1_slime', 'taken:card_spirit_bolt'], 'the card is remembered, and so is the guardian');
    assert.deepEqual(s.exits, ['east'], 'all the way to the exit');
    assert.equal(s.transition?.phase, 'fadeOut', 'which starts the transition to R2');
    assert.equal(s.health, 5, 'a bottle brought the life back');
    assert.deepEqual(s.bottles, ['recharging', 'ready', 'ready'], 'one bottle is spent and recharging, one at a time');
    assert.ok(s.magic! >= 40 && s.magic! <= 100, `two bolts cost 60 (${s.magic})`);
    assert.equal(s.gates?.exit_door?.open, true);
    await ctx.shot('c-05-exit');
    await ctx.step(40);
    s = await ctx.state();
    assert.equal(s.room, 'r2_hall', 'and the exit leads to R2: the hero arrives with everything they won');
    assert.equal(s.card, 'card_spirit_bolt');
    assert.equal(s.health, 5);
    assert.deepEqual(s.bottles, ['recharging', 'ready', 'ready']);

    // =================================================================================================== 1b · the defeat, by keyboard
    await ctx.open('paused=1', { width: 844, height: 390, dpr: 1 });
    page = ctx.page;
    s = await ctx.state();
    assert.equal(s.now, 0);
    await replay(ctx, lose, {
      chunk: 4,
      observe: async (st) => {
        note(st);
        if (st.state === 'drink') seen.add('drink-before-losing');
      },
    });
    s = await ctx.state();
    note(s);
    assert.ok(seen.has('drink-before-losing'));
    assert.ok(Math.abs(s.x - 4) < 0.2, `back at the entrance (x = ${s.x})`);
    assert.equal(s.health, 5, 'with full life');
    assert.equal(s.magic, 100, 'and full magic');
    assert.equal(s.card, 'card_spirit_bolt', 'what was found stays found: the card is still equipped');
    assert.deepEqual(s.bottles, ['recharging', 'ready', 'ready'], 'the bottle is NOT refilled: its recharge is slow on purpose');
    assert.deepEqual(s.flags, ['taken:card_spirit_bolt'], 'the card was taken, the slime was not beaten');
    assert.equal(s.enemies?.length, 1, 'the slime is back');
    assert.equal(s.gates?.exit_door?.open, false, 'the door is shut');
    await frames(page, 6);
    assert.equal(await dom(page, 'hud-card', 'data-state'), 'ready', 'the HUD still shows the card');
    await ctx.teleport(73.4, 0);
    await ctx.step(3);
    await frames(page, 6);
    assert.equal(await dom(page, 'prompt-hit', 'data-active'), '0', 'and the card is not lying there again');
    await ctx.shot('d-01-respawned');

    // =================================================================================================== 2 · touch, from the tunnel to the exit
    await ctx.open('touch=1', { width: 844, height: 390, touch: true });
    page = ctx.page;
    const screen = await new TouchScreen(page).init();
    await ctx.teleport(62, 0); // the mouth of the crawl tunnel (the first sections are physics, proven elsewhere)
    await ctx.step(10);
    s = await ctx.state();
    assert.equal(s.room, 'r1_gate');
    assert.equal(await dom(page, 'hud-card', 'data-state'), 'empty');
    assert.equal(await display(page, 'touch-ability'), 'none', 'no card: no Ability button');
    assert.equal(await display(page, 'touch-chip'), 'none', 'full life: no bottle chip');
    assert.equal(await dom(page, 'prompt-hit', 'data-active'), '0');

    // ---- crawl through the tunnel with ONE finger: right and down at once
    await screen.touch(1, 100, 250);
    await screen.drag(1, 50, 45, 3);
    for (let i = 0; i < 160 && (await ctx.state()).x < 73.0; i++) await ctx.step(5);
    await screen.lift(1);
    await ctx.step(20);
    s = await ctx.state();
    assert.ok(s.crouched, 'crawling');
    assert.ok(s.x > 72.9 && s.x < 74.4, `at the end of the tunnel (x = ${s.x})`);
    assert.equal(s.device, 'touch');

    // ---- the icon IS the button: one tap takes the card, and then the Ability button appears
    await frames(page, 6);
    assert.equal(await dom(page, 'prompt-hit', 'data-active'), '1');
    assert.equal((await page.locator('[data-testid="prompt-glyph"]').textContent()) ?? '', '', 'touch: no key on the icon');
    const icon = await centreOf(page, 'prompt-hit');
    assert.ok(icon.w >= 44, `a finger-sized target (${icon.w})`);
    await ctx.shot('t-01-icon');
    const under = await centreOf(page, 'prompt-hit'); // the icon follows the camera frame by frame: measure it again right before the finger lands
    await screen.tap(2, under.x, under.y);
    await ctx.step(1);
    s = await ctx.state();
    assert.equal(s.state, 'interact');
    assert.equal(s.card, 'card_spirit_bolt');
    await ctx.step(14);
    await frames(page, 6);
    assert.notEqual(await display(page, 'touch-ability'), 'none', 'with a card the Ability button is drawn');
    assert.equal(await dom(page, 'hud-card', 'data-state'), 'ready');
    assert.equal(await dom(page, 'prompt-hit', 'data-active'), '0');

    // ---- the slime, with the Spirit Bolt: from the arena's edge, tapping the Ability button
    await ctx.teleport(86.5, 0);
    await ctx.step(10);
    const ability = await centreOf(page, 'touch-ability');
    const slimeHp = async (): Promise<number> => (await ctx.state()).enemies?.[0]?.hp ?? 0;
    assert.equal(await slimeHp(), 3);
    for (let i = 0; i < 4 && (await ctx.state()).enemies?.length; i++) {
      await screen.tap(3 + i, ability.x, ability.y);
      await ctx.step(26);
    }
    s = await ctx.state();
    assert.equal(s.enemies?.length, 0, 'two bolts beat the slime (3 life, 2 damage each)');
    assert.ok(s.flags!.includes('defeated:r1_slime'));
    assert.ok(s.magic! <= 70, `the bolts cost magic (${s.magic})`);
    assert.equal(s.gates?.exit_door?.open, true, 'the door is open');
    await ctx.shot('t-02-slime-down');

    // ---- hurt: the chip appears, a tap on it drinks
    await page.evaluate('window.__troid.strikePlayer(1)');
    await ctx.step(40);
    await frames(page, 6);
    assert.ok((await ctx.state()).health! < 5, 'a hit');
    assert.notEqual(await display(page, 'touch-chip'), 'none', 'hurt with a bottle ready: the chip appears');
    const chip = await centreOf(page, 'touch-chip');
    await screen.tap(20, chip.x, chip.y);
    await ctx.step(1);
    assert.equal((await ctx.state()).state, 'drink');
    await ctx.step(26);
    s = await ctx.state();
    assert.equal(s.health, 5, 'the bottle healed');
    assert.deepEqual(s.bottles, ['recharging', 'ready', 'ready']);
    await frames(page, 6);
    assert.equal(await display(page, 'touch-chip'), 'none', 'full life: the chip is gone again');

    // ---- through the door to the exit, with one finger
    await ctx.teleport(98, 0);
    await ctx.step(10);
    await screen.touch(21, 100, 250);
    await screen.drag(21, 56, 0, 3);
    for (let i = 0; i < 120 && !(await ctx.state()).exits?.includes('east'); i++) await ctx.step(5);
    await screen.lift(21);
    s = await ctx.state();
    note(s);
    assert.deepEqual(s.exits, ['east'], 'exit:reached, by touch');
    assert.equal(s.transition?.phase, 'fadeOut');
    await ctx.shot('t-03-exit');
    await ctx.step(40);
    assert.equal((await ctx.state()).room, 'r2_hall', 'the exit leads to R2');
    await page.evaluate('window.__troid.session.loadRoom("r1_gate", "start")'); // back to R1 for the defeat below (its slime stays beaten)
    await ctx.step(5);

    // ---- and a defeat by touch: five hits, the screen goes black, a tap on a button skips the wait, and what was gained is still there
    await ctx.teleport(90, 0);
    await ctx.step(10);
    for (let i = 0; i < 5; i++) {
      await page.evaluate('window.__troid.strikePlayer(1)');
      await ctx.step(70); // 60 ticks of invulnerability after each hit
    }
    s = await ctx.state();
    assert.notEqual(s.death?.phase, 'none', 'the hero fell');
    for (let i = 0; i < 400 && (await ctx.state()).death?.phase !== 'hold'; i++) await ctx.step(2);
    await frames(page, 4);
    assert.equal(await display(page, 'death-overlay'), 'flex', 'the defeat screen is up');
    await ctx.step(30);
    const attack = await centreOf(page, 'touch-attack');
    await screen.tap(30, attack.x, attack.y); // any button skips the wait (and that press is spent there)
    for (let i = 0; i < 200 && (await ctx.state()).death?.phase !== 'none'; i++) await ctx.step(2);
    await ctx.step(40);
    s = await ctx.state();
    note(s);
    assert.ok(Math.abs(s.x - 4) < 0.3, `back at the entrance (x = ${s.x})`);
    assert.equal(s.health, 5);
    assert.equal(s.card, 'card_spirit_bolt', 'the card is still there');
    assert.deepEqual(s.bottles, ['recharging', 'ready', 'ready'], 'and the bottle is still recharging');
    assert.ok(s.flags!.includes('defeated:r1_slime'), 'the beaten guardian stays beaten');
    assert.equal(s.enemies?.length, 0, 'so the slime does not come back');
    await frames(page, 6);
    assert.notEqual(await display(page, 'touch-ability'), 'none', 'and the Ability button is still drawn');
    await ctx.shot('t-04-respawned');

    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    console.log(`  vertical: R1 complete by keyboard (replayed bit for bit) and by touch; ${worst} draw calls at the worst moment (budget 60)`);
  },
};
