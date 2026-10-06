import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Scenario } from '../scenario';
import { frames } from '../frames';

/**
 * SOAK in the real browser (docs/PROMPT5-LOG.md S20): a few minutes of game time of RANDOM play through the real keyboard, an abstract
 * gamepad and the test hooks — keys down and up in any order, hits (some of them lethal), slimes and dummies dropped in, room reloads,
 * jumps next to every object, the card taken and put back, the bar set to arbitrary values — with the real renderer, VFX, HUD,
 * prompt and defeat overlay running. It proves what no unit test can: that the console stays clean (the runner fails on any
 * error), that the budgets hold at the worst moment (draw calls ≤ 60, live particles ≤ 400), that the numbers the HUD shows stay
 * inside their bars, and — comparing a calm room before and after — that nothing is left behind: not a Pixi object, not a view,
 * not a particle, and not a DOM node.
 */
const ROOMS = ['r1_gate', 'movement_test', 'crouch_test', 'interaction_test'];
const KEYS = ['KeyA', 'KeyD', 'KeyD', 'KeyS', 'Space', 'KeyJ', 'ShiftLeft', 'KeyK', 'KeyK', 'KeyL', 'KeyL', 'KeyE', 'KeyE'];
const ROUNDS = 1600;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const dom = (page: Page): Promise<number> => page.evaluate('document.querySelectorAll("*").length') as Promise<number>;
const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);

