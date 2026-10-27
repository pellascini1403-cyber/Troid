import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { reload, seed } from '../bossKit';
import type { Scenario } from '../scenario';

/**
 * WHAT A FRAME COSTS THE MAIN THREAD (docs/PROMPT20-LOG.md §7): the heaviest minutes of the game — the hero walking into the arena of the Ink Warden and striking while the Warden winds up, charges and rains ink — played in
 * REAL TIME, and the time every frame of the game takes (the simulation's ticks, the scene's update and the drawing commands the renderer sends: everything the game's JavaScript does in a frame) taken by wrapping
 * `requestAnimationFrame` and timing the game's own callback. Then the same minutes with the CPU of the page slowed down ×4 and ×6 (DevTools' `Emulation.setCPUThrottlingRate`), which is the nearest thing a desktop has to a phone that is not new.
 *
 * What it says and what it does not. It says how much of a 16.7 ms frame the game's own code uses, and how that grows when the processor is slower: the headroom. It does NOT say that a phone will run at 60 frames
 * a second: the throttling slows this page's JavaScript only (not the GPU, which in this browser is a software one on other threads), a real phone differs from "this machine ÷ 6" in a hundred ways, and nothing
 * here has run on a phone. It is an indicator to compare one build with the next and to know whether the first thing to profile on a device would be the code or the drawing — never a result about a device. The only
 * checks are that the instrument works (frames were counted; slowing the CPU slowed the frames) and a wide guard (the average frame of the game, on this machine, fits a 60 Hz frame with room): a number that large would
 * be a change of order, not noise.
 */
const SIZE = { width: 844, height: 390, dpr: 1 };
const RATES = [1, 4, 6] as const;
const PLAY_MS = 9000;
/** Frames the instrument needs before a mean and a percentile mean anything. On a machine whose software renderer gets through fewer than this in `PLAY_MS` (a container with every core busy drawing: 6–8 frames a second), the minutes measured go on until they are counted, up to `MAX_FACTOR` times as long. */
const MIN_FRAMES = 60;
const MAX_FACTOR = 5;

/** Before the game's own code runs: every frame callback is timed (the time it takes, not the time between frames). */
const TIMING = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__cost = [];
  window.requestAnimationFrame = (callback) => raf((time) => {
    const t0 = performance.now();
    try { callback(time); } finally { window.__cost.push([callback.name, performance.now() - t0]); }
  });
})()`;

interface Stats {
  frames: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  over: number;
}

function stats(ms: number[]): Stats {
  const sorted = [...ms].sort((a, b) => a - b);
  const at = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  return {
    frames: ms.length,
    mean: ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length),
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted[sorted.length - 1] ?? 0,
    over: ms.filter((t) => t > 1000 / 60).length / Math.max(1, ms.length),
  };
}

/** The hero walks into the arena and strikes, in real time. The frames are counted from the moment the Warden is awake (the minutes measured are the fight, however slow the page makes the walk there), for `ms`. */
async function play(page: Page, ms: number): Promise<number[]> {
  await page.evaluate('window.__troid.resume()');
  await page.keyboard.down('KeyD');
  const strike = async (): Promise<void> => {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(220);
  };
  for (const start = Date.now(); Date.now() - start < 90_000; ) {
    const boss = (await page.evaluate('window.__troid.state().boss')) as { state: string } | null;
    if (boss && boss.state !== 'dormant' && boss.state !== 'intro') break;
    await strike();
  }
  await page.evaluate('window.__cost.length = 0');
  const end = Date.now() + ms;
  const cap = Date.now() + ms * MAX_FACTOR;
  // (counted as the frames are taken below: the game's own, or all of them if the page names none)
  const counted = async (): Promise<number> =>
    (await page.evaluate("(() => { const all = window.__cost; const game = all.filter(([name]) => name === 'onFrame'); return (game.length > 0 ? game : all).length; })()")) as number;
  // (the fight is played for `ms` at least, and on a slow machine until enough frames are in: how many the renderer gets through in nine seconds is the machine's, not what this measures)
  while (Date.now() < end || (Date.now() < cap && (await counted()) < MIN_FRAMES)) await strike();
  await page.keyboard.up('KeyD');
  await page.evaluate('window.__troid.pause()');
  // only the game's own frame (`GameLoop.onFrame`) is the game's cost: the page has other callbacks asked for on each frame (the interface's, the browser's own) that do almost nothing and would pull every figure down
  const all = (await page.evaluate('window.__cost.slice()')) as Array<[string, number]>;
  const game = all.filter(([name]) => name === 'onFrame').map(([, ms]) => ms);
  return game.length > 0 ? game : all.map(([, ms]) => ms);
}

export const cost: Scenario = {
  name: 'cost',
  async run(ctx) {
    await ctx.open('paused=1', {
      ...SIZE,
      prepare: async (context) => {
        await context.addInitScript(TIMING);
      },
    });
    const cdp = await ctx.page.context().newCDPSession(ctx.page);
    const results = new Map<number, Stats>();
    try {
      for (const rate of RATES) {
        await seed(ctx); // the hero at the shrine of R4 again (the page reloads: the frame timer is installed before it runs)
        await ctx.page.evaluate('window.__troid.pause()');
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        await ctx.page.waitForTimeout(300);
        const frames = await play(ctx.page, PLAY_MS);
        const s = stats(frames);
        results.set(rate, s);
        const after = await ctx.state();
        const fight = after.boss;
        console.log(
          `  cost ×${rate}: ${s.frames} frames · JavaScript per frame: mean ${s.mean.toFixed(2)} ms · p50 ${s.p50.toFixed(2)} · p95 ${s.p95.toFixed(2)} · p99 ${s.p99.toFixed(2)} · worst ${s.max.toFixed(1)} · over 16.7 ms: ${(s.over * 100).toFixed(1)}%` +
            ` · the Warden was ${fight ? `${fight.state} (${fight.hp}/${fight.maxHp})` : 'not in the room'} · the game's own count: ${after.fps.toFixed(0)} frames a second`,
        );
        assert.ok(frames.length >= MIN_FRAMES, `×${rate}: the frames were counted (${frames.length})`);
      }
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined);
    }
    const one = results.get(1)!;
    const six = results.get(6)!;
    assert.ok(six.mean > one.mean * 1.5, `slowing the CPU ×6 slowed the frames (mean ${one.mean.toFixed(2)} ms → ${six.mean.toFixed(2)} ms): the instrument sees the throttling`);
    assert.ok(one.mean < 8, `the average frame of the game's JavaScript fits a 60 Hz frame with room on this machine (${one.mean.toFixed(2)} ms)`);
    await reload(ctx.page);
  },
};
