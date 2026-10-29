import assert from 'node:assert/strict';
import { seed } from '../bossKit';
import { frames } from '../frames';
import { countPixels, decodePng, isLavaLight } from '../png';
import type { GameState, Scenario } from '../scenario';

/**
 * LAVA in a real browser (docs/PROMPT23-LOG.md §6 and §7): the first pool of the Verge of Dusk — 12 m of it with two stones standing in it, at the east of the Gate of Dusk (`dv_gate`, x 26 … 38). It looks like what it is (the orange and yellow that nothing else in the
 * game has: counted on screen against the same room with the pool out of view), walking into it with the real keyboard costs a point of life, throws the hero up, shakes the camera and starts the i-frames — a hurt like any other —, and then LETS GO: the hero is put back
 * on the bank they came from, out of the lava and not burned a second time however long the key was held down. A running jump over each of the two stones crosses the pool and touches nothing. On the last point of life the lava kills and the defeat flow, not the let-go, brings the
 * hero back at the shrine of the Verge. The console stays clean (the runner fails the scenario otherwise).
 */
const SIZE = { width: 844, height: 390, dpr: 1 } as const;
const POOL = { x0: 26, x1: 38 };
/** A hero who has everything the first half gave, standing at the west door of the Gate of Dusk, with the shrine of the Verge as the place to come back to. */
const SAVE = {
  saveVersion: 1,
  at: { room: 'dv_gate', entry: 'west' },
  checkpoint: { room: 'dv_shrine', entry: 'rest' },
  flags: ['broken:r3_seal', 'defeated:r1_slime', 'defeated:r2_slime', 'defeated:r4_boss', 'defeated:rt_boss', 'defeated:mr_boss', 'defeated:mn_boss', 'defeated:sp_boss', 'defeated:fd_boss', 'defeated:ih_boss', 'taken:air_dash', 'taken:card_spirit_bolt'],
  abilities: ['air_dash', 'dash', 'double_jump', 'ground_slam', 'magic_attack', 'wall_jump'],
  cards: { owned: ['card_spirit_bolt'], equipped: 'card_spirit_bolt' },
  bottleSlots: 3,
};

