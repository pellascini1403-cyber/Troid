import assert from 'node:assert/strict';
import { INK_WARDEN } from '@/content/enemies';
import type { Guardian } from '@/enemies/Guardian';
import { fightTheWarden } from '../../../tests/helpers/fighter';
import { runTo } from '../../../tests/helpers/hops';
import {
  AIR_DASH_FLAG, AT_THE_SHRINE, FIGHT_FLAG, WARDEN_FLAG, bar, log, seed, shrineDriver, shut, stored, watch, wardenName,
} from '../bossKit';
import { frames } from '../frames';
import { record, replay } from '../replay';
import type { GameState, Scenario } from '../scenario';

/**
 * A DEFEAT AGAINST THE INK WARDEN in a real browser (docs/PROMPT6-LOG.md S29): the hero dies in the arena and comes back to the shrine of the
 * vestibule — with the Warden WHOLE and dormant again, the doors open, the bar and the camera free, ONE boss in the room and nothing left over in the
 * scene — and it can be fought again. The first defeat is natural: a fight that hurt the Warden to two thirds of its life and then a hero who stood
 * still, RECORDED in Node on the pure simulation and REPLAYED through the real keyboard, tick by tick, comparing digests (the death flow and the
 * respawn included). Then the same again (a second round through the hooks), and the other way round: a defeat AFTER the Warden has fallen leaves it
 * gone, and the reward — taken once, a flag — is neither duplicated nor lost.
 *
 * Without the reward the dash in the air is the one dash in the air (the hero in this scenario has not earned the Air Dash: `boss` shows the second).
 */
