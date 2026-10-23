import assert from 'node:assert/strict';
import type { ConsoleMessage, Page } from 'playwright-core';
import { reload } from '../bossKit';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * AUTO THAT MEASURES, in a real browser (docs/PROMPT20-LOG.md §7): with the quality on Auto — the profile the game starts on — a game that cannot keep up steps down to the low profile, once; a game with the quality chosen
 * by hand (High) is never touched; nothing is judged while the menu is open (the frames say nothing then); and what it did is not saved (the setting stays Auto: the next visit starts balanced again).
 *
 * The pages of the E2E run with the measuring OFF (`?hooks=1` turns it off: software drawing is slow by nature, and a scene must not have its quality change under it) — this one turns it on with `?adaptive=1`. A device
 * that cannot keep up is made with the hook `slowFrames(ms)`: every frame waits that long before it draws. The decision itself — what counts as not keeping up — is proven by `qualityGovernor.test.ts`.
 */
const SIZE = { width: 844, height: 390, dpr: 2 }; // (at a pixel ratio of 2 the two profiles differ in resolution: 1.75 and 1.25)
const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);

async function waitFor(page: Page, expr: string, what: string, timeout: number): Promise<void> {
  try {
    await page.waitForFunction(expr, undefined, { timeout });
  } catch {
    assert.fail(`${what} (${expr})`);
  }
}
const quality = async (ctx: Ctx): Promise<NonNullable<GameState['quality']>> => (await ctx.state()).quality!;

export const adaptive: Scenario = {
  name: 'adaptive',
  async run(ctx) {
    const infos: string[] = [];
    const listen = (page: Page): void => {
      page.on('console', (m: ConsoleMessage) => {
        if (m.type() === 'info' && m.text().includes('[quality]')) infos.push(m.text());
      });
    };

    // ================================================================================================ Auto, on a device that cannot keep up
    await ctx.open('adaptive=1&new=1', SIZE);
    listen(ctx.page);
    await ctx.page.evaluate('window.__troid.resume()'); // a player's game: the loop runs in real time
    let s = await quality(ctx);
    assert.deepEqual([s.setting, s.tier], ['auto', 'medium'], 'a game starts on Auto, which starts balanced');
    const balanced = { resolution: s.resolution, particles: s.particleBudget, sprites: s.spriteBudget };
    await ctx.page.evaluate('window.__troid.slowFrames(34)'); // ~30 frames a second at best
    await waitFor(ctx.page, `window.__troid.state().quality.tier === 'low'`, 'Auto stepped down to the low profile', 60000);
    s = await quality(ctx);
    assert.equal(s.setting, 'auto', 'the setting is still Auto: the game did it, not the player');
    assert.ok(s.resolution < balanced.resolution, `a lower render resolution (${balanced.resolution} → ${s.resolution})`);
    assert.ok((s.particleBudget ?? 0) < (balanced.particles ?? 0), `a smaller budget of particles (${balanced.particles} → ${s.particleBudget})`);
    assert.ok((s.spriteBudget ?? 0) < (balanced.sprites ?? 0), `and of effect sprites (${balanced.sprites} → ${s.spriteBudget})`);
    assert.equal(infos.length, 1, `it said so once (${infos.join(' | ')})`);
    assert.match(infos[0]!, /stepped down/);
    const saved = (await ctx.page.evaluate("localStorage.getItem('troid.settings')")) as string | null;
    assert.ok(saved === null || !/"quality":"low"/.test(saved), `what it did is not saved (${saved})`);
    // …and it does not go back up on its own, nor step again
    await ctx.page.evaluate('window.__troid.slowFrames(0)');
    await ctx.page.waitForTimeout(6000);
    assert.equal((await quality(ctx)).tier, 'low', 'a device that struggled is not asked to prove itself again');
    assert.equal(infos.length, 1, 'and it did not say it again');
    console.log(`  adaptive: Auto stepped down to Low (resolution ${balanced.resolution} → ${s.resolution}, particles ${balanced.particles} → ${s.particleBudget}); setting stays "auto", nothing saved, said once`);

    // the player picks Auto again in the menu: balanced again, and the measuring starts afresh
    await ctx.page.keyboard.press('Escape');
    await waitFor(ctx.page, 'window.__troid.state().menuOpen', 'the menu is open', 15000);
    await q(ctx.page, 'pause-settings').click();
    await q(ctx.page, 'settings-quality-high').click();
    await q(ctx.page, 'settings-quality-auto').click();
    s = await quality(ctx);
    assert.deepEqual([s.setting, s.tier], ['auto', 'medium'], 'Auto chosen again by hand is the balanced profile again');
    await q(ctx.page, 'pause-resume').click(); // (Escape would only go back from the settings to the map)
    await waitFor(ctx.page, '!window.__troid.state().menuOpen', 'the menu is closed', 15000);

    // ================================================================================================ the menu open: the frames say nothing
    await ctx.page.evaluate('window.__troid.slowFrames(34)');
    await ctx.page.keyboard.press('Escape');
    await waitFor(ctx.page, 'window.__troid.state().menuOpen', 'the menu is open', 15000);
    await ctx.page.waitForTimeout(16000); // longer than the start-up and the window together
    assert.equal((await quality(ctx)).tier, 'medium', 'with the menu open, however slow the frames, nothing is judged');
    await ctx.page.keyboard.press('Escape');
    await waitFor(ctx.page, '!window.__troid.state().menuOpen', 'the menu is closed', 15000);
    await waitFor(ctx.page, `window.__troid.state().quality.tier === 'low'`, 'and once the game is back it is judged on its own frames', 60000);

    // ================================================================================================ High, chosen by hand: never touched
    await ctx.page.keyboard.press('Escape');
    await waitFor(ctx.page, 'window.__troid.state().menuOpen', 'the menu is open', 15000);
    await q(ctx.page, 'pause-settings').click();
    await q(ctx.page, 'settings-quality-high').click();
    await q(ctx.page, 'pause-resume').click();
    await waitFor(ctx.page, '!window.__troid.state().menuOpen', 'the menu is closed', 15000);
    s = await quality(ctx);
    assert.deepEqual([s.setting, s.tier], ['high', 'high'], 'High, chosen by hand');
    await ctx.page.waitForTimeout(18000); // the slow frames go on
    assert.equal((await quality(ctx)).tier, 'high', 'a profile the player chose is never taken away, however slow the frames');

    // ================================================================================================ a new visit starts balanced again (Auto was never saved as Low)
    await ctx.page.evaluate("localStorage.removeItem('troid.settings')");
    await reload(ctx.page);
    s = await quality(ctx);
    assert.deepEqual([s.setting, s.tier], ['auto', 'medium'], 'a new visit starts on Auto, balanced');
  },
};
