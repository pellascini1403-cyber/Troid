import assert from 'node:assert/strict';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { ARRIVAL } from '@/presentation/arrival';
import { MEMORY_BUDGET_MIB, MIB } from '@/presentation/stressModel';
import { openPage } from '../harness';
import { countPixels, decodePng } from '../png';
import type { ArrivalState } from '@/app/testHooks';
import type { GameState, Scenario } from '../scenario';

/**
 * THE ARRIVAL AT A NEW ROOM, in a real browser (docs/PROMPT13-LOG.md): a change of zone shows the next room WHOLE or not at all. Before this, the fade of a transition lasted a fixed half second whatever
 * the art needed, the room was built as the blockout and dressed when its files arrived, and on any line slower than that half second the player saw the ground and a few props first and the rest
 * pop in. Now the simulation still swaps the room under the black, but the WORLD IS HELD there (not one tick runs) until the art of the room is in memory and its view has been put on the stage in one
 * step and drawn out of sight; the fade back in starts from a picture that is already there. Every page here has its own network — a delay on every art file, a hang, a refusal, a real bandwidth.
 *
 *   A · a slow line, first visit to R2: no frame with the picture visible ever shows the room half-dressed; the black lasts as long as the loading takes (and the tick count of the transition is
 *       the same); the loading indicator comes in after a moment, under the black; the fade out and the fade in are each one clean ramp, with no flicker
 *   B · the same walk on a fast line, and the result of the game is the same bit for bit (position, life, magic, flags, enemies, ticks): waiting changes nothing the simulation decides
 *   C · walking toward the way out brings the art of the next room in early: the change of zone finds it in memory even on the slow line, shows no loading indicator, and the files were asked
 *       for before the way out was touched; the zone is given back when the hero turns away
 *   D · what fails does not trap the player at the black: an art that is refused, and one that never answers (`?arrival=1500`), both let the world go on
 *   E · back and forth, quickly, on a slow line: every transition finishes, the scene is the one of a room loaded directly (nothing left over, nothing doubled), no timer is left pending
 *   F · a real, limited bandwidth: the loading indicator shows the share of the bytes that have really arrived, growing, never backward
 *   G · the indicator fits the screen of a phone (with a notch) and a desktop, and the black stays black around it
 *   H · a defeat that brings the hero back to another room is held the same way: the loading indicator shows above the defeat screen and the room that comes back is whole
 */
const PHONE = { width: 844, height: 390, dpr: 1 };
const DESKTOP = { width: 1280, height: 720, dpr: 1 };
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** What a page's network does to the art, changeable while the page runs. */
interface Net {
  /** Every art file waits this long before it is let through (ms). */
  delay: number;
  /** Art whose URL matches is refused. */
  abort: RegExp | null;
  /** Art whose URL matches is never answered. */
  hang: RegExp | null;
}

interface Frame {
  t: number;
  tick: number;
  room: string;
  phase: string;
  veil: number;
  held: boolean;
  stage: string;
  dressed: boolean;
  sig: string;
  ind: number;
}

interface World {
  page: Page;
  context: BrowserContext;
  errors: string[];
  net: Net;
  close(): Promise<void>;
}

/** The count of children of the layers the art dresses: the signature of "this room, whole". */
const SIGNATURE = `(() => { const L = window.__troid.game.renderer.layers; return ['terrain', 'backdropFar', 'backdropMid', 'backdropNear', 'foreground', 'lightOverlay'].map((k) => L[k].children.length).join(','); })()`;

/** One record per animation frame, taken AFTER the game's own frame (its callback was registered first): what was drawn, and how black the screen was while it was. */
const RECORDER = `(() => {
  const game = window.__troid.game;
  const L = game.renderer.layers;
  const overlay = document.querySelector('[data-testid="transition-overlay"]');
  const defeat = document.querySelector('[data-testid="death-overlay"]');
  const black = (el) => { if (!el) return 0; const cs = getComputedStyle(el); return cs.display === 'none' ? 0 : Number(cs.opacity); };
  const keys = ['terrain', 'backdropFar', 'backdropMid', 'backdropNear', 'foreground', 'lightOverlay'];
  window.__tl = [];
  window.__tlOn = true;
  const record = () => {
    const s = game.session;
    const a = window.__troid.arrival();
    window.__tl.push({ t: performance.now(), tick: s.now, room: s.room.id, phase: s.transitionSnapshot.phase, veil: Math.max(black(overlay), black(defeat)), held: a.blocking, stage: a.stage,
      dressed: game.roomArtCover !== null, sig: keys.map((k) => L[k].children.length).join(','), ind: a.indicator });
    if (window.__tlOn) requestAnimationFrame(record);
  };
  requestAnimationFrame(record);
})()`;

