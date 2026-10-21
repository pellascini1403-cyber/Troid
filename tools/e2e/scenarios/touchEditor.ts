import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../../assets/png';
import { TOUCH_ART_DIR, TOUCH_ART_ORIGINALS } from '../../../tests/helpers/touchArt';
import { computeTouchLayout, touchFrame, type ButtonPlacements, type TouchLayout } from '@/ui/touch/layout';
import { frames } from '../frames';
import type { Ctx, Scenario } from '../scenario';
import { centreOf, TouchScreen } from '../touch';

/**
 * THE TOUCH BUTTONS WITH THE ARTIST'S PNGs, AND THE EDITOR THAT MOVES THEM (docs/PROMPT15-LOG.md) — in the real page, with real fingers (DevTools touch events: several at once):
 *
 *  A · the art: the page loads exactly three PNG files for the three buttons, and they are the originals — the bytes the browser gets are the ones that were delivered (SHA-256), the pixels it decodes
 *      are the file's own, and what is put on them is a scale and nothing else (no filter, no blend, no transform, no recolouring). A desktop never downloads them;
 *  B · the design: on the reference screen (844 × 390) Dash, Attack and Magic are where the reference puts them, the size it gives them, in the arrangement it has;
 *  C · each button does what it says, through the game's own rules: Attack attacks, Dash dashes (and rests for its cooldown, and the button says so), Magic casts the Spirit Bolt for its cost and rests for
 *      its cooldown, and does not cast without the magic; a button the hero cannot use is not there; four fingers at once press all three and run;
 *  D · opening the pause menu or its settings with a finger on a button does not press anything: the buttons let go, a tap on the menu does not reach them, and nothing fires when the game is back;
 *  E · the editor: from Settings → Controls → Edit layout; the real layer steps aside; a finger on a button MOVES it (nothing is pressed); a button stops at the HUD, the pause button, the boss's bar, the other
 *      buttons and the edge of the screen; the size of one; the other hand; back to the design; Cancel and Escape keep nothing; Save keeps the places — and the buttons then act where they are now;
 *  F · the places survive: a reload, a change of zone and another saved game (the settings are the player's, not the game's), and the buttons keep working;
 *  G · a phone with a notch (`?safe=`): a button taken to any corner stops inside the safe area, what is saved is a fraction of it, and after a reload and in another window the places are laid out again
 *      against what that window has — never off it, never one on another, and back in the first window they are where they were;
 *  H · a desktop is untouched: no touch section, no files downloaded, the keyboard plays.
 */
const QUERY = 'room=movement_test&unlock=dash&touch=1';
const SIZE = { width: 844, height: 390, dpr: 2, touch: true };
const KEY = 'troid.settings';
const TOUCH_IDS = ['attack', 'dash', 'ability'] as const;
type Id = (typeof TOUCH_IDS)[number];

const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);
const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
const hooks = async (page: Page): Promise<{ visible: boolean; active: number; layout: TouchLayout }> => (await page.evaluate('window.__troid.touch()')) as { visible: boolean; active: number; layout: TouchLayout };
const held = (page: Page, action: string): Promise<boolean> => page.evaluate(`window.__troid.input.isHeld(${JSON.stringify(action)})`) as Promise<boolean>;
const saved = async (page: Page): Promise<Record<string, any> | null> => {
  const raw = (await page.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`)) as string | null;
  return raw === null ? null : (JSON.parse(raw) as Record<string, any>);
};
async function savedWhere(page: Page, ok: (s: Record<string, any>) => boolean, what: string): Promise<Record<string, any>> {
  let last: Record<string, any> | null = null;
  for (let i = 0; i < 60; i++) {
    last = await saved(page);
    if (last && ok(last)) return last;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what} (saved: ${JSON.stringify(last)})`);
}
/** The box of an element, its centre and its size, in CSS px of the page. */
const box = async (page: Page, id: string): Promise<{ cx: number; cy: number; w: number; h: number; x: number; y: number }> => {
  const b = await q(page, id).boundingBox();
  assert.ok(b, `${id} is on screen`);
  return { cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height, x: b.x, y: b.y };
};
/** What is SEEN of a button: its picture's box (the plate), not its touch area. */
const plate = async (page: Page, id: string): Promise<{ cx: number; cy: number; w: number; h: number }> => {
  const b = await q(page, id).locator('img').evaluate((img) => {
    const r = (img.parentElement as HTMLElement).getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h };
};
/** How faint the button has been told to be (what it eases to: a frame is slow in software GL, and the computed value is mid-way for a few of them). */
const faceOpacity = (page: Page, id: string): Promise<string> => q(page, id).evaluate((e) => (e.firstElementChild as HTMLElement).style.opacity);
const shown = (page: Page, id: string): Promise<boolean> => q(page, id).evaluate((e) => getComputedStyle(e).display !== 'none');
const setRange = (page: Page, id: string, value: number): Promise<void> =>
  q(page, id).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** The page after a reload (or one the game reloaded itself): wait for the game and its cosmetic chunks, and stop its clock, as `ctx.open` does. */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
  await page.waitForFunction('window.__troid.effectsReady()', undefined, { timeout: 30000 });
  await page.evaluate('window.__troid.pause()');
  await page.waitForTimeout(150);
}
const menuIs = (page: Page, open: boolean): Promise<unknown> => page.waitForSelector(`[data-testid="pause-menu"][data-open="${open ? '1' : '0'}"]`, { state: 'attached', timeout: 15000 });

