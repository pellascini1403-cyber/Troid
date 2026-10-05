import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/** The 2D camera in the real game: follows, anticipates, respects the room bounds at every aspect ratio. */
export const camera: Scenario = {
  name: 'camera',
  async run(ctx) {
    // movement_test bounds: x ∈ [-1, 141], y ∈ [-14, 30]
    await ctx.open('room=movement_test&unlock=dash', { width: 844, height: 390 });
    await ctx.step(5);
    await ctx.page.waitForTimeout(400);
    let s = await ctx.state();
    assert.ok(s.camera && s.view);
    assert.equal(s.camera.viewHeight, 13.5, 'the configured visible height');
    const half = s.view.visibleWidth / 2;
    assert.ok(near(s.camera.x, -1 + half, 0.05), `at the left wall the view is clamped to the room: cam ${s.camera.x}, expected ${-1 + half}`);
    assert.ok(s.x < s.camera.x, 'the player starts left of the centre of the screen');
    await ctx.shot('01-left-wall');

    // run right on open ground (the steps near the spawn would block the run): the camera follows, smoothly, in real time
    const { page } = ctx;
    await ctx.teleport(46, 0);
    await ctx.step(10);
    await page.waitForTimeout(500);
    await page.keyboard.down('KeyD');
    await ctx.step(90);
    await page.waitForTimeout(1800);
    s = await ctx.state();
    assert.ok(s.camera);
    assert.ok(s.x > 55, `ran to ${s.x}`);
    assert.ok(Math.abs(s.camera.x - s.x) < 3.2, `the camera stays with the runner: cam ${s.camera.x} player ${s.x}`);
    await ctx.shot('02-following');
    await page.keyboard.up('KeyD');

    // right wall: never shows beyond the room
    await ctx.teleport(139, 0);
    await ctx.step(5);
    await page.waitForTimeout(600);
    s = await ctx.state();
    assert.ok(s.camera && s.view);
    assert.ok(s.camera.x <= 141 - s.view.visibleWidth / 2 + 0.05, `right clamp: cam ${s.camera.x}`);
    await ctx.shot('03-right-wall');

    // ultra-wide 21:9: shows 31.5 m, still inside the room
    await page.setViewportSize({ width: 2560, height: 1080 });
    await page.waitForTimeout(500);
    s = await ctx.state();
    assert.ok(s.camera && s.view);
    assert.ok(near(s.view.visibleWidth, 31.5, 1e-6));
    assert.ok(s.camera.x <= 141 - 31.5 / 2 + 0.05, `21:9 right clamp: cam ${s.camera.x}`);
    await ctx.shot('04-ultrawide-right');

    // 4:3 tablet at the left wall
    await page.setViewportSize({ width: 1024, height: 768 });
    await ctx.teleport(2, 0);
    await ctx.step(5);
    await page.waitForTimeout(600);
    s = await ctx.state();
    assert.ok(s.camera && s.view);
    assert.ok(near(s.view.visibleWidth, 18, 1e-6));
    assert.ok(s.camera.x >= -1 + 9 - 0.05, `4:3 left clamp: cam ${s.camera.x}`);
    await ctx.shot('05-tablet-left');
  },
};