/** What the simulation decided, and nothing of how it was drawn: the same walk must end in the same digest whatever the line. */
const DIGEST = `(() => { const s = window.__troid.state(); return { room: s.room, tick: s.tick, now: s.now, x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: s.grounded, health: s.health, magic: s.magic, card: s.card, bottles: s.bottles,
  flags: [...s.flags].sort(), respawn: s.respawnPoint, enemies: (s.enemies || []).map((e) => [e.id, e.def, e.state, e.ticks, e.x, e.y, e.hp]), views: s.views, exits: s.exits }; })()`;

const EVENTS = `(() => { const s = window.__troid.session; window.__ev = []; for (const t of ['transition:started', 'transition:finished', 'transition:cancelled', 'room:loaded', 'room:entered']) s.bus.on(t, (p) => window.__ev.push({ tick: s.now, type: t, p })); })()`;

const arrivalOf = (page: Page): Promise<ArrivalState> => page.evaluate('window.__troid.arrival()') as Promise<ArrivalState>;
const sigOf = (page: Page): Promise<string> => page.evaluate(SIGNATURE) as Promise<string>;
const stateOf = (page: Page): Promise<GameState> => page.evaluate('window.__troid.state()') as Promise<GameState>;
const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);

/** Polls until `test` is true; says what it was waiting for when it never is. */
async function until(what: string, test: () => Promise<boolean>, ms = 30000): Promise<void> {
  const t0 = Date.now();
  while (!(await test())) {
    if (Date.now() - t0 > ms) throw new Error(`timed out (${ms} ms) waiting for ${what}`);
    await sleep(40);
  }
}

/** A fresh page of the game (hooks on, paused, art as it is): its own browser context, its own cold cache, its own network. */
async function world(browser: Browser, origin: string, query: string, size: { width: number; height: number; dpr: number; touch?: boolean }, net: Partial<Net> = {}): Promise<World> {
  const state: Net = { delay: 0, abort: null, hang: null, ...net };
  const opened = await openPage(browser, `${origin}/?hooks=1&${query}`, {
    ...size,
    prepare: async (context) => {
      await context.route('**/art/**', async (route) => {
        const url = route.request().url();
        if (state.abort?.test(url)) return route.abort();
        if (state.hang?.test(url)) return; // never answered
        if (state.delay > 0) await sleep(state.delay);
        await route.continue();
      });
    },
  });
  const { page } = opened;
  await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
  await page.waitForFunction('!window.__troid.effectsReady || window.__troid.effectsReady()', undefined, { timeout: 30000 });
  await page.evaluate('window.__troid.pause()');
  return { page, context: page.context(), errors: opened.errors, net: state, close: () => page.context().close() };
}

/** Waits until the room the hero is in is dressed with the art and nothing is held or fading: the picture a player would call settled. */
async function settled(page: Page): Promise<void> {
  await until('the room to be dressed and still', async () => {
    const s = await stateOf(page);
    return s.roomArt !== null && s.arrival?.blocking === false && s.transition?.phase === 'none';
  });
  await sleep(200);
}

/** The shape of the fades in a run of frames: one ramp up to black, black for as long as it lasts, one ramp down — never up again. */
function shape(frames: Frame[]): { first: number; last: number; rises: boolean; plateau: boolean; falls: boolean } {
  const black = frames.flatMap((f, i) => (f.veil >= 0.999 ? [i] : []));
  assert.ok(black.length > 0, 'the screen went black');
  const first = black[0]!;
  const last = black[black.length - 1]!;
  let rises = true;
  let falls = true;
  for (let i = 1; i <= first; i++) if (frames[i]!.veil < frames[i - 1]!.veil - 1e-6) rises = false;
  for (let i = last + 1; i < frames.length; i++) if (frames[i]!.veil > frames[i - 1]!.veil + 1e-6) falls = false;
  return { first, last, rises, plateau: frames.slice(first, last + 1).every((f) => f.veil >= 0.999), falls };
}

/** The frames in which a picture of `room` was visible (more than 2 % of it) and what was on the stage was not the whole of it. */
function exposed(frames: Frame[], truth: Record<string, string>): Frame[] {
  return frames.filter((f) => f.veil < 0.98 && truth[f.room] !== undefined && (!f.dressed || f.sig !== truth[f.room]));
}

