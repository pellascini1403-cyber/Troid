import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';

/** The movement playground, driven by REAL keyboard events. */
export const movement: Scenario = {
  name: 'movement',
  async run(ctx) {
    await ctx.open('room=movement_test&unlock=dash');
    const { page } = ctx;

    await ctx.step(30);
    let s = await ctx.state();
    assert.equal(s.grounded, true, 'spawns grounded');
    assert.equal(s.anim, 'idle');
    await ctx.shot('01-idle');

    // run right with D
    await page.keyboard.down('KeyD');
    await ctx.step(60);
    s = await ctx.state();
    assert.ok(s.vx > 8, `running right at ${s.vx}`);
    assert.equal(s.anim, 'run');
    await ctx.shot('02-run');

    // jump with Space (held)
    await page.keyboard.down('Space');
    await ctx.step(14);
    s = await ctx.state();
    assert.equal(s.grounded, false);
    assert.ok(s.vy > 0 || s.y > 1, 'rising');
    assert.ok(['jump', 'fall'].includes(s.anim));
    await ctx.shot('03-jump');
    await page.keyboard.up('Space');
    await ctx.step(40);

    // dash with Shift, in open ground (a dash into a wall ends immediately, by design)
    await ctx.teleport(52, 0);
    await ctx.step(20);
    const x0 = (await ctx.state()).x;
    await page.keyboard.down('ShiftLeft');
    await ctx.step(1);
    await page.keyboard.up('ShiftLeft');
    await ctx.step(4);
    s = await ctx.state();
    assert.equal(s.state, 'dash', 'dashing after Shift');
    assert.equal(s.anim, 'dash');
    assert.ok(s.x - x0 > 1.5, 'moved forward fast');
    await ctx.shot('04-dash');

    await page.keyboard.up('KeyD');
    await ctx.step(60);
    s = await ctx.state();
    assert.ok(Math.abs(s.vx) < 0.1, 'stopped after releasing D');
    assert.equal(s.anim, 'idle');

    // a stuck key must not survive a window blur
    await page.keyboard.down('KeyA');
    await ctx.step(10);
    await page.evaluate("window.dispatchEvent(new Event('blur'))");
    await ctx.step(60);
    s = await ctx.state();
    assert.ok(Math.abs(s.vx) < 0.1, 'blur released the held key');
    await page.keyboard.up('KeyA');
  },
};
