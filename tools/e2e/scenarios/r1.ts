import assert from 'node:assert/strict';
import { countPixels, decodePng, isVioletLight } from '../png';
import type { GameState, Scenario } from '../scenario';

/**
 * R1 «Puerta de las Ruinas» in a real browser (S10 smoke; the full real-input playthrough is S11): a new game starts here
 * with the dash, the room is built whole (slime in the world, door shut, nothing in the flags), every section looks like
 * what it is (screenshots), the door dissolves when the flag that opens it is set, and walking into the exit zone raises
 * `exit:reached`. The console has to stay clean through all of it (the runner fails the scenario otherwise).
 */
export const r1: Scenario = {
  name: 'r1',
  async run(ctx) {
    await ctx.open('', { width: 844, height: 390, dpr: 1 });
    const { page } = ctx;
    const hooks = (expr: string): Promise<unknown> => ctx.page.evaluate(`window.__troid.${expr}`);
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };

    // ---- a new game: R1, the hero's abilities, the slime asleep behind the tunnel, the door shut ----
    await ctx.step(20);
    let s = await state();
    assert.equal(s.room, 'r1_gate', 'a new game starts in R1');
    assert.ok(Math.abs(s.x - 4) < 0.1, `at the entrance (x = ${s.x})`);
    assert.equal(await hooks('session.abilities.has("dash")'), true, 'R1 starts with the dash');
    assert.equal(s.enemies?.length, 1, 'the slime is in the world before the first tick');
    assert.equal(s.enemies?.[0]?.def, 'ink_slime');
    assert.ok(Math.abs((s.enemies?.[0]?.x ?? 0) - 96) < 0.5, 'in its arena');
    assert.equal(s.views, 1, 'and has a view');
    assert.deepEqual(s.flags, []);
    assert.equal(s.gates?.exit_door?.open, false);
    assert.equal(s.gates?.exit_door?.alpha, 1, 'the door is fully drawn');
    assert.deepEqual(s.exits, []);
    await ctx.shot('01-entry');

    // ---- the sections, left to right ----
    await ctx.teleport(20, 0);
    await ctx.step(30);
    await ctx.shot('02-movement');
    await ctx.teleport(44, 3);
    await ctx.step(30);
    await ctx.shot('03-platforms');
    await ctx.teleport(61, 0);
    await page.keyboard.down('KeyS');
    await ctx.step(60);
    s = await state();
    assert.equal(s.crouched, true, 'crouched at the mouth of the passage');
    await ctx.shot('04-tunnel');
    await page.keyboard.down('KeyD');
    await ctx.step(200);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyS');
    s = await state();
    assert.ok(s.x > 66, `crawling through the passage (x = ${s.x})`);

    // ---- the arena: the slime wakes up when I come within 8 m, and the violet shows ----
    await ctx.teleport(88, 0);
    await ctx.step(10);
    s = await state();
    assert.equal(s.enemies?.[0]?.state, 'detect', 'it noticed me');
    await ctx.shot('05-arena');
    await hooks('game.debug.set("godMode", true)'); // this scenario looks at the room, not at the fight
    await ctx.teleport(94.5, 0);
    for (let i = 0; i < 400 && (await state()).enemies?.[0]?.state !== 'telegraph'; i++) await ctx.step(1);
    await ctx.step(18);
    await ctx.page.waitForTimeout(80);
    const violet = countPixels(decodePng(await ctx.page.screenshot()), isVioletLight);
    assert.ok(violet > 200, `the wind-up shows violet in R1 (${violet} px)`);
    await ctx.shot('06-telegraph');
    await hooks('game.debug.set("godMode", false)');

    // ---- the door: shut while the slime lives; dissolves when its flag is set ----
    await ctx.teleport(101, 0);
    await ctx.step(5);
    await ctx.shot('07-door');
    await page.keyboard.down('KeyD');
    await ctx.step(60);
    await page.keyboard.up('KeyD');
    s = await state();
    assert.ok(s.x < 104, `the door stops me (x = ${s.x})`);
    assert.deepEqual(s.exits, []);
    await hooks('session.flags.set("defeated:r1_slime")');
    await ctx.step(2);
    s = await state();
    assert.deepEqual(s.flags, ['defeated:r1_slime']);
    assert.equal(s.gates?.exit_door?.open, true, 'the simulation opened it');
    await page.waitForFunction('window.__troid.state().gates.exit_door.alpha === 0', undefined, { timeout: 10000 });
    await ctx.shot('08-door-open');

    // ---- through it, to the exit ----
    await page.keyboard.down('KeyD');
    await ctx.step(120);
    await page.keyboard.up('KeyD');
    s = await state();
    assert.ok(s.x > 106, `through the door (x = ${s.x})`);
    assert.deepEqual(s.exits, ['east'], 'exit:reached');
    await ctx.shot('09-exit');
    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    console.log(`  r1: ${s.draws} draw calls in the exit section, worst over the room ${worst}`);

    // ---- the same room on a desktop screen: the picture is there (not an empty canvas) and still cheap ----
    await ctx.page.setViewportSize({ width: 1920, height: 1080 });
    await ctx.page.waitForFunction('window.__troid.state().canvas.width === 1920 && window.__troid.state().canvas.height === 1080', undefined, { timeout: 15000 });
    await ctx.teleport(96, 0);
    await ctx.step(5);
    await ctx.page.waitForTimeout(150);
    const big = decodePng(await ctx.page.screenshot());
    const lit = countPixels(big, (r, g, b) => r > 40 || g > 40 || b > 60);
    assert.equal(big.width, 1920);
    assert.ok(lit > big.width * big.height * 0.25, `the 1920×1080 picture has content (${((100 * lit) / (big.width * big.height)).toFixed(0)} % lit pixels)`);
    await ctx.shot('10-desktop');
    s = await state();
    assert.ok((s.drawsMax ?? 99) <= 60, `draw calls at 1920×1080: ${s.drawsMax}`);
  },
};
