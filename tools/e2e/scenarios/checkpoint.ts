import assert from 'node:assert/strict';
import { frames } from '../frames';
import type { GameState, Scenario } from '../scenario';

/**
 * CHECKPOINTS in a real browser (docs/PROMPT6-LOG.md S24): resting at a shrine with the real keyboard makes it the place a defeat brings
 * the hero back — in whichever room they fell — and gives back life, magic and bottles; a defeat before any rest brings them back to the
 * start of the world; and what was won stays won through all of it. The console stays clean (the runner fails the scenario otherwise).
 */
export const checkpoint: Scenario = {
  name: 'checkpoint',
  async run(ctx) {
    await ctx.open('', { width: 844, height: 390, dpr: 1 });
    const sess = (code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
    const dom = (id: string, attr: string): Promise<string | null> => ctx.page.locator(`[data-testid="${id}"]`).getAttribute(attr);
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };
    const through = async (x: number): Promise<void> => {
      await ctx.teleport(x, 0); // into an exit zone
      await ctx.step(40);
    };
    const fall = async (): Promise<GameState> => {
      await sess('s.player.health.damage(s.player.health.current - 1);');
      await ctx.page.evaluate('window.__troid.strikePlayer(1)');
      await ctx.step(2);
      let s = await state();
      assert.notEqual(s.death?.phase, 'none', 'the hero fell');
      for (let i = 0; i < 400 && s.death?.phase !== 'none'; i++) {
        await ctx.step(2);
        s = await state();
      }
      await ctx.step(10);
      s = await state();
      assert.equal(s.death?.phase, 'none', 'the defeat flow ended');
      return s;
    };

    // ================================================================================================ never rested: the start of the world
    await ctx.step(20);
    let s = await state();
    assert.equal(s.room, 'r1_gate');
    assert.deepEqual(s.respawnPoint, { room: 'r1_gate', entry: 'start' }, 'a new game: the checkpoint is the start of the world');
    await ctx.teleport(60, 0);
    await ctx.step(5);
    s = await fall();
    assert.equal(s.room, 'r1_gate');
    assert.ok(Math.abs(s.x - 4) < 0.3, `back at the start (x = ${s.x})`);
    assert.equal(s.health, s.maxHealth);

    // ================================================================================================ R2: the shrine
    await sess('s.flags.set("defeated:r1_slime")');
    await ctx.step(2);
    await through(110);
    s = await state();
    assert.equal(s.room, 'r2_hall', 'through R1\'s exit');
    assert.deepEqual(s.respawnPoint, { room: 'r1_gate', entry: 'start' }, 'a transition does not move the checkpoint');
    await ctx.teleport(11.2, 0);
    await ctx.step(8);
    await frames(ctx.page, 30);
    assert.equal(await dom('prompt-hit', 'data-active'), '1', 'the icon is over the shrine');
    assert.equal(await dom('prompt-hit', 'data-object'), 'shrine');
    assert.equal((await ctx.page.locator('[data-testid="prompt-glyph"]').textContent()) ?? '', 'E', 'with the keyboard it says E');
    await ctx.shot('a-01-shrine-icon');
    // hurt, magic spent and a bottle drunk: resting gives it all back
    await sess('s.player.health.damage(3); s.magic.set(10); s.bottles.consume(0); s.bottles.consume(1);');
    await ctx.step(2);
    s = await state();
    assert.equal(s.health, 2);
    assert.deepEqual(s.bottles, ['recharging', 'empty', 'ready']);
    const spawned0 = s.vfx?.spawned ?? 0;
    await ctx.page.keyboard.down('KeyE');
    await ctx.step(1);
    await ctx.page.keyboard.up('KeyE');
    s = await state();
    assert.equal(s.state, 'interact', 'the hero holds the pose');
    await ctx.step(14);
    await frames(ctx.page, 10);
    s = await state();
    assert.deepEqual(s.respawnPoint, { room: 'r2_hall', entry: 'rest' }, 'the shrine is the checkpoint now');
    assert.equal(s.health, s.maxHealth, 'life is back');
    assert.equal(s.magic, 100, 'magic is back');
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready'], 'every bottle is back');
    assert.ok((s.vfx?.spawned ?? 0) > spawned0, 'the light played where the hero stands');
    assert.equal(await dom('hud-life', 'aria-valuenow'), String(s.maxHealth), 'and the HUD shows it');
    await ctx.shot('a-02-rested');

    // ================================================================================================ a defeat in R2 comes back to the shrine
    await sess('s.bottles.consume(0);');
    await ctx.teleport(60, 0);
    await ctx.step(5);
    s = await fall();
    assert.equal(s.room, 'r2_hall');
    assert.ok(Math.abs(s.x - 12.8) < 0.3, `back at the shrine (x = ${s.x})`);
    assert.equal(s.health, s.maxHealth);
    assert.deepEqual(s.respawnPoint, { room: 'r2_hall', entry: 'rest' });
    assert.notEqual(s.bottles?.[0], 'ready', 'a defeat does NOT refill the bottles: the slow recharge is on purpose');
    assert.ok(s.flags!.includes('defeated:r1_slime'), 'what was won stays won');
    await ctx.shot('a-03-back-at-the-shrine');

    // ================================================================================================ a defeat in R3 comes back to R2: the defeat crosses rooms
    await through(89.5); // R2's east exit
    s = await state();
    assert.equal(s.room, 'r3_chamber');
    assert.deepEqual(s.respawnPoint, { room: 'r2_hall', entry: 'rest' }, 'still the shrine of R2');
    await ctx.teleport(40, 0);
    await ctx.step(5);
    s = await fall();
    assert.equal(s.room, 'r2_hall', 'the hero fell in R3 and is back in R2');
    assert.ok(Math.abs(s.x - 12.8) < 0.3, `at the shrine (x = ${s.x})`);
    assert.equal(s.health, s.maxHealth);
    assert.equal(s.enemies?.length, 1, 'R2 was built again: its slime is there');
    assert.equal((await ctx.page.locator('[data-testid="death-overlay"]').evaluate((e) => getComputedStyle(e).display)), 'none', 'no black screen is left');
    await frames(ctx.page, 20);
    await ctx.shot('a-04-crossed-rooms');
    assert.equal(await sess('return s.scheduler.pending'), 0, 'no timer is left pending');

    // ================================================================================================ the checkpoint glows
    // (the shrine\'s crystal is the cyan-white light of the hero's energy: bright when this is the checkpoint, dim when it is not)
    const lit = await ctx.page.evaluate(`(() => { const g = window.__troid.game; return g.isCheckpoint('shrine'); })()`);
    assert.equal(lit, true, 'R2\'s shrine is the lit one');

    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    console.log(`  checkpoint: rest → defeat in R2 and in R3 both come back at the shrine; life, magic and bottles restored by the rest only · worst ${worst} draw calls (budget 60)`);
  },
};
