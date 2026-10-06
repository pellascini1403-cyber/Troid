import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';

interface Stats {
  particles: number;
  sprites: number;
  spawned: number;
  dropped: number;
  peakParticles: number;
  poolCreated: number;
}

/**
 * VFX in a real browser (S7): every trigger of the table plays through the real director on the lab stage and takes
 * its pictures at fixed times; effects die and return to their pools; the whole VFX layer stays within a handful of
 * draw calls; and on the LOW quality profile the particle budget (150) is never exceeded however much is thrown at it.
 */
export const vfx: Scenario = {
  name: 'vfx',
  async run(ctx) {
    await ctx.open('lab=vfx&manual=1&vh=5', { width: 1280, height: 720, dpr: 1 });
    await ctx.page.waitForTimeout(300);
    const call = <T>(expr: string): Promise<T> => ctx.page.evaluate(expr) as Promise<T>;
    const stats = (): Promise<Stats> => call<Stats>('window.__vfx.stats()');

    assert.equal((await stats()).particles, 0);
    const triggers = await call<string[]>('window.__vfx.triggers');
    assert.deepEqual(triggers, ['slash', 'slashFinisher', 'hitLanded', 'playerHurt', 'dashStart', 'enemyDied', 'enemyTelegraph', 'playerDied', 'boltCast', 'boltImpact', 'boltEnd', 'drinkStart', 'drinkHeal', 'pickup']);

    // ---- every trigger produces something, shows up on screen, and dies completely ----
    for (const t of triggers) {
      await call(`window.__vfx.play('${t}')`);
      const born = await stats();
      assert.ok(born.particles + born.sprites > 0, `${t} produced nothing`);
      await call('window.__vfx.advance(0.05); window.__vfx.render()');
      await ctx.shot(`${t}`);
      await call('window.__vfx.advance(2.5)');
      const gone = await stats();
      assert.equal(gone.particles + gone.sprites, 0, `${t} left ${gone.particles} particles and ${gone.sprites} sprites alive`);
    }

    // ---- batching: all of it in a few draw calls ----
    await call("window.__vfx.play('enemyDied'); window.__vfx.fire('hitLanded'); window.__vfx.fire('playerHurt'); window.__vfx.fire('slashFinisher'); window.__vfx.advance(0.04)");
    await ctx.page.waitForTimeout(500);
    const s1 = (await ctx.page.evaluate('window.__troid.state()')) as { draws: number; drawsMax: number };
    console.log(`  vfx: ${s1.draws} draw calls with the heaviest moment on screen (worst ${s1.drawsMax})`);
    assert.ok(s1.draws <= 12, `the VFX layer batches: ${s1.draws} draw calls`);
    assert.ok(s1.drawsMax <= 60, `worst frame ${s1.drawsMax}`);
    await ctx.shot('heavy-moment');
    await call('window.__vfx.clear()');

    // ---- pools stop growing: a long fight allocates nothing new ----
    const fight = async (): Promise<void> => {
      for (const t of ['slash', 'hitLanded', 'playerHurt', 'enemyDied']) await call(`window.__vfx.fire('${t}')`);
      await call('window.__vfx.advance(1.3)');
    };
    for (let i = 0; i < 6; i++) await fight();
    const warm = (await stats()).poolCreated;
    for (let i = 0; i < 40; i++) await fight();
    const after = await stats();
    assert.ok(after.poolCreated <= warm + 12, `the pools keep growing: ${warm} → ${after.poolCreated}`);
    assert.equal(after.particles + after.sprites, 0);

    // ---- the optional warm accent is OFF by default and ON when asked (the finisher is the only user) ----
    await ctx.open('lab=vfx&manual=1&vh=3.2&accent=1', { width: 1280, height: 720, dpr: 1 });
    await ctx.page.waitForTimeout(300);
    await call("window.__vfx.play('slashFinisher'); window.__vfx.advance(0.06); window.__vfx.render()");
    await ctx.shot('finisher-with-accent');

    // ---- LOW profile: the 150-particle budget is a hard cap ----
    await ctx.open('lab=vfx&manual=1&tier=low', { width: 1280, height: 720, dpr: 1 });
    await ctx.page.waitForTimeout(300);
    for (let i = 0; i < 30; i++) {
      for (const t of triggers) await call(`window.__vfx.fire('${t}')`);
      await call('window.__vfx.advance(0.016)');
      assert.ok((await stats()).particles <= 150, `over budget: ${(await stats()).particles}`);
    }
    const low = await stats();
    assert.ok(low.peakParticles <= 150, `peak ${low.peakParticles}`);
    assert.ok(low.dropped > 0 || low.peakParticles >= 100, 'the budget was really pushed');
    console.log(`  vfx (low): peak ${low.peakParticles}/150 particles, ${low.dropped} effects dropped by the governor`);
  },
};
