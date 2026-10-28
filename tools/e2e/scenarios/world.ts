import assert from 'node:assert/strict';
import { roomLimits } from '@/camera/cameraZones';
import { ROOMS, WORLD } from '@/content';
import { arriveIn, freshWorld, playWorld } from '../../../tests/helpers/journey';
import { frames } from '../frames';
import { record, replay } from '../replay';
import { createArtFixture, type FixturePack } from '../artFixture';
import type { Ctx, GameState, Scenario } from '../scenario';
import { HERO_PACKS } from './playerR1';

/** The art on the page in `world-art`: the whole protagonist and three packs nothing draws yet (they must change nothing). */
/** The rooms of the first chapter, in the order the journey meets them (and then the Nave). */
const CHAPTER = WORLD.rooms.slice(0, 4);

const ART_PACKS: FixturePack[] = [
  ...HERO_PACKS,
  { id: 'forest', category: 'environment', load: 'zone', zones: ['r1_gate', 'r2_hall'], sprites: [{ id: 'stone', canvas: [64, 64], clips: { idle: 1 }, prefix: 'stone_', extra: { pivot: [0, 0], tags: ['role:solid', 'material:stone', 'part:fill'] } }] },
  { id: 'sparks', category: 'vfx', load: 'lazy', sprites: [{ id: 'burst', canvas: [64, 64], clips: { idle: 6 }, prefix: 'burst_' }] },
  { id: 'inks', category: 'enemies', load: 'zone', zones: ['r1_gate'], sprites: [{ id: 'slime', canvas: [96, 64], clips: { idle: 4 }, prefix: 'slime_' }] },
];

/**
 * THE FIRST CHAPTER OF THE WORLD (docs/PROMPT6-LOG.md S23, S29; docs/PROMPT21-LOG.md): R1 → R2 → R3 → R4 → the Collapsed Nave, walked with REAL keyboard events in headless
 * Chromium — the fight with the Ink Warden of R4 and the reward it leaves included, and the way on to the rest of the world, which is a chunk of the game of its own (`content/beyond.ts`) that the page has by then. The journey is RECORDED
 * in Node on the pure simulation by a scripted player (`tests/helpers/journey.ts`, the same script `worldJourney.test.ts` asserts on) and REPLAYED through the browser's keyboard tick by tick, comparing a digest of the whole
 * simulation — which includes the room and the transition — every 50 ticks: the browser plays the same game as the simulation, bit for bit, through four room transitions.
 *
 * `world-art` is the same walk with ART ATTACHED (S44; synthetic art, never art): the complete protagonist (fifteen clips), a piece of scenery, an effect pack and an enemy pack the game does
 * not draw yet are all on the page, and the digests must STILL match the simulation tick for tick — the simulation does not know the art — while the hero is drawn by the art at every
 * sample (it has every clip), the library has nothing to say, and the draw calls stay under the budget with all of it loaded.
 *
 * Also: every room is seen on screen once the hero has arrived, the camera never shows beyond the room it is in, the hero arrives at
 * the west entry of every room, the console stays clean (the runner fails the scenario otherwise) and draw calls stay ≤ 60.
 */
