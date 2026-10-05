import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';

/**
 * Sprite pipeline in a real browser (S3): the placeholder atlas is drawn with a canvas, loaded through the asset
 * manager, validated, and played by the same `ActorSprite` the game uses. Phase-driven attacks show the frame the
 * simulation asks for, the sword anchors follow the hand, and swapping the art (another art resolution) keeps the
 * on-screen size because sprites are measured in metres.
 */
export const sprites2d: Scenario = {
  name: 'sprites-2d',
  async run(ctx) {
    await ctx.open('lab=sprites&cycle=0', { width: 1920, height: 1080, dpr: 1 });
    await ctx.page.waitForTimeout(400);
    const call = <T>(expr: string): Promise<T> => ctx.page.evaluate(expr) as Promise<T>;

    // ---- the set validates cleanly and everything is loaded ----
    const info = await call<{ report: string[]; states: string[]; frameCount: number }>('({ report: window.__sprites.report, states: window.__sprites.states, frameCount: window.__sprites.frameCount })');
    const problems = info.report.filter((r) => !r.startsWith('info:'));
    assert.deepEqual(problems, [], `validator reported: ${problems.join(' | ')}`);
    assert.equal(info.frameCount, 62);
    for (const s of ['idle', 'walk', 'run', 'jump', 'fall', 'dash', 'attack', 'hurt', 'death', 'crouch']) {
      assert.ok(info.states.includes(s), `clip "${s}" present`);
    }
    await ctx.shot('01-sheet');

    // ---- logical states reach their clips ----
    for (const [state, prefix] of [['idle', 'idle_'], ['walk', 'walk_'], ['run', 'run_'], ['jump', 'jump_'], ['fall', 'fall_'], ['dash', 'dash_'], ['hurt', 'hurt_'], ['death', 'death_']] as const) {
      const f = await call<string | null>(`window.__sprites.play('${state}')`);
      assert.ok(f?.startsWith(prefix), `${state} → ${f}`);
    }

    // ---- phase-driven attack: the frame follows the SIMULATION phase ----
    const at = (phase: string, t: number): Promise<string | null> => call(`window.__sprites.play('attack', '${phase}', ${t})`);
    assert.equal(await at('startup', 0), 'attack_00');
    assert.equal(await at('startup', 0.9), 'attack_01');
    assert.equal(await at('active', 0), 'attack_02');
    assert.equal(await at('active', 0.9), 'attack_03');
    assert.equal(await at('recovery', 0), 'attack_04');
    assert.equal(await at('recovery', 0.9), 'attack_05');

    // ---- the sword is attached to the right hand and reaches forward in the active frames ----
    await at('active', 0.9);
    const grip = await call<{ x: number; y: number }>("window.__sprites.anchor('weapon_grip')");
    const hand = await call<{ x: number; y: number }>("window.__sprites.anchor('hand_r')");
    const tip = await call<{ x: number; y: number }>("window.__sprites.anchor('weapon_tip')");
    assert.ok(Math.hypot(grip.x - hand.x, grip.y - hand.y) <= 0.04, 'grip on the hand');
    assert.ok(tip.x - grip.x > 0.9, `the blade points forward at the end of the swing (${tip.x - grip.x})`);
    await ctx.shot('02-attack-active');

    // ---- swapping the art keeps the size in metres ----
    const main = await call<{ set: string; spriteScaleTimesArt: number; boundsW: number; boundsH: number }>("window.__sprites.swap('main')");
    const low = await call<{ set: string; artPxPerMeter: number; spriteScaleTimesArt: number; boundsW: number; boundsH: number }>("window.__sprites.swap('lowres')");
    assert.equal(main.set, 'player_placeholder');
    assert.equal(low.set, 'player_placeholder_lowres');
    assert.equal(low.artPxPerMeter, 36);
    assert.ok(Math.abs(main.spriteScaleTimesArt - 1) < 1e-6 && Math.abs(low.spriteScaleTimesArt - 1) < 1e-6, 'scale × art px/m = 1 in both sets');
    // the atlas cells are whole pixels, so the two cells differ by a rounding error (< 0.5 %), not by the 56/36 ratio of the art
    const rel = (a: number, b: number): number => Math.abs(a - b) / a;
    assert.ok(rel(main.boundsW, low.boundsW) < 0.005 && rel(main.boundsH, low.boundsH) < 0.005, `same on-screen size: ${main.boundsW}×${main.boundsH} vs ${low.boundsW}×${low.boundsH}`);
    await ctx.shot('03-lowres');
    await call("window.__sprites.swap('main')");

    // (The lab draws ~100 debug shapes and labels, so its draw calls are not a budget: the game scene is checked in movement-2d.)
  },
};