export const soak: Scenario = {
  name: 'soak',
  async run(ctx) {
    const rnd = lcg(20261006);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;

    // ================================================================== the calm room, as it is when freshly built (with the card, so the HUD is in the state the chaos leaves it in)
    await ctx.open('room=movement_test&unlock=dash', { width: 844, height: 390 });
    const { page } = ctx;
    await sess(page, 's.loadout.acquire("card_spirit_bolt");');
    await ctx.step(60);
    await frames(page, 30);
    const base = await ctx.state();
    const baseDom = await dom(page);
    assert.equal(base.views, 0, 'the calm room has no entity views');
    assert.ok(Object.values(base.scene!).every((n) => n >= 0));

    // ================================================================== the chaos
    const down = new Set<string>();
    const seen = { rounds: 0, loads: 0, strikes: 0, worstDraws: 0, worstParticles: 0 };
    // what happened, counted by the game's own events (looking at the state every few rounds would miss most of it)
    await sess(
      page,
      `const c = (window.__soak = { casts: 0, denied: 0, drinks: 0, drinksRefused: 0, interactions: 0, deaths: 0, hurt: 0 });
       s.bus.on('skill:cast', () => c.casts++); s.bus.on('skill:denied', () => c.denied++);
       s.bus.on('bottle:drunk', () => c.drinks++); s.bus.on('bottle:denied', () => c.drinksRefused++);
       s.bus.on('interaction:performed', () => c.interactions++); s.bus.on('player:died', () => c.deaths++); s.bus.on('player:hurt', () => c.hurt++);`,
    );
    for (let round = 0; round < ROUNDS; round++) {
      // ---- the hands
      if (rnd() < 0.5) {
        const k = pick(KEYS);
        if (down.has(k)) {
          await page.keyboard.up(k);
          down.delete(k);
        } else {
          await page.keyboard.down(k);
          down.add(k);
        }
      }
      if (rnd() < 0.04) await page.evaluate(`window.__troid.pad.set(${pick([0, 0.3, 1, -1])}, ${pick([0, 0, 0.5])}, ${JSON.stringify(rnd() < 0.5 ? [] : [pick([0, 1, 2, 3, 4, 6])])})`);
      // ---- the world
      const w = rnd();
      if (w < 0.03) {
        await page.evaluate('window.__troid.strikePlayer(1)');
        seen.strikes++;
      } else if (w < 0.034) {
        await sess(page, 's.player.health.damage(s.player.health.current - 1);'); // the last point…
        await page.evaluate('window.__troid.strikePlayer(1)'); // …and the blow
        seen.strikes++;
      } else if (w < 0.044) {
        await page.evaluate(`window.__troid.spawnSlime(window.__troid.state().x + ${pick([-7, -5, 5, 7])}, 0, ${pick([-1, 1])})`);
      } else if (w < 0.054) {
        await page.evaluate(`window.__troid.spawnDummy(window.__troid.state().x + ${pick([-3, 3, 5])}, 0, 4)`);
      } else if (w < 0.064) {
        await sess(page, `s.loadRoom(${JSON.stringify(pick(ROOMS))});`);
        seen.loads++;
      } else if (w < 0.1) {
        // next to something that can be interacted with
        await sess(
          page,
          `if (!s.player.health.dead) { const t = s.room.interactables || []; if (t.length) { const o = t[Math.floor(${rnd()} * t.length)]; window.__troid.teleport(o.x + ${(rnd() - 0.5) * 2}, o.y); } }`,
        );
      } else if (w < 0.11) {
        await sess(page, rnd() < 0.25 ? 's.loadout.equip(null);' : 's.loadout.acquire("card_spirit_bolt"); s.loadout.equip("card_spirit_bolt");');
      } else if (w < 0.12) {
        await sess(page, `s.magic.set(${Math.round(rnd() * 140 - 20)});`);
      }
      await ctx.step(1 + Math.floor(rnd() * 8));

      // ---- every few rounds: let the page draw some real frames and look at the numbers
      if (round % 20 === 19) {
        await page.waitForTimeout(40);
        const s = await ctx.state();
        seen.rounds++;
        seen.worstDraws = Math.max(seen.worstDraws, s.drawsMax ?? 0);
        seen.worstParticles = Math.max(seen.worstParticles, s.vfx?.particles ?? 0);
        assert.ok(s.health! >= 0 && s.health! <= s.maxHealth!, `life ${s.health} is inside its bar (round ${round})`);
        assert.ok(s.magic! >= 0 && s.magic! <= 100, `magic ${s.magic} is inside its bar (round ${round})`);
        assert.ok(s.bottles!.length >= 3 && s.bottles!.length <= 4 && s.bottles!.every((b) => ['ready', 'empty', 'recharging'].includes(b)), `bottles ${s.bottles} (round ${round})`);
        assert.ok(s.bottles!.filter((b) => b === 'recharging').length <= 1, `one bottle recharging at a time (${s.bottles})`);
        assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y), `the hero is a number (round ${round})`);
        assert.ok((s.vfx?.particles ?? 0) <= 400, `${s.vfx?.particles} live particles (round ${round})`);
        assert.ok((s.drawsMax ?? 0) <= 60, `${s.drawsMax} draw calls (round ${round})`);
      }
    }
    for (const k of down) await page.keyboard.up(k);
    await page.evaluate('window.__troid.pad.remove()');
    await ctx.step(5);

    // ================================================================== it really was chaos
    const did = (await page.evaluate('window.__soak')) as { casts: number; denied: number; drinks: number; drinksRefused: number; interactions: number; deaths: number; hurt: number };
    assert.ok(seen.strikes > 20 && seen.loads > 5, `hits and room loads happened (${JSON.stringify(seen)})`);
    assert.ok(did.casts >= 4 && did.denied >= 1 && did.drinks >= 2 && did.interactions >= 2 && did.deaths >= 3 && did.hurt >= 20, `the chaos exercised every system (${JSON.stringify(did)})`);
    assert.ok(seen.worstDraws > 0, 'draw calls were measured');
    await ctx.shot('01-after-chaos');

    // ================================================================== and nothing is left behind
    await sess(page, 's.loadRoom("movement_test"); s.loadout.acquire("card_spirit_bolt"); s.loadout.equip("card_spirit_bolt"); s.player.health.restore(); s.magic.restore();');
    await ctx.step(60);
    await page.waitForTimeout(2500); // the effects of the page live in real time: let them all end
    await frames(page, 30);
    const end = await ctx.state();
    // (the effect layers hold the POOLED objects too — idle and invisible, reused by the next effect — so they are bounded by the pools, not equal)
    const { fxNormal: fxN, fxWorld: fxW, ...rest } = end.scene!;
    const { fxNormal: _n, fxWorld: _w, ...baseRest } = base.scene!;
    assert.deepEqual(rest, baseRest, 'the same room has the same number of objects in every layer of the scene as before the chaos');
    assert.ok(fxN! + fxW! <= (end.vfx?.poolCreated ?? 0) + 8, `the effect layers hold only pooled objects (${fxN} + ${fxW} for ${end.vfx?.poolCreated} created)`);
    assert.equal(end.views, 0, 'no entity view was left behind');
    assert.equal(end.vfx?.particles, 0, 'no particle is still alive');
    assert.equal(end.vfx?.sprites, 0, 'no effect sprite is still alive');
    const endDom = await dom(page);
    assert.ok(Math.abs(endDom - baseDom) <= 12, `the DOM did not grow (${baseDom} → ${endDom} nodes)`);
    assert.ok((end.vfx?.poolCreated ?? 0) < 1200, `the pools stayed bounded (${end.vfx?.poolCreated} objects created)`);
    console.log(
      `  soak: ${ROUNDS} rounds of random play · ${did.hurt} hits, ${did.deaths} defeats, ${seen.loads} room loads, ${did.casts} bolts (${did.denied} refused), ${did.drinks} drinks (${did.drinksRefused} refused), ${did.interactions} interactions · ` +
        `worst ${seen.worstDraws} draw calls and ${seen.worstParticles} particles · DOM ${baseDom} → ${endDom} nodes · pools ${end.vfx?.poolCreated}`,
    );
  },
};
