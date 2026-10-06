import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { ROOMS } from '@/content';
import { fetchTheFourthBottle } from '../../../tests/helpers/journey';
import { driver } from '../../../tests/helpers/sim';
import { frames } from '../frames';
import { record, replay } from '../replay';
import type { GameState, Scenario } from '../scenario';
import { centreOf, TouchScreen } from '../touch';

/**
 * THE FOURTH BOTTLE in a real browser (docs/PROMPT6-LOG.md S27): it lies on the ledge of R2's high road. The way there — the hops of the
 * road, a jump from under the ledge, Interact — is RECORDED in Node on the pure simulation and REPLAYED through the real keyboard, tick by
 * tick, comparing a digest of the whole simulation (bottles and flags included): the browser plays the same game as the simulation. Then:
 * the pickup is felt (the new vial arrives glowing on the HUD, a light opens where it floated, the object is gone), it is SAVED with the
 * flag that hides it, and it stays taken through a reload, a transition and a defeat — and cannot be taken twice. On touch the icon is the
 * button, and four vials fit with the controls. A new game starts with three again.
 */
const KEY = 'troid.progress';
/** A game saved at R2's entrance, the first guardian beaten, the shrine its checkpoint: the fourth bottle not yet taken. */
const SEED = {
  saveVersion: 1,
  at: { room: 'r2_hall', entry: 'west' },
  checkpoint: { room: 'r2_hall', entry: 'rest' },
  flags: ['defeated:r1_slime'],
  abilities: ['dash'],
  cards: { owned: [] as string[], equipped: null },
  bottleSlots: 3,
};
const FLAG = 'taken:bottle_fourth';

const stored = (page: Page): Promise<{ at: { room: string; entry: string }; checkpoint: { room: string; entry: string }; flags: string[]; bottleSlots: number } | null> =>
  page.evaluate(`(() => { const t = localStorage.getItem(${JSON.stringify(KEY)}); return t === null ? null : JSON.parse(t); })()`) as never;

const vials = (page: Page): Promise<Array<{ state: string | undefined; gain: string | undefined }>> =>
  page.locator('[data-testid^="hud-bottle-"]').evaluateAll((els) => els.map((e) => ({ state: (e as HTMLElement).dataset['state'], gain: (e as HTMLElement).dataset['gain'] })));

/** The interaction icon is DOM and follows the camera frame by frame: wait for frames, then read what it shows. */
async function icon(page: Page): Promise<{ active: boolean; object: string | null; kind: string | null; label: string | null }> {
  await frames(page, 6);
  const at = (name: string): Promise<string | null> => page.locator('[data-testid="prompt-hit"]').getAttribute(name);
  return { active: (await at('data-active')) === '1', object: await at('data-object'), kind: await at('data-kind'), label: await at('aria-label') };
}

