import assert from 'node:assert/strict';
import { ROOMS, WORLD } from '@/content';
import { roomLimits } from '@/camera/cameraZones';
import { frames } from '../frames';
import type { GameState, Scenario } from '../scenario';

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

    // ---- the cameras of the world (docs/PROMPT6-LOG.md S26) ----
    /** The camera eases in its own time (frames, not ticks): let it run `seconds` of it now instead of waiting on slow software-GL frames. */
    const settle = async (seconds = 4): Promise<void> => {
      await frames(ctx.page, 2); // a real frame has drawn the change first
      await ctx.page.evaluate(`window.__troid.settleCamera(${seconds})`);
    };
    // every room holds the view to ITS limits (the room's width, the foot of the ground at the bottom): at the start, and at the far end
    for (const id of WORLD.rooms) {
      const room = ROOMS[id]!;
      const limits = roomLimits(room);
      await ctx.open(`room=${id}`, { width: 844, height: 390 });
      await ctx.step(5);
      await settle(2);
      s = await ctx.state();
      assert.equal(s.camera!.zone, null, `${id}: the room's own limits hold at the start`);
      assert.deepEqual(s.camera!.limits, limits, `${id}: the view is held to the limits the room declares`);
      assert.ok(inside(s), `${id}: at the start the view (${fmt(edges(s))}) is inside ${fmt(limits)}`);
      assert.ok(edges(s).y0 >= -6 - 0.06, `${id}: nothing below the foot of the ground is ever shown`);
      for (const x of [limits.x1 - 2, (limits.x0 + limits.x1) / 2]) {
        await ctx.teleport(x, 0);
        await ctx.step(3);
        await settle(2);
        s = await ctx.state();
        assert.ok(inside(s), `${id}: at x = ${x} the view (${fmt(edges(s))}) is inside ${fmt(limits)}`);
        assert.ok(Math.abs(s.camera!.x - s.x) <= s.view!.visibleWidth / 2, `${id}: the hero is on screen at x = ${x}`);
      }
      await ctx.shot(`06-limits-${id}`);
    }

    // R4's arena: while the hero's feet are inside it the view is held to the fight (the doors at both ends in, nothing of the rest of
    // the room out) and pulled back a little; the moment the hero is out of it the room's own limits and height come back
    const r4 = ROOMS.r4_sanctum!;
    const arena = r4.camera!.zones![0]!;
    await ctx.open('room=r4_sanctum', { width: 844, height: 390 });
    await ctx.step(5);
    await settle(2);
    s = await ctx.state();
    assert.equal(s.camera!.zone, null, 'the vestibule is outside the arena');
    assert.equal(s.camera!.viewHeight, 13.5, '…at the normal height');
    const free = { ...s.camera!.limits! };

    // walking in, for real: the zone engages as the hero crosses its edge, the limits ease (they never jump) and the picture stays inside them
    await ctx.teleport(arena.rect.x0 - 4, 0);
    await ctx.step(3);
    await settle(2);
    await ctx.page.keyboard.down('KeyD');
    let held = 0;
    let worstStep = 0;
    let between = 0;
    let lastLimits = (await ctx.state()).camera!.limits!;
    for (let i = 0; i < 40; i++) {
      await ctx.step(5);
      await frames(ctx.page, 2);
      s = await ctx.state();
      assert.ok(inside(s), `walking in, the view (${fmt(edges(s))}) stays inside the limits that hold at that moment (${fmt(s.camera!.limits!)})`);
      worstStep = Math.max(worstStep, Math.abs(s.camera!.limits!.x0 - lastLimits.x0));
      lastLimits = s.camera!.limits!;
      if (s.camera!.zone === 'arena') held++;
      if (s.camera!.limits!.x0 > free.x0 + 0.5 && s.camera!.limits!.x0 < arena.bounds.x0 - 0.5) between++;
    }
    await ctx.page.keyboard.up('KeyD');
    assert.ok(held > 10, `the arena engaged while walking in (${held} samples)`);
    const travel = Math.abs(arena.bounds.x0 - free.x0);
    assert.ok(between >= 3, `the limits eased in: ${between} samples saw the west edge on its way`);
    assert.ok(worstStep < travel / 2, `…and never jumped: at most ${worstStep.toFixed(2)} m between two samples of the ${travel.toFixed(0)} m it travels`);
    await settle(5);
    s = await ctx.state();
    assert.equal(s.camera!.zone, 'arena', 'the hero is in the arena');
    assert.ok(s.camera!.limits && near(s.camera!.limits.x0, arena.bounds.x0, 0.05) && near(s.camera!.limits.x1, arena.bounds.x1, 0.05), `held to the arena (${fmt(s.camera!.limits!)})`);
    assert.ok(near(s.camera!.viewHeight, arena.viewHeight!, 0.05), `pulled back to ${arena.viewHeight} m (${s.camera!.viewHeight.toFixed(2)})`);
    assert.ok(inside(s));
    await ctx.shot('07-arena-west');

    // the far side of the arena: the view stops at its limit — the east door, not the rest of the room
    await ctx.teleport(arena.rect.x1 - 1, 0);
    await ctx.step(3);
    await settle(2);
    s = await ctx.state();
    assert.equal(s.camera!.zone, 'arena');
    assert.ok(edges(s).x1 <= arena.bounds.x1 + 0.06, `the east edge of the view (${edges(s).x1.toFixed(2)}) stops at the arena's limit (${arena.bounds.x1})`);
    assert.ok(edges(s).x0 >= arena.bounds.x0 - 0.06 && edges(s).y0 >= arena.bounds.y0 - 0.06 && edges(s).y1 <= arena.bounds.y1 + 0.06);
    await ctx.shot('08-arena-east');

    // out of it, the camera is free again: the room's limits and the normal height
    await ctx.teleport(arena.rect.x1 + 4, 0);
    await ctx.step(3);
    await settle(5);
    s = await ctx.state();
    assert.equal(s.camera!.zone, null, 'out of the arena the room holds the view again');
    assert.deepEqual(s.camera!.limits && { x0: s.camera!.limits.x0, x1: s.camera!.limits.x1 }, { x0: free.x0, x1: free.x1 }, 'the limits are the room\'s again');
    assert.ok(near(s.camera!.viewHeight, 13.5, 0.05), `the height is the normal one (${s.camera!.viewHeight.toFixed(2)})`);
    await ctx.shot('09-arena-released');

    // the arena at the widest and the narrowest screens: the view never shows beyond it
    for (const [w, h] of [[2560, 1080], [1024, 768]] as const) {
      await ctx.page.setViewportSize({ width: w, height: h });
      await ctx.teleport((arena.rect.x0 + arena.rect.x1) / 2, 0);
      await ctx.step(3);
      await settle(2);
      s = await ctx.state();
      assert.equal(s.camera!.zone, 'arena');
      assert.ok(inside(s), `${w}×${h}: the view (${fmt(edges(s))}) is inside the arena (${fmt(s.camera!.limits!)})`);
    }
  },
};

type Box = { x0: number; y0: number; x1: number; y1: number };
const fmt = (b: Box): string => `x ${b.x0.toFixed(1)}…${b.x1.toFixed(1)}, y ${b.y0.toFixed(1)}…${b.y1.toFixed(1)}`;

/** What the camera shows, in world metres (from its centre, its visible height and the aspect of the game area). */
function edges(s: GameState): Box {
  const h = s.camera!.viewHeight / 2;
  const w = (h * s.view!.contentWidth) / s.view!.contentHeight;
  return { x0: s.camera!.x - w, x1: s.camera!.x + w, y0: s.camera!.y - h, y1: s.camera!.y + h };
}

/** The view is inside the limits it is held to now (an axis that the limits are narrower than the view on is centred, so it is skipped). */
function inside(s: GameState, tol = 0.06): boolean {
  const e = edges(s);
  const l = s.camera!.limits!;
  const xOk = e.x1 - e.x0 > l.x1 - l.x0 + tol || (e.x0 >= l.x0 - tol && e.x1 <= l.x1 + tol);
  const yOk = e.y1 - e.y0 > l.y1 - l.y0 + tol || (e.y0 >= l.y0 - tol && e.y1 <= l.y1 + tol);
  return xOk && yOk;
}
