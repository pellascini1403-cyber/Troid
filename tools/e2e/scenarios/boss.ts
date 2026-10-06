import assert from 'node:assert/strict';
import { INK_WARDEN } from '@/content/enemies';
import { beatTheWarden } from '../../../tests/helpers/journey';
import { AIR_DASH_FLAG, AT_THE_SHRINE, FIGHT_FLAG, WARDEN_FLAG, bar, log, reload, seed, shrineDriver, shut, stored, watch, wardenName } from '../bossKit';
import { frames } from '../frames';
import { countPixels, decodePng, isVioletLight } from '../png';
import { record, replay } from '../replay';
import type { GameState, Scenario } from '../scenario';

/**
 * THE INK WARDEN in a real browser (docs/PROMPT6-LOG.md S29): a game saved at the shrine of R4, the walk into the arena, the whole fight with the
 * Warden, its fall, the reward and the way out. The fight is RECORDED in Node on the pure simulation by a scripted fighter that reads the boss the
 * way a person does (its telegraph on the floor — `tests/helpers/fighter.ts`) and REPLAYED through the browser's real keyboard, tick by tick,
 * comparing a digest of the whole simulation — the boss's state, place and life included — every 50 ticks: the browser plays the same fight as the
 * simulation, bit for bit.
 *
 * Along the way, what the player SEES is looked at, not only the numbers: the doors that shut behind the hero, the camera held to the arena, the
 * bar of the boss with its name in the language of the page and its life, the warnings on the floor in violet (their pixels, building as the strike
 * nears), the second phase, the fall — and after it the doors open, the camera free, the reward in its place (and taken with Interact, which gives a
 * second dash in the air), the way out of the world open, and everything SAVED: a reload leaves the Warden gone for good. The console stays clean
 * (the runner fails the scenario otherwise) and draw calls stay ≤ 60.
 */
