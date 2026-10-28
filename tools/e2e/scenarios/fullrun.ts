import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { COMPLETED_FLAG } from '@/progression/adventure';
import { ROAD } from '../../../tests/helpers/road';
import { Runner } from '../../../tests/helpers/runner';
import { PROGRESS_KEY, stored } from '../bossKit';
import { recordAsync, replay } from '../replay';
import type { GameState, Scenario } from '../scenario';

/**
 * THE WHOLE ADVENTURE, IN A REAL BROWSER (docs/PROMPT22-LOG.md §5): from a new game in the first room to the way out of the world, ONE page, ONE session, tick by tick.
 *
 * The run is played in Node on the pure simulation by a scripted player with a hero who can die (`tests/helpers/runner.ts`: the same one `fullRun.test.ts` asserts on — the seven zones, the fifty-six rooms of the road, the seven guardians, the
 * levers, the seals, the shrines, the falls) and RECORDED: the stick to the last digit and the buttons held, tick by tick. The browser plays it through the scripted hand of the test hooks (`__troid.script`, one more source of the
 * `InputManager`, next to the keyboard, the pad and the fingers) and compares a digest of the whole simulation — hero, flags, enemies, guardians, room, transition, generator — every 50 ticks: the page plays the same game as the simulation, bit for bit,
 * through every room, every fight and every fall. At the end the page must be where the game ends: the closing screen open, the world held, the game saved as COMPLETED in the storage of the page, and what is saved the very flags of the simulation.
 *
 * While it runs, the page is looked at: the draw calls stay under the budget, no console error appears (the runner fails the scenario otherwise), and the memory and the DOM are sampled across the whole session to see whether a long game leaves anything behind.
 *
 * What it does NOT do: press the physical keyboard (the stick of a scripted run is analog, which keys cannot say — the keyboard, the pad and the fingers have their own scenarios and play the first chapter bit for bit), or tell how long a person takes.
 */
const SIZE = { width: 844, height: 390, dpr: 1 } as const;

interface Sample {
  tick: number;
  room: string | undefined;
  heapMB: number | null;
  dom: number;
  draws: number;
  views: number | undefined;
  particles: number | undefined;
  sceneObjects: number;
}

const dom = (page: Page): Promise<number> => page.evaluate('document.querySelectorAll("*").length') as Promise<number>;
const heap = (page: Page): Promise<number | null> => page.evaluate('(performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null)') as Promise<number | null>;

