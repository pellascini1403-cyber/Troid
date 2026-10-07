import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Scenario } from '../scenario';
import { frames } from '../frames';

/**
 * The developer tools are a TOOL, not part of the game (docs/PROMPT5-LOG.md S17): their code is a separate chunk. A normal load
 * never fetches it; `?debug=1` does, and then the panel works — it lists its actions, shows the readout, and an action changes
 * the world.
 *
 * And a pause is IMMEDIATE (S44): a frame that comes late — software GL, a texture upload, a busy page — must not first run, with the loop still
 * unpaused, the ticks it was owed (up to five). Two E2E scenarios found that out in the production run: their stepped play, counted by the tick, had five ticks too many.
 */
export const devtools: Scenario = {
  name: 'devtools',
  async run(ctx) {
    // ---- a normal load does not carry the tools
    const fetched = (page: Page): Promise<string[]> =>
      page.evaluate(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /devTools/.test(n))`) as Promise<string[]>;
    await ctx.open('room=movement_test', { width: 844, height: 390 });
    const page: Page = ctx.page;
    await frames(page, 4);
    assert.equal(await page.locator('text=DEBUG').count(), 0, 'no panel on a normal load');
    assert.deepEqual(await fetched(page), [], 'and its code is not even requested');

    // ---- ?debug=1 fetches them and the panel is there
    await ctx.open('room=movement_test&debug=1', { width: 844, height: 390 });
    const p2: Page = ctx.page;
    for (let k = 0; k < 60 && (await p2.locator('text=DEBUG').count()) === 0; k++) await p2.waitForTimeout(100);
    assert.ok((await p2.locator('text=DEBUG').count()) > 0, '?debug=1 opens the panel');
    assert.equal((await fetched(p2)).length, 1, 'by fetching the tools');
    await frames(p2, 6);
    const button = p2.locator('button', { hasText: 'spawn dummy' });
    assert.equal(await button.count(), 1, 'the panel lists the debug actions');
    const before = (await ctx.state()).dummies!.length;
    await button.click();
    await ctx.step(3);
    assert.equal((await ctx.state()).dummies!.length, before + 1, 'an action changes the world');
    const readout = await p2.locator('pre').first().textContent();
    assert.ok(/room\s+movement_test/.test(readout ?? ''), 'and the readout follows the game');
    await ctx.shot('01-panel');

    // ---- pausing is immediate: the page is busy for 400 ms right after the pause; the first frame after it must find the loop paused and run no tick (it used to find it running and run the ticks it was owed)
    await ctx.open('room=movement_test', { width: 844, height: 390 });
    const stopped = (await ctx.state()).tick;
    await ctx.page.evaluate('window.__troid.resume()');
    await frames(ctx.page, 6);
    const running = (await ctx.state()).tick;
    assert.ok(running > stopped, `resumed, the simulation runs in real time (tick ${stopped} → ${running})`);
    const paused = (await ctx.page.evaluate(
      `(() => { const t = window.__troid.state().tick; window.__troid.pause(); const until = performance.now() + 400; while (performance.now() < until) { /* busy: no frame can start */ } return t; })()`,
    )) as number;
    await frames(ctx.page, 4);
    assert.equal((await ctx.state()).tick, paused, 'not one tick ran after the pause, however late the next frame came');
  },
};