export const touchEditor: Scenario = {
  name: 'touchEditor',
  async run(ctx) {
    // ================================================================================================ A · the art: three files, and they are the originals
    const requests: string[] = [];
    await ctx.open(QUERY, { ...SIZE, prepare: async (context) => void context.on('request', (r) => requests.push(r.url())) });
    let { page } = ctx;
    let screen = await new TouchScreen(page).init();
    await ctx.step(20);
    const files = [...new Set(requests.filter((u) => /touch-(attack|dash|magic)[^/?]*\.png$/.test(u)))];
    assert.equal(files.length, 3, `the page asked for exactly the three PNGs of the buttons (${files.join(', ')})`);
    for (const name of ['attack', 'dash', 'magic']) assert.equal(files.filter((u) => u.includes(`touch-${name}`)).length, 1, `${name}: once`);

    // the browser's own copy of every file: the bytes it was served, and the pixels it decoded
    const sampleStep = 40;
    const decoded = (await page.evaluate(
      `(async () => {
        const out = {};
        for (const id of ${JSON.stringify(TOUCH_IDS)}) {
          const img = document.querySelector('[data-testid="touch-' + id + '"] img');
          if (!img.complete) await img.decode();
          const bytes = await (await fetch(img.currentSrc)).arrayBuffer();
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const g = canvas.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          const px = [];
          for (let y = 0; y < canvas.height; y += ${sampleStep}) for (let x = 0; x < canvas.width; x += ${sampleStep}) px.push(...g.getImageData(x, y, 1, 1).data);
          const cs = getComputedStyle(img);
          const face = getComputedStyle(img.parentElement);
          out[id] = {
            sha256: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''), bytes: bytes.byteLength, w: img.naturalWidth, h: img.naturalHeight, px,
            filter: cs.filter, blend: cs.mixBlendMode, transform: cs.transform, opacity: cs.opacity, imageRendering: cs.imageRendering, fit: cs.objectFit, mask: cs.maskImage, clip: cs.clipPath, bg: cs.backgroundImage,
            faceFilter: face.filter, faceBlend: face.mixBlendMode, faceClip: face.clipPath, faceMask: face.maskImage, faceBg: face.backgroundImage, ratio: parseFloat(cs.width) / parseFloat(cs.height),
          };
        }
        return out;
      })()`,
    )) as Record<Id, { sha256: string; bytes: number; w: number; h: number; px: number[]; filter: string; blend: string; transform: string; opacity: string; imageRendering: string; fit: string; mask: string; clip: string; bg: string; faceFilter: string; faceBlend: string; faceClip: string; faceMask: string; faceBg: string; ratio: number }>;
    for (const id of TOUCH_IDS) {
      const want = TOUCH_ART_ORIGINALS[id];
      const got = decoded[id];
      assert.equal(got.sha256, want.sha256, `${id}: the bytes the browser gets are the original file's (${want.file})`);
      assert.equal(got.bytes, want.bytes, `${id}: and as many`);
      assert.deepEqual([got.w, got.h], [2560, 1440], `${id}: a 2560 × 1440 picture`);
      // …and the pixels the page holds are the file's: sampled on a grid, against the same file decoded here
      const original = decodePng(readFileSync(fileURLToPath(new URL(`../../../${TOUCH_ART_DIR}/${want.file}`, import.meta.url)))) as { width: number; data: Uint8Array };
      let mismatches = 0;
      let k = 0;
      for (let y = 0; y < 1440; y += sampleStep) {
        for (let x = 0; x < 2560; x += sampleStep) {
          for (let c = 0; c < 4; c++) {
            const o = original.data[(y * original.width + x) * 4 + c] as number;
            // (a canvas keeps a pixel premultiplied: where the pixel is clear its colour is gone, and only its alpha is compared)
            if ((c === 3 || (original.data[(y * original.width + x) * 4 + 3] as number) > 0) && Math.abs((got.px[k] as number) - o) > 1) mismatches++;
            k++;
          }
        }
      }
      assert.equal(mismatches, 0, `${id}: ${k / 4} sampled pixels of the picture in the page are the file's own`);
      // what is done to what is seen: nothing but scale and position
      assert.deepEqual([got.filter, got.blend, got.transform, got.opacity, got.fit, got.mask, got.clip, got.bg], ['none', 'normal', 'none', '1', 'fill', 'none', 'none', 'none'], `${id}: the picture has no filter, blend, transform, mask, clip or background`);
      assert.deepEqual([got.faceFilter, got.faceBlend, got.faceClip, got.faceMask, got.faceBg], ['none', 'normal', 'none', 'none', 'none'], `${id}: nor has its box`);
      assert.ok(Math.abs(got.ratio - 2560 / 1440) < 1e-3, `${id}: shown in proportion (${got.ratio})`);
    }
    assert.equal(await q(page, 'touch-attack').locator('svg, canvas').count(), 0, 'the buttons are not drawn by code');

    // ================================================================================================ B · the design: where the reference puts them, as big, in the same arrangement
    // a button the hero cannot use is not there: with no card equipped there is no Magic button (and no bottle to drink, no chip)
    assert.equal(await shown(page, 'touch-ability'), false, 'no card: no Magic button');
    assert.equal(await shown(page, 'touch-chip'), false, 'no bottle to drink: no chip');
    assert.equal(await shown(page, 'touch-dash') && (await shown(page, 'touch-attack')), true, 'Attack and Dash, which the hero has from the start, are there');
    await sess(page, 's.loadout.acquire("card_spirit_bolt");');
    await ctx.step(3);
    await frames(page, 4);
    assert.equal(await shown(page, 'touch-ability'), true, 'with a card equipped the Magic button is there');
    const design = (await hooks(page)).layout;
    const at = {
      attack: await plate(page, 'touch-attack'),
      dash: await plate(page, 'touch-dash'),
      ability: await plate(page, 'touch-ability'),
    };
    // the numbers measured on the reference screen (image 4): centres, and the height of each plate
    const reference = { attack: [781, 293, 68], dash: [683, 329, 68], ability: [721.5, 284, 30] } as const;
    for (const id of TOUCH_IDS) {
      const [rx, ry, rh] = reference[id];
      assert.ok(Math.hypot(at[id].cx - rx, at[id].cy - ry) < 1.2, `${id}: its centre is where the reference puts it (${at[id].cx.toFixed(1)}, ${at[id].cy.toFixed(1)}) vs (${rx}, ${ry})`);
      assert.ok(Math.abs(at[id].h - rh) < 1.2, `${id}: as tall as the reference (${at[id].h.toFixed(1)} vs ${rh})`);
    }
    assert.ok(at.dash.cx < at.ability.cx && at.ability.cx < at.attack.cx, 'left to right: Dash, Magic, Attack');
    assert.ok(at.ability.cy < at.attack.cy && at.attack.cy < at.dash.cy, 'top to bottom: Magic, Attack, Dash');
    assert.equal(design.side, 'right');
    await ctx.shot('01-design');

    // ================================================================================================ C · each button does what it says
    const state = (): ReturnType<Ctx['state']> => ctx.state();
    const press = async (id: Id, ticks: number, finger = 1): Promise<void> => {
      const c = await centreOf(page, `touch-${id}`);
      await screen.touch(finger, c.x, c.y);
      await ctx.step(ticks);
    };
    await ctx.teleport(95, 0);
    await ctx.step(30);
    // Attack: the game's own attack (its animation, its combo)
    await press('attack', 4);
    let s = await state();
    assert.equal(s.state, 'attack', 'a finger on Attack attacks');
    assert.ok(s.combat?.attack !== null, 'with the attack of the game');
    assert.equal(await held(page, 'attack'), true, 'and holds the action while the finger is down');
    assert.equal((await hooks(page)).active, 1);
    await frames(page, 4); // (the pressed look eases in over a few frames)
    assert.equal(await q(page, 'touch-attack').locator('img').evaluate((i) => getComputedStyle(i.parentElement as HTMLElement).transform), 'matrix(0.93, 0, 0, 0.93, 0, 0)', 'the button looks pressed: a little smaller, the picture untouched');
    await screen.lift(1);
    assert.equal(await held(page, 'attack'), false, 'and lets go when it lifts');
    await ctx.step(60);

    // Dash: its conditions, duration and cooldown are the player's own (the button only presses the action)
    await ctx.teleport(95, 0);
    await ctx.step(20);
    await press('dash', 3);
    s = await state();
    assert.equal(s.state, 'dash', 'a finger on Dash dashes');
    const x0 = s.x;
    await screen.lift(1);
    await ctx.step(14);
    s = await state();
    assert.ok(s.x > x0 + 1.5, `and goes forward (${x0.toFixed(2)} → ${s.x.toFixed(2)})`);
    await frames(page, 3);
    assert.equal(await faceOpacity(page, 'touch-dash'), '0.45', 'while it recharges the button is faint');
    await press('dash', 3);
    s = await state();
    assert.notEqual(s.state, 'dash', 'and pressing it then does not dash: the cooldown is the game\'s');
    await screen.lift(1);
    await ctx.step(40);
    await frames(page, 3);
    assert.equal(await faceOpacity(page, 'touch-dash'), '1', 'recharged: the button is whole again');
    await press('dash', 3);
    s = await state();
    assert.equal(s.state, 'dash', 'and dashes again');
    await screen.lift(1);
    await ctx.step(50);

    // Magic: the Spirit Bolt, for its cost, with its cooldown; not without the magic
    await ctx.teleport(95, 0);
    await ctx.step(30);
    const before = (await state()).magic ?? 0;
    await press('ability', 3);
    s = await state();
    assert.equal(s.state, 'cast', 'a finger on Magic casts the Spirit Bolt');
    await screen.lift(1);
    await ctx.step(24);
    s = await state();
    assert.ok((s.projectiles?.length ?? 0) > 0 || (s.magic ?? 0) < before, 'a bolt leaves');
    assert.ok(before - (s.magic ?? 0) >= 29, `and costs its 30 (${before} → ${s.magic})`);
    await ctx.step(40);
    await sess(page, 's.magic.set(10);'); // less than a cast costs
    await ctx.step(1);
    await frames(page, 3);
    assert.equal(await faceOpacity(page, 'touch-ability'), '0.45', 'without the magic for it the button is faint');
    const poor = (await state()).magic ?? 0;
    await press('ability', 4);
    s = await state();
    assert.notEqual(s.state, 'cast', 'and does not cast');
    assert.ok((s.magic ?? 0) <= poor + 0.5, 'and spends nothing');
    await screen.lift(1);
    await sess(page, 's.magic.restore();');
    await ctx.step(40);
    await frames(page, 3);
    assert.equal(await faceOpacity(page, 'touch-ability'), '1', 'with the magic back, and the cooldown over, the button is whole again');

    // four fingers at once: one runs, and Attack, Dash and Magic are pressed together
    await ctx.teleport(90, 0);
    await ctx.step(30);
    const zone = (await hooks(page)).layout.zone;
    await screen.touch(1, zone.x + zone.w * 0.4, 300);
    await screen.drag(1, 70, 0, 4, 8);
    await ctx.step(10);
    for (const [i, id] of TOUCH_IDS.entries()) {
      const c = await centreOf(page, `touch-${id}`);
      await screen.touch(2 + i, c.x, c.y);
    }
    await ctx.step(2);
    assert.equal((await hooks(page)).active, 4, 'four fingers, four owners');
    for (const a of ['attack', 'dash', 'ability']) assert.equal(await held(page, a), true, `${a} is held`);
    s = await state();
    assert.ok(s.vx > 5, `and the hero is still running (${s.vx})`);
    for (const f of [2, 3, 4]) await screen.lift(f);
    assert.equal(await held(page, 'attack') || (await held(page, 'dash')) || (await held(page, 'ability')), false, 'lifting them lets go of all three');
    await screen.lift(1);
    await ctx.step(50);
    assert.equal((await hooks(page)).active, 0);
    await ctx.shot('02-after-the-fingers');

    // ================================================================================================ D · opening the menu with a finger on a button presses nothing
    await sess(page, 'window.__ev = []; for (const t of ["player:attacked", "player:dashed", "skill:cast"]) s.bus.on(t, () => window.__ev.push(t));');
    const events = (): Promise<string[]> => page.evaluate('window.__ev') as Promise<string[]>;
    await ctx.teleport(90, 0);
    await ctx.step(40);
    const attackAt = await centreOf(page, 'touch-attack');
    await screen.touch(1, attackAt.x, attackAt.y);
    await ctx.step(3);
    assert.equal(await held(page, 'attack'), true, 'a finger holds Attack');
    assert.deepEqual(await events(), ['player:attacked'], 'and the hero attacked once');
    const pauseAt = await centreOf(page, 'pause-button');
    await screen.tap(2, pauseAt.x, pauseAt.y); // …and a second finger presses Pause
    await menuIs(page, true);
    assert.equal((await hooks(page)).active, 0, 'the menu is up: no finger owns a button any more');
    assert.equal(await held(page, 'attack'), false, 'and Attack is not held');
    await screen.lift(1);
    await screen.tap(3, attackAt.x, attackAt.y); // a tap on the spot of the Attack button, over the menu
    assert.equal((await hooks(page)).active, 0, 'a finger over the menu where a button lies owns nothing');
    assert.equal(await held(page, 'attack'), false);
    await q(page, 'pause-resume').click();
    await menuIs(page, false);
    await ctx.step(80); // the attack that was on its way ends, and anything pressed by mistake would show
    assert.deepEqual(await events(), ['player:attacked'], 'back in the game nothing more was pressed: not one attack, dash or cast');
    s = await state();
    assert.ok(s.state !== 'attack' && s.state !== 'dash' && s.state !== 'cast', `and the hero is free (${s.state})`);
    // the same through the settings: a finger on Dash, the menu, Controls, and back
    await ctx.teleport(90, 0);
    await ctx.step(40);
    const dashAt = await centreOf(page, 'touch-dash');
    await screen.touch(1, dashAt.x, dashAt.y);
    await ctx.step(3);
    assert.deepEqual(await events(), ['player:attacked', 'player:dashed'], 'Dash dashed once');
    await q(page, 'pause-button').click();
    await menuIs(page, true);
    await q(page, 'pause-controls').click();
    await page.waitForSelector('[data-testid="controls-screen"][data-open="1"]', { timeout: 15000 });
    assert.equal(await held(page, 'dash'), false, 'in the settings Dash is not held either');
    await screen.lift(1);
    await q(page, 'controls-back').click();
    await q(page, 'pause-resume').click();
    await menuIs(page, false);
    await ctx.step(80);
    assert.deepEqual(await events(), ['player:attacked', 'player:dashed'], 'and nothing fires when the game is back');

    // ================================================================================================ E · the editor
    const openEditor = async (): Promise<void> => {
      await q(page, 'pause-button').click();
      await menuIs(page, true);
      await q(page, 'pause-controls').click();
      await page.waitForSelector('[data-testid="controls-screen"][data-open="1"]', { timeout: 15000 });
      await q(page, 'settings-touch-edit').scrollIntoViewIfNeeded();
      await q(page, 'settings-touch-edit').click();
      await page.waitForSelector('[data-testid="touch-editor"][data-open="1"]', { timeout: 15000 });
      await frames(page, 3);
    };
    const editorBox = (id: Id): ReturnType<typeof box> => box(page, `touch-editor-${id}`);
    const frame = touchFrame(844, 390);
    const nothingPressed = async (what: string): Promise<void> => {
      assert.equal((await hooks(page)).active, 0, `${what}: no finger owns a button of the game`);
      for (const a of ['attack', 'dash', 'ability']) assert.equal(await held(page, a), false, `${what}: ${a} is not held`);
    };
    const reaches = (b: { cx: number; cy: number; w: number }, r: { x0: number; y0: number; x1: number; y1: number }): boolean => {
      const nx = Math.max(r.x0, Math.min(b.cx, r.x1));
      const ny = Math.max(r.y0, Math.min(b.cy, r.y1));
      return Math.hypot(b.cx - nx, b.cy - ny) < b.w / 2 - 0.5;
    };
    await openEditor();
    assert.equal(await q(page, 'pause-menu').evaluate((e) => getComputedStyle(e).display), 'none', 'the menu steps aside');
    assert.equal(await q(page, 'touch-layer').evaluate((e) => getComputedStyle(e).visibility), 'hidden', 'and so does the touch layer of the game: its buttons are the editor\'s now');
    assert.equal((await state()).menuOpen, true, 'the game is still stopped');
    for (const id of TOUCH_IDS) assert.equal(await q(page, `touch-editor-${id}`).locator('img').count(), 1, `${id} is the artist's picture in the editor too`);
    const imgSrcs = await page.locator('[data-testid^="touch-editor-"] img').evaluateAll((l) => l.map((i) => (i as HTMLImageElement).currentSrc));
    assert.deepEqual([...new Set(imgSrcs)].sort(), [...new Set(files)].sort(), 'the very same three files');
    for (const id of TOUCH_IDS) {
      const e = await editorBox(id);
      const d = design[id];
      assert.ok(Math.hypot(e.cx - d.cx, e.cy - d.cy) < 1, `${id}: the editor starts where the game has the button`);
    }
    await ctx.shot('03-editor');
    // a finger on a button of the editor MOVES it: nothing of the game is pressed, not for a moment
    const a0 = await editorBox('attack');
    await screen.touch(1, a0.cx, a0.cy);
    await nothingPressed('down');
    await screen.drag(1, -420, 0, 6, 16);
    await nothingPressed('dragging');
    await screen.drag(1, 0, -60, 3, 16);
    await screen.lift(1);
    await frames(page, 2);
    await nothingPressed('lifted');
    const moved = await editorBox('attack');
    assert.ok(Math.hypot(moved.cx - (a0.cx - 420), moved.cy - (a0.cy - 60)) < 3, `Attack went where the finger took it (${a0.cx.toFixed(0)}, ${a0.cy.toFixed(0)}) → (${moved.cx.toFixed(0)}, ${moved.cy.toFixed(0)})`);
    assert.equal(await q(page, 'touch-editor').getAttribute('data-open'), '1');
    // a finger on the old place of Attack (now empty): the editor's backdrop, nothing of the game
    await screen.touch(2, a0.cx, a0.cy);
    await screen.drag(2, -50, 0, 3, 16);
    await nothingPressed('over the old place');
    await screen.lift(2);

    // it stops against the HUD, the pause button, the boss's bar, the other buttons and the edge of the screen
    const dragTo = async (id: Id, x: number, y: number): Promise<void> => {
      const b = await editorBox(id);
      await screen.touch(1, b.cx, b.cy);
      await screen.drag(1, x - b.cx, y - b.cy, 8, 16);
      await screen.lift(1);
      await frames(page, 2);
    };
    await dragTo('attack', (frame.hud.x0 + frame.hud.x1) / 2, (frame.hud.y0 + frame.hud.y1) / 2);
    let e = await editorBox('attack');
    assert.ok(!reaches(e, frame.hud), `taken to the middle of the HUD, Attack stops outside it (${e.cx.toFixed(0)}, ${e.cy.toFixed(0)})`);
    await dragTo('attack', (frame.pause.x0 + frame.pause.x1) / 2, (frame.pause.y0 + frame.pause.y1) / 2);
    e = await editorBox('attack');
    assert.ok(!reaches(e, frame.pause), 'and off the pause button');
    await dragTo('attack', 422, 360);
    e = await editorBox('attack');
    assert.ok(!reaches(e, frame.boss), 'and off the room of the boss\'s bar');
    await dragTo('attack', 2000, 2000);
    e = await editorBox('attack');
    assert.ok(e.x >= 0 && e.y >= 0 && e.x + e.w <= 844 && e.y + e.h <= 390, 'a button taken off the screen stays on it');
    const d1 = await editorBox('dash');
    await dragTo('attack', d1.cx, d1.cy);
    e = await editorBox('attack');
    const d2 = await editorBox('dash');
    assert.ok(Math.hypot(e.cx - d2.cx, e.cy - d2.cy) >= (e.w + d2.w) / 2 - 0.5, 'taken onto Dash, Attack stops against it (touch areas do not overlap)');
    assert.ok(Math.hypot(d2.cx - d1.cx, d2.cy - d1.cy) < 1, 'and Dash did not move');
    await nothingPressed('after all the dragging');

    // the other buttons, a size, the other hand, the design again
    await dragTo('attack', 180, 250);
    await dragTo('dash', 300, 330);
    await dragTo('ability', 240, 190);
    const placedAttack = await editorBox('attack');
    const placedMagic = await editorBox('ability');
    await screen.tap(1, placedMagic.cx, placedMagic.cy);
    await frames(page, 2);
    assert.ok(/Ability/.test((await q(page, 'touch-editor-size-row').textContent()) ?? ''), 'a tap chose the Magic button: the slider is its');
    const magicPlate = (await plate(page, 'touch-editor-ability')).h;
    await setRange(page, 'touch-editor-size', 1.4);
    await frames(page, 2);
    const bigMagic = (await plate(page, 'touch-editor-ability')).h;
    assert.ok(Math.abs(bigMagic / magicPlate - 1.4) < 0.05, `its size grows to 140 % (${magicPlate.toFixed(1)} → ${bigMagic.toFixed(1)})`);
    assert.ok(Math.abs((await plate(page, 'touch-editor-attack')).h - (await plate(page, 'touch-editor-attack')).h) < 1e-9);
    await ctx.shot('04-editor-placed');
    // Swap sides: the three for the other hand
    await screen.tap(1, (await centreOf(page, 'touch-editor-mirror')).x, (await centreOf(page, 'touch-editor-mirror')).y);
    await frames(page, 2);
    const mirrored = await editorBox('attack');
    assert.ok(mirrored.cx > 844 - placedAttack.cx - 3 && mirrored.cx < 844 - placedAttack.cx + 3, `Swap sides turns the screen over (${placedAttack.cx.toFixed(0)} → ${mirrored.cx.toFixed(0)})`);
    await screen.tap(1, (await centreOf(page, 'touch-editor-mirror')).x, (await centreOf(page, 'touch-editor-mirror')).y);
    await frames(page, 2);
    // Default: back to the design
    const defaultAt = await centreOf(page, 'touch-editor-reset');
    await screen.tap(1, defaultAt.x, defaultAt.y);
    await frames(page, 2);
    for (const id of TOUCH_IDS) {
      const b = await editorBox(id);
      assert.ok(Math.hypot(b.cx - design[id].cx, b.cy - design[id].cy) < 1.5, `${id}: Default puts it back where the design has it`);
    }
    // Cancel keeps nothing
    await dragTo('attack', 200, 200);
    const cancelAt = await centreOf(page, 'touch-editor-cancel');
    await screen.tap(1, cancelAt.x, cancelAt.y);
    await page.waitForSelector('[data-testid="touch-editor"][data-open="0"]', { state: 'attached', timeout: 15000 });
    assert.equal(await saved(page), null, 'Cancel saved nothing: the settings file does not even exist');
    assert.equal(await q(page, 'pause-menu').getAttribute('data-aside'), '0', 'the menu is back…');
    assert.equal(await q(page, 'controls-screen').getAttribute('data-open'), '1', '…on the screen it was');
    assert.equal(await q(page, 'touch-layer').evaluate((el) => getComputedStyle(el).visibility), 'visible', 'and the touch layer is back');
    // Escape (the pause key) gives the editor up first, the menu next
    await q(page, 'settings-touch-edit').click();
    await page.waitForSelector('[data-testid="touch-editor"][data-open="1"]', { timeout: 15000 });
    await dragTo('dash', 200, 200);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="touch-editor"][data-open="0"]', { state: 'attached', timeout: 15000 });
    assert.equal(await saved(page), null, 'Escape kept nothing');
    assert.equal(await q(page, 'pause-menu').getAttribute('data-open'), '1', 'and the menu is still there');
    assert.equal((await state()).menuOpen, true);

    // Save keeps the places the player left
    await q(page, 'settings-touch-edit').click();
    await page.waitForSelector('[data-testid="touch-editor"][data-open="1"]', { timeout: 15000 });
    await dragTo('attack', 190, 262);
    await dragTo('dash', 310, 335);
    await dragTo('ability', 250, 205);
    await screen.tap(1, (await centreOf(page, 'touch-editor-ability')).x, (await centreOf(page, 'touch-editor-ability')).y);
    await setRange(page, 'touch-editor-size', 1.3);
    await frames(page, 2);
    const chosen = { attack: await editorBox('attack'), dash: await editorBox('dash'), ability: await editorBox('ability') };
    const chosenPlate = (await plate(page, 'touch-editor-ability')).h;
    await ctx.shot('05-editor-left-hand');
    const saveAt = await centreOf(page, 'touch-editor-save');
    await screen.tap(1, saveAt.x, saveAt.y); // a tap right after a drag: the first press is not lost
    await page.waitForSelector('[data-testid="touch-editor"][data-open="0"]', { state: 'attached', timeout: 15000 });
    const file = await savedWhere(page, (f) => f['version'] === 4 && Object.keys(f['touch']?.buttons ?? {}).length === 3, 'the places were saved');
    assert.deepEqual(Object.keys(file['touch'].buttons), ['attack', 'dash', 'ability'], 'the three buttons the player placed');
    assert.equal(file['touch'].buttons.ability.scale, 1.3, 'with the size of the one they resized');
    assert.equal(file['touch'].buttons.attack.scale, 1);
    const wantLayout = computeTouchLayout(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }, { buttons: file['touch'].buttons as ButtonPlacements });
    for (const id of TOUCH_IDS) assert.ok(Math.abs(file['touch'].buttons[id].x * 844 - chosen[id].cx) < 1.5, `${id}: saved where it was left (${(file['touch'].buttons[id].x * 844).toFixed(1)} vs ${chosen[id].cx.toFixed(1)})`);
    assert.equal(await q(page, 'pause-menu').getAttribute('data-aside'), '0');
    // the small picture in the settings shows them now
    const pic = await box(page, 'settings-touch-preview');
    const picAttack = await box(page, 'settings-touch-preview-attack');
    assert.ok((picAttack.cx - pic.x) / pic.w < 0.4, 'the picture in the settings has Attack on the left');
    await q(page, 'controls-back').click();
    await q(page, 'pause-resume').click();
    await menuIs(page, false);
    await frames(page, 3);

    // the buttons of the game are where the editor left them — and act there
    const live = (await hooks(page)).layout;
    for (const id of TOUCH_IDS) {
      assert.ok(Math.hypot(live[id].cx - wantLayout[id].cx, live[id].cy - wantLayout[id].cy) < 0.5, `${id}: the page lays the buttons out as the pure function does for what was saved`);
      const d = await plate(page, `touch-${id}`);
      assert.ok(Math.hypot(d.cx - chosen[id].cx, d.cy - chosen[id].cy) < 2, `${id}: and it is where the editor showed it`);
    }
    assert.equal(live.side, 'left', 'the buttons are on the left: the movement zone is on the right');
    assert.ok(live.zone.x > 844 / 2 - 1, 'the zone is on the right half');
    assert.ok(Math.abs((await plate(page, 'touch-ability')).h / chosenPlate - 1) < 0.02, 'the Magic button is the size it was given');
    await ctx.shot('06-left-hand');
    await ctx.teleport(90, 0);
    await ctx.step(30);
    await press('attack', 4);
    assert.equal((await state()).state, 'attack', 'a finger on Attack, where it is now, attacks');
    await screen.lift(1);
    await ctx.step(60);
    await press('dash', 3);
    assert.equal((await state()).state, 'dash', 'on Dash, dashes');
    await screen.lift(1);
    await ctx.step(40);
    await press('ability', 3);
    assert.equal((await state()).state, 'cast', 'on Magic, casts');
    await screen.lift(1);
    await ctx.step(40);
    // the old place of Attack is empty: a finger there is the movement gesture's (the zone is on the right now), not an attack
    await ctx.teleport(90, 0);
    await ctx.step(30);
    await screen.touch(1, reference.attack[0], reference.attack[1]);
    await screen.drag(1, 60, 0, 4, 8);
    await ctx.step(10);
    s = await state();
    assert.ok(s.combat?.attack === null && s.vx > 3, `a finger where Attack used to be moves the hero, it does not attack (${s.state}, vx ${s.vx})`);
    await screen.lift(1);
    await ctx.step(40);

    // ================================================================================================ F · the places survive: a reload, a change of zone, another saved game
    await page.reload();
    await ready(page);
    screen = await new TouchScreen(page).init();
    const again = (await hooks(page)).layout;
    for (const id of TOUCH_IDS) assert.ok(Math.hypot(again[id].cx - live[id].cx, again[id].cy - live[id].cy) < 0.5, `${id}: after a reload it is where it was left`);
    await sess(page, 's.loadout.acquire("card_spirit_bolt");');
    await ctx.teleport(90, 0);
    await ctx.step(30);
    await press('attack', 4);
    assert.equal((await state()).state, 'attack', 'and Attack still attacks');
    await screen.lift(1);

    // a change of zone, in the real world (R1 → R2): the buttons are where they were, and still work
    await ctx.open('touch=1', { ...SIZE });
    ({ page } = ctx);
    await page.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(file))})`);
    await page.reload();
    await ready(page);
    screen = await new TouchScreen(page).init();
    await sess(page, 's.flags.set("defeated:r1_slime");');
    const beforeZone = (await hooks(page)).layout;
    await ctx.step(2);
    await ctx.teleport(110, 0);
    await ctx.step(1);
    assert.equal((await state()).transition?.phase, 'fadeOut', 'the exit started the change of zone');
    await ctx.step(40); // the fade out, the swap, the black and the fade in (a change of zone lasts 32 ticks)
    s = await state();
    assert.equal(s.transition?.phase, 'none', 'the change of zone is over');
    assert.equal(s.room, 'r2_hall', 'the hero is in the next room');
    assert.equal((await hooks(page)).active, 0, 'the change of zone let go of every finger');
    const afterZone = (await hooks(page)).layout;
    for (const id of TOUCH_IDS) assert.ok(Math.hypot(afterZone[id].cx - beforeZone[id].cx, afterZone[id].cy - beforeZone[id].cy) < 0.01, `${id}: the same place after the change of zone`);
    await ctx.step(20);
    await press('attack', 4);
    assert.equal((await state()).state, 'attack', 'and Attack works in the new zone');
    await screen.lift(1);
    await ctx.step(60);
    await press('dash', 3);
    assert.equal((await state()).state, 'dash', 'and Dash');
    await screen.lift(1);
    await ctx.step(40);

    // another saved game: starting one in slot 2 opens the page again — the buttons are the player's, not the game's
    await q(page, 'pause-button').click();
    await menuIs(page, true);
    await q(page, 'pause-saves').click();
    await page.waitForSelector('[data-testid="saves-screen"][data-open="1"][data-ready="1"]', { timeout: 15000 });
    const loaded = page.waitForEvent('load', { timeout: 30000 });
    await q(page, 'saves-new-2').click();
    await loaded;
    await ready(page);
    screen = await new TouchScreen(page).init();
    assert.equal((await ctx.state()).slot, 2, 'the page opened on the other game');
    const other = (await hooks(page)).layout;
    for (const id of TOUCH_IDS) assert.ok(Math.hypot(other[id].cx - beforeZone[id].cx, other[id].cy - beforeZone[id].cy) < 0.5, `${id}: another game, the same places`);
    await ctx.step(20);
    await press('attack', 4);
    assert.equal((await state()).state, 'attack', 'and the buttons work in it');
    await screen.lift(1);
    await ctx.step(40);

    // restore: in the settings, in one press, back to the design — and saved
    await q(page, 'pause-button').click();
    await menuIs(page, true);
    await q(page, 'pause-controls').click();
    await page.waitForSelector('[data-testid="controls-screen"][data-open="1"]', { timeout: 15000 });
    await q(page, 'settings-touch-reset').scrollIntoViewIfNeeded();
    await q(page, 'settings-touch-reset').click();
    await frames(page, 3);
    const back = (await hooks(page)).layout;
    const clean = computeTouchLayout(844, 390);
    for (const id of TOUCH_IDS) assert.ok(Math.hypot(back[id].cx - clean[id].cx, back[id].cy - clean[id].cy) < 0.5, `${id}: Restore puts it where the design has it`);
    assert.equal(back.side, 'right');
    await savedWhere(page, (f) => Object.keys(f['touch']?.buttons ?? { x: 1 }).length === 0, 'the restore was saved: no place kept');
    await ctx.shot('07-restored');

    // ================================================================================================ G · a phone with a notch: the places are fractions of the SAFE area
    const NOTCH = { top: 0, right: 47, bottom: 21, left: 47 };
    await ctx.open(`${QUERY}&safe=${NOTCH.top},${NOTCH.right},${NOTCH.bottom},${NOTCH.left}`, { ...SIZE });
    ({ page } = ctx);
    screen = await new TouchScreen(page).init();
    await sess(page, 's.loadout.acquire("card_spirit_bolt");');
    await ctx.step(3);
    await frames(page, 3);
    const within = (b: { x: number; y: number; w: number; h: number }, width: number, height: number): boolean =>
      b.x >= NOTCH.left - 0.5 && b.x + b.w <= width - NOTCH.right + 0.5 && b.y >= NOTCH.top - 0.5 && b.y + b.h <= height - NOTCH.bottom + 0.5;
    for (const id of TOUCH_IDS) assert.ok(within(await box(page, `touch-${id}`), 844, 390), `${id}: the design is inside the safe area, clear of the notch and the home indicator`);
    await openEditor();
    await dragTo('attack', 2000, 2000);
    assert.ok(within(await editorBox('attack'), 844, 390), 'a button taken to the corner of the screen stops inside the safe area');
    await dragTo('dash', 1, 389);
    assert.ok(within(await editorBox('dash'), 844, 390), 'and the other corner');
    await dragTo('ability', 843, 1);
    assert.ok(within(await editorBox('ability'), 844, 390), 'and the top: a place is never off the screen');
    const cornerSave = await centreOf(page, 'touch-editor-save');
    await screen.tap(1, cornerSave.x, cornerSave.y);
    await page.waitForSelector('[data-testid="touch-editor"][data-open="0"]', { state: 'attached', timeout: 15000 });
    const cornerFile = await savedWhere(page, (f) => Object.keys(f['touch']?.buttons ?? {}).length === 3, 'the corner places were saved');
    for (const id of TOUCH_IDS) {
      const b = cornerFile['touch'].buttons[id] as { x: number; y: number };
      assert.ok(b.x >= 0 && b.x <= 1 && b.y >= 0 && b.y <= 1, `${id}: what is saved is a fraction of the safe area (${b.x}, ${b.y})`);
    }
    await q(page, 'controls-back').click();
    await q(page, 'pause-resume').click();
    await menuIs(page, false);
    // the places, after a reload and in another window (the phone is turned, the browser's bar comes and goes): laid out again against what that window has, never off it, never one on another
    await page.reload();
    await ready(page);
    screen = await new TouchScreen(page).init();
    await sess(page, 's.loadout.acquire("card_spirit_bolt");'); // (a playground keeps nothing: the card is asked for again)
    await ctx.step(3);
    await frames(page, 3);
    const notchLayout = computeTouchLayout(844, 390, NOTCH, { buttons: cornerFile['touch'].buttons as ButtonPlacements });
    const notchLive = (await hooks(page)).layout;
    for (const id of TOUCH_IDS) {
      assert.ok(Math.hypot(notchLive[id].cx - notchLayout[id].cx, notchLive[id].cy - notchLayout[id].cy) < 0.5, `${id}: after a reload the page lays it out as the pure function does`);
      assert.ok(within(await box(page, `touch-${id}`), 844, 390), `${id}: inside the safe area`);
    }
    await page.setViewportSize({ width: 667, height: 375 });
    await frames(page, 4);
    const small = computeTouchLayout(667, 375, NOTCH, { buttons: cornerFile['touch'].buttons as ButtonPlacements });
    const smallLive = (await hooks(page)).layout;
    for (const id of TOUCH_IDS) {
      assert.ok(Math.hypot(smallLive[id].cx - small[id].cx, smallLive[id].cy - small[id].cy) < 0.5, `${id}: in a smaller window it is laid out again as the pure function does`);
      assert.ok(within(await box(page, `touch-${id}`), 667, 375), `${id}: and it is inside that window's safe area`);
    }
    for (const [a, b] of [['attack', 'dash'], ['attack', 'ability'], ['dash', 'ability']] as const) {
      const [p, r] = [await box(page, `touch-${a}`), await box(page, `touch-${b}`)];
      assert.ok(Math.hypot(p.cx - r.cx, p.cy - r.cy) >= (p.w + r.w) / 2 - 0.5, `${a} and ${b} do not overlap, wherever the window put them`);
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await frames(page, 4);
    const backAgain = (await hooks(page)).layout;
    for (const id of TOUCH_IDS) assert.ok(Math.hypot(backAgain[id].cx - notchLive[id].cx, backAgain[id].cy - notchLive[id].cy) < 0.5, `${id}: back in the first window it is where it was (the place is kept as a fraction, not as the pixels of one window)`);
    await ctx.teleport(90, 0);
    await ctx.step(30);
    await press('attack', 4);
    assert.equal((await state()).state, 'attack', 'and the buttons work where they are');
    await screen.lift(1);

    // ================================================================================================ H · a desktop is untouched
    const desktopRequests: string[] = [];
    await ctx.open('room=movement_test&unlock=dash', { width: 1280, height: 720, dpr: 1, prepare: async (context) => void context.on('request', (r) => desktopRequests.push(r.url())) });
    await ctx.step(10);
    assert.equal(await ctx.page.locator('[data-testid="touch-layer"]').isVisible(), false, 'a desktop never sees the touch layer');
    assert.equal(desktopRequests.filter((u) => /touch-(attack|dash|magic)[^/?]*\.png$/.test(u)).length, 0, 'and never downloads the pictures of its buttons');
    await ctx.page.keyboard.down('KeyD');
    await ctx.step(30);
    assert.ok((await ctx.state()).vx > 8, 'the keyboard plays');
    await ctx.page.keyboard.up('KeyD');
    await ctx.page.keyboard.press('KeyJ');
    await ctx.step(4);
    assert.equal((await ctx.state()).state, 'attack', 'J attacks');
    await ctx.page.evaluate('window.__troid.resume()'); // (the loop runs: the pause key is read by the game's own ticks)
    await ctx.page.keyboard.press('Escape');
    await ctx.page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 15000 });
    await ctx.page.locator('[data-testid="pause-controls"]').click();
    await ctx.page.waitForSelector('[data-testid="controls-screen"][data-open="1"]', { timeout: 15000 });
    assert.equal(await ctx.page.locator('[data-testid="settings-touch"]').isVisible(), false, 'there is no touch section on a desktop with no touch screen');
    assert.equal(await ctx.page.locator('[data-testid="settings-touch-edit"]').isVisible(), false, 'and no way into the editor');
  },
};