export const bottle4: Scenario = {
  name: 'bottle4',
  async run(ctx) {
    const size = { width: 844, height: 390, dpr: 1 };
    const sess = (code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
    const reload = async (): Promise<void> => {
      await ctx.page.reload();
      await ctx.page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
      await ctx.page.waitForFunction('window.__troid.effectsReady()', undefined, { timeout: 30000 });
      await ctx.page.waitForTimeout(150);
    };
    const seed = async (): Promise<void> => {
      await ctx.page.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(SEED))})`);
      await reload();
    };
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };
    const press = async (code: string, ticks = 1): Promise<void> => {
      await ctx.page.keyboard.down(code);
      await ctx.step(ticks);
      await ctx.page.keyboard.up(code);
    };
    const toTheLedge = async (): Promise<void> => {
      await ctx.teleport(49.5, 4.8);
      await ctx.step(5);
    };

    // ================================================================================================ the start: the saved game, three bottles, nothing taken
    await ctx.open('paused=1', size); // paused from the first frame: the replay below starts at tick 0
    await seed();
    let s = await state();
    assert.equal(s.room, 'r2_hall');
    assert.equal(s.now, 0, 'not one tick has run: the replay starts from tick 0');
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready']);
    assert.ok(!s.flags!.includes(FLAG));
    assert.equal((await vials(ctx.page)).length, 3, 'three vials on the HUD');

    // ================================================================================================ the way to it, recorded in Node and replayed by the keyboard
    const d = driver({ room: ROOMS.r2_hall!, entry: 'west', unlocked: ['dash'], seed: 1, extra: { rooms: ROOMS, flags: [...SEED.flags], checkpoint: { ...SEED.checkpoint } } });
    const journey = record(d, () => fetchTheFourthBottle(d));
    assert.equal(d.session.bottles.slots.length, 4, 'in the simulation the route ends with four bottles');
    console.log(`  recorded in Node: ${journey.total} ticks (${journey.runs.length} key changes) to the ledge and the bottle`);

    await ctx.page.evaluate(`(() => {
      window.__gain = { seen: false, vials: 0 };
      const row = document.querySelector('[data-testid="hud-bottles"]');
      const check = () => {
        const v = document.querySelector('[data-testid="hud-bottle-3"]');
        if (v && v.dataset.gain === '1') window.__gain.seen = true;
        window.__gain.vials = Math.max(window.__gain.vials, document.querySelectorAll('[data-testid^="hud-bottle-"]').length);
      };
      new MutationObserver(check).observe(row, { attributes: true, childList: true, subtree: true });
    })()`);
    const spawnedBefore = (await state()).vfx!.spawned;
    let highest = 0;
    await replay(ctx, journey, {
      chunk: 4,
      observe: async (st) => {
        worst = Math.max(worst, st.drawsMax ?? 0);
        highest = Math.max(highest, st.y);
      },
    });
    s = await state();
    assert.equal(s.room, 'r2_hall');
    assert.ok(highest > 4.7, `the hero climbed to the ledge (highest ${highest.toFixed(2)} m)`);
    assert.ok(Math.abs(s.y - 4.8) < 0.05 && s.x > 48 && s.x < 51, `and stands on it (${s.x.toFixed(2)}, ${s.y.toFixed(2)})`);
    assert.equal(s.health, s.maxHealth, 'nothing hurt the hero on the way');

    // ================================================================================================ taken: felt, shown, saved
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready', 'ready'], 'four bottles, all full');
    assert.ok(s.flags!.includes(FLAG), 'the flag that hides the pickup');
    await frames(ctx.page, 6);
    const gain = (await ctx.page.evaluate('window.__gain')) as { seen: boolean; vials: number };
    assert.equal(gain.vials, 4, 'the HUD grew to four vials');
    assert.ok(gain.seen, 'the new vial arrived glowing');
    assert.ok((await state()).vfx!.spawned > spawnedBefore, 'a light opened where the bottle floated');
    assert.deepEqual((await vials(ctx.page)).map((v) => v.state), ['ready', 'ready', 'ready', 'ready']);
    await ctx.shot('a-01-the-ledge-with-four-vials');
    await frames(ctx.page, 90);
    assert.deepEqual((await vials(ctx.page)).map((v) => v.gain), ['0', '0', '0', '0'], 'the glow settles');
    let i = await icon(ctx.page);
    assert.equal(i.active, false, 'the icon went with the object: there is nothing left to take');
    await press('KeyE', 14); // …and pressing Interact again does nothing
    s = await state();
    assert.equal(s.state, 'free', 'no pose for an object that is not there');
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready', 'ready'], 'a second press gives nothing');
    await ctx.page.waitForTimeout(80);
    let p = await stored(ctx.page);
    assert.ok(p, 'saved');
    assert.equal(p.bottleSlots, 4, 'the four slots…');
    assert.ok(p.flags.includes(FLAG) && p.flags.includes('defeated:r1_slime'), '…and the flag, in the same save');
    assert.deepEqual(p.checkpoint, { room: 'r2_hall', entry: 'rest' });

    // ================================================================================================ a reload: still four, still taken, and the ledge is empty
    await reload();
    s = await state();
    assert.equal(s.room, 'r2_hall');
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready', 'ready'], 'the loaded game has four bottles');
    assert.ok(s.flags!.includes(FLAG));
    assert.equal((await vials(ctx.page)).length, 4);
    assert.deepEqual((await vials(ctx.page)).map((v) => v.gain), ['0', '0', '0', '0'], 'a game that LOADS with four does not announce the fourth');
    await toTheLedge();
    i = await icon(ctx.page);
    assert.equal(i.active, false, 'nothing lies on the ledge any more');
    await press('KeyE', 14);
    s = await state();
    assert.equal(s.state, 'free');
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready', 'ready'], 'taking it again gives nothing');
    await ctx.shot('a-02-after-the-reload');

    // ================================================================================================ a transition away and back
    await ctx.teleport(90, 0);
    await ctx.step(40);
    s = await state();
    assert.equal(s.room, 'r3_chamber');
    assert.equal(s.bottles!.length, 4, 'in the next room');
    await ctx.teleport(1.2, 0);
    await ctx.step(40);
    s = await state();
    assert.equal(s.room, 'r2_hall');
    assert.equal(s.bottles!.length, 4, 'and back');
    await toTheLedge();
    assert.equal((await icon(ctx.page)).active, false, 'the ledge is still empty');

    // ================================================================================================ a defeat: back at the shrine, four bottles, nothing on the ledge
    await sess('s.bottles.consume(0);'); // (a defeat does not refill: the one drunk stays empty)
    await sess('s.player.health.damage(s.player.health.current - 1);');
    await ctx.page.evaluate('window.__troid.strikePlayer(1)');
    await ctx.step(2);
    assert.notEqual((await state()).death?.phase, 'none', 'the hero fell');
    for (let k = 0; k < 400 && (await state()).death?.phase !== 'none'; k++) await ctx.step(2);
    await ctx.step(10);
    s = await state();
    assert.equal(s.room, 'r2_hall');
    assert.ok(Math.abs(s.x - 12.8) < 0.3, `at the shrine (x = ${s.x})`);
    assert.equal(s.bottles!.length, 4, 'a defeat takes no bottle away');
    assert.deepEqual(s.bottles, ['recharging', 'ready', 'ready', 'ready'], 'and gives none back');
    assert.ok(s.flags!.includes(FLAG));
    await toTheLedge();
    assert.equal((await icon(ctx.page)).active, false, 'still taken');
    await ctx.page.waitForTimeout(80);
    p = await stored(ctx.page);
    assert.equal(p!.bottleSlots, 4);

    // ================================================================================================ on touch: the icon is the button, and four vials fit with the controls
    await ctx.open('paused=1&touch=1', { width: 844, height: 390, dpr: 1, touch: true });
    await seed();
    await ctx.teleport(49.5, 2.4); // on the platform under the ledge: nothing in reach
    await ctx.step(5);
    assert.equal((await icon(ctx.page)).active, false, 'from the platform below the icon is not there');
    await toTheLedge();
    i = await icon(ctx.page);
    assert.equal(i.active, true, 'on the ledge the bottle has the icon');
    assert.equal(i.object, 'bottle_fourth');
    assert.equal(i.kind, 'pickup');
    assert.equal(i.label, { es: 'Recoger', en: 'Pick up' }[(await state()).lang as 'es' | 'en'], 'its verb, in the language of the player');
    const tc = await centreOf(ctx.page, 'prompt-hit');
    assert.ok(tc.w >= 44 && tc.h >= 44, `a finger-sized target (${tc.w}×${tc.h})`);
    const screen = await new TouchScreen(ctx.page).init();
    await screen.tap(1, tc.x, tc.y);
    await ctx.step(1);
    s = await state();
    assert.equal(s.state, 'interact', 'a tap on the icon takes it');
    assert.equal(s.device, 'touch');
    await ctx.step(14);
    s = await state();
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready', 'ready']);
    await frames(ctx.page, 8);
    // four vials, all on screen and none under a BUTTON of the touch layer (its movement zone is the whole left half: the HUD floats over it)
    const boxes = (await ctx.page.evaluate(`(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return { id: e.dataset.testid, x0: b.left, y0: b.top, x1: b.right, y1: b.bottom, shown: getComputedStyle(e).display !== 'none' }; };
      return { vials: [...document.querySelectorAll('[data-testid^="hud-bottle-"]')].map(r), controls: [...document.querySelectorAll('[data-testid^="touch-"]')].filter((e) => !['touch-layer', 'touch-zone'].includes(e.dataset.testid)).map(r).filter((b) => b.shown && b.x1 > b.x0 && b.y1 > b.y0) };
    })()`)) as { vials: Array<{ id: string; x0: number; y0: number; x1: number; y1: number }>; controls: Array<{ id: string; x0: number; y0: number; x1: number; y1: number }> };
    assert.equal(boxes.vials.length, 4);
    for (const v of boxes.vials) {
      assert.ok(v.x0 >= 0 && v.y0 >= 0 && v.x1 <= 844 && v.y1 <= 390, `${v.id} is on screen`);
      for (const c of boxes.controls) assert.ok(v.x1 <= c.x0 || v.x0 >= c.x1 || v.y1 <= c.y0 || v.y0 >= c.y1, `${v.id} does not sit under ${c.id}`);
    }
    await ctx.shot('b-01-touch-four-vials');

    // ================================================================================================ a new game starts with three again
    await ctx.open('new=1', size);
    s = await state();
    assert.equal(s.room, 'r1_gate');
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready']);
    assert.ok(!s.flags!.includes(FLAG));
    assert.equal((await vials(ctx.page)).length, 3);
    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    console.log(`  bottle4: recorded route replayed bit for bit · the new vial glows · saved with its flag · kept through a reload, a transition and a defeat · taken once · touch tap · worst ${worst} draw calls (budget 60)`);
  },
};
