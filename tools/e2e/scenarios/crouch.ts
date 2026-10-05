import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';

/**
 * Crouching with REAL keyboard input (S5, PC only): the body really shrinks, low passages (1.2 m) open to a crouched
 * player and stay shut to a standing one, releasing `S` under a roof keeps the player crouched (forced), a crouched dash
 * slides, and the camera does not move for it.
 */
export const crouch: Scenario = {
  name: 'crouch',
  async run(ctx) {
    await ctx.open('room=crouch_test&unlock=dash');
    const { page } = ctx;
    await ctx.step(30);
    let s = await ctx.state();
    assert.equal(s.bodyHeight, 1.7, 'standing body');
    assert.equal(s.crouched, false);
    const camY = s.camera?.y ?? 0;
    await ctx.shot('01-standing');

    // ---- S = crouch: 1.7 m → 1.0 m, the sprite follows, the camera does not move ----
    await page.keyboard.down('KeyS');
    await ctx.step(5);
    s = await ctx.state();
    assert.equal(s.state, 'crouch');
    assert.equal(s.crouched, true);
    assert.equal(s.bodyHeight, 1.0);
    assert.equal(s.anim, 'crouch');
    assert.ok(s.sprite?.frame?.startsWith('crouch_'), `crouch frame ${s.sprite?.frame}`);
    await ctx.step(60);
    s = await ctx.state();
    assert.ok(Math.abs((s.camera?.y ?? 0) - camY) < 0.05, `the camera does not move for crouching (${camY} → ${s.camera?.y})`);
    await ctx.shot('02-crouch');

    // ---- crouch-walk at ≤ 3.0 m/s ----
    await page.keyboard.down('KeyD');
    await ctx.step(40);
    s = await ctx.state();
    assert.ok(Math.abs(s.vx - 3.0) < 0.05, `crouch speed ${s.vx}`);
    assert.equal(s.anim, 'crouchWalk');
    assert.ok(s.sprite?.frame?.startsWith('crouchWalk_'), `crouchWalk frame ${s.sprite?.frame}`);

    // ---- into passage A (1.2 m high, x 14..26): fits only crouched ----
    await ctx.step(220);
    s = await ctx.state();
    assert.ok(s.x > 16, `inside the passage (x = ${s.x})`);
    assert.equal(s.grounded, true);
    await ctx.shot('03-under-roof');

    // ---- forced crouch: let go of S under the roof ----
    await page.keyboard.up('KeyS');
    await ctx.step(30);
    s = await ctx.state();
    assert.equal(s.crouched, true, 'still crouched: there is no room to stand');
    assert.equal(s.bodyHeight, 1.0);
    assert.equal(s.state, 'crouch');

    // ---- out the other side: stands up by itself ----
    await ctx.step(420);
    s = await ctx.state();
    assert.ok(s.x > 26.5, `out of the passage (x = ${s.x})`);
    assert.equal(s.crouched, false);
    assert.equal(s.bodyHeight, 1.7);
    await page.keyboard.up('KeyD');
    await ctx.step(30);

    // ---- a standing player is stopped by passage B (1.4 m) ----
    await ctx.teleport(33, 0);
    await ctx.step(10);
    await page.keyboard.down('KeyD');
    await ctx.step(120);
    s = await ctx.state();
    assert.ok(s.x < 35.7, `blocked by the roof's face (x = ${s.x})`);
    await ctx.shot('04-blocked');
    await page.keyboard.up('KeyD');

    // ---- crouched DASH under passage A: the body keeps the crouched size the whole way ----
    await ctx.teleport(11, 0);
    await ctx.step(20);
    await page.keyboard.down('KeyS');
    await page.keyboard.down('KeyD');
    await ctx.step(4);
    await page.keyboard.down('ShiftLeft');
    await ctx.step(1);
    await page.keyboard.up('ShiftLeft');
    await ctx.step(1);
    s = await ctx.state();
    assert.equal(s.state, 'dash', 'dashing');
    assert.equal(s.bodyHeight, 1.0, 'the crouched body is kept during the dash');
    assert.equal(s.anim, 'crouchWalk', 'a crouched dash slides low');
    const x0 = s.x;
    await ctx.step(10);
    s = await ctx.state();
    assert.ok(s.x - x0 > 2, `slid ${s.x - x0} m`);
    assert.equal(s.crouched, true);
    await ctx.shot('05-crouch-dash');
    await page.keyboard.up('KeyS');
    await page.keyboard.up('KeyD');

    // ---- drawing budget ----
    await ctx.page.waitForTimeout(300);
    s = await ctx.state();
    assert.ok((s.draws ?? 0) <= 60 && (s.drawsMax ?? 0) <= 60, `draw calls ${s.draws} (worst ${s.drawsMax})`);
  },
};
