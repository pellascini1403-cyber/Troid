import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';

interface Stats {
  particles: number;
  sprites: number;
  spawned: number;
  dropped: number;
  unplayed: number;
  peakParticles: number;
  poolCreated: number;
}

/**
 * VFX in a real browser (S7): every trigger of the table plays through the real director on the lab stage and takes
 * its pictures at fixed times; effects die and return to their pools; the whole VFX layer stays within a handful of
 * draw calls; and on the LOW quality profile the particle budget (150) is never exceeded however much is thrown at it.
 *
 * Phase H (S52): the lab draws with the LIGHT THE ART PAINTED — the ten shapes and the twelve sequences of the `vfx` packs (its look says so) — and with the game's own shapes when it is asked to (`?vfx=procedural`):
 * every trigger is whole in both (it produces something and dies completely), and only the second leaves effects unplayed (the sequences are the art's). The hero's own light (the ambient motes) is a few particles
 * at most, as often as the magic is high.
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
    assert.deepEqual(triggers, ['slash', 'slashFinisher', 'hitLanded', 'playerHurt', 'dashStart', 'enemyDied', 'enemyTelegraph', 'playerDied', 'boltCharge', 'boltCast', 'boltImpact', 'boltEnd', 'drinkStart', 'drinkHeal', 'checkpoint', 'abilityGained', 'pickup', 'sealRejected', 'sealBroken', 'bossWake', 'bossStrike', 'bossPhase', 'bossDefeated']);

    // ---- the light is the art's: its shapes and all its sequences, and every one of the effects that plays one has it ----
    const look = await call<{ origin: string; sequences: string[] }>('window.__vfx.look()');
    assert.equal(look.origin, 'art', 'the lab draws with the shapes the art painted');
    assert.equal(look.sequences.length, 12, `the twelve sequences of the art: ${look.sequences.join(', ')}`);

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

    assert.equal((await stats()).unplayed, 0, 'with the art\'s sequences nothing is left unplayed');

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

    // ---- the game's own shapes (what the effects were before the art painted the light): every trigger is whole without the sequences — it produces something and dies completely ----
    await ctx.open('lab=vfx&manual=1&vh=5&vfx=procedural', { width: 1280, height: 720, dpr: 1 });
    await ctx.page.waitForTimeout(300);
    const own = await call<{ origin: string; sequences: string[] }>('window.__vfx.look()');
    assert.deepEqual(own, { origin: 'procedural', sequences: [] });
    for (const t of triggers) {
      await call(`window.__vfx.play('${t}')`);
      const born = await stats();
      assert.ok(born.particles + born.sprites > 0, `${t} produced nothing without the art's sequences`);
      await call('window.__vfx.advance(0.05); window.__vfx.render()');
      if (['slash', 'enemyDied', 'checkpoint', 'boltImpact'].includes(t)) await ctx.shot(`procedural-${t}`);
      await call('window.__vfx.advance(2.5)');
      const gone = await stats();
      assert.equal(gone.particles + gone.sprites, 0, `${t} left effects alive without the art's sequences`);
    }
    assert.ok((await stats()).unplayed >= 8, `the effects made of a sequence were not played (${(await stats()).unplayed}), and the others carried each moment`);

    // ---- the light the hero carries: a few motes, as often as their magic is high, and none when it is spent ----
    await ctx.open('lab=vfx&manual=1&vh=5&ambient=1', { width: 1280, height: 720, dpr: 1 });
    await ctx.page.waitForTimeout(300);
    let peak = 0;
    for (let i = 0; i < 400; i++) {
      await call('window.__vfx.advance(0.016)');
      peak = Math.max(peak, (await stats()).particles);
    }
    assert.ok(peak >= 2 && peak <= 8, `the hero's own light is a handful of motes (peak ${peak})`);
    await call('window.__vfx.setAmbient(0)');
    await call('window.__vfx.advance(3)');
    assert.equal((await stats()).particles, 0, 'and none once their magic is spent');

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
