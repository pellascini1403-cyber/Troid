import assert from 'node:assert/strict';
import { ROOMS } from '@/content';
import { frames } from '../frames';
import { countPixels, decodePng } from '../png';
import type { GameState, Scenario } from '../scenario';

/**
 * ROOM TRANSITIONS in a real browser (docs/PROMPT6-LOG.md S23): touching an exit that leads somewhere fades the screen out, builds the
 * next room and puts the hero at the entry the exit names (position AND facing), fades back in, and gives the control back — with the
 * REAL keyboard held down the whole time to prove nothing gets through, the console clean and nothing left behind in the scene.
 *
 *   A · R1 → R2 with the keys of an attack, a jump and a dash held: the overlay goes black, nothing the hero "did" is seen, and the
 *       first frame in R2 is a black one
 *   B · the walk forward and back through all four rooms: every arrival at the entry its exit names, facing into the room, with the
 *       camera inside the room
 *   C · nothing is left behind: the scene graph of a room entered through a transition is the one of the same room loaded directly
 *   D · one transition at a time, and a defeat in the middle of one: no swap under a hero who is down, the defeat flow brings them
 *       back where they entered the room
 */
const overlay = (ctx: Parameters<Scenario['run']>[0]): Promise<{ display: string; opacity: number }> =>
  ctx.page.locator('[data-testid="transition-overlay"]').evaluate((e) => ({ display: getComputedStyle(e).display, opacity: Number(getComputedStyle(e).opacity) }));
const facing = (ctx: Parameters<Scenario['run']>[0]): Promise<number> => ctx.page.evaluate('window.__troid.session.player.facing') as Promise<number>;

