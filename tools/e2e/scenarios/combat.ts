import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';

/**
 * Combat with REAL keyboard input (S6): the ground / air / crouch attacks, their phase-driven sprite frames, hit-once,
 * knockback, hit-stop (time stops, the press is kept), the two-hit chain, taking damage (hurt pose, flash, blink, i-frames),
 * camera shake and death.
 */
export const combat: Scenario = {
  name: 'combat',
  async run(ctx) {
    await ctx.open('room=crouch_test&unlock=dash');
    const { page } = ctx;
    const hooks = (expr: string): Promise<unknown> => page.evaluate(`window.__troid.${expr}`);
    await ctx.teleport(30, 0);
    await ctx.step(20);
    await hooks('spawnDummy(31.4, 0, 8)');
    await ctx.step(2);
    let s = await ctx.state();
    assert.equal(s.dummies?.length, 1, 'the dummy joined the world');
    assert.equal(s.views, 1, 'and has a view');
    assert.equal(s.health, 5);
    await ctx.shot('01-ready');

    // ---- J: the attack runs by phases and the sprite frame follows the simulation ----
    await page.keyboard.down('KeyJ');
    await ctx.step(1);
    await page.keyboard.up('KeyJ');
    await ctx.step(2);
    s = await ctx.state();
    assert.equal(s.state, 'attack');
    assert.equal(s.combat?.attack, 'slash_1');
    assert.equal(s.combat?.phase, 'startup');
    assert.ok(s.sprite?.frame?.startsWith('attack_'), `attack frame ${s.sprite?.frame}`);
    const startupFrame = s.sprite?.frame;
    // run until the blow connects (the dummy loses health, the world freezes)
    for (let i = 0; i < 20 && (await ctx.state()).dummies?.[0]?.hp === 8; i++) await ctx.step(1);
    s = await ctx.state();
    assert.equal(s.dummies?.[0]?.hp, 7, 'hit once');
    assert.equal(s.dummies?.[0]?.hits, 1);
    assert.ok((s.dummies?.[0]?.vx ?? 0) > 4, `knockback ${s.dummies?.[0]?.vx}`);
    assert.equal(s.combat?.phase, 'active');
    assert.notEqual(s.sprite?.frame, startupFrame, 'the active frame differs from the startup frame');
    assert.ok(['attack_02', 'attack_03'].includes(s.sprite?.frame ?? ''), `active frame ${s.sprite?.frame}`);
    assert.ok((s.hitStop ?? 0) > 0, 'hit-stop');
    assert.ok((s.trauma ?? 0) > 0, 'the impact shakes the camera');
    await ctx.shot('02-impact');

    // ---- hit-stop: time does not advance, then it resumes ----
    const now = s.now ?? 0;
    const frozenFor = s.hitStop ?? 0;
    await ctx.step(frozenFor);
    s = await ctx.state();
    assert.equal(s.now, now, 'the simulation clock did not move during the freeze');
    assert.equal(s.hitStop, 0);
    await ctx.step(1);
    s = await ctx.state();
    assert.equal(s.now, (now ?? 0) + 1);
    assert.equal(s.dummies?.[0]?.hits, 1, 'three active ticks, one hit');

    // ---- chain: a second press in the window → slash_2 ----
    await ctx.step(4);
    await page.keyboard.down('KeyJ');
    await ctx.step(1);
    await page.keyboard.up('KeyJ');
    await ctx.step(8);
    s = await ctx.state();
    assert.equal(s.combat?.attack, 'slash_2');
    assert.equal(s.combat?.combo, 1);
    assert.ok(s.sprite?.frame?.startsWith('attack2_'), `chain frame ${s.sprite?.frame}`);
    await ctx.step(60);
    s = await ctx.state();
    assert.equal(s.state, 'free');
    assert.equal(s.dummies?.[0]?.hp, 6, 'slash_1 + slash_2 = 2 damage (8 → 6)');

    // ---- air attack ----
    await ctx.teleport(30, 0);
    await ctx.step(20);
    await page.keyboard.down('Space');
    await ctx.step(14);
    await page.keyboard.up('Space');
    await page.keyboard.down('KeyJ');
    await ctx.step(1);
    await page.keyboard.up('KeyJ');
    await ctx.step(4);
    s = await ctx.state();
    assert.equal(s.grounded, false);
    assert.equal(s.combat?.attack, 'air_slash');
    assert.ok(s.sprite?.frame?.startsWith('attackAir_'), `air frame ${s.sprite?.frame}`);
    await ctx.shot('03-air-attack');
    await ctx.step(120);

    // ---- crouch attack ----
    await ctx.step(20);
    await page.keyboard.down('KeyS');
    await ctx.step(4);
    await page.keyboard.down('KeyJ');
    await ctx.step(1);
    await page.keyboard.up('KeyJ');
    await ctx.step(8);
    s = await ctx.state();
    assert.equal(s.combat?.attack, 'crouch_slash');
    assert.equal(s.bodyHeight, 1.0);
    assert.ok(s.sprite?.frame?.startsWith('attackCrouch_'), `crouch attack frame ${s.sprite?.frame}`);
    await ctx.shot('04-crouch-attack');
    await ctx.step(40);
    await page.keyboard.up('KeyS');
    await ctx.step(10);

    // ---- taking damage: hurt pose, flash, blink, knockback, i-frames, shake ----
    await ctx.teleport(30, 0);
    await ctx.step(30);
    await hooks('strikePlayer(1)');
    await ctx.step(1);
    s = await ctx.state();
    assert.equal(s.health, 4);
    assert.equal(s.state, 'hurt');
    assert.ok(s.sprite?.frame?.startsWith('hurt_'), `hurt frame ${s.sprite?.frame}`);
    assert.ok((s.flash ?? 0) > 0.5, 'white flash on the hit');
    assert.equal(s.blink, true, 'blinks while invulnerable');
    assert.ok((s.hitStop ?? 0) >= 5, `hit-stop ${s.hitStop}`);
    await ctx.shot('05-hurt');
    await ctx.step(8);
    await hooks('strikePlayer(1)');
    await ctx.step(1);
    assert.equal((await ctx.state()).health, 4, 'the i-frames ignore the second strike');
    await ctx.step(80);
    s = await ctx.state();
    assert.equal(s.invulnerable, false);
    assert.equal(s.blink, false);
    assert.equal(s.state, 'free');

    // ---- death ----
    for (let i = 0; i < 4; i++) {
      await hooks('strikePlayer(1)');
      await ctx.step(1);
      await ctx.step(80);
    }
    s = await ctx.state();
    assert.equal(s.health, 0);
    assert.equal(s.state, 'dead');
    assert.equal(s.anim, 'death');
    assert.ok(s.sprite?.frame?.startsWith('death_'), `death frame ${s.sprite?.frame}`);
    await page.keyboard.down('KeyD');
    await ctx.step(30);
    await page.keyboard.up('KeyD');
    s = await ctx.state();
    assert.equal(s.state, 'dead', 'a dead player ignores the input');
    await ctx.shot('06-dead');
    await hooks('revive()');
    await ctx.step(10);
    s = await ctx.state();
    assert.equal(s.health, 5);
    assert.equal(s.state, 'free');

    await page.waitForTimeout(300);
    s = await ctx.state();
    assert.ok((s.draws ?? 0) <= 60 && (s.drawsMax ?? 0) <= 60, `draw calls ${s.draws} (worst ${s.drawsMax})`);
  },
};