export const fullrun: Scenario = {
  name: 'fullrun',
  async run(ctx) {
    // ================================================================================================ the run, in Node
    const t0 = Date.now();
    const runner = new Runner({ seed: 1 });
    const journey = await recordAsync(runner.d, () => runner.play());
    assert.ok(runner.ended, 'the scripted player reached the way out of the world');
    console.log(`  recorded in Node: ${journey.total} ticks (${(journey.total / 3600).toFixed(1)} min of play, ${journey.runs.length} changes of the hands), ${runner.deaths} falls, in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    assert.ok(journey.total > 54_000, `a long game (${journey.total} ticks)`);

    // ================================================================================================ the same game, in the page
    await ctx.open('paused=1', SIZE);
    const { page } = ctx;
    let s = await ctx.state();
    assert.equal(s.room, 'r1_gate', 'a new game starts in the first room');
    assert.equal(s.now, 0, 'not one tick has run: the replay starts from tick 0');
    assert.equal((await stored(page)), null, 'and nothing is saved yet');
    await page.evaluate(
      `(() => { const s = window.__troid.session; const w = (window.__w = { rooms: [], guardians: [], abilities: [], rests: 0, deaths: 0, ended: [], cancelled: 0 });
        s.bus.on('room:entered', (e) => w.rooms.push(e.roomId)); s.bus.on('boss:defeated', (e) => w.guardians.push(e.defId)); s.bus.on('ability:unlocked', (e) => w.abilities.push(e.id));
        s.bus.on('checkpoint:set', () => w.rests++); s.bus.on('death:started', () => w.deaths++); s.bus.on('adventure:ended', (e) => w.ended.push(e.roomId + '/' + e.exitId)); s.bus.on('transition:cancelled', () => w.cancelled++); })()`,
    );

    const samples: Sample[] = [];
    const sample = async (tick: number, st: GameState): Promise<void> => {
      samples.push({ tick, room: st.room, heapMB: await heap(page), dom: await dom(page), draws: st.drawsMax ?? 0, views: st.views, particles: st.vfx?.particles, sceneObjects: Object.values(st.scene ?? {}).reduce((a, b) => a + b, 0) });
    };
    let worstDraws = 0;
    let lastSample = -1e9;
    const t1 = Date.now();
    await replay(ctx, journey, {
      chunk: 50,
      device: () => 'script',
      observe: async (st, tick) => {
        worstDraws = Math.max(worstDraws, st.drawsMax ?? 0);
        if (tick - lastSample >= 6000) {
          lastSample = tick;
          await sample(tick, st);
          if (samples.length % 3 === 1) console.log(`    … ${(tick / 3600).toFixed(1)} min of ${(journey.total / 3600).toFixed(1)}: ${st.room} · life ${st.health}/${st.maxHealth} · ${((Date.now() - t1) / 1000).toFixed(0)} s`);
        }
      },
    });
    await ctx.step(2);
    s = await ctx.state();
    await sample(journey.total, s);
    console.log(`  replayed in the page: ${journey.total} ticks in ${((Date.now() - t1) / 1000).toFixed(0)} s, every digest (${journey.digests.length}) equal to the simulation's`);

    // ================================================================================================ where the game ends
    const w = (await page.evaluate('window.__w')) as { rooms: string[]; guardians: string[]; abilities: string[]; rests: number; deaths: number; ended: string[]; cancelled: number };
    assert.deepEqual(w.ended, [`${ROAD[ROAD.length - 1]}/end`], 'the adventure ended once, through the way out of the last room');
    assert.equal(w.deaths, runner.deaths, 'the same falls as in the simulation');
    assert.equal(w.guardians.length, 7, `the seven guardians fell (${w.guardians.join(', ')})`);
    assert.deepEqual([...w.abilities].sort(), ['air_dash', 'double_jump', 'ground_slam', 'magic_attack', 'relic_brew', 'relic_swift', 'relic_ward', 'wall_jump'], 'the five abilities of the road, the Spirit Bolt and the three relics of the guardians were won, once each');
    for (const room of ROAD.slice(1)) assert.ok(w.rooms.includes(room), `the page built ${room}`); // (the first room was built before anyone could listen)
    assert.equal(w.cancelled, 0, 'no transition was cancelled');
    assert.equal(s.room, ROAD[ROAD.length - 1]);
    assert.ok(s.flags!.includes(COMPLETED_FLAG), 'the world remembers the end');
    assert.equal(s.menuOpen, true, 'the closing is open');
    // (the menu is a chunk of its own: it takes a moment to be drawn)
    const screenOf = (): Promise<unknown> => page.evaluate(`document.querySelector('[data-testid="pause-menu"]')?.dataset.screen + '/' + document.querySelector('[data-testid="pause-menu"]')?.dataset.open`);
    let screen = await screenOf();
    for (let i = 0; i < 100 && screen !== 'ending/1'; i++) {
      await page.waitForTimeout(50);
      screen = await screenOf();
    }
    assert.equal(screen, 'ending/1', 'on its closing screen');
    assert.equal(s.stats!.deaths, runner.deaths, 'the page counted the falls');
    assert.equal(s.stats!.ticks, runner.now, 'and the time played (the simulation\'s own clock, which a blow\'s hit-stop and the black of a change of room hold still: the frames played are more)');
    assert.ok(s.stats!.rooms.length >= ROAD.length, `and the rooms seen (${s.stats!.rooms.length})`);

    // what the page SAVED: the game, as the next load will read it, is completed — and is the simulation's
    let saved = await stored(page);
    for (let i = 0; i < 40 && !saved?.flags.includes(COMPLETED_FLAG); i++) {
      await page.waitForTimeout(100);
      saved = await stored(page);
    }
    assert.ok(saved, `a game is saved under "${PROGRESS_KEY}"`);
    assert.ok(saved!.flags.includes(COMPLETED_FLAG), 'and it is completed');
    assert.equal(saved!.at.room, ROAD[ROAD.length - 1]);
    const want = runner.d.session.flags.list().filter((f) => !f.startsWith('~')).sort();
    assert.deepEqual([...saved!.flags].filter((f) => !f.startsWith('~')).sort(), want, 'the saved game has the very flags of the simulation');
    assert.deepEqual([...saved!.abilities].sort(), runner.d.session.abilities.serialize().sort(), 'and its abilities');

    // ================================================================================================ the page, after a whole game
    assert.ok(worstDraws <= 60, `draw calls stayed under the budget (${worstDraws})`);
    for (const x of samples) {
      assert.ok((x.particles ?? 0) <= 400, `particles at ${x.tick}: ${x.particles}`);
      assert.ok(x.draws <= 60, `draw calls at ${x.tick}: ${x.draws}`);
    }
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    const maxDom = Math.max(...samples.map((x) => x.dom));
    const maxObjects = Math.max(...samples.map((x) => x.sceneObjects));
    console.log(
      `  the page across ${samples.length} samples · heap ${first.heapMB?.toFixed(0) ?? '?'} → ${last.heapMB?.toFixed(0) ?? '?'} MB (peak ${Math.max(...samples.map((x) => x.heapMB ?? 0)).toFixed(0)}) · DOM ${first.dom} → ${last.dom} nodes (peak ${maxDom}) · scene objects peak ${maxObjects} · worst ${worstDraws} draw calls`,
    );
    console.log(`  samples (minute · room · heap MB · DOM nodes · scene objects): ${samples.map((x) => `${(x.tick / 3600).toFixed(0)}·${x.room}·${x.heapMB?.toFixed(0) ?? '?'}·${x.dom}·${x.sceneObjects}`).join('  ')}`);
    assert.ok(maxDom < first.dom + 400, `the DOM did not grow with the game (${first.dom} → peak ${maxDom})`);
    await ctx.shot('01-the-end');
    // what the page said about itself on the way (the runner prints the first three): all of it, for whoever reads the art
    mkdirSync('.shots/e2e', { recursive: true });
    writeFileSync('.shots/e2e/fullrun-warnings.txt', [...new Set(ctx.warnings)].sort().join('\n') + '\n');
  },
};
