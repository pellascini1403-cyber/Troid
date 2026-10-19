import assert from 'node:assert/strict';
import { AMBIENT_CONTRACT } from '@/presentation/vfxContract';
import { VFX_SEQUENCE_NAMES } from '@/presentation/vfxArt';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * THE LIGHT THE ART PAINTED, in the real game (docs/PROMPT8-LOG.md, phase H; docs/ART-PIPELINE-2D.md §M.14): the two packs of the `vfx` category boot with the game, and once they are in memory the effects draw with the
 * art's shapes and play its sequences — the cut of the sword, the blow that lands, the ink that bursts, the pillar of a place that awakens, the bolt in flight. Light that stands behind the hero is drawn behind them.
 * The hero carries a little light of their own while their magic is high (a handful of motes, no more, none when it is spent). With `?vfx=procedural` the game draws with its own shapes, as it always did — and every
 * moment is still whole: the effects made of a sequence are simply not played. The console stays clean (the runner fails the scenario otherwise) and draw calls stay ≤ 60.
 */
const SIZE = { width: 844, height: 390, dpr: 1 };

async function until(ctx: Ctx, what: string, ok: (s: GameState) => boolean, ms = 20000): Promise<GameState> {
  const t0 = Date.now();
  let s = await ctx.state();
  while (!ok(s)) {
    if (Date.now() - t0 > ms) assert.fail(`timed out waiting for ${what}`);
    await ctx.page.waitForTimeout(80);
    s = await ctx.state();
  }
  return s;
}

