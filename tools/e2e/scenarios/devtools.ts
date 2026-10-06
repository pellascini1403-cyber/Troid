import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Scenario } from '../scenario';
import { frames } from '../frames';

/**
 * The developer tools are a TOOL, not part of the game (docs/PROMPT5-LOG.md S17): their code is a separate chunk. A normal load
 * never fetches it; `?debug=1` does, and then the panel works — it lists its actions, shows the readout, and an action changes
 * the world.
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
  },
};
