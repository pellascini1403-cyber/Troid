import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/**
 * PixiJS view: Application, canvas, resolution, resize and device pixel ratio (S1 spike checklist), plus the
 * 4:3 – 21:9 viewport clamp (S2). Sizes are CSS px; the backing store is css × min(devicePixelRatio, 1.75).
 */
export const render: Scenario = {
  name: 'render',
  async run(ctx) {
    // A viewport change reaches the game through the browser's `resize` event; on a busy machine that takes longer than any
    // fixed wait, so wait for the backing store to follow instead (DPR 1: one backing pixel per CSS pixel).
    const resizeTo = async (width: number, height: number): Promise<void> => {
      await ctx.page.setViewportSize({ width, height });
      await ctx.page.waitForFunction(`window.__troid.state().canvas.width === ${width} && window.__troid.state().canvas.height === ${height}`, undefined, { timeout: 15000 });
      await ctx.page.waitForTimeout(100);
    };
    await ctx.open('room=movement_test&unlock=dash', { width: 844, height: 390, dpr: 1 });
    await ctx.step(10);
    await ctx.page.waitForTimeout(150);
    let s = await ctx.state();
    assert.ok(s.canvas && s.view, 'the 2D view reports its canvas and viewport');
    assert.equal(s.canvas.cssWidth, 844);
    assert.equal(s.canvas.cssHeight, 390);
    assert.equal(s.canvas.width, 844, 'DPR 1: one backing pixel per CSS pixel');
    assert.ok(near(s.view.ppm, 390 / 13.5, 1e-6), `ppm ${s.view.ppm}`);
    assert.ok(near(s.view.visibleWidth, 13.5 * (844 / 390), 1e-6), 'visible width follows the aspect ratio');
    assert.equal(s.view.barX, 0);
    await ctx.shot('01-phone');

    // ---- resize at runtime: 16:9 desktop ----
    await resizeTo(1920, 1080);
    s = await ctx.state();
    assert.ok(s.canvas && s.view);
    assert.equal(s.canvas.cssWidth, 1920);
    assert.ok(near(s.view.ppm, 80, 1e-6), `ppm ${s.view.ppm}`);
    assert.ok(near(s.view.visibleWidth, 24, 1e-6));
    await ctx.shot('02-desktop');

    // ---- ultra-wide: pillarboxed to 21:9, never reveals more than 31.5 m ----
    await resizeTo(2560, 1080);
    s = await ctx.state();
    assert.ok(s.view);
    assert.ok(near(s.view.visibleWidth, 13.5 * (21 / 9), 1e-6), `visible ${s.view.visibleWidth}`);
    assert.ok(s.view.barX > 0, 'side bars appear on ultra-wide screens');
    await ctx.shot('03-ultrawide');

    // ---- 4:3 tablet ----
    await resizeTo(1024, 768);
    s = await ctx.state();
    assert.ok(s.view);
    assert.ok(near(s.view.visibleWidth, 13.5 * (4 / 3), 1e-6));
    assert.equal(s.view.rotateDevice, false);
    await ctx.shot('04-tablet');

    // ---- portrait: letterboxed, asks to rotate ----
    await resizeTo(390, 844);
    s = await ctx.state();
    assert.ok(s.view);
    assert.equal(s.view.rotateDevice, true);
    assert.ok(s.view.barY > 0);
    await ctx.shot('05-portrait');

    // ---- device pixel ratio: the backing store follows min(dpr, 1.75) ----
    await ctx.open('room=movement_test', { width: 844, height: 390, dpr: 3 });
    await ctx.step(5);
    await ctx.page.waitForTimeout(200);
    s = await ctx.state();
    assert.ok(s.canvas && s.view);
    assert.equal(s.view.resolution, 1.75);
    assert.ok(near(s.canvas.width, 844 * 1.75, 1), `backing ${s.canvas.width}`);
    assert.ok(near(s.canvas.height, 390 * 1.75, 1), `backing ${s.canvas.height}`);
    assert.equal(s.canvas.cssWidth, 844, 'CSS size is unchanged by the resolution');
    await ctx.shot('06-dpr3');
  },
};