export const boss: Scenario = {
  name: 'boss',
  async run(ctx) {
    const size = { width: 844, height: 390, dpr: 1 };
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };
    const look = async (name: string): Promise<Awaited<ReturnType<typeof decodePng>>> => {
      await frames(ctx.page, 3);
      const png = await ctx.page.screenshot({ path: `.shots/e2e/boss-${name}.png` });
      return decodePng(png);
    };
    /** Where the floor of a mark is on screen (CSS px = screenshot px at DPR 1): the strip it covers, up to the top of its column of ink. */
    const strip = async (m: { x: number; w: number }): Promise<{ x0: number; y0: number; x1: number; y1: number }> => {
      const [a, b] = (await ctx.page.evaluate(
        `[window.__troid.worldToScreen(${m.x - m.w / 2 - 0.4}, -0.3), window.__troid.worldToScreen(${m.x + m.w / 2 + 0.4}, 5.5)]`,
      )) as Array<{ x: number; y: number }>;
      // whole pixels: a fractional bound indexes between two pixels
      return { x0: Math.floor(Math.min(a!.x, b!.x)), x1: Math.ceil(Math.max(a!.x, b!.x)), y0: Math.floor(Math.min(a!.y, b!.y)), y1: Math.ceil(Math.max(a!.y, b!.y)) };
    };
    const MAX = INK_WARDEN.health;

    // ================================================================================================ the fight, recorded in Node
    const d = shrineDriver();
    const fight = record(d, () => beatTheWarden(d));
    assert.ok(d.session.flags.has(WARDEN_FLAG), 'in the simulation the route ends with the Warden fallen…');
    assert.ok(d.session.flags.has(AIR_DASH_FLAG) && d.session.abilities.has('air_dash'), '…and the Air Dash taken');
    assert.ok(fight.total > 2000, `a long fight (${fight.total} ticks)`);
    console.log(`  recorded in Node: ${fight.total} ticks (${fight.runs.length} key changes) from the shrine to the Air Dash`);

    // ================================================================================================ the saved game at the shrine, paused at tick 0
    await ctx.open('paused=1', size);
    await seed(ctx);
    let s = await state();
    assert.equal(s.room, 'r4_sanctum', 'the saved game opens in the sanctum');
    assert.equal(s.now, 0, 'not one tick has run: the replay starts from tick 0');
    assert.deepEqual(s.respawnPoint, { room: 'r4_sanctum', entry: 'rest' });
    assert.ok(s.boss, 'the Warden is in its room');
    assert.deepEqual([s.boss.def, s.boss.state, s.boss.x, s.boss.facing, s.boss.hp, s.boss.maxHp], ['ink_warden', 'dormant', 58, -1, MAX, MAX], 'waiting dormant, whole, facing the way the hero comes');
    assert.deepEqual(shut(s), { w: false, e: false }, 'both doors open');
    assert.ok(!s.flags!.includes(FIGHT_FLAG) && !s.flags!.includes(WARDEN_FLAG));
    assert.equal(s.camera?.zone, null, 'the camera is free in the vestibule');
    let b = await bar(ctx.page);
    assert.ok(b, 'the bar is in the page (its looks came with the first frames)');
    assert.equal(b.display, 'none', 'and hidden: no fight yet');
    assert.equal((await ctx.page.locator('[data-testid="boss-bar"]').count()), 1);
    await ctx.shot('a-01-the-vestibule');
    await watch(ctx.page);

    // ================================================================================================ the fight, through the real keyboard
    const seen = {
      woke: false,
      lastHp: MAX,
      hpRises: 0,
      minHp: MAX,
      attacks: new Set<string>(),
      enraged: false,
      dead: false,
      quiet: -1,
      marks: new Map<string, { v0: number; v1: number | null }>(),
      maxMarks: 0,
    };
    const lang = (await state()).lang;
    const name = wardenName(lang);
    await replay(ctx, fight, {
      chunk: 4,
      observe: async (st) => {
        worst = Math.max(worst, st.drawsMax ?? 0);
        const w = st.boss;
        if (!w) return;
        if (w.hp > seen.lastHp) seen.hpRises++;
        seen.lastHp = w.hp;
        seen.minHp = Math.min(seen.minHp, w.hp);
        seen.maxMarks = Math.max(seen.maxMarks, w.marks.length);

        // ---- it wakes: the doors shut, the camera holds the arena, the bar appears with its name ----
        if (w.state !== 'dormant' && !seen.woke) {
          seen.woke = true;
          assert.equal(w.state, 'intro', 'the first thing it does is wake');
          assert.ok(st.x > 27.4 && st.x < 30.5, `the hero is in the arena, past the door (x = ${st.x.toFixed(2)})`);
          assert.ok(st.flags!.includes(FIGHT_FLAG), 'the fight flag is up (volatile)');
          assert.deepEqual(shut(st), { w: true, e: true }, 'both doors shut behind the hero');
          await ctx.page.evaluate('window.__troid.settleCamera(3)');
          await frames(ctx.page, 40);
          const t = await state();
          assert.equal(t.camera!.zone, 'arena', 'the camera is held to the arena');
          assert.ok(t.camera!.limits!.x0 >= 24.99 && t.camera!.limits!.x1 <= 67.01, `held between the doors (${JSON.stringify(t.camera!.limits)})`);
          assert.ok(t.camera!.viewHeight > 14, `and pulled back (${t.camera!.viewHeight.toFixed(1)} m)`);
          const bb = await bar(ctx.page);
          assert.equal(bb.display, 'block', 'the bar is on screen');
          assert.ok(bb.opacity > 0.9, `fully faded in (${bb.opacity})`);
          assert.equal(bb.name, name, `it says who it is, in the language of the page (${lang})`);
          assert.equal(bb.value, 100, 'full');
          await look('a-02-the-doors-close');
        }

        // ---- the quiet: what the arena looks like when it is not winding up ----
        if (w.state === 'recover' && seen.quiet < 0 && seen.woke) {
          seen.quiet = countPixels(await look('a-03-quiet'), isVioletLight);
        }

        // ---- the telegraph: violet on the floor where the strike will land, building as it nears ----
        if (w.state === 'telegraph' && w.marks.length > 0 && w.attack) {
          seen.attacks.add(w.attack);
          const key = `${w.attack}${w.enraged ? '+' : ''}`;
          const m0 = w.marks[0]!;
          const rec = seen.marks.get(key);
          if (!rec && m0.t01 < 0.4) {
            const px = countPixels(await look(`b-${key}-early`), isVioletLight, await strip(m0));
            seen.marks.set(key, { v0: px, v1: null });
          } else if (rec && rec.v1 === null && m0.t01 > 0.85) {
            rec.v1 = countPixels(await look(`b-${key}-late`), isVioletLight, await strip(m0));
          }
        }

        // ---- the second phase ----
        if (w.enraged && !seen.enraged) {
          seen.enraged = true;
          assert.ok(w.hp <= MAX * INK_WARDEN.enrageAt + 1, `it burns hotter at half its life (${w.hp}/${MAX})`);
          await frames(ctx.page, 30);
          const bb = await bar(ctx.page);
          assert.ok(bb.enraged, 'the bar burns too');
          assert.ok(Math.abs((bb.value ?? -99) - (100 * w.hp) / MAX) <= 3, `the bar follows its life (${bb.value} % for ${w.hp}/${MAX})`);
          await look('c-01-the-second-phase');
        }

        // ---- the fall: the flag, the doors, the camera ----
        if (w.state === 'dead' && !seen.dead) {
          seen.dead = true;
          assert.ok(st.flags!.includes(WARDEN_FLAG), 'its defeat is a flag of the world');
          assert.ok(!st.flags!.includes(FIGHT_FLAG), 'the fight flag is gone');
          assert.deepEqual(shut(st), { w: false, e: false }, 'both doors are open again');
          await ctx.page.evaluate('window.__troid.settleCamera(3)');
          await frames(ctx.page, 30);
          const t = await state();
          assert.equal(t.camera!.zone, null, 'the camera is free again');
          const bb = await bar(ctx.page);
          assert.equal(bb.value, 0, 'the bar is empty');
          await look('d-01-it-falls');
        }
      },
    });
    s = await state();

    // ================================================================================================ what the fight was
    assert.ok(seen.woke && seen.enraged && seen.dead, 'it woke, burned hotter and fell');
    assert.equal(seen.hpRises, 0, 'its life never went up');
    assert.equal(seen.minHp, 0);
    assert.ok(seen.attacks.has('charge') && seen.attacks.has('rain'), `it threw both attacks (${[...seen.attacks].join(', ')})`);
    assert.ok(seen.maxMarks >= 4, `the enraged rain marks four spots (${seen.maxMarks})`);
    assert.ok(seen.quiet >= 0);
    const lines: string[] = [];
    for (const [key, r] of seen.marks) {
      assert.ok(r.v1 !== null, `${key}: the warning was seen near its end`);
      lines.push(`${key} ${r.v0}→${r.v1}`);
      assert.ok(r.v1! >= 300, `${key}: the floor is violet where it will strike (${r.v1} px)`);
      assert.ok(r.v1! > r.v0 + 60, `${key}: and the warning builds as the strike nears (${r.v0} → ${r.v1} px)`);
    }
    assert.ok(seen.marks.has('charge') && seen.marks.has('rain'), `both warnings were looked at (${[...seen.marks.keys()].join(', ')})`);
    const events = await log(ctx.page);
    assert.equal(events.filter((e) => e.startsWith('started')).length, 1, 'it woke once');
    assert.deepEqual(events.filter((e) => e.startsWith('started')), [`started ink_warden ${MAX}/${MAX}`]);
    assert.deepEqual(events.filter((e) => e.startsWith('phase')), ['phase 2'], 'one second phase');
    assert.equal(events.filter((e) => e === 'defeated').length, 1, 'it fell once');
    assert.ok(events.filter((e) => e.startsWith('strike')).length >= 8, `a fight of many strikes (${events.filter((e) => e.startsWith('strike')).length})`);
    assert.deepEqual(
      events.filter((e) => e.startsWith('gate')),
      ['gate arena_door_w shut', 'gate arena_door_e shut', 'gate arena_door_w open', 'gate arena_door_e open'],
      'the doors shut when it woke and opened when it fell, each once',
    );
    assert.ok(!events.includes('player died'), 'the hero never fell');
    assert.ok(events.includes('ability air_dash') && events.includes('did reward_air_dash'), 'the reward was taken with Interact');
    assert.ok(events.indexOf('defeated') < events.indexOf('did reward_air_dash'), 'after the fall, not before');

    // ================================================================================================ after the fight
    assert.equal(s.room, 'r4_sanctum');
    assert.equal(s.boss, null, 'the Warden dissolved and is gone from the room');
    assert.deepEqual(
      s.flags!.slice().sort(),
      [...AT_THE_SHRINE.flags, WARDEN_FLAG, AIR_DASH_FLAG].sort(),
      'the flags: what the hero came with, the fall, the reward taken — and no volatile flag',
    );
    assert.ok(s.health! > 0 && s.state === 'free');
    assert.ok(Math.abs(s.x - 84.4) < 0.6, `the hero stands at the pedestal (x = ${s.x.toFixed(2)})`);
    assert.equal(await ctx.page.evaluate('window.__troid.session.abilities.has("air_dash")'), true, 'the Air Dash is theirs');
    await frames(ctx.page, 150); // the bar lingers a moment and goes
    b = await bar(ctx.page);
    assert.equal(b.display, 'none', 'the bar is gone');
    await ctx.shot('d-02-after-the-fight');
    // the pedestal is empty and the icon is gone with it
    await frames(ctx.page, 6);
    assert.equal(await ctx.page.locator('[data-testid="prompt-hit"]').getAttribute('data-active'), '0', 'nothing left to take');

    // ================================================================================================ the reward in use: two dashes in the air, with the real keyboard
    await ctx.teleport(72, 16);
    await ctx.step(2);
    const before = (await log(ctx.page)).filter((e) => e.startsWith('dash')).length;
    await ctx.page.keyboard.down('KeyD');
    for (let i = 0; i < 2; i++) {
      assert.equal((await state()).grounded, false, `in the air for dash ${i + 1}`);
      await ctx.page.keyboard.down('ShiftLeft');
      await ctx.step(1);
      await ctx.page.keyboard.up('ShiftLeft');
      await ctx.step(40); // the dash lasts 10 ticks and its cooldown 25 more, counted from its end
    }
    await ctx.page.keyboard.up('KeyD');
    const dashes = (await log(ctx.page)).filter((e) => e.startsWith('dash')).slice(before);
    assert.deepEqual(dashes, ['dash air', 'dash air'], 'two dashes in the air: one more than the dash alone allows (boss-death shows the one)');

    // ================================================================================================ the way out of the world, open
    await ctx.teleport(96.5, 0);
    await ctx.step(30);
    s = await state();
    assert.deepEqual(s.exits, ['east'], 'the way out of the world is reached');
    assert.equal(s.transition?.phase, 'none', 'it is the end of the world: no room follows');
    assert.ok(s.health! > 0);

    // ================================================================================================ saved: a reload leaves the Warden gone
    await ctx.page.waitForTimeout(150);
    const saved = await stored(ctx.page);
    assert.ok(saved, 'saved');
    assert.ok(saved.flags.includes(WARDEN_FLAG) && saved.flags.includes(AIR_DASH_FLAG), 'the fall and the reward are in the save');
    assert.ok(!saved.flags.some((f) => f.startsWith('~')), 'and no volatile flag is');
    assert.deepEqual(saved.abilities.slice().sort(), ['air_dash', 'dash'], 'with the Air Dash among the abilities');
    assert.deepEqual(saved.checkpoint, { room: 'r4_sanctum', entry: 'rest' });
    await reload(ctx.page);
    s = await state();
    assert.equal(s.room, 'r4_sanctum');
    assert.equal(s.boss, null, 'it does not come back');
    assert.deepEqual(shut(s), { w: false, e: false }, 'the doors are open');
    assert.ok(s.flags!.includes(WARDEN_FLAG) && !s.flags!.includes(FIGHT_FLAG));
    assert.equal(await ctx.page.evaluate('window.__troid.session.abilities.has("air_dash")'), true, 'the Air Dash is still theirs');
    assert.equal((await bar(ctx.page)).display, 'none');
    await ctx.teleport(40, 0);
    await ctx.page.evaluate('window.__troid.settleCamera(2)');
    await ctx.step(60);
    s = await state();
    assert.equal(s.camera?.zone, null, 'the camera is free in the arena for good');
    assert.equal(s.boss, null, 'nothing woke in the arena');
    await ctx.teleport(84, 0);
    await ctx.step(6);
    await frames(ctx.page, 8);
    assert.equal(await ctx.page.locator('[data-testid="prompt-hit"]').getAttribute('data-active'), '0', 'the reward is not there to take twice');
    await ctx.teleport(96.5, 0);
    await ctx.step(30);
    assert.deepEqual((await state()).exits, ['east'], 'and the way out still works');

    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    console.log(`  boss: ${fight.total} ticks replayed bit for bit · violet warnings ${lines.join(', ')} px · quiet arena ${seen.quiet} px · ${worst} draw calls at the worst moment (budget 60)`);
  },
};