export const bossDeath: Scenario = {
  name: 'boss-death',
  async run(ctx) {
    const size = { width: 844, height: 390, dpr: 1 };
    const MAX = INK_WARDEN.health;
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };
    const sess = (code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
    const dom = (id: string, attr: string): Promise<string | null> => ctx.page.locator(`[data-testid="${id}"]`).getAttribute(attr);
    /** The hero goes down NOW (a hit at one point of life) and the whole defeat flow runs: back, in control, in whichever room the checkpoint is. */
    const fall = async (): Promise<GameState> => {
      await sess('s.player.health.damage(s.player.health.current - 1);');
      await ctx.page.evaluate('window.__troid.strikePlayer(1)');
      await ctx.step(2);
      let s = await state();
      assert.notEqual(s.death?.phase, 'none', 'the hero fell');
      for (let i = 0; i < 600 && s.death?.phase !== 'none'; i++) {
        await ctx.step(2);
        s = await state();
      }
      await ctx.step(10);
      s = await state();
      assert.equal(s.death?.phase, 'none', 'the defeat flow ended');
      await frames(ctx.page, 30); // the bar and the camera follow in real time
      return state();
    };
    const guardians = async (): Promise<number> => (await ctx.page.evaluate('window.__troid.session.entities.filter((e) => e.kind === "guardian").length')) as number;
    /** Everything the next load of the room must not change: what is in the scene, and what the page shows. */
    const LAYERS = ['terrain', 'actors', 'backdropFar', 'backdropMid', 'backdropNear', 'foreground', 'lightOverlay']; // (the effects' own layers hold pools that grow once and stay)
    const footprint = (s: GameState): string =>
      JSON.stringify({ views: s.views, scene: LAYERS.map((k) => s.scene?.[k]), boss: s.boss && [s.boss.state, s.boss.x, s.boss.facing, s.boss.hp] });

    // ================================================================================================ the first defeat, recorded in Node: a hurt Warden, then a hero who stands still
    const d = shrineDriver();
    const boss = (): Guardian | undefined => d.session.entities.find((e): e is Guardian => e.kind === 'guardian');
    const round1 = record(d, () => {
      runTo(d, 30);
      d.stop();
      fightTheWarden(d, { until: () => boss()!.health.current <= 24 });
      d.stop();
      d.release('jump');
      d.until(() => d.p.health.dead, 4000); // the Warden does the rest
      d.until(() => !d.session.death.active && d.session.death.phase === 'none', 2000);
      d.step(30);
    });
    assert.equal(boss()!.state, 'dormant', 'in the simulation the Warden is dormant again…');
    assert.equal(boss()!.health.current, MAX, '…and whole');
    console.log(`  recorded in Node: ${round1.total} ticks (${round1.runs.length} key changes) from the shrine, into the arena, to a defeat and back`);

    // ================================================================================================ the saved game at the shrine, paused at tick 0
    await ctx.open('paused=1', size);
    await seed(ctx);
    let s = await state();
    assert.equal(s.now, 0, 'not one tick has run: the replay starts from tick 0');
    assert.equal(s.room, 'r4_sanctum');
    assert.ok(s.boss && s.boss.state === 'dormant' && s.boss.hp === MAX);
    const lang = s.lang;
    const baseline = footprint(s);
    const startFlags = s.flags!.slice().sort();
    assert.deepEqual(startFlags, [...AT_THE_SHRINE.flags].sort());
    assert.equal(await guardians(), 1);
    await watch(ctx.page);

    const seen = { woke: false, hurt: false, down: false };
    await replay(ctx, round1, {
      chunk: 4,
      observe: async (st) => {
        worst = Math.max(worst, st.drawsMax ?? 0);
        const w = st.boss;
        if (!w) return;
        if (w.state !== 'dormant' && !seen.woke) {
          seen.woke = true;
          assert.deepEqual(shut(st), { w: true, e: true }, 'the doors shut behind the hero');
          await frames(ctx.page, 40);
          const bb = await bar(ctx.page);
          assert.equal(bb.display, 'block');
          assert.equal(bb.name, wardenName(lang));
          assert.equal(bb.value, 100);
        }
        if (w.hp <= 24 && !seen.hurt) {
          seen.hurt = true;
          await frames(ctx.page, 30);
          const bb = await bar(ctx.page);
          assert.ok(Math.abs((bb.value ?? -99) - (100 * w.hp) / MAX) <= 3, `the bar follows its life (${bb.value} % for ${w.hp}/${MAX})`);
          assert.ok(bb.value! < 100);
          await ctx.shot('a-01-hurt');
        }
        if (st.death && st.death.phase !== 'none' && !seen.down) {
          seen.down = true;
          assert.equal(w.state === 'dormant', false, 'the Warden is still in the room the moment the hero falls');
          assert.ok(st.flags!.includes(FIGHT_FLAG), 'and the fight is on');
          await ctx.shot('a-02-the-hero-falls');
        }
      },
    });
    assert.ok(seen.woke && seen.hurt && seen.down, 'the fight, the blows and the defeat were all seen');
    await frames(ctx.page, 40);
    s = await state();

    // ================================================================================================ back at the shrine: the Warden returns whole
    const events = await log(ctx.page);
    assert.equal(events.filter((e) => e === 'player died').length, 1, 'the hero fell once');
    assert.ok(events.includes('respawned'));
    assert.equal(s.room, 'r4_sanctum');
    assert.ok(Math.abs(s.x - 14.8) < 0.3, `back at the shrine (x = ${s.x.toFixed(2)})`);
    assert.equal(s.health, s.maxHealth, 'with all their life');
    assert.deepEqual(s.respawnPoint, { room: 'r4_sanctum', entry: 'rest' });
    assert.ok(s.boss, 'the Warden is in its room');
    assert.deepEqual([s.boss.state, s.boss.x, s.boss.facing, s.boss.hp, s.boss.attack, s.boss.marks.length], ['dormant', 58, -1, MAX, null, 0], 'dormant, at its place, whole, with no warning on the floor');
    assert.equal(await guardians(), 1, 'one Warden, not two');
    assert.deepEqual(shut(s), { w: false, e: false }, 'the doors are open');
    assert.ok(!s.flags!.includes(FIGHT_FLAG), 'the fight flag is gone');
    assert.ok(!s.flags!.includes(WARDEN_FLAG), 'and the Warden is not defeated');
    assert.deepEqual(s.flags!.slice().sort(), startFlags, 'nothing was won or lost');
    assert.equal((await bar(ctx.page)).display, 'none', 'the bar is gone');
    assert.equal(s.camera?.zone, null, 'the camera is free');
    assert.equal(footprint(s), baseline, 'the room is as it was: the same views, the same objects in every layer, the same Warden');
    assert.equal(await ctx.page.locator('[data-testid="death-overlay"]').evaluate((e) => getComputedStyle(e).display), 'none', 'no black screen is left');
    await ctx.shot('b-01-back-at-the-shrine');
    // nothing was taken, nothing was lost: the reward is not there to take, and the save says the same as before
    await ctx.teleport(84, 0);
    await ctx.step(6);
    await frames(ctx.page, 8);
    assert.equal(await dom('prompt-hit', 'data-active'), '0', 'the reward waits for the Warden to fall');
    await ctx.teleport(14.8, 0);
    await ctx.step(6);
    await ctx.page.waitForTimeout(150);
    let saved = await stored(ctx.page);
    assert.ok(saved && !saved.flags.some((f) => f.startsWith('~')), 'no volatile flag in the save');
    assert.deepEqual(saved!.flags.slice().sort(), startFlags, 'the save is as it was');
    assert.deepEqual([saved!.at, saved!.checkpoint], [AT_THE_SHRINE.at, AT_THE_SHRINE.checkpoint]);

    // ================================================================================================ without the reward, one dash in the air
    const dashes = (): Promise<number> => log(ctx.page).then((l) => l.filter((e) => e.startsWith('dash air')).length);
    const before = await dashes();
    await ctx.teleport(8, 16);
    await ctx.step(2);
    await ctx.page.keyboard.down('KeyD');
    for (let i = 0; i < 2; i++) {
      assert.equal((await state()).grounded, false, `in the air for dash ${i + 1}`);
      await ctx.page.keyboard.down('ShiftLeft');
      await ctx.step(1);
      await ctx.page.keyboard.up('ShiftLeft');
      await ctx.step(40);
    }
    await ctx.page.keyboard.up('KeyD');
    assert.equal((await dashes()) - before, 1, 'one dash in the air: the second press is refused');
    await ctx.teleport(14.8, 0);
    await ctx.step(60);

    // ================================================================================================ the same again, and again: the Warden is as whole the second time
    const walkIn = async (): Promise<GameState> => {
      await ctx.page.keyboard.down('KeyD');
      let t = await state();
      for (let i = 0; i < 80 && t.boss?.state === 'dormant'; i++) {
        await ctx.step(8);
        t = await state();
      }
      await ctx.page.keyboard.up('KeyD');
      assert.notEqual(t.boss?.state, 'dormant', 'it woke');
      return t;
    };
    for (const round of [2, 3]) {
      const t = await walkIn();
      assert.deepEqual(shut(t), { w: true, e: true }, `round ${round}: the doors shut again`);
      assert.equal(t.boss!.hp, MAX, `round ${round}: it begins whole`);
      assert.equal(t.boss!.state, 'intro');
      await frames(ctx.page, 40);
      assert.equal((await bar(ctx.page)).value, 100);
      await ctx.step(10);
      s = await fall();
      assert.equal(s.room, 'r4_sanctum');
      assert.ok(Math.abs(s.x - 14.8) < 0.3, `round ${round}: back at the shrine`);
      assert.equal(await guardians(), 1, `round ${round}: one Warden`);
      assert.deepEqual([s.boss!.state, s.boss!.hp], ['dormant', MAX], `round ${round}: dormant and whole`);
      assert.deepEqual(shut(s), { w: false, e: false });
      assert.equal((await bar(ctx.page)).display, 'none');
      assert.equal(footprint(s), baseline, `round ${round}: the room is as it was (no leak in a view or a layer)`);
    }
    const all = await log(ctx.page);
    assert.equal(all.filter((e) => e.startsWith('started')).length, 3, 'it woke three times, once per fight');
    assert.equal(all.filter((e) => e === 'player died').length, 3, 'and the hero fell in each');
    assert.equal(all.filter((e) => e === 'defeated').length, 0, 'it never fell');

    // ================================================================================================ a defeat AFTER the Warden fell: it stays gone, and the reward is one
    await sess(`s.flags.set(${JSON.stringify(WARDEN_FLAG)});`); // as a won fight leaves the world (the real fight is `boss`)
    s = await fall();
    assert.equal(s.boss, null, 'the Warden does not come back');
    assert.equal(await guardians(), 0);
    assert.deepEqual(shut(s), { w: false, e: false });
    assert.ok(s.flags!.includes(WARDEN_FLAG));
    assert.ok(s.views! < JSON.parse(baseline).views, 'its view is gone with it');
    assert.equal(s.camera?.zone, null);
    await ctx.teleport(40, 0);
    await ctx.page.evaluate('window.__troid.settleCamera(2)');
    await ctx.step(60);
    s = await state();
    assert.equal(s.boss, null, 'nothing wakes in the arena');
    assert.equal(s.camera?.zone, null, 'the camera is free in it');
    await ctx.teleport(84.4, 0);
    await ctx.step(6);
    await frames(ctx.page, 8);
    assert.equal(await dom('prompt-hit', 'data-active'), '1', 'the reward is there to take: once');
    assert.equal(await dom('prompt-hit', 'data-object'), 'reward_air_dash');
    await ctx.page.keyboard.down('KeyE');
    await ctx.step(1);
    await ctx.page.keyboard.up('KeyE');
    await ctx.step(20);
    s = await state();
    assert.ok(s.flags!.includes(AIR_DASH_FLAG), 'taken');
    assert.equal(await sess('return s.abilities.has("air_dash")'), true, 'the Air Dash is theirs');
    await frames(ctx.page, 8);
    assert.equal(await dom('prompt-hit', 'data-active'), '0', 'and gone from the pedestal');
    await ctx.page.waitForTimeout(150);
    saved = await stored(ctx.page);
    assert.ok(saved!.flags.includes(WARDEN_FLAG) && saved!.flags.includes(AIR_DASH_FLAG), 'both are in the save');
    assert.ok(saved!.abilities.includes('air_dash'));
    s = await fall(); // a defeat with the reward in hand
    assert.equal(s.boss, null, 'still gone');
    assert.ok(s.flags!.includes(AIR_DASH_FLAG), 'what was won stays won');
    assert.equal(await sess('return s.abilities.has("air_dash")'), true);
    await ctx.teleport(84.4, 0);
    await ctx.step(6);
    await frames(ctx.page, 8);
    assert.equal(await dom('prompt-hit', 'data-active'), '0', 'the reward is not duplicated');
    assert.equal(await sess('return s.entities.filter((e) => e.kind === "guardian").length'), 0);
    await ctx.shot('c-01-after-the-fall');
    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    console.log(`  boss-death: a defeat replayed bit for bit (${round1.total} ticks) · back at the shrine with the Warden whole, three times in a row · after the fall it stays gone and the reward is one · ${worst} draw calls at the worst moment (budget 60)`);
  },
};