async function runWorld(ctx: Ctx, withArt: boolean): Promise<void> {
  const d = freshWorld();
  const journey = record(d, () => {
    playWorld(d);
    arriveIn(d, 'ru_nave'); // the touch of the way on begins the transition; the journey goes on until the hero is in the Nave
  });
  console.log(`  recorded in Node: ${journey.total} ticks (${journey.runs.length} key changes) through ${CHAPTER.length + 1} rooms`);
  assert.ok(journey.total > 2500, `a long walk (${journey.total} ticks)`);

  const fixture = withArt ? createArtFixture(ART_PACKS) : null;
  try {
    await ctx.open(`paused=1${fixture ? '&art=art-test' : ''}`, { width: 844, height: 390, dpr: 1, ...(fixture ? { prepare: async (context) => fixture.serve(context, 'art-test') } : {}) });
    if (fixture) {
      // the art arrives while the game is paused at tick 0 (the replay starts only when the hero is drawn by it)
      await ctx.page.waitForFunction('window.__troid.state().visual && window.__troid.state().visual.art === "player/hero"', undefined, { timeout: 20000 });
      assert.equal((await ctx.state()).visual?.art, 'player/hero', 'the art is on the hero before the first tick');
      assert.deepEqual((await ctx.state()).visual?.lacks, [], 'and nothing is left to draw with the placeholder');
    }
    let s = await ctx.state();
    assert.equal(s.room, 'r1_gate', 'a new game starts in R1');
    assert.equal(s.now, 0, 'not one tick has run: the replay starts from tick 0');
    // what the world tells the interface, as it happens
    await ctx.page.evaluate(
      `(() => { const s = window.__troid.session; window.__w = []; s.bus.on('room:entered', (e) => window.__w.push('enter ' + e.roomId + ':' + e.entryId + ' from ' + e.from)); s.bus.on('exit:reached', (e) => window.__w.push('exit ' + e.roomId + '/' + e.exitId)); s.bus.on('transition:cancelled', () => window.__w.push('cancelled')); s.bus.on('player:died', () => window.__w.push('died')); s.bus.on('card:changed', (e) => e.type === 'equipped' && window.__w.push('card')); s.bus.on('actor:died', (e) => e.team === 'neutral' && window.__w.push('seal broken')); s.bus.on('seal:rejected', () => window.__w.push('seal rejected')); s.bus.on('boss:started', () => window.__w.push('boss started')); s.bus.on('boss:defeated', () => window.__w.push('boss defeated')); s.bus.on('ability:unlocked', (e) => window.__w.push('ability ' + e.id)); s.bus.on('adventure:ended', (e) => window.__w.push('adventure ' + e.roomId + '/' + e.exitId)); })()`,
    );

    let worst = 0;
    const looks: Record<string, number> = {};
    const shot = new Set<string>();
    let transitions = 0;
    let lastPhase = 'none';
    // what the page tells the hero when it learns the Air Dash (docs/PROMPT22-LOG.md §6): looked at while it is on screen
    let told: string | null = null;
    const camera = { rooms: new Set<string>(), worstOverrun: 0 };
    await replay(ctx, journey, {
      chunk: 4,
      observe: async (st: GameState) => {
        worst = Math.max(worst, st.drawsMax ?? 0);
        if (told === null && st.flags?.includes('taken:air_dash')) {
          told = (await ctx.page.evaluate(
            `(() => { const e = document.querySelector('[data-testid="ability-notice"]'); return e && e.dataset.open === '1' ? e.dataset.ability + ' | ' + e.querySelector('.ability-kicker').textContent + ' | ' + e.querySelector('[data-testid="ability-notice-name"]').textContent + ' | ' + e.querySelector('[data-testid="ability-notice-how"]').textContent : null; })()`,
          )) as string | null;
          if (told !== null) await ctx.shot('ability-notice');
        }
        if (st.visual) looks[st.visual.shows] = (looks[st.visual.shows] ?? 0) + 1;
        if (st.transition?.phase === 'fadeOut' && lastPhase === 'none') transitions++;
        lastPhase = st.transition?.phase ?? 'none';
        // once the hero is in a room and in control, look at it: a picture, and the camera inside the room
        if (st.room && st.transition?.phase === 'none' && !shot.has(st.room) && st.now! > 0 && st.x > 3 && st.grounded) {
          shot.add(st.room);
          await frames(ctx.page, 30); // the camera follows in real time while the replay runs ahead of it: let it catch up
          const seen = await ctx.state();
          // the view against the limits the room declares (S26: its width, the foot of its ground at the bottom — tighter than its extents)
          const c = seen.camera!;
          const limits = c.limits!;
          const halfH = c.viewHeight / 2;
          const halfW = (halfH * seen.view!.contentWidth) / seen.view!.contentHeight;
          camera.rooms.add(st.room);
          assert.deepEqual(limits, roomLimits(ROOMS[st.room]!), `${st.room}: the view is held to the limits the room declares`);
          const over = Math.max(limits.x0 - (c.x - halfW), c.x + halfW - limits.x1, limits.y0 - (c.y - halfH), c.y + halfH - limits.y1, 0);
          camera.worstOverrun = Math.max(camera.worstOverrun, over);
          await ctx.shot(`room-${st.room}`);
        }
      },
    });
    s = await ctx.state();
    worst = Math.max(worst, s.drawsMax ?? 0);

    const events = (await ctx.page.evaluate('window.__w')) as string[];
    assert.deepEqual(
      events.filter((e) => e.startsWith('enter')),
      ['enter r2_hall:west from r1_gate', 'enter r3_chamber:west from r2_hall', 'enter r4_sanctum:west from r3_chamber', 'enter ru_nave:west from r4_sanctum'],
      'the four transitions of the chapter, each arriving at the west entry of the next room — the last one into the rest of the world',
    );
    assert.deepEqual(
      events.filter((e) => e.startsWith('exit')),
      ['exit r1_gate/east', 'exit r2_hall/east', 'exit r3_chamber/east', 'exit r4_sanctum/east'],
      'every east exit, the last one the way on out of the Sanctum',
    );
    assert.ok(!events.includes('died') && !events.includes('cancelled'), `the hero never fell (${events.join(' | ')})`);
    assert.ok(events.includes('card') && events.indexOf('card') < events.indexOf('seal broken'), 'the card was taken before the seal broke');
    assert.ok(!events.includes('seal rejected'), 'and the sword never swung at the seal');
    // the end of R4 is earned: the Warden wakes, falls, and only then does the Air Dash come and the way out open (S29)
    const at = (e: string): number => events.indexOf(e);
    assert.deepEqual(events.filter((e) => e.startsWith('boss')), ['boss started', 'boss defeated'], 'the Warden woke once and fell once');
    assert.ok(at('enter r4_sanctum:west from r3_chamber') < at('boss started') && at('boss started') < at('boss defeated'), 'in R4, in that order');
    assert.ok(at('boss defeated') < at('ability air_dash') && at('ability air_dash') < at('exit r4_sanctum/east'), 'the reward after the fall, and the way on after the reward');
    assert.deepEqual(events.filter((e) => e.startsWith('adventure')), [], 'the Sanctum is not the end of the world any more: nothing ended');
    assert.equal(s.menuOpen, false, 'and the world was not held at a closing');
    assert.ok(transitions >= 3, `the fades of the chapter were seen (${transitions})`);
    assert.equal(s.room, 'ru_nave', 'the walk ends in the Collapsed Nave, the hub of the rest of the world — the room came from the chunk the page asked for after its first frame');
    assert.equal(s.transition?.phase, 'none');
    assert.ok(s.health! > 0);
    assert.deepEqual(
      s.flags!.slice().sort(),
      ['broken:r3_seal', 'defeated:r1_slime', 'defeated:r2_slime', 'defeated:r4_boss', 'taken:air_dash', 'taken:card_spirit_bolt'],
      'both slimes fell on the way, the card was taken on R3\'s ledge and its seal broken, the Warden fell and its Air Dash was taken',
    );
    assert.equal(s.card, 'card_spirit_bolt', 'the hero ends the chapter with the Spirit Bolt in hand');
    assert.equal(told, 'air_dash | New ability | Air Dash | In the air, press Shift once more.', 'and was told what it had learned, and how it is done with the keys');
    assert.deepEqual([...shot].sort(), [...CHAPTER, 'ru_nave'].sort(), 'every room of the chapter was seen with the hero in it, and the Nave');
    assert.deepEqual([...camera.rooms].sort(), [...CHAPTER, 'ru_nave'].sort());
    assert.ok(camera.worstOverrun < 0.6, `the camera never showed more than 0.6 m beyond the limits of a room (${camera.worstOverrun.toFixed(2)} m)`);
    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    await ctx.shot('the-way-on');
    if (fixture) {
      const samples = Object.values(looks).reduce((a, b) => a + b, 0);
      assert.equal(looks['placeholder'] ?? 0, 0, `with the complete art the hero is never drawn by the placeholder (${JSON.stringify(looks)})`);
      assert.ok(samples > 300 && looks['art'] === samples, `the art drew the hero in every one of the ${samples} samples (${JSON.stringify(looks)})`);
      const art = (await ctx.state()).art!;
      assert.equal(art.failures, 0, 'the library failed at nothing');
      assert.ok(art.sets >= 1 && art.pages >= 1, 'and holds the hero\'s pages');
      assert.equal(ctx.warnings.filter((w) => w.includes('[art]')).length, 0, 'and had nothing to say');
      // the zone packs followed the hero: fetched while it was in the rooms they name, let go afterwards; the lazy one nobody asked for was never fetched
      const asked = (pack: string): number => fixture!.requests.filter((r) => r.startsWith(`${pack}/`)).length;
      const held = (pack: string): boolean => art.packList.find((p) => p.id === pack)?.held ?? false;
      assert.ok(asked('forest') > 0 && asked('inks') > 0, 'the packs of R1 were fetched while the hero was in R1');
      assert.ok(!held('forest') && !held('inks'), 'and are not held in R4');
      assert.equal(asked('sparks'), 0, 'the lazy pack, which nothing asked for, was never fetched');
      console.log(`  world-art: the same ${CHAPTER.length + 1} rooms and ${transitions} transitions, bit for bit, with art attached (peak ${(art.peakBytes / 1048576).toFixed(1)} MiB, ${art.requests} files, zone packs followed the hero) and the hero drawn by it in ${looks['art']} of ${samples} samples · ${worst} draw calls at the worst moment (budget 60)`);
    } else console.log(`  world: ${CHAPTER.length + 1} rooms and ${transitions} transitions replayed bit for bit through the keyboard · ${worst} draw calls at the worst moment (budget 60) · camera overrun ${camera.worstOverrun.toFixed(2)} m`);
  } finally {
    fixture?.cleanup();
  }
}

export const world: Scenario = { name: 'world', run: (ctx) => runWorld(ctx, false) };
export const worldArt: Scenario = { name: 'world-art', run: (ctx) => runWorld(ctx, true) };
