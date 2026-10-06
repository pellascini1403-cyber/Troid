import assert from 'node:assert/strict';
import { countPixels, decodePng, isVioletLight } from '../png';
import type { GameState, Scenario } from '../scenario';

/**
 * The Ink Slime in a real browser (S9): the procedural look and its warning in the lab (poses, then a live wind-up with
 * the real VFX), and the whole encounter in the game with REAL keyboard input — it notices, slides in, winds up (violet
 * on screen), lunges and hurts; a jump avoids the lunge; three slashes kill it and it dissolves and is removed; and it
 * stops attacking when the player is down. The pixels are looked at, not only the numbers.
 */
export const slime: Scenario = {
  name: 'slime',
  async run(ctx) {
    const violet = async (): Promise<number> => {
      await ctx.page.waitForTimeout(80); // let a frame render with the new state
      return countPixels(decodePng(await ctx.page.screenshot()), isVioletLight);
    };

    // ============================================================================================ A · the pose sheet
    await ctx.open('lab=slime', { width: 1280, height: 720, dpr: 1 });
    await ctx.page.waitForTimeout(300);
    const sheetViolet = await violet();
    assert.ok(sheetViolet > 3000, `the sheet shows the violet aura of the wind-up poses (${sheetViolet} px)`);
    await ctx.shot('sheet');
    let lab = (await ctx.state()) as GameState;
    // each slime is two batches (aura + light over its body in additive, the ink in normal): 14 of them stay far under 60
    assert.ok((lab.draws ?? 99) <= 40, `14 slimes in ${lab.draws} draw calls`);

    // ============================================================================ B · the live wind-up, frame by frame
    await ctx.open('lab=slime&mode=live&manual=1', { width: 1280, height: 720, dpr: 1 });
    const call = <T>(expr: string): Promise<T> => ctx.page.evaluate(expr) as Promise<T>;
    await call('window.__slime.start(); window.__slime.advance(0); window.__slime.render()');
    const v0 = await violet();
    await ctx.shot('live-0-start');
    // the aura builds with the wind-up (ease-in): by 0.2 s there is more violet, by 0.38 s (tick 23) a lot more
    await call('window.__slime.advance(0.2); window.__slime.render()');
    const v1 = await violet();
    await ctx.shot('live-1-mid');
    await call('window.__slime.advance(0.18); window.__slime.render()');
    const v2 = await violet();
    await ctx.shot('live-2-end');
    console.log(`  slime lab violet px: start ${v0} · 0.2 s ${v1} · 0.38 s ${v2}`);
    // (the motes are brightest at birth and fade as the aura of the creature builds: the dip in between is expected)
    assert.ok(v2 > v1 + 1500, `the violet builds to the instant before the blow: ${v1} → ${v2}`);
    const fx = await call<{ spawned: number; sprites: number; particles: number } | null>('window.__slime.stats()');
    assert.ok((fx?.spawned ?? 0) >= 2, `the ring and the motes were raised (${fx?.spawned})`);
    await call('window.__slime.advance(0.08); window.__slime.render()'); // 0.46 s: inside the lunge
    await ctx.shot('live-3-lunge');
    await call('window.__slime.advance(0.4); window.__slime.render()');
    await ctx.shot('live-4-recovery');
    await call('window.__slime.advance(3); window.__slime.render()');
    const vEnd = await violet();
    assert.ok(vEnd < v2 / 2, `everything goes quiet after the encounter: ${v2} → ${vEnd}`);
    const fxEnd = await call<{ particles: number; sprites: number }>('window.__slime.stats()');
    assert.equal(fxEnd.particles + fxEnd.sprites, 0, 'and every effect returned to its pool');

    // ===================================================================================== C · the encounter, for real
    await ctx.open('room=crouch_test&unlock=dash');
    const { page } = ctx;
    const hooks = (expr: string): Promise<unknown> => ctx.page.evaluate(`window.__troid.${expr}`);
    const enemy = async (): Promise<NonNullable<GameState['enemies']>[number]> => {
      const e = (await ctx.state()).enemies?.[0];
      assert.ok(e, 'there is a slime');
      return e;
    };
    const until = async (cond: () => Promise<boolean>, max: number, what: string): Promise<number> => {
      for (let i = 0; i < max; i++) {
        if (await cond()) return i;
        await ctx.step(1);
      }
      throw new Error(`${what}: not reached in ${max} ticks`);
    };
    const reset = async (): Promise<void> => {
      await ctx.page.evaluate('window.__troid.session.loadRoom("crouch_test"); window.__troid.revive()');
      await ctx.step(2);
    };

    await ctx.teleport(68, 0);
    await ctx.step(20);
    await hooks('spawnSlime(75, 0, -1)');
    await ctx.step(2);
    let s = await ctx.state();
    assert.equal(s.enemies?.length, 1, 'the slime joined the world');
    assert.equal(s.views, 1, 'and has a view');
    assert.equal(s.enemies?.[0]?.def, 'ink_slime');
    assert.equal(s.enemies?.[0]?.hp, 3);

    // ---- it notices me (7 m) and says so ----
    await until(async () => (await enemy()).state === 'detect', 30, 'detect');
    assert.equal((await enemy()).anim, 'alert');
    assert.equal((await enemy()).facing, -1, 'it turned to me');
    await ctx.shot('01-alert');
    const quiet = await violet();
    const spawnedBefore = (await ctx.state()).vfx?.spawned ?? 0;

    // ---- it slides in, stops at 2.2 m and winds up: the warning ----
    await until(async () => (await enemy()).state === 'telegraph', 300, 'telegraph');
    let e = await enemy();
    s = await ctx.state();
    assert.ok(Math.abs(e.x - s.x) <= 2.2 + 1e-6, `it winds up at ${Math.abs(e.x - s.x).toFixed(2)} m`);
    assert.equal(e.anim, 'telegraph');
    assert.equal(e.phase, 'startup');
    await ctx.step(20);
    e = await enemy();
    assert.equal(e.state, 'telegraph', 'still winding up at tick 20 of 24');
    assert.ok(e.phaseT > 0.7, `the wind-up is ${(e.phaseT * 100).toFixed(0)} % through`);
    s = await ctx.state();
    assert.ok((s.vfx?.spawned ?? 0) >= spawnedBefore + 2, `the violet ring and motes were raised (${spawnedBefore} → ${s.vfx?.spawned})`);
    const warning = await violet();
    assert.ok(warning > quiet + 800, `violet on screen: ${quiet} → ${warning} px`);
    await ctx.shot('02-telegraph');

    // ---- I stand still: the lunge connects ----
    await until(async () => ((await ctx.state()).health ?? 5) < 5, 60, 'the lunge connects');
    s = await ctx.state();
    assert.equal(s.health, 4, 'one hit, one damage');
    assert.equal(s.state, 'hurt');
    assert.equal(s.invulnerable, true, 'i-frames');
    assert.ok((s.hitStop ?? 0) > 0, 'hit-stop');
    assert.ok((s.vx ?? 0) < 0, 'pushed away from it');
    assert.equal(s.anim, 'hurt');
    await ctx.shot('03-hit');
    assert.ok((s.drawsMax ?? 99) <= 60, `draw calls ${s.drawsMax}`);
    console.log(`  slime: ${s.draws} draw calls with the player, a slime and the hit effects on screen (worst ${s.drawsMax})`);

    // ---- a jump over the lunge ----
    await reset();
    await ctx.teleport(68, 0);
    await ctx.step(20);
    await hooks('spawnSlime(75, 0, -1)');
    await ctx.step(2);
    await until(async () => (await enemy()).state === 'attack', 400, 'attack');
    await page.keyboard.down('Space');
    await ctx.step(1);
    await page.keyboard.up('Space');
    await ctx.step(45);
    s = await ctx.state();
    assert.equal(s.health, 5, 'jumping over the lunge avoids it');
    assert.ok(['recover', 'approach', 'telegraph'].includes((await enemy()).state), `it carries on: ${(await enemy()).state}`);

    // ---- three slashes kill it ----
    await reset();
    await ctx.page.evaluate('window.__troid.game.debug.set("godMode", true)'); // this part is about the slime, not about my life
    await ctx.teleport(68, 0);
    await ctx.step(20);
    await hooks('spawnSlime(69.7, 0, -1)');
    await ctx.step(2);
    const pull = (): Promise<unknown> =>
      ctx.page.evaluate(`(() => { const t = window.__troid; const e = t.session.entities.find((x) => x.kind === 'enemy'); const p = t.session.player.body; e.body.x = p.x + 1.6; e.body.vx = 0; })()`);
    for (let hit = 1; hit <= 3; hit++) {
      await pull();
      await ctx.step(1);
      await page.keyboard.down('KeyJ');
      await ctx.step(1);
      await page.keyboard.up('KeyJ');
      await until(async () => (await enemy()).hp <= 3 - hit, 40, `slash ${hit} lands`);
      e = await enemy();
      if (hit < 3) {
        assert.equal(e.state, 'hurt', `hit ${hit} staggers it`);
        assert.equal(e.hp, 3 - hit);
        if (hit === 1) await ctx.shot('04-slime-hurt');
        await ctx.step(30);
      }
    }
    e = await enemy();
    assert.equal(e.hp, 0);
    assert.equal(e.state, 'dead');
    assert.equal(e.anim, 'death');
    const inkBefore = (await ctx.state()).vfx?.spawned ?? 0;
    await ctx.step(14);
    e = await enemy();
    assert.ok(e.opacity < 1 && e.opacity > 0, `dissolving (${e.opacity.toFixed(2)})`);
    s = await ctx.state();
    assert.ok(inkBefore >= 1, 'the death ink was raised');
    await ctx.shot('05-dying');
    await ctx.step(40);
    s = await ctx.state();
    assert.equal(s.enemies?.length, 0, 'the body is gone after its 40 ticks');
    assert.equal(s.views, 0, 'and so is its view');
    assert.ok((s.drawsMax ?? 99) <= 60, `draw calls ${s.drawsMax}`);
    await ctx.page.evaluate('window.__troid.game.debug.set("godMode", false)');

    // ---- a defeated player is left alone ----
    await reset();
    await ctx.teleport(68, 0);
    await ctx.step(20);
    await hooks('spawnSlime(75, 0, -1)');
    await ctx.step(2);
    await until(async () => (await enemy()).state === 'telegraph', 300, 'telegraph');
    for (let i = 0; i < 5; i++) {
      await hooks('strikePlayer(1)');
      await ctx.step(1);
      if (i < 4) await ctx.step(80);
    }
    s = await ctx.state();
    assert.equal(s.health, 0);
    assert.equal(s.state, 'dead');
    const wake = (await ctx.state()).enemies?.[0]?.state;
    await ctx.step(12); // the 8 ticks of the death hit-stop freeze it too
    assert.ok(['idle', 'patrol'].includes((await enemy()).state), `it stood down (was ${wake})`);
    for (let i = 0; i < 6; i++) {
      await ctx.step(10);
      assert.ok(!['telegraph', 'attack'].includes((await enemy()).state), 'it never attacks a fallen player');
    }
    await ctx.shot('06-fallen');
  },
};
