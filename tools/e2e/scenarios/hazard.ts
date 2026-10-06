import assert from 'node:assert/strict';
import { frames } from '../frames';
import { countPixels, decodePng, isVioletLight } from '../png';
import type { GameState, Scenario } from '../scenario';

/**
 * HAZARDS in a real browser (docs/PROMPT6-LOG.md S25): the strip of spikes on the floor of R2's ditch (x 39.5 … 42). It looks like what
 * it is (violet-tipped thorns), walking into it with the real keyboard costs a point of life, throws the hero up and out, shakes the
 * camera and starts the i-frames; a second touch during them does nothing and one after them hurts again; on the last point of life
 * they kill, and the hero comes back at the shrine; and a running jump over them touches nothing. The console stays clean (the runner
 * fails the scenario otherwise).
 */
export const hazard: Scenario = {
  name: 'hazard',
  async run(ctx) {
    await ctx.open('', { width: 844, height: 390, dpr: 1 });
    const sess = (code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
    await sess(`window.__hz = []; for (const t of ['hazard:hit', 'player:hurt', 'player:died', 'death:respawned']) s.bus.on(t, (p) => window.__hz.push({ tick: s.now, type: t, p }));`);
    const log = (): Promise<Array<{ tick: number; type: string; p: Record<string, unknown> }>> => ctx.page.evaluate('window.__hz') as never;
    const count = async (type: string): Promise<number> => (await log()).filter((e) => e.type === type).length;
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };
    const dom = (id: string, attr: string): Promise<string | null> => ctx.page.locator(`[data-testid="${id}"]`).getAttribute(attr);
    const violetOnScreen = async (): Promise<number> => {
      await ctx.page.waitForTimeout(100);
      return countPixels(decodePng(await ctx.page.screenshot()), isVioletLight);
    };

    // ================================================================================================ to the ditch of R2
    await ctx.step(20);
    await sess('s.flags.set("defeated:r1_slime"); s.flags.set("defeated:r2_slime");');
    await ctx.step(2);
    await ctx.teleport(110, 0);
    await ctx.step(40);
    let s = await state();
    assert.equal(s.room, 'r2_hall');
    assert.equal(await sess('return s.hazards.count'), 1, 'the room has its strip of spikes');
    // the shrine first: the checkpoint a defeat will use
    await ctx.teleport(11.2, 0);
    await ctx.step(8);
    await ctx.page.keyboard.down('KeyE');
    await ctx.step(1);
    await ctx.page.keyboard.up('KeyE');
    await ctx.step(14);
    assert.deepEqual((await state()).respawnPoint, { room: 'r2_hall', entry: 'rest' });

    // ================================================================================================ it looks like what it is
    await ctx.teleport(36, -3.2);
    await ctx.step(30);
    await frames(ctx.page, 40);
    const violet = await violetOnScreen();
    assert.ok(violet > 25, `the thorns show their violet tips on screen (${violet} px)`);
    await ctx.shot('a-01-the-spikes');

    // ================================================================================================ walking into them: damage, knockback, shake, i-frames
    s = await state();
    const hp = s.health!;
    const shakes0 = s.shakes!.count;
    await ctx.page.keyboard.down('KeyD');
    for (let i = 0; i < 120 && (await state()).health === hp; i++) await ctx.step(1);
    await ctx.page.keyboard.up('KeyD');
    s = await state();
    assert.equal(s.health, hp - 1, 'a point of life');
    assert.equal(await count('hazard:hit'), 1);
    const hit = (await log()).find((e) => e.type === 'hazard:hit')!.p as { roomId: string; hazardId: string; damage: number; x: number };
    assert.equal(hit.roomId, 'r2_hall');
    assert.equal(hit.hazardId, 'spikes_ditch');
    assert.equal(hit.damage, 1);
    assert.ok(hit.x > 39 && hit.x < 42.5, `where it landed (${hit.x})`);
    assert.equal(s.state, 'hurt', 'stunned');
    assert.ok(s.vy > 3, `thrown up (vy = ${s.vy.toFixed(1)})`);
    assert.equal(s.invulnerable, true, 'with the i-frames running');
    assert.equal(s.blink, true, 'and blinking');
    assert.ok(s.shakes!.count > shakes0, 'the camera shook');
    await ctx.step(2);
    await frames(ctx.page, 6);
    assert.equal(await dom('hud-life', 'aria-valuenow'), String(hp - 1), 'and the HUD shows it');
    await ctx.shot('a-02-hit');

    // the i-frames: kept inside the zone for 58 ticks, nothing more happens; once they end, it hurts again
    const hold = async (n: number): Promise<void> => {
      for (let i = 0; i < n; i++) {
        await sess('const b = s.player.body; b.x = 40.7; b.y = -3.2; b.vx = 0; b.vy = 0;');
        await ctx.step(1);
      }
    };
    await hold(50);
    assert.equal(await count('hazard:hit'), 1, 'a second touch during the i-frames does nothing');
    assert.equal((await state()).health, hp - 1);
    await hold(40);
    assert.equal(await count('hazard:hit'), 2, 'the first touch after them hurts again');
    assert.equal((await state()).health, hp - 2);
    const hits = (await log()).filter((e) => e.type === 'hazard:hit');
    assert.ok(hits[1]!.tick - hits[0]!.tick >= 60, `the i-frames last 60 ticks (${hits[1]!.tick - hits[0]!.tick})`);

    // ================================================================================================ a running jump over them touches nothing
    await sess('s.player.health.restore();');
    await ctx.teleport(31, -3.2);
    await ctx.step(10);
    const before = await count('hazard:hit');
    await ctx.page.keyboard.down('KeyD');
    let jumped = false;
    for (let i = 0; i < 300 && (await state()).x < 47; i++) {
      if (!jumped && (await state()).x >= 37.6) {
        await ctx.page.keyboard.down('Space');
        jumped = true;
        await ctx.step(24);
        await ctx.page.keyboard.up('Space');
      } else await ctx.step(1);
    }
    await ctx.page.keyboard.up('KeyD');
    s = await state();
    assert.ok(jumped, 'it took off in the window');
    assert.ok(s.x > 46, `it got across (x = ${s.x})`);
    assert.equal(await count('hazard:hit'), before, 'a running jump over them touches nothing');
    assert.equal(s.health, s.maxHealth);
    await ctx.shot('a-03-over-the-spikes');

    // ================================================================================================ on the last point of life they kill: back at the shrine
    await sess('s.player.health.damage(s.player.health.current - 1);');
    await ctx.teleport(37, -3.2);
    await ctx.step(10);
    await ctx.page.keyboard.down('KeyD');
    for (let i = 0; i < 120 && (await state()).health! > 0 && (await count('player:died')) === 0; i++) await ctx.step(1);
    await ctx.page.keyboard.up('KeyD');
    assert.equal(await count('player:died'), 1, 'the spikes killed the hero');
    s = await state();
    assert.notEqual(s.death?.phase, 'none', 'the defeat flow runs');
    for (let i = 0; i < 400 && (await state()).death?.phase !== 'none'; i++) await ctx.step(2);
    await ctx.step(10);
    s = await state();
    assert.equal(s.room, 'r2_hall');
    assert.ok(Math.abs(s.x - 12.8) < 0.3, `back at the shrine (x = ${s.x})`);
    assert.equal(s.health, s.maxHealth);
    assert.equal(await count('death:respawned'), 1);
    assert.equal(await count('hazard:hit'), before + 1, 'and nothing hurt a hero who was down');
    await frames(ctx.page, 10);
    await ctx.shot('a-04-back-at-the-shrine');
    assert.equal(await sess('return s.scheduler.pending'), 0);

    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    console.log(`  hazard: spikes drawn (${violet} violet px), a touch costs 1 life with knockback + shake + i-frames, repeats after them, a running jump clears them, the last point of life kills · worst ${worst} draw calls (budget 60)`);
  },
};
