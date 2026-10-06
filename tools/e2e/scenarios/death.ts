import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';

/**
 * Defeat and respawn (S8) with real input and the real DOM overlay: the death plays out, the screen fades to black, the
 * LOCALIZED title appears (es / en, switchable at runtime), a press after 30 ticks skips the wait, and the player comes
 * back at the room entrance with full health, every ability and the scenery rebuilt.
 */
export const death: Scenario = {
  name: 'death',
  async run(ctx) {
    await ctx.open('room=crouch_test&unlock=dash&lang=es');
    const { page } = ctx;
    // (`ctx.page` is looked up each time: `ctx.open()` below starts a NEW page)
    const hooks = (expr: string): Promise<unknown> => ctx.page.evaluate(`window.__troid.${expr}`);
    const overlay = (): Promise<{ display: string; opacity: number; title: string; hint: number }> =>
      ctx.page.evaluate(`(() => {
        const o = document.querySelector('[data-testid=death-overlay]');
        const t = document.querySelector('[data-testid=death-title]');
        const h = document.querySelector('[data-testid=death-hint]');
        return { display: getComputedStyle(o).display, opacity: Number(getComputedStyle(o).opacity), title: t.textContent, hint: Number(getComputedStyle(h).opacity) };
      })()`) as Promise<{ display: string; opacity: number; title: string; hint: number }>;

    await ctx.teleport(30, 0);
    await ctx.step(30);
    let s = await ctx.state();
    assert.equal(s.lang, 'es');
    assert.deepEqual(s.respawnPoint, { room: 'crouch_test', entry: 'start' });
    assert.equal((await overlay()).display, 'none', 'no overlay while alive');
    await hooks('spawnDummy(34, 0)');
    await ctx.step(2);
    assert.equal((await ctx.state()).dummies?.length, 1);

    // ---- kill the player (5 hits, waiting out the i-frames between them) ----
    for (let i = 0; i < 5; i++) {
      await hooks('strikePlayer(1)');
      await ctx.step(1);
      if (i < 4) await ctx.step(80);
    }
    s = await ctx.state();
    assert.equal(s.health, 0);
    assert.equal(s.state, 'dead');
    assert.equal(s.death?.phase, 'dying');
    assert.equal((await overlay()).display, 'none', 'while dying the world is still visible: death animation, energy dispersal');
    await ctx.shot('01-dying');

    // ---- the input is ignored while dying ----
    await page.keyboard.down('KeyD');
    await ctx.step(20);
    await page.keyboard.up('KeyD');
    assert.equal((await ctx.state()).state, 'dead');

    // ---- fade to black, the title comes in over it ----
    for (let i = 0; i < 200 && (await ctx.state()).death?.phase !== 'fadeOut'; i++) await ctx.step(1);
    assert.equal((await ctx.state()).death?.phase, 'fadeOut');
    await ctx.step(15);
    let o = await overlay();
    assert.equal(o.display, 'flex');
    assert.ok(o.opacity > 0.3 && o.opacity < 0.8, `half-way through the fade: ${o.opacity}`);
    await ctx.shot('02-fading');
    await ctx.step(16);
    s = await ctx.state();
    assert.equal(s.death?.phase, 'hold');
    o = await overlay();
    assert.equal(o.opacity, 1);
    assert.equal(o.title, 'Has caído', 'the title in Spanish, from the catalog');
    assert.equal(o.hint, 0, 'the hint waits 30 ticks');
    await ctx.shot('03-title-es');

    // ---- the language switches at runtime: no reload, no code ----
    await page.evaluate("window.__troid.game.translator.setLocale('en')");
    assert.equal((await overlay()).title, 'You fell');
    await ctx.shot('04-title-en');
    await page.evaluate("window.__troid.game.translator.setLocale('es')");
    assert.equal((await overlay()).title, 'Has caído');

    // ---- a press BEFORE 30 ticks is ignored; after them any button skips the wait ----
    await page.keyboard.press('Space');
    await ctx.step(2);
    assert.equal((await ctx.state()).death?.phase, 'hold', 'too early to skip');
    await ctx.step(30);
    assert.equal((await overlay()).hint, 1, 'the hint appears once a press would skip');
    await page.keyboard.down('KeyJ');
    await ctx.step(1);
    await page.keyboard.up('KeyJ');
    s = await ctx.state();
    assert.equal(s.death?.phase, 'fadeIn', 'the press skipped the rest of the wait');

    // ---- back at the entrance, alive, with everything it had ----
    assert.equal(s.health, 5);
    assert.equal(s.state, 'free');
    assert.ok(Math.abs(s.x - 4) < 0.1, `at the entrance (x = ${s.x})`);
    assert.equal(s.dummies?.length, 0, 'the room was reloaded');
    assert.equal(s.views, 0, 'and the entity views with it');
    await page.waitForTimeout(200); // the camera cuts at the next rendered frame
    assert.ok(Math.abs(((await ctx.state()).camera?.x ?? 99) - 4) < 12, 'the camera cut to the entrance');
    await ctx.step(15);
    o = await overlay();
    assert.ok(o.opacity > 0.2 && o.opacity < 0.9, `fading back in: ${o.opacity}`);
    await ctx.shot('05-fade-in');
    await ctx.step(30);
    assert.equal((await overlay()).display, 'none');
    assert.equal((await ctx.state()).death?.phase, 'none');

    // ---- dying costs nothing: the dash is still there ----
    await page.keyboard.down('KeyD');
    await ctx.step(10);
    await page.keyboard.down('ShiftLeft');
    await ctx.step(1);
    await page.keyboard.up('ShiftLeft');
    await ctx.step(2);
    s = await ctx.state();
    assert.equal(s.state, 'dash', 'the ability survived the defeat');
    await page.keyboard.up('KeyD');
    await ctx.step(40);
    await ctx.shot('06-back');

    // ---- the whole flow in real time (no stepping): about 3.2 s ----
    await hooks('revive()');
    for (let i = 0; i < 5; i++) {
      await hooks('strikePlayer(1)');
      await ctx.step(1);
      if (i < 4) await ctx.step(80);
    }
    assert.equal((await ctx.state()).death?.phase, 'dying');
    await hooks('resume()');
    await page.waitForFunction("window.__troid.state().death.phase === 'hold'", undefined, { timeout: 8000 });
    await page.waitForFunction("window.__troid.state().death.phase === 'none' && window.__troid.state().health === 5", undefined, { timeout: 8000 });
    await hooks('pause()');
    s = await ctx.state();
    assert.equal(s.health, 5);
    assert.ok((s.draws ?? 0) <= 60 && (s.drawsMax ?? 0) <= 60, `draw calls ${s.draws} (worst ${s.drawsMax})`);

    // ---- English from the start ----
    await ctx.open('room=crouch_test&lang=en');
    assert.equal((await ctx.state()).lang, 'en');
    assert.equal((await overlay()).title, 'You fell');
  },
};