export const arrival: Scenario = {
  name: 'arrival',
  async run(ctx) {
    await ctx.open('', PHONE);
    const origin = new URL(ctx.page.url()).origin;
    const browser = ctx.page.context().browser()!;
    await ctx.page.goto('about:blank'); // (a page left running keeps drawing frames with the CPU the pages below need)

    // ================================================================================================ the truth: what each room looks like when it is whole
    const truth: Record<string, string> = {};
    {
      const w = await world(browser, origin, '', PHONE);
      for (const room of ['r1_gate', 'r2_hall', 'r3_chamber']) {
        await sess(w.page, `s.loadRoom("${room}")`);
        await w.page.evaluate('window.__troid.step(2)');
        await settled(w.page);
        truth[room] = await sigOf(w.page);
      }
      assert.equal(new Set(Object.values(truth)).size, 3, `the three rooms are told apart by what the art puts on the stage (${JSON.stringify(truth)})`);
      assert.deepEqual(w.errors, [], 'the page threw nothing');
      await w.close();
    }

    // ================================================================================================ A · a slow line, the first visit to R2 — in real time, as a player sees it
    const SLOW = 600;
    {
      const w = await world(browser, origin, '', PHONE);
      await settled(w.page);
      assert.equal(await sigOf(w.page), truth['r1_gate'], 'R1 is whole before the walk');
      await sess(w.page, 's.flags.set("defeated:r1_slime")');
      await w.page.evaluate(`(() => { const s = window.__troid.session; window.__troid.game.debug.set('godMode', true); })()`);
      w.net.delay = SLOW; // from here on every file of the art takes its time
      await w.page.evaluate(RECORDER);
      await w.page.evaluate('window.__troid.teleport(110, 0)');
      await w.page.evaluate('window.__troid.resume()'); // the loop runs at its own pace from here
      await until('the world to be held with the indicator on screen', async () => {
        const a = await arrivalOf(w.page);
        return a.blocking && a.indicator > 0.95;
      });
      const mid = await arrivalOf(w.page);
      assert.equal(mid.stage, 'loading', 'the art is on its way');
      assert.equal(mid.room, 'r2_hall');
      assert.ok(mid.waited >= ARRIVAL.graceMs, `the indicator waited for the grace (${mid.waited.toFixed(0)} ms)`);
      const during = await stateOf(w.page);
      assert.equal(during.room, 'r2_hall', 'the simulation is in the new room…');
      assert.equal(during.transition?.phase, 'hold', '…at the start of its black…');
      assert.equal(during.transition?.ticks, 0, '…and it has not moved a tick since');
      const heldTick = during.now;
      await sleep(300);
      assert.equal((await stateOf(w.page)).now, heldTick, 'the world is held: not one tick runs while the art is on its way, however long the loop runs');
      const pic = decodePng(await w.page.screenshot({ path: '.shots/e2e/arrival-a-waiting.png' }));
      const dark = countPixels(pic, (r, g, b) => r < 14 && g < 14 && b < 14);
      assert.ok(dark > pic.width * pic.height * 0.985, `the screen is black but for a hairline of light (${((100 * dark) / (pic.width * pic.height)).toFixed(2)} % black)`);
      const lit = countPixels(pic, (r, g, b) => b > 150 && g > 120 && r < 200);
      assert.ok(lit > 20, `and the hairline is there (${lit} px of cyan light)`);
      await until('the arrival to be over', async () => {
        const s = await stateOf(w.page);
        return (s.arrival?.history.length ?? 0) === 1 && s.arrival?.blocking === false && s.transition?.phase === 'none';
      });
      await settled(w.page);
      const frames = (await (async () => {
        await w.page.evaluate('window.__tlOn = false');
        return w.page.evaluate('window.__tl');
      })()) as Frame[];
      const a = await arrivalOf(w.page);
      const last = a.history[a.history.length - 1]!;
      assert.equal(a.history.length, 1, 'one change of zone, one arrival');
      assert.equal(last.room, 'r2_hall');
      assert.equal(last.outcome, 'ready', 'it ended because the art was in, not because it ran out or failed');
      assert.equal(last.indicator, true, 'the indicator was shown: the wait was long');
      assert.ok(last.waited >= 1000, `the world was held for as long as the loading took (${last.waited} ms)`);
      assert.equal(await sigOf(w.page), truth['r2_hall'], 'R2 is whole afterwards: the scene graph is the one of the room loaded directly');
      const bad = exposed(frames, truth);
      assert.equal(bad.length, 0, `not one picture of R2 was seen unfinished (${bad.length} of ${frames.filter((f) => f.veil < 0.98 && f.room === 'r2_hall').length} visible frames; first: ${JSON.stringify(bad[0])})`);
      const seenR2 = frames.filter((f) => f.veil < 0.98 && f.room === 'r2_hall');
      assert.ok(seenR2.length >= 3, `R2 was seen, whole, after the black (${seenR2.length} frames)`);
      const heldFrames = frames.filter((f) => f.held);
      assert.ok(heldFrames.length >= 5, `the wait was recorded (${heldFrames.length} frames)`);
      assert.ok(heldFrames.every((f) => f.veil >= 0.999), 'the black did not let a thing through while the world was held');
      const sh = shape(frames);
      assert.ok(sh.rises && sh.plateau && sh.falls, `the fade out and the fade in are each one clean ramp, with black between them (rises ${sh.rises}, black ${sh.plateau}, falls ${sh.falls})`);
      const lastHeld = frames.map((f) => f.held).lastIndexOf(true);
      assert.ok(frames[lastHeld + 1]!.veil >= 0.5, `the picture did not start coming back before the world was let go (veil ${frames[lastHeld + 1]!.veil})`);
      assert.ok(sh.last >= lastHeld, 'the black lasted at least as long as the wait');
      assert.ok(frames.some((f) => f.ind > 0.9), 'the indicator reached full light');
      assert.ok(frames.filter((f) => !f.held).slice(-3).every((f) => f.ind === 0), 'and it is gone once the world goes on');
      await w.page.screenshot({ path: '.shots/e2e/arrival-a-after.png' });
      assert.deepEqual(w.errors, [], 'the page threw nothing');
      console.log(`  arrival A: slow line (${SLOW} ms a file), in real time — black ${(frames[sh.last]!.t - frames[sh.first]!.t).toFixed(0)} ms, world held ${last.waited} ms, indicator shown, ${seenR2.length} frames of R2 seen and every one whole`);
      await w.close();
    }

    // ================================================================================================ B · the same walk, tick by tick, on a slow line and on a fast one: the same game
    const digests: unknown[] = [];
    for (const [label, delay] of [['slow', SLOW], ['fast', 0]] as const) {
      const w = await world(browser, origin, '', PHONE);
      await settled(w.page);
      await sess(w.page, 's.flags.set("defeated:r1_slime")');
      await w.page.evaluate(EVENTS);
      w.net.delay = delay;
      // (a page runs its first ticks in real time until the test pauses it: how many is not the same on two loads, so the ticks are counted from here)
      const startTick = (await stateOf(w.page)).now!;
      await w.page.evaluate('window.__troid.teleport(110, 0)');
      await w.page.evaluate('window.__troid.step(90)'); // the steps after the swap wait for the world to be let go
      await settled(w.page);
      assert.equal(await sigOf(w.page), truth['r2_hall'], `${label}: R2 is whole`);
      const ev = (await w.page.evaluate('window.__ev')) as Array<{ tick: number; type: string }>;
      assert.equal(ev.find((e) => e.type === 'transition:finished')!.tick - ev.find((e) => e.type === 'transition:started')!.tick, 31, `${label}: the transition lasts the same 32 simulated ticks, however long the art took`);
      const digest = (await w.page.evaluate(DIGEST)) as { now: number; tick: number };
      digests.push({ ...digest, now: digest.now - startTick, tick: digest.tick - startTick });
      assert.deepEqual(w.errors, []);
      await w.close();
    }
    assert.deepEqual(digests[0], digests[1], 'the slow line and the fast line end in the same game: position, life, magic, flags, enemies and ticks are identical — waiting decides nothing');
    assert.equal((digests[1] as { now: number }).now, 90, 'and exactly the ticks that were asked for were run');
    console.log(`  arrival B: the same 90 ticks and the same game bit for bit on a ${SLOW} ms line and on a fast one`);

    // ================================================================================================ C · walking toward the way out brings the art in early
    {
      const w = await world(browser, origin, 'room=r2_hall', PHONE, { delay: 400 });
      await settled(w.page);
      assert.equal((await arrivalOf(w.page)).aheadFor, null);
      await w.page.evaluate(EVENTS);
      await w.page.evaluate(`(() => { const s = window.__troid.session; window.__troid.game.debug.set('godMode', true); for (const e of s.entities) s.despawn(e); s.bus.on('transition:started', () => { window.__tStart = performance.now(); }); })()`);
      await w.page.evaluate(RECORDER);
      await w.page.evaluate('window.__troid.teleport(62, 0)');
      await w.page.evaluate('window.__troid.resume()'); // in real time from here
      await w.page.keyboard.down('KeyD'); // …running toward the way out, 26 metres away
      await until('the next room to be brought in early', async () => (await arrivalOf(w.page)).aheadFor === 'r3_chamber');
      await until('its pack to be claimed as an early load', async () => (await stateOf(w.page)).art!.packList.find((p) => p.id === 'ruins-seal')?.ahead === true);
      const early = (await stateOf(w.page)).art!.packList.find((p) => p.id === 'ruins-seal')!;
      assert.equal(early.held, false, 'the pack of R3 is brought in early and is not held: R2 is still the zone');
      const heroX = (await stateOf(w.page)).x;
      assert.ok(heroX < 88, `the way out had not been touched yet (x = ${heroX.toFixed(1)})`);
      await until('the walk to the next room to be over', async () => {
        const s = await stateOf(w.page);
        return s.room === 'r3_chamber' && s.arrival?.blocking === false && s.transition?.phase === 'none';
      }, 60000);
      await w.page.keyboard.up('KeyD');
      await settled(w.page);
      const a = await arrivalOf(w.page);
      const last = a.history[a.history.length - 1]!;
      assert.equal(last.room, 'r3_chamber');
      assert.equal(last.outcome, 'ready');
      assert.equal(last.indicator, false, 'the art was in memory when the way out was touched: no loading indicator, on a line that takes 400 ms for every file');
      const frames = (await (async () => {
        await w.page.evaluate('window.__tlOn = false');
        return w.page.evaluate('window.__tl');
      })()) as Frame[];
      assert.equal(exposed(frames, truth).length, 0, 'not one picture of R3 was seen unfinished');
      assert.equal(await sigOf(w.page), truth['r3_chamber']);
      // the files were asked for BEFORE the way out was touched
      const timing = (await w.page.evaluate(`(() => ({ start: window.__tStart, seal: performance.getEntriesByType('resource').filter((e) => e.name.includes('/ruins-seal/')).map((e) => [e.name.slice(e.name.indexOf('/ruins-seal/')), e.startTime]) }))()`)) as { start: number; seal: Array<[string, number]> };
      assert.ok(timing.seal.length >= 3, `the files of R3's pack were fetched (${timing.seal.length})`);
      assert.ok(timing.seal.every(([, at]) => at < timing.start), `all of them before the way out was touched (${timing.seal.map(([n, at]) => `${n}@${(at - timing.start).toFixed(0)}`).join(', ')} ms from the touch)`);
      assert.equal(new Set(timing.seal.map(([n]) => n)).size, timing.seal.length, 'and none was asked for twice');
      assert.deepEqual(w.errors, []);
      console.log(`  arrival C: ${timing.seal.length} files of R3 asked for ${Math.round((timing.start - Math.max(...timing.seal.map(([, at]) => at))))} ms before the way out was touched; the arrival waited ${last.waited} ms and showed no indicator`);
      await w.close();
    }

    // …and turning away gives it back
    {
      const w = await world(browser, origin, 'room=r2_hall', PHONE);
      await settled(w.page);
      await w.page.evaluate(`(() => { const s = window.__troid.session; window.__troid.game.debug.set('godMode', true); for (const e of s.entities) s.despawn(e); })()`);
      await w.page.evaluate('window.__troid.teleport(62, 0)');
      await w.page.evaluate('window.__troid.resume()');
      await w.page.keyboard.down('KeyD');
      await until('R3 to be brought in early', async () => (await arrivalOf(w.page)).aheadFor === 'r3_chamber');
      await until('its pack to be in memory', async () => ((await stateOf(w.page)).art!.packList.find((p) => p.id === 'ruins-seal')?.sets.length ?? 0) > 0);
      await w.page.keyboard.up('KeyD');
      await w.page.evaluate('window.__troid.teleport(20, 0)'); // far from the way out now (the limit to give it back is 64 m), standing: not walking toward the other one either
      await until('the early pack to be given back', async () => {
        const s = await stateOf(w.page);
        const seal = s.art!.packList.find((p) => p.id === 'ruins-seal')!;
        return s.arrival?.aheadFor === null && seal.ahead === false && seal.sets.length === 0;
      });
      assert.equal((await stateOf(w.page)).art!.packList.find((p) => p.id === 'ruins-roots')!.held, true, 'what R2 needs stayed');
      assert.equal((await stateOf(w.page)).room, 'r2_hall', 'and the hero is still in R2');
      assert.deepEqual(w.errors, []);
      console.log('  arrival C: the hero turned away — the early load of R3 was given back and what R2 needs stayed');
      await w.close();
    }

    // ================================================================================================ D · what fails does not trap the player at the black
    {
      // the art of R2 is refused (a broken deploy)
      const w = await world(browser, origin, '', PHONE);
      await settled(w.page);
      await sess(w.page, 's.flags.set("defeated:r1_slime")');
      w.net.abort = /\/ruins-roots\//;
      await w.page.evaluate('window.__troid.teleport(110, 0)');
      const t0 = Date.now();
      await w.page.evaluate('window.__troid.step(90)');
      const took = Date.now() - t0;
      const s = await stateOf(w.page);
      assert.equal(s.room, 'r2_hall');
      assert.equal(s.arrival?.blocking, false, 'the world was let go');
      assert.equal(s.transition?.phase, 'none');
      assert.ok(took < 15000, `without the art of the room the player waited seconds, not for ever (${took} ms)`);
      const a = await arrivalOf(w.page);
      assert.ok(['ready', 'failed'].includes(a.history[a.history.length - 1]!.outcome ?? ''), `it ended (${a.history[a.history.length - 1]!.outcome})`);
      assert.equal((await stateOf(w.page)).art!.failures > 0, true, 'the library counted what it could not fetch');
      // and the game goes on: the hero can move
      const x0 = s.x;
      await w.page.keyboard.down('KeyD');
      await w.page.evaluate('window.__troid.step(30)');
      await w.page.keyboard.up('KeyD');
      assert.ok((await stateOf(w.page)).x > x0 + 1, 'the hero moves in the room that came without its art');
      await w.page.screenshot({ path: '.shots/e2e/arrival-d-refused.png' });
      // (the browser reports a refused file twice: the request that failed, and the console line without a name)
      assert.deepEqual(w.errors.filter((e) => !/ruins-roots|Failed to load resource: net::ERR_FAILED/.test(e)), [], 'the only complaints are about the files that were refused');
      assert.ok(w.errors.length > 0, 'and the browser did complain about them');
      console.log(`  arrival D: art refused — the world went on after ${took} ms, room built as it could be, hero free`);
      await w.close();
    }
    {
      // the art of R2 never answers: the wait gives up
      const w = await world(browser, origin, `arrival=${1500}`, PHONE);
      await settled(w.page);
      await sess(w.page, 's.flags.set("defeated:r1_slime")');
      w.net.hang = /\/ruins-roots\//;
      await w.page.evaluate('window.__troid.teleport(110, 0)');
      const t0 = Date.now();
      await w.page.evaluate('window.__troid.step(90)');
      const took = Date.now() - t0;
      const a = await arrivalOf(w.page);
      const last = a.history[a.history.length - 1]!;
      assert.equal(last.outcome, 'timeout', 'it gave up');
      assert.ok(last.waited >= 1400 && last.waited < 6000, `after the wait it was told (${last.waited} ms), not before and not long after`);
      assert.equal(a.blocking, false);
      assert.equal(last.indicator, true, 'the indicator told the player the game was waiting, not frozen');
      const s = await stateOf(w.page);
      assert.equal(s.room, 'r2_hall');
      assert.equal(s.transition?.phase, 'none');
      const x0 = s.x;
      await w.page.keyboard.down('KeyD');
      await w.page.evaluate('window.__troid.step(30)');
      await w.page.keyboard.up('KeyD');
      assert.ok((await stateOf(w.page)).x > x0 + 1, 'the hero moves');
      console.log(`  arrival D: art that never answers — gave up after ${last.waited} ms (${took} ms in all), the hero is free`);
      await w.close();
    }

    // ================================================================================================ E · back and forth, quickly, on a slow line
    {
      const w = await world(browser, origin, '', PHONE);
      await settled(w.page);
      await sess(w.page, 's.flags.set("defeated:r1_slime")');
      await w.page.evaluate(`(() => { window.__troid.game.debug.set('godMode', true); })()`);
      await w.page.evaluate(EVENTS);
      w.net.delay = 300;
      await w.page.evaluate(RECORDER);
      const hops: Array<[string, number, string]> = [['r1_gate', 110, 'r2_hall'], ['r2_hall', 1.2, 'r1_gate'], ['r1_gate', 110, 'r2_hall'], ['r2_hall', 89.5, 'r3_chamber'], ['r3_chamber', 1.2, 'r2_hall'], ['r2_hall', 1.2, 'r1_gate']];
      for (const [from, x, to] of hops) {
        assert.equal((await stateOf(w.page)).room, from, `at ${from}`);
        await w.page.evaluate(`window.__troid.teleport(${x}, 0)`);
        await w.page.evaluate('window.__troid.step(40)');
        const now = await stateOf(w.page);
        assert.equal(now.room, to, `${from} → ${to}`);
        assert.equal(now.transition?.phase, 'none', 'and the transition is over');
      }
      await settled(w.page);
      const frames = (await (async () => {
        await w.page.evaluate('window.__tlOn = false');
        return w.page.evaluate('window.__tl');
      })()) as Frame[];
      const bad = exposed(frames, truth);
      assert.equal(bad.length, 0, `not one picture was seen unfinished across six changes of zone (${bad.length}; first ${JSON.stringify(bad[0])})`);
      const ev = (await w.page.evaluate('window.__ev')) as Array<{ type: string }>;
      assert.equal(ev.filter((e) => e.type === 'transition:started').length, 6);
      assert.equal(ev.filter((e) => e.type === 'transition:finished').length, 6);
      assert.equal(ev.filter((e) => e.type === 'transition:cancelled').length, 0);
      assert.equal(await sess(w.page, 'return s.scheduler.pending'), 0, 'no timer is left pending');
      const end = await stateOf(w.page);
      assert.equal(end.arrival?.blocking, false);
      assert.equal(end.arrival?.history.length, 6, 'six arrivals were recorded');
      assert.equal(await sigOf(w.page), truth['r1_gate'], 'the scene is the one of R1 loaded directly: nothing left over from the other rooms, nothing doubled');
      const art = end.art!;
      assert.ok(art.bytes < MEMORY_BUDGET_MIB.zone * MIB, `the art in memory fits the zone budget (${(art.bytes / MIB).toFixed(1)} MiB)`);
      assert.deepEqual(art.packList.filter((p) => p.ahead).map((p) => p.id), [], 'nothing is left brought in early');
      assert.equal(art.failures, 0, 'the library fetched everything it asked for');
      await sess(w.page, 's.loadRoom("r1_gate")');
      await w.page.evaluate('window.__troid.step(2)');
      await settled(w.page);
      assert.equal(end.views, (await stateOf(w.page)).views, 'and the views of the room are the ones of the room loaded directly');
      assert.deepEqual(w.errors, []);
      console.log(`  arrival E: six changes of zone on a slow line — all finished, ${frames.filter((f) => f.veil < 0.98).length} visible frames and not one unfinished, no timer pending, ${(art.bytes / MIB).toFixed(1)} MiB resident`);
      await w.close();
    }

    // ================================================================================================ F · a real, limited bandwidth: the share is the bytes that have arrived
    {
      const w = await world(browser, origin, '', PHONE);
      await settled(w.page);
      await sess(w.page, 's.flags.set("defeated:r1_slime")');
      const cdp = await w.context.newCDPSession(w.page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 120, downloadThroughput: 260 * 1024, uploadThroughput: 260 * 1024 });
      await w.page.evaluate('window.__troid.teleport(110, 0)');
      const stepping = w.page.evaluate('window.__troid.step(90)');
      const shares: number[] = [];
      let label = '';
      let shot = false;
      const t0 = Date.now();
      while ((await arrivalOf(w.page)).blocking || Date.now() - t0 < 600) {
        const a = await arrivalOf(w.page);
        if (a.blocking && a.progress?.fraction !== null && a.progress?.fraction !== undefined) shares.push(a.progress.fraction);
        const text = await w.page.locator('[data-testid="arrival-label"]').textContent().catch(() => null);
        if (a.blocking && a.indicator > 0.9 && /\d\s?%/.test(text ?? '')) {
          label = text ?? '';
          if (!shot && shares.length > 4) {
            shot = true;
            await w.page.screenshot({ path: '.shots/e2e/arrival-f-percent.png' });
          }
        }
        if (Date.now() - t0 > 60000) throw new Error('the bandwidth test never finished');
        await sleep(60);
      }
      await stepping;
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      assert.ok(shares.length >= 3, `the share was measurable while the bytes came (${shares.length} samples)`);
      assert.ok(shares.every((v, i) => v >= 0 && v <= 1 && (i === 0 || v >= shares[i - 1]! - 1e-9)), `the share of the bytes that arrived only grows (${shares.map((v) => v.toFixed(2)).join(' ')})`);
      assert.ok(Math.max(...shares) > 0.3 && Math.min(...shares) < 0.7, `and it passes through the middle of the load (${Math.min(...shares).toFixed(2)} … ${Math.max(...shares).toFixed(2)})`);
      assert.match(label, /\d\s?%/, `the number beside the line is written in percent (${JSON.stringify(label)})`);
      assert.equal(shot, true, 'a picture of the percentage was taken');
      await settled(w.page);
      assert.equal((await stateOf(w.page)).room, 'r2_hall');
      assert.equal(await sigOf(w.page), truth['r2_hall']);
      console.log(`  arrival F: 260 KB/s — ${shares.length} samples of the real share, ${Math.min(...shares).toFixed(2)} → ${Math.max(...shares).toFixed(2)}, last label ${JSON.stringify(label)}`);
      await w.close();
    }

    // ================================================================================================ G · it fits the screen: a phone with a notch, and a desktop
    for (const [label, query, size, safeBottom] of [
      ['phone', 'safe=44,47,21,47&touch=1', { ...PHONE, touch: true }, 21],
      ['desktop', '', DESKTOP, 0],
    ] as const) {
      const w = await world(browser, origin, query, size);
      await settled(w.page);
      await sess(w.page, 's.flags.set("defeated:r1_slime")');
      w.net.delay = 900;
      await w.page.evaluate('window.__troid.teleport(110, 0)');
      const stepping = w.page.evaluate('window.__troid.step(90)');
      await until('the indicator on screen', async () => {
        const a = await arrivalOf(w.page);
        return a.blocking && a.indicator > 0.95;
      });
      const box = (await w.page.locator('[data-testid="arrival-indicator"]').boundingBox())!;
      assert.ok(box.x >= 0 && box.x + box.width <= size.width && box.y >= 0 && box.y + box.height <= size.height - safeBottom, `${label}: the indicator is inside the screen and the safe area (${JSON.stringify(box)})`);
      assert.ok(Math.abs(box.x + box.width / 2 - size.width / 2) < 3, `${label}: centred`);
      assert.ok(box.y > size.height * 0.5, `${label}: low on the screen, out of the way of where the action is`);
      const line = (await w.page.locator('[data-testid="arrival-indicator"] > div').first().boundingBox())!;
      assert.ok(line.width >= 120 && line.width <= 290, `${label}: a hairline of ${line.width.toFixed(0)} px`);
      const pic = decodePng(await w.page.screenshot({ path: `.shots/e2e/arrival-g-${label}.png` }));
      const dark = countPixels(pic, (r, g, b) => r < 14 && g < 14 && b < 14);
      assert.ok(dark > pic.width * pic.height * 0.985, `${label}: the screen stays black around it (${((100 * dark) / (pic.width * pic.height)).toFixed(2)} %)`);
      await stepping;
      await w.close();
    }
    // ================================================================================================ H · a defeat that brings the hero back to another room
    {
      const w = await world(browser, origin, '', PHONE);
      await settled(w.page);
      await sess(w.page, 's.flags.set("defeated:r1_slime")');
      await w.page.evaluate(`(() => { window.__troid.game.debug.set('godMode', false); })()`);
      for (const [x, room] of [[110, 'r2_hall'], [89.5, 'r3_chamber']] as const) {
        await w.page.evaluate(`window.__troid.teleport(${x}, 0)`);
        await w.page.evaluate('window.__troid.step(60)');
        await settled(w.page);
        assert.equal((await stateOf(w.page)).room, room);
      }
      assert.deepEqual((await stateOf(w.page)).respawnPoint, { room: 'r1_gate', entry: 'start' }, 'a defeat in R3 brings the hero back to R1');
      await w.page.evaluate(`(() => { const s = window.__troid.session; for (const e of s.entities) s.despawn(e); })()`);
      await w.page.evaluate(EVENTS);
      w.net.delay = 1200; // (what R1 needs back is one small pack: a line this slow makes the wait long enough for the indicator to come in)
      await w.page.evaluate(RECORDER);
      await sess(w.page, 's.player.health.damage(s.player.health.current - 1);');
      await w.page.evaluate('window.__troid.strikePlayer(1)');
      const stepping = w.page.evaluate('window.__troid.step(260)');
      await until('the world to be held at the defeat screen with the indicator on', async () => {
        const a = await arrivalOf(w.page);
        return a.blocking && a.indicator > 0.95;
      });
      const held = await stateOf(w.page);
      assert.equal(held.room, 'r1_gate', 'the hero is back in R1…');
      assert.notEqual(held.death?.phase, 'none', '…under the defeat screen…');
      const pic = decodePng(await w.page.screenshot({ path: '.shots/e2e/arrival-h-defeat.png' }));
      const lit = countPixels(pic, (r, g, b) => b > 150 && g > 120 && r < 200, { x0: 0, y0: Math.floor(pic.height * 0.7), x1: pic.width, y1: pic.height });
      assert.ok(lit > 20, `…and the hairline of light shows ABOVE the defeat screen (${lit} px of cyan light in its lower third)`);
      await stepping;
      await settled(w.page);
      const frames = (await (async () => {
        await w.page.evaluate('window.__tlOn = false');
        return w.page.evaluate('window.__tl');
      })()) as Frame[];
      const end = await stateOf(w.page);
      assert.equal(end.room, 'r1_gate');
      assert.equal(end.health, end.maxHealth, 'back with full life');
      assert.equal(end.arrival?.blocking, false);
      const last = end.arrival!.history[end.arrival!.history.length - 1]!;
      assert.equal(last.room, 'r1_gate');
      assert.equal(last.outcome, 'ready');
      assert.equal(last.indicator, true);
      assert.equal(exposed(frames, truth).length, 0, 'not one picture of R1 came back unfinished');
      assert.equal(await sigOf(w.page), truth['r1_gate']);
      assert.equal(await sess(w.page, 'return s.scheduler.pending'), 0, 'no timer is left pending');
      assert.deepEqual(w.errors, []);
      console.log(`  arrival H: a defeat in R3 on a slow line — back in R1 after the world was held ${last.waited} ms, indicator above the defeat screen, nothing unfinished seen`);
      await w.close();
    }
    console.log(`  arrival: nothing unfinished ever seen on a slow line, the world held while the art came, the same game on every line · numbers: grace ${ARRIVAL.graceMs} ms, longest wait ${ARRIVAL.maxWaitMs} ms, ${ARRIVAL.warmFrames} frames out of sight`);
  },
};