export const transition: Scenario = {
  name: 'transition',
  async run(ctx) {
    await ctx.open('', { width: 844, height: 390, dpr: 1 });
    const sess = (code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
    await sess(
      `window.__ev = [];
       for (const t of ['exit:reached', 'transition:started', 'transition:fadeOut', 'transition:fadeIn', 'transition:finished', 'transition:cancelled', 'room:exiting', 'room:loaded', 'room:entered', 'player:attacked', 'player:jumped', 'player:dashed', 'skill:cast', 'death:started', 'death:respawned'])
         s.bus.on(t, (p) => window.__ev.push({ tick: s.now, type: t, p }));`,
    );
    const events = (): Promise<Array<{ tick: number; type: string; p: Record<string, unknown> }>> => ctx.page.evaluate('window.__ev') as never;
    const count = async (type: string): Promise<number> => (await events()).filter((e) => e.type === type).length;
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };
    const inRoom = (s: GameState): boolean => {
      const b = ROOMS[s.room!]!.bounds;
      const half = (s.view?.visibleWidth ?? 0) / 2;
      return half > 0 && s.camera!.x - half >= b.x0 - 0.6 && s.camera!.x + half <= b.x1 + 0.6;
    };

    await ctx.step(20);
    let s = await state();
    assert.equal(s.room, 'r1_gate');
    assert.equal(s.transition?.phase, 'none');
    assert.equal((await overlay(ctx)).display, 'none', 'no transition: nothing is drawn over the game');

    // ================================================================================================ A · R1 → R2, hands on the keys
    await sess('s.flags.set("defeated:r1_slime")'); // the guardian is down: the door opens and so does the way out
    await ctx.step(2);
    await ctx.teleport(110, 0);
    await ctx.step(1);
    s = await state();
    assert.equal(s.transition?.phase, 'fadeOut', 'the exit started the transition');
    assert.deepEqual(s.exits, ['east']);
    assert.equal(s.room, 'r1_gate', 'the old room is still the room while it fades');
    assert.equal((await overlay(ctx)).display, 'block', 'the overlay is up');
    // hands on the keys from now on: run, attack, jump, dash
    await ctx.page.keyboard.down('KeyD');
    await ctx.page.keyboard.down('KeyJ');
    await ctx.page.keyboard.down('Space');
    await ctx.page.keyboard.down('ShiftLeft');
    await ctx.step(4);
    s = await state();
    const mid = await overlay(ctx);
    assert.ok(mid.opacity > 0.05 && mid.opacity < 0.95, `half way to black (${mid.opacity})`);
    assert.ok(Math.abs(s.x - 110) < 0.6 && Math.abs(s.vx) < 1 && s.grounded, `the hero stands where they were: the keys do not walk, jump or dash them (x = ${s.x}, vx = ${s.vx})`);
    await ctx.shot('a-01-fading-out');
    await ctx.step(7); // the swap: the fade out's timer is due 11 ticks after the tick that saw the exit (5 ticks in so far, plus these 7: the 12th tick)
    s = await state();
    assert.equal(s.room, 'r2_hall', 'R2 is built');
    assert.equal(s.transition?.phase, 'hold', 'in the black');
    assert.ok(Math.abs(s.x - 4) < 0.05 && Math.abs(s.y) < 0.1, `at R2's west entry (${s.x}, ${s.y})`);
    assert.equal(await facing(ctx), 1, 'facing into the room');
    const black = await overlay(ctx);
    assert.equal(black.opacity, 1);
    await ctx.page.waitForTimeout(80);
    const shot = decodePng(await ctx.page.screenshot());
    const dark = countPixels(shot, (r, g, b) => r < 12 && g < 12 && b < 12);
    assert.ok(dark > shot.width * shot.height * 0.98, `the screen is black while the room changes (${((100 * dark) / (shot.width * shot.height)).toFixed(1)} % black)`);
    await ctx.shot('a-02-black');
    await ctx.step(10); // the rest of the black and a good part of the fade in
    s = await state();
    assert.equal(s.transition?.phase, 'fadeIn');
    const back = await overlay(ctx);
    assert.ok(back.opacity > 0 && back.opacity < 1, `the picture is coming back (${back.opacity})`);
    await ctx.shot('a-03-fading-in');
    await ctx.step(12);
    s = await state();
    assert.equal(s.transition?.phase, 'none', 'over');
    assert.equal((await overlay(ctx)).display, 'none');
    await ctx.page.keyboard.up('KeyJ');
    await ctx.page.keyboard.up('Space');
    await ctx.page.keyboard.up('ShiftLeft');
    await ctx.page.keyboard.up('KeyD');
    const started = (await events()).find((e) => e.type === 'transition:started')!;
    const finished = (await events()).find((e) => e.type === 'transition:finished')!;
    const during = (await events()).filter((e) => ['player:attacked', 'player:jumped', 'player:dashed', 'skill:cast'].includes(e.type) && e.tick >= started.tick && e.tick <= finished.tick);
    assert.deepEqual(during, [], 'with the attack, jump and dash keys down the whole time, the hero did nothing during the transition');
    assert.equal(await count('transition:started'), 1);
    assert.equal(await count('room:entered'), 1);
    assert.equal(finished.tick - started.tick, 31, 'a transition lasts 32 simulated ticks, counting the one that saw the exit');

    // ================================================================================================ B · every connection, forward and back
    const arrive = async (via: string, room: string, x: number, face: 1 | -1): Promise<void> => {
      await ctx.step(40);
      await frames(ctx.page, 20); // the camera follows in real time: let it catch up with the room it was cut to
      const st = await state();
      assert.equal(st.room, room, `${via} leads to ${room}`);
      assert.ok(Math.abs(st.x - x) < 0.1, `${via}: at the entry (x = ${st.x}, want ${x})`);
      assert.equal(await facing(ctx), face, `${via}: facing ${face > 0 ? 'right' : 'left'}`);
      assert.equal(st.transition?.phase, 'none');
      assert.deepEqual(st.exits, [], `${via}: arriving touches no exit`);
      assert.ok(inRoom(st), `${via}: the camera shows nothing beyond the room`);
      await ctx.shot(`b-${room}-${face > 0 ? 'from-the-west' : 'from-the-east'}`);
    };
    // forward: R2 → R3 → R4 (the east zones)
    await ctx.teleport(89.5, 0);
    await arrive('R2 east', 'r3_chamber', 4, 1);
    // R3's way on is held by the seal (S28): the zone does nothing until it is broken — here its flag is set, the breaking itself is `progression`'s
    await ctx.teleport(77.5, 0);
    await ctx.step(40);
    s = await state();
    assert.equal(s.room, 'r3_chamber', 'with the seal whole the zone of R3 east does nothing');
    assert.deepEqual(s.exits, []);
    assert.equal(s.transition?.phase, 'none');
    await sess('s.flags.set("broken:r3_seal")');
    await ctx.teleport(70, 0);
    await ctx.step(2);
    await ctx.teleport(77.5, 0);
    await arrive('R3 east', 'r4_sanctum', 4, 1);
    // and back: the west zones
    await ctx.teleport(1.2, 0);
    await arrive('R4 west', 'r3_chamber', 72.5, -1);
    await ctx.teleport(1.2, 0);
    await arrive('R3 west', 'r2_hall', 84.5, -1);
    await ctx.teleport(1.2, 0);
    await arrive('R2 west', 'r1_gate', 106.6, -1);
    assert.equal(await count('transition:started'), 6);
    assert.equal(await count('transition:finished'), 6);
    assert.equal(await count('transition:cancelled'), 0);
    const entered = (await events()).filter((e) => e.type === 'room:entered').map((e) => `${e.p['roomId']}:${e.p['entryId']}`);
    assert.deepEqual(entered, ['r2_hall:west', 'r3_chamber:west', 'r4_sanctum:west', 'r3_chamber:east', 'r2_hall:east', 'r1_gate:east']);
    s = await state();
    assert.equal(s.gates?.exit_door?.open, true, 'R1\'s door is still open: the guardian stays beaten');
    assert.deepEqual(s.respawnPoint, { room: 'r1_gate', entry: 'start' }, 'a transition does not move the checkpoint: the start of the world, until the hero rests somewhere');

    // ================================================================================================ C · nothing left behind
    const domBefore = (await ctx.page.evaluate('document.querySelectorAll("*").length')) as number;
    const sceneThrough = (await state()).scene!;
    const viewsThrough = (await state()).views;
    await sess('s.loadRoom("r1_gate", "east")'); // the same room, loaded directly
    await ctx.step(3);
    await ctx.page.waitForTimeout(100);
    const direct = await state();
    const { fxNormal: _a, fxWorld: _b, ...throughRest } = sceneThrough;
    const { fxNormal: _c, fxWorld: _d, ...directRest } = direct.scene!;
    assert.deepEqual(throughRest, directRest, 'the scene graph of a room entered through a transition is the one of the same room loaded directly');
    assert.equal(viewsThrough, direct.views);
    assert.ok(Math.abs(((await ctx.page.evaluate('document.querySelectorAll("*").length')) as number) - domBefore) <= 4, 'and the DOM did not grow');
    // eight more round trips R1 ⇄ R2 leave the scene as it was
    for (let i = 0; i < 8; i++) {
      await ctx.teleport(110, 0);
      await ctx.step(40);
      await ctx.teleport(1.2, 0);
      await ctx.step(40);
    }
    await ctx.page.waitForTimeout(100);
    const after = await state();
    assert.equal(after.room, 'r1_gate');
    const { fxNormal: _e, fxWorld: _f, ...afterRest } = after.scene!;
    assert.deepEqual(afterRest, directRest, 'sixteen transitions later the scene has the same number of objects in every layer');
    assert.equal(after.views, direct.views);
    assert.equal(await sess('return s.scheduler.pending'), 0, 'no timer is left pending');

    // ================================================================================================ D · one at a time, and a defeat in the middle
    const started0 = await count('transition:started');
    await ctx.teleport(110, 0);
    await ctx.step(3);
    assert.equal((await state()).transition?.phase, 'fadeOut');
    assert.equal(await sess('return s.transition.begin("r1_gate", "east", { room: "r2_hall", entry: "west" })'), false, 'a second transition is refused while one runs');
    await ctx.step(40);
    assert.equal((await state()).room, 'r2_hall');
    // R2 has two ways out: touch the east one, and the west one in the middle of the fade
    await ctx.teleport(89.5, 0);
    await ctx.step(3);
    assert.equal((await state()).transition?.phase, 'fadeOut');
    await ctx.teleport(1.2, 0);
    await ctx.step(40);
    assert.equal(await count('transition:started'), started0 + 2, 'one transition for each pair of touches');
    s = await state();
    assert.equal(s.room, 'r3_chamber', 'the first exit won');
    assert.equal(await facing(ctx), 1);
    assert.equal(await count('transition:cancelled'), 0);

    // a defeat in the middle of the fade out
    await ctx.teleport(77.5, 0); // R3 → R4, and the hero goes down while it fades
    await ctx.step(4);
    assert.equal((await state()).transition?.phase, 'fadeOut');
    await sess('s.player.health.damage(s.player.health.current - 1);');
    await ctx.page.evaluate('window.__troid.strikePlayer(1)');
    await ctx.step(2);
    s = await state();
    assert.notEqual(s.death?.phase, 'none', 'the hero fell');
    assert.equal(s.transition?.phase, 'none', 'and the transition was called off');
    assert.equal(await count('transition:cancelled'), 1);
    assert.equal(((await events()).find((e) => e.type === 'transition:cancelled')!.p as { reason: string }).reason, 'death');
    for (let i = 0; i < 300 && (await state()).death?.phase !== 'none'; i++) await ctx.step(2);
    await ctx.step(10);
    s = await state();
    assert.equal(s.death?.phase, 'none');
    // (the last checkpoint is the one `loadRoom` put in section C: R1's east entry — a room placed by hand is where a defeat brings the hero back)
    assert.equal(s.room, 'r1_gate', 'no swap under a hero who was down: the defeat flow brought them back at the last checkpoint');
    assert.ok(Math.abs(s.x - 106.6) < 0.3, `at it (x = ${s.x})`);
    assert.equal(s.health, s.maxHealth, 'with full life');
    assert.equal(s.transition?.phase, 'none');
    assert.equal((await overlay(ctx)).display, 'none', 'no black screen is left over the game');
    assert.equal(await count('room:entered'), 6 + 16 + 2, 'and no room was entered after the defeat began');
    assert.equal(await sess('return s.scheduler.pending'), 0);
    // and the world still works afterwards
    await ctx.teleport(110, 0);
    await ctx.step(40);
    s = await state();
    assert.equal(s.room, 'r2_hall', 'the next transition goes through');
    await ctx.shot('d-after-the-defeat');
    const total = await count('transition:started');
    assert.equal(await count('transition:finished'), total - 1, 'every transition finished except the one the defeat called off');

    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    console.log(`  transition: ${total} transitions (one called off by a defeat); overlay black in the swap, hands off for the whole fade, scene leak-free · worst ${worst} draw calls (budget 60)`);
  },
};