export const vfxArt: Scenario = {
  name: 'vfx-art',
  async run(ctx) {
    const sess = (code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
    const hooks = (expr: string): Promise<unknown> => ctx.page.evaluate(`window.__troid.${expr}`);
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };

    // ================================================================================================ the light is the art's
    await ctx.open('room=r1_gate&unlock=dash&paused=1', SIZE);
    let s = await until(ctx, 'the effects to draw with the art\'s light', (x) => x.vfxLook?.origin === 'art');
    assert.deepEqual(s.vfxLook!.sequences.slice().sort(), [...VFX_SEQUENCE_NAMES].sort(), 'every sequence of the art is in the atlas');
    const packs = s.art!.packList.filter((p) => p.category === 'vfx');
    assert.deepEqual(packs.map((p) => [p.id, p.load, p.status, p.read, p.held]), [['vfx-shapes', 'boot', 'provisional', true, true], ['vfx-flipbooks', 'boot', 'provisional', true, true]], 'the two packs of light boot with the game and are held for as long as it runs');
    assert.equal(s.art!.failures, 0, 'nothing failed to load');
    assert.equal(s.vfx!.unplayed, 0);

    // ---- a blow that lands plays the sequences (nothing is left unplayed) and the hero's slash is the art's cut
    await hooks('game.debug.set("godMode", true)');
    await sess('const e = s.entities.find((x) => x.kind === "enemy"); const p = s.player.body; if (e) { e.body.x = p.x + 1.5; e.body.vx = 0; }');
    await ctx.step(1);
    const spawned0 = (await state()).vfx!.spawned;
    await ctx.page.keyboard.down('KeyJ');
    await ctx.step(1);
    await ctx.page.keyboard.up('KeyJ');
    for (let i = 0; i < 16 && (await state()).combat!.phase !== 'active'; i++) await ctx.step(1);
    s = await state();
    assert.ok(s.vfx!.spawned - spawned0 >= 5, `the cut, the sparks, the flash, the ring and the flare of the blow started (${s.vfx!.spawned - spawned0})`);
    assert.equal(s.vfx!.unplayed, 0, 'every sequence the blow asks for is the art\'s');
    assert.ok(s.vfx!.sprites >= 4, `the painted cut and burst are on screen (${s.vfx!.sprites} sprite effects)`);
    await hooks('advanceEffects(0.05)');
    await ctx.shot('01-the-blow');
    await hooks('advanceEffects(3)');
    s = await state();
    assert.equal(s.vfx!.sprites, 0, 'and all of it went back to its pool');

    // ---- the place that awakens: its light stands BEHIND the hero (the layer behind the actors), and goes
    await sess('const p = s.player.body; s.bus.emit("checkpoint:set", { room: "r1_gate", entry: "start", x: p.x, y: p.y });');
    s = await state();
    assert.ok(s.scene!['fxBack']! > 0, 'a layer behind the actors exists and holds the pillar and the rune');
    assert.ok(s.vfx!.sprites >= 4, `the pillar, the flame, the rune and the ring (${s.vfx!.sprites})`);
    await hooks('advanceEffects(0.4)');
    await ctx.shot('02-the-place-awakens');
    await hooks('advanceEffects(3)');
    assert.equal((await state()).vfx!.sprites, 0);

    // ---- a power gained: a rune behind the hero, a pillar, a ring (the event names no place: it is the hero's)
    await sess('s.bus.emit("ability:unlocked", { id: "air_dash" });');
    s = await state();
    assert.ok(s.vfx!.sprites >= 4 && s.vfx!.particles >= 8, `the rune, the pillar, the ring, the flash and the motes (${s.vfx!.sprites} + ${s.vfx!.particles})`);
    await hooks('advanceEffects(0.5)');
    await ctx.shot('03-a-power-gained');
    await hooks('advanceEffects(3)');
    assert.equal((await state()).vfx!.sprites, 0);

    // ---- the Spirit Bolt: the light gathers in the hand, the bolt in flight is the art's, and it lands in light
    await sess('s.loadout.acquire("card_spirit_bolt"); s.magic.restore();');
    await hooks('advanceEffects(3)'); // (gaining the card is a moment of its own)
    await ctx.step(40); // (the blow is over)
    await sess('const e = s.entities.find((x) => x.kind === "enemy"); const p = s.player.body; if (e) { e.body.x = p.x + 6; e.body.vx = 0; }');
    await ctx.step(1);
    await ctx.page.keyboard.down('KeyK');
    await ctx.step(1);
    await ctx.page.keyboard.up('KeyK');
    for (let i = 0; i < 12 && (await state()).state !== 'cast'; i++) await ctx.step(1);
    s = await state();
    assert.equal(s.state, 'cast', 'the hero is casting');
    assert.ok(s.vfx!.sprites >= 2 && s.vfx!.particles >= 4, `the ring closes and the motes fly in as the power gathers (${s.vfx!.sprites} + ${s.vfx!.particles})`);
    await hooks('advanceEffects(0.05)');
    await ctx.shot('04-the-power-gathers');
    for (let i = 0; i < 12 && (await state()).projectiles!.length === 0; i++) await ctx.step(1);
    s = await state();
    assert.equal(s.projectiles!.length, 1, 'the bolt left the hand');
    assert.equal(s.looks!.bolt, true, 'and what flies is the art\'s bolt');
    await ctx.step(4);
    await hooks('advanceEffects(0.1)');
    await ctx.shot('05-the-bolt-in-flight');
    for (let i = 0; i < 30 && (await state()).projectiles!.length > 0; i++) await ctx.step(2);
    s = await state();
    assert.equal(s.vfx!.unplayed, 0, 'the bolt landed in the art\'s light');
    await hooks('advanceEffects(0.1)');
    await ctx.shot('06-the-bolt-lands');
    await hooks('advanceEffects(3)');

    // ================================================================================================ the hero's own light
    await sess('s.magic.restore();');
    await hooks('resume()');
    await ctx.page.waitForTimeout(3200);
    s = await state();
    assert.ok(s.vfx!.particles >= 1 && s.vfx!.particles <= AMBIENT_CONTRACT.maxAlive, `the hero carries a few motes of light while their magic is full (${s.vfx!.particles})`);
    await ctx.shot('07-the-hero-carries-light');
    await sess('s.magic.spend(s.magic.current);');
    await ctx.page.waitForTimeout(3300); // (the last mote lives two seconds, and the magic comes back slowly)
    await hooks('pause()');
    s = await state();
    assert.equal(s.vfx!.sprites, 0);
    assert.ok(s.vfx!.particles <= 2, `with the magic spent the light goes out (${s.vfx!.particles} left)`);

    // ================================================================================================ the effects are rebuilt (a quality change) and still draw with the art's light
    await sess('s.magic.restore();');
    await ctx.page.locator('[data-testid="pause-button"]').click();
    await ctx.page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 20000 });
    await ctx.page.locator('[data-testid="pause-settings"]').click();
    await ctx.page.waitForSelector('[data-testid="settings-screen"][data-open="1"]', { timeout: 20000 });
    await ctx.page.locator('[data-testid="settings-quality-low"]').click();
    s = await until(ctx, 'the effects to be built again', (x) => x.quality?.tier === 'low' && x.vfxLook !== null);
    assert.equal(s.vfxLook!.origin, 'art', 'the art\'s light survives a rebuild of the effects');
    assert.equal(s.quality!.particleBudget, 150);
    assert.ok((s.drawsMax ?? 0) <= 60, `draw calls ${s.drawsMax}`);

    // ================================================================================================ the game's own shapes (`?vfx=procedural`): every moment is whole without the sequences
    await ctx.open('room=r1_gate&unlock=dash&paused=1&vfx=procedural', SIZE);
    s = await until(ctx, 'the art to start', (x) => x.art?.state === 'ready' && (x.art?.packList.filter((p) => p.category === 'vfx' && p.held).length ?? 0) === 2);
    await ctx.page.waitForTimeout(300);
    s = await state();
    assert.deepEqual(s.vfxLook, { origin: 'procedural', sequences: [] }, 'the effects keep the shapes the game draws itself');
    await hooks('game.debug.set("godMode", true)');
    await sess('const e = s.entities.find((x) => x.kind === "enemy"); const p = s.player.body; if (e) { e.body.x = p.x + 1.5; e.body.vx = 0; }');
    await ctx.step(1);
    const before = (await state()).vfx!.spawned;
    await ctx.page.keyboard.down('KeyJ');
    await ctx.step(1);
    await ctx.page.keyboard.up('KeyJ');
    for (let i = 0; i < 16 && (await state()).combat!.phase !== 'active'; i++) await ctx.step(1);
    s = await state();
    assert.ok(s.vfx!.spawned - before >= 4, `the blow still has its slash, its sparks and its flash (${s.vfx!.spawned - before})`);
    assert.ok(s.vfx!.unplayed >= 1, 'and the burst the art paints is not played');
    await hooks('advanceEffects(0.05)');
    await ctx.shot('08-the-game-draws-its-own');
    await sess('s.loadout.acquire("card_spirit_bolt"); s.magic.restore();');
    await hooks('advanceEffects(3)');
    await ctx.step(40);
    await sess('const e = s.entities.find((x) => x.kind === "enemy"); const p = s.player.body; if (e) { e.body.x = p.x + 6; e.body.vx = 0; }');
    await ctx.step(1);
    await ctx.page.keyboard.down('KeyK');
    await ctx.step(1);
    await ctx.page.keyboard.up('KeyK');
    for (let i = 0; i < 12 && (await state()).projectiles!.length === 0; i++) await ctx.step(1);
    s = await state();
    assert.equal(s.looks!.bolt, false, 'and the bolt is the one made of shapes');

    assert.ok(worst <= 60, `draw calls stay within the budget (worst ${worst})`);
    console.log(`  vfx-art: worst frame ${worst} draw calls`);
  },
};