export const lava: Scenario = {
  name: 'lava',
  async run(ctx) {
    await ctx.open('paused=1', SIZE);
    await seed(ctx, SAVE);
    await ctx.page.evaluate('window.__troid.pause()');
    const sess = (code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
    // (the creatures of the room are not the question here: the crawlers and the wisp are put away)
    await sess('for (const e of [...s.entities]) if (e.kind === "enemy") e.expired = true;');
    await sess(`window.__lv = []; for (const t of ['hazard:hit', 'player:hurt', 'player:died', 'death:respawned']) s.bus.on(t, (p) => window.__lv.push({ tick: s.now, type: t, p }));`);
    const log = (): Promise<Array<{ tick: number; type: string; p: Record<string, unknown> }>> => ctx.page.evaluate('window.__lv') as never;
    const count = async (type: string): Promise<number> => (await log()).filter((e) => e.type === type).length;
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };
    const dom = (id: string, attr: string): Promise<string | null> => ctx.page.locator(`[data-testid="${id}"]`).getAttribute(attr);
    const lavaOnScreen = async (): Promise<number> => {
      await ctx.page.waitForTimeout(100);
      return countPixels(decodePng(await ctx.page.screenshot()), isLavaLight);
    };

    // ================================================================================================ it looks like what it is
    let s = await state();
    assert.equal(s.room, 'dv_gate', 'the saved game starts at the Gate of Dusk');
    assert.equal(await sess('return s.hazards.count'), 3, 'the pool is three pieces of lava (either side of its two stones)');
    await ctx.teleport(66, 2); // the east end of the room, the pool far out of view
    await ctx.step(30);
    await frames(ctx.page, 40);
    const away = await lavaOnScreen();
    await ctx.teleport(23.5, 2);
    await ctx.step(30);
    await frames(ctx.page, 40);
    const near = await lavaOnScreen();
    assert.ok(near > 400, `the pool shows the colour of lava on screen (${near} px)`);
    assert.ok(near > 8 * Math.max(away, 1), `and the same room without the pool in view does not (${near} px against ${away} px)`);
    await ctx.shot('a-01-the-pool');

    // ================================================================================================ walking into it: a hurt like any other
    s = await state();
    const hp = s.health!;
    const shakes0 = s.shakes!.count;
    await ctx.page.keyboard.down('KeyD');
    for (let i = 0; i < 200 && (await count('hazard:hit')) === 0; i++) await ctx.step(1);
    await ctx.page.keyboard.up('KeyD');
    s = await state();
    assert.equal(await count('hazard:hit'), 1, 'the lava hit once');
    assert.equal(s.health, hp - 1, 'a point of life');
    const hit = (await log()).find((e) => e.type === 'hazard:hit')!.p as { roomId: string; hazardId: string; kind: string; damage: number; x: number };
    assert.equal(hit.roomId, 'dv_gate');
    assert.equal(hit.kind, 'lava');
    assert.equal(hit.damage, 1);
    assert.ok(hit.x > POOL.x0 - 0.5 && hit.x < POOL.x1 + 0.5, `where it landed (${hit.x})`);
    assert.equal(s.state, 'hurt', 'stunned');
    assert.equal(s.invulnerable, true, 'with the i-frames running');
    assert.equal(s.blink, true, 'and blinking');
    assert.ok(s.shakes!.count > shakes0, 'the camera shook');
    await ctx.step(2);
    await frames(ctx.page, 6);
    assert.equal(await dom('hud-life', 'aria-valuenow'), String(hp - 1), 'and the HUD shows it');
    await ctx.shot('a-02-burnt');

    // ================================================================================================ and then lets go: out of the lava, once
    for (let i = 0; i < 90 && ((await state()).y < 1.9 || (await state()).state === 'hurt'); i++) await ctx.step(1);
    s = await state();
    assert.ok(s.y >= 1.9, `put back out of the lava (y = ${s.y.toFixed(2)})`);
    assert.ok(s.x < POOL.x0 + 0.5, `on the bank they came from (x = ${s.x.toFixed(2)})`);
    await ctx.step(120);
    assert.equal(await count('hazard:hit'), 1, 'and not burned a second time');
    assert.equal((await state()).health, hp - 1);
    await ctx.shot('a-03-let-go');

    // ================================================================================================ the way across: a running jump to each stone and to the far bank
    await sess('s.player.health.restore();');
    await ctx.teleport(22, 2);
    await ctx.step(60);
    const before = await count('hazard:hit');
    await ctx.page.keyboard.down('KeyD');
    const edges = [POOL.x0 - 0.4, 30.6, 35.6]; // the last metre of the bank and of each stone: where a person jumps
    let jumps = 0;
    for (let i = 0; i < 500 && (await state()).x < 41; i++) {
      const st = await state();
      if (st.grounded && jumps < edges.length && st.x >= edges[jumps]!) {
        jumps++;
        await ctx.page.keyboard.down('Space');
        await ctx.step(20);
        await ctx.page.keyboard.up('Space');
      } else await ctx.step(1);
    }
    await ctx.page.keyboard.up('KeyD');
    s = await state();
    assert.equal(jumps, 3, 'three running jumps');
    assert.ok(s.x > 38.5, `it got across (x = ${s.x.toFixed(2)})`);
    assert.equal(await count('hazard:hit'), before, 'and touched nothing');
    assert.equal(s.health, s.maxHealth);
    await ctx.shot('a-04-across');

    // ================================================================================================ on the last point of life the lava kills: the defeat flow brings the hero back, not the let-go
    await sess('s.player.health.damage(s.player.health.current - 1);');
    await ctx.teleport(24, 2);
    await ctx.step(40);
    await ctx.page.keyboard.down('KeyD');
    for (let i = 0; i < 200 && (await count('player:died')) === 0; i++) await ctx.step(1);
    await ctx.page.keyboard.up('KeyD');
    assert.equal(await count('player:died'), 1, 'the lava killed the hero');
    assert.equal(await count('hazard:hit'), before + 1);
    s = await state();
    assert.notEqual(s.death?.phase, 'none', 'the defeat flow runs');
    for (let i = 0; i < 600 && (await state()).death?.phase !== 'none'; i++) await ctx.step(2);
    await ctx.step(10);
    s = await state();
    assert.equal(s.room, 'dv_shrine', 'back at the shrine of the Verge');
    assert.equal(s.health, s.maxHealth);
    assert.equal(await count('death:respawned'), 1);
    assert.equal(await count('hazard:hit'), before + 1, 'and nothing burned a hero who was down');
    await frames(ctx.page, 10);
    await ctx.shot('a-05-back-at-the-shrine');
    assert.equal(await sess('return s.scheduler.pending'), 0);

    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    console.log(`  lava: ${near} px of lava colour in view (${away} out of it), a touch costs 1 life with a hurt + shake + i-frames and then lets go (out of the pool, burned once), three running jumps cross it, the last point of life kills and the shrine brings the hero back · worst ${worst} draw calls (budget 60)`);
  },
};
