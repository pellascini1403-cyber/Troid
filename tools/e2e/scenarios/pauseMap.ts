import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Ctx, GameState, Scenario } from '../scenario';
import { cardState } from '../hud';
import { TouchScreen } from '../touch';

/**
 * THE PAUSE THAT OPENS ON THE MAP, in a real browser (docs/PROMPT19-LOG.md): the button is in the top right corner and clear of everything else; what it opens is the map of the world in the main panel, on
 * the left, with the column of options on the right; the world is stopped for real; each option opens in the place of the map and the way back is a press; the map is the world the hero has been through (it
 * grows as they go, it opens the ways the world opens, it is the same after a reload) and can be dragged and zoomed with a mouse, a wheel, the keys and fingers; and nothing typed or touched on the menu
 * reaches the game. On a desktop window, on a phone held sideways and on one held upright.
 */
const KEY = 'troid.progress';
const DESKTOP = { width: 1280, height: 720, dpr: 1 };
const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);
const attr = (page: Page, id: string, name: string): Promise<string | null> => q(page, id).getAttribute(name);
const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
}
async function box(page: Page, id: string): Promise<Box> {
  const b = await q(page, id).first().boundingBox();
  assert.ok(b, `${id} is on screen`);
  return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height, w: b.width, h: b.height };
}
const overlap = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const centre = (b: Box): { x: number; y: number } => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
const inside = (inner: Box, outer: Box, slack = 0.5): boolean => inner.x0 >= outer.x0 - slack && inner.y0 >= outer.y0 - slack && inner.x1 <= outer.x1 + slack && inner.y1 <= outer.y1 + slack;

async function waitFor(page: Page, expr: string, what: string, ms = 30000): Promise<void> {
  const t0 = Date.now();
  while (!(await page.evaluate(expr))) {
    if (Date.now() - t0 > ms) assert.fail(`timed out (${ms} ms) waiting for ${what} (${expr})`);
    await page.waitForTimeout(40);
  }
}
const menuIs = (page: Page, open: boolean): Promise<void> =>
  waitFor(page, `document.querySelector('[data-testid="pause-menu"]')?.dataset.open === '${open ? '1' : '0'}'`, `the menu is ${open ? 'open' : 'closed'}`, 15000);
const screenIs = (page: Page, screen: string): Promise<void> =>
  waitFor(page, `document.querySelector('[data-testid="pause-menu"]')?.dataset.screen === '${screen}' && document.querySelector('[data-testid="pause-menu"]')?.dataset.open === '1'`, `the menu is on its ${screen} screen`, 15000);
const ready = async (page: Page): Promise<void> => {
  await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
  await page.waitForFunction('window.__troid.effectsReady()', undefined, { timeout: 30000 });
  await page.evaluate('window.__troid.pause()');
  await page.waitForTimeout(150);
};
/** Where the map is seen from, as the page reports it. */
const viewOf = async (page: Page): Promise<{ scale: number; x: number; y: number; moved: boolean }> => {
  const d = await q(page, 'map').evaluate((e) => ({ ...(e as HTMLElement).dataset }));
  return { scale: Number(d['scale']), x: Number(d['x']), y: Number(d['y']), moved: d['moved'] === '1' };
};
const roomsOnMap = (page: Page): Promise<string[]> => page.locator('[data-testid^="map-room-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['room'] ?? ''));
const stateOf = (page: Page): Promise<GameState & { menuOpen?: boolean; room?: string }> => page.evaluate('window.__troid.state()') as never;
const stored = async (page: Page): Promise<{ at: { room: string }; stats: { rooms: string[] }; flags: string[] } | null> => {
  const raw = (await page.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`)) as string | null;
  return raw === null ? null : JSON.parse(raw);
};

export const pauseMap: Scenario = {
  name: 'pauseMap',
  async run(ctx: Ctx) {
    // ================================================================================================ A · the button: in the top right corner, clear of the HUD
    await ctx.open('new=1', DESKTOP);
    let page = ctx.page;
    await page.evaluate('window.__troid.resume()');
    await waitFor(page, 'window.__troid.state().now > 20', 'the game runs');
    const pb = await box(page, 'pause-button');
    const hud = await box(page, 'hud-block');
    assert.ok(DESKTOP.width - pb.x1 <= 24 && pb.x1 <= DESKTOP.width, `the pause button is at the right edge (${JSON.stringify(pb)})`);
    assert.ok(pb.y0 <= 24 && pb.y0 >= 0, `and at the top (${pb.y0})`);
    assert.ok(pb.w >= 44 && pb.h >= 44, `and a finger (${pb.w} × ${pb.h})`);
    assert.ok(!overlap(pb, hud), 'clear of the HUD at the top left');
    assert.ok(pb.x0 > DESKTOP.width * 0.9, 'in the corner, not at the top centre where it used to be');
    await ctx.shot('a-01-the-button');

    // ================================================================================================ B · it opens on the map, the world stopped, the options on the right
    const before = await stateOf(page);
    await q(page, 'pause-button').click();
    await menuIs(page, true);
    await screenIs(page, 'main');
    assert.equal((await stateOf(page)).menuOpen, true);
    assert.equal(await q(page, 'pause-button').evaluate((e) => getComputedStyle(e).visibility), 'hidden', 'the button steps out of the way');
    assert.equal(await q(page, 'map').isVisible(), true, 'the first view is the map');
    assert.equal(await q(page, 'pause-map-panel').isVisible(), true);
    for (const screen of ['sound-screen', 'settings-screen', 'controls-screen', 'profile-screen', 'saves-screen']) assert.equal(await q(page, screen).count(), 0, `${screen} has not been asked for: the map is what is there`);
    const frozen = await stateOf(page);
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(120);
      const s = await stateOf(page);
      assert.equal(s.now, frozen.now, `the simulation does not advance behind the menu (sample ${i})`);
      assert.equal(s.x, frozen.x, 'nor does the hero');
    }
    assert.ok((frozen.now ?? 0) >= (before.now ?? 0), 'it stopped where it was');
    const frame = await box(page, 'pause-stage').then(async (stage) => ({ stage, side: await box(page, 'pause-side'), map: await box(page, 'map') }));
    assert.ok(frame.map.x1 <= frame.side.x0 + 0.5, `the map is on the left and the options on the right (${frame.map.x1} / ${frame.side.x0})`);
    assert.ok(inside(frame.map, frame.stage), 'the map is in the main panel');
    assert.ok(frame.map.w >= frame.side.w * 2, `the map has the room (${frame.map.w.toFixed(0)} px against ${frame.side.w.toFixed(0)} px of options)`);
    assert.ok(frame.map.h >= DESKTOP.height * 0.5, `and the height (${frame.map.h.toFixed(0)} px)`);
    const entries = await page.locator('.pm-entry').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['id']));
    assert.deepEqual(entries, ['resume', 'map', 'controls', 'sound', 'settings', 'saves', 'profile'], 'the options, in order');
    for (const id of ['pause-resume', 'pause-map', 'pause-controls', 'pause-sound', 'pause-settings', 'pause-saves', 'pause-profile']) {
      const b = await box(page, id);
      assert.ok(b.x0 >= frame.side.x0 - 0.5 && b.x1 <= frame.side.x1 + 0.5, `${id} is in the column on the right`);
      assert.ok(b.h >= 40, `${id} is big enough to press (${b.h.toFixed(0)} px)`);
    }
    assert.equal(await attr(page, 'pause-map', 'aria-current'), 'page', 'the Map entry says it is the one shown');
    // the map is the world as the player has it: the first room, alone, the hero in it, the way on shut into the unknown
    assert.deepEqual(await roomsOnMap(page), ['r1_gate'], 'only what the hero has been in');
    assert.equal(await attr(page, 'map-room-r1_gate', 'data-current'), '1');
    const room = await box(page, 'map-room-r1_gate');
    const hero = await box(page, 'map-hero');
    assert.ok(centre(hero).x > room.x0 && centre(hero).x < room.x1 && centre(hero).y > room.y0 && centre(hero).y < room.y1, 'the hero\'s mark is inside the room they stand in');
    assert.equal(await attr(page, 'map-door-r1_gate:east', 'data-state'), 'locked', 'the way on is shut');
    assert.equal(await attr(page, 'map-door-r1_gate:east', 'data-known'), '0', 'and leads into the unknown');
    assert.equal(await page.locator('.map-stub').count(), 1, 'drawn as a stub');
    assert.equal(await page.locator('.map-link').count(), 0);
    assert.equal(await q(page, 'pause-zone').textContent(), 'Ruins Gate', 'where the hero is, above the map');
    assert.equal(await page.locator('[data-testid="map-room-r2_hall"]').count(), 0, 'the rest of the world is not there to see');
    await ctx.shot('b-01-the-map');

    // ================================================================================================ C · the options open IN the main panel, work, and the map comes back
    const stageBox = await box(page, 'pause-stage');
    for (const [entry, screen] of [['controls', 'controls-screen'], ['sound', 'sound-screen'], ['settings', 'settings-screen'], ['profile', 'profile-screen'], ['saves', 'saves-screen']] as const) {
      await q(page, `pause-${entry}`).click();
      await q(page, screen).waitFor({ state: 'visible', timeout: 15000 });
      assert.equal(await q(page, 'map').isVisible(), false, `the map makes way for ${screen}`);
      assert.ok(inside(await box(page, screen), stageBox, 1), `${screen} fills the main panel`);
      assert.equal(await q(page, 'pause-side').isVisible(), true, 'and the column of options stays where it is');
      assert.equal(await attr(page, `pause-${entry}`, 'aria-current'), 'page', `${entry} is the one shown`);
      assert.equal((await stateOf(page)).menuOpen, true, 'the game is still paused');
      await q(page, 'pause-map').click();
      await q(page, 'map').waitFor({ state: 'visible', timeout: 15000 });
      assert.equal(await attr(page, 'pause-map', 'aria-current'), 'page');
    }
    // a choice made in a screen is in force (the sound screen is the real one) and survives the way back to the map
    await q(page, 'pause-sound').click();
    await q(page, 'sound-screen').waitFor({ state: 'visible' });
    await q(page, 'settings-volume-music').evaluate((el) => {
      const input = el as HTMLInputElement;
      input.value = '0.3';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal((await ctx.state()).volume?.levels?.music, 0.3, 'the volume moved at once');
    await ctx.shot('c-01-the-sound-in-the-panel');
    await page.keyboard.press('Escape'); // one step back: from a screen to the map
    await screenIs(page, 'main');
    assert.equal(await q(page, 'map').isVisible(), true, 'Escape from a screen brings the map back, it does not close the menu');
    assert.equal((await ctx.state()).volume?.levels?.music, 0.3, 'and what was chosen stays');
    await q(page, 'pause-sound').click();
    await q(page, 'sound-back').click();
    await screenIs(page, 'main');

    // ================================================================================================ D · the map moves: buttons, wheel, mouse, keys — and keeps its view through the options
    const v0 = await viewOf(page);
    assert.equal(v0.moved, false, 'the opening view');
    await q(page, 'map-zoom-in').click();
    const v1 = await viewOf(page);
    assert.ok(v1.scale > v0.scale * 1.2, `the button zooms in (${v0.scale} → ${v1.scale})`);
    const m = await box(page, 'map');
    await page.mouse.move(centre(m).x, centre(m).y);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(100);
    const v2 = await viewOf(page);
    assert.ok(v2.scale > v1.scale, `the wheel zooms in (${v1.scale} → ${v2.scale})`);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(100);
    assert.ok((await viewOf(page)).scale < v2.scale, 'and out');
    const beforeDrag = await viewOf(page);
    await page.mouse.move(centre(m).x, centre(m).y);
    await page.mouse.down();
    await page.mouse.move(centre(m).x - 70, centre(m).y + 12, { steps: 6 });
    await page.mouse.up();
    const dragged = await viewOf(page);
    assert.ok(dragged.moved && (dragged.x !== beforeDrag.x || dragged.y !== beforeDrag.y), `a drag moves the map (${beforeDrag.x} → ${dragged.x})`);
    await q(page, 'map').focus();
    const x3 = (await viewOf(page)).x;
    await page.keyboard.press('ArrowLeft');
    assert.ok((await viewOf(page)).x > x3, 'the arrow keys move it, once it has the focus');
    const s3 = (await viewOf(page)).scale;
    await page.keyboard.press('Equal');
    assert.ok((await viewOf(page)).scale > s3, 'plus zooms in');
    await page.keyboard.press('Minus');
    await page.keyboard.press('Minus');
    assert.ok((await viewOf(page)).scale < s3, 'minus zooms out');
    assert.equal((await stateOf(page)).menuOpen, true, 'and none of that touched the menu');
    // dragged about as far as it goes it is still in the panel
    await page.mouse.move(centre(m).x, centre(m).y);
    await page.mouse.down();
    await page.mouse.move(centre(m).x + 5000, centre(m).y, { steps: 3 });
    await page.mouse.up();
    const far = await box(page, 'map-room-r1_gate');
    assert.ok(far.x0 < m.x1 && far.y1 > m.y0 && far.y0 < m.y1, 'the map cannot be dragged out of its panel altogether');
    // the view the player gave it is kept through the options…
    const given = await viewOf(page);
    await q(page, 'pause-controls').click();
    await q(page, 'controls-screen').waitFor({ state: 'visible' });
    await q(page, 'pause-map').click();
    await q(page, 'map').waitFor({ state: 'visible' });
    const kept = await viewOf(page);
    assert.deepEqual([kept.scale, kept.x, kept.y], [given.scale, given.x, given.y], 'the map is where the player left it');
    // …and the centre button, and a menu opened again, give the opening view back
    await q(page, 'map-center').click();
    const centred = await viewOf(page);
    assert.equal(centred.moved, false);
    assert.ok(Math.abs(centred.scale - v0.scale) < 1e-3, 'the centre button comes back to the opening view');
    await q(page, 'map-zoom-in').click();
    await q(page, 'pause-resume').click();
    await menuIs(page, false);

    // ================================================================================================ E · nothing on the menu reaches the game
    await ctx.teleport(30, 0);
    await waitFor(page, 'window.__troid.state().grounded === true', 'the hero to stand', 5000);
    await page.waitForTimeout(300);
    const rest = await ctx.state();
    await q(page, 'pause-button').click();
    await menuIs(page, true);
    await q(page, 'map').focus();
    for (const code of ['KeyD', 'KeyA', 'Space', 'KeyJ', 'KeyK', 'KeyL', 'ShiftLeft', 'KeyE']) await page.keyboard.press(code);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyD');
    const mb = await box(page, 'map');
    await page.mouse.click(centre(mb).x, centre(mb).y); // a click on the map is not an attack
    await page.mouse.click(centre(mb).x, centre(mb).y, { button: 'right' });
    await page.mouse.dblclick(centre(mb).x + 30, centre(mb).y);
    await page.waitForTimeout(200);
    const still = await ctx.state();
    assert.ok((still.now ?? 0) - (rest.now ?? 0) < 60, 'the world only ran until the menu opened');
    const pausedAt = still.now;
    await page.waitForTimeout(300);
    assert.equal((await ctx.state()).now, pausedAt, 'and then stood: the keys and clicks did not make it run');
    assert.ok(Math.abs(still.x - rest.x) < 0.5, `the hero did not move (${rest.x} → ${still.x})`);
    assert.equal(still.combat?.attack, null, 'and did not attack');
    await q(page, 'pause-resume').click();
    await menuIs(page, false);
    await page.waitForTimeout(300);
    const after = await ctx.state();
    assert.ok(Math.abs(after.x - rest.x) < 0.5, `nor did anything typed on the menu wait to be played once it closed (${rest.x} → ${after.x})`);
    assert.equal(after.combat?.attack, null);

    // ================================================================================================ F · the map is the world the hero has been through: it grows with them, opens what the world opens, and is the same after a reload
    await sess(page, 's.flags.set("defeated:r1_slime")');
    await ctx.teleport(110, 0);
    await waitFor(page, `window.__troid.state().room === 'r2_hall' && window.__troid.state().transition.phase === 'none' && !window.__troid.arrival().blocking`, 'the hero to be in the second room', 30000);
    await page.waitForTimeout(200);
    await q(page, 'pause-button').click();
    await menuIs(page, true);
    assert.deepEqual(await roomsOnMap(page), ['r1_gate', 'r2_hall'], 'the second room joined the map');
    assert.equal(await attr(page, 'map-room-r2_hall', 'data-current'), '1', 'and it is the one the hero is in');
    assert.equal(await page.locator('.map-link').count(), 1, 'with its connection to the first');
    assert.equal(await attr(page, 'map-door-r1_gate:east', 'data-state'), 'open', 'the way the slime kept shut is open on the map: the world opened it');
    assert.equal(await attr(page, 'map-door-r1_gate:east', 'data-known'), '1');
    assert.equal(await attr(page, 'map-door-r2_hall:east', 'data-known'), '0', 'the way on from here leads into the unknown');
    assert.equal(await page.locator('[data-testid^="map-poi-r2_hall:rest"]').count(), 1, 'the shrine of the room is marked');
    assert.equal(await q(page, 'pause-zone').textContent(), 'Root Gallery');
    const hero2 = await box(page, 'map-hero');
    const room2 = await box(page, 'map-room-r2_hall');
    assert.ok(centre(hero2).x > room2.x0 && centre(hero2).x < room2.x1 && centre(hero2).y > room2.y0 && centre(hero2).y < room2.y1, 'the hero is in the second room on the map');
    await ctx.shot('f-01-two-rooms');
    await q(page, 'pause-resume').click();
    await menuIs(page, false);
    // the third room
    await sess(page, 's.flags.set("defeated:r2_slime")');
    await ctx.teleport(89.5, 0);
    await waitFor(page, `window.__troid.state().room === 'r3_chamber' && window.__troid.state().transition.phase === 'none' && !window.__troid.arrival().blocking`, 'the hero to be in the third room', 30000);
    await page.waitForTimeout(200);
    // saved with the game
    let saved = await stored(page);
    for (let i = 0; i < 80 && !(saved && saved.stats.rooms.length === 3); i++) {
      await page.waitForTimeout(50);
      saved = await stored(page);
    }
    assert.deepEqual(saved?.stats.rooms, ['r1_gate', 'r2_hall', 'r3_chamber'], 'the game keeps the rooms the hero has been in, sorted');
    await page.reload();
    await ready(page);
    assert.equal((await stateOf(page)).room, 'r3_chamber', 'the loaded game begins where the hero was');
    await q(page, 'pause-button').click();
    await menuIs(page, true);
    await screenIs(page, 'main');
    assert.deepEqual(await roomsOnMap(page), ['r1_gate', 'r2_hall', 'r3_chamber'], 'the same map after a reload: the three rooms, and not the fourth');
    assert.equal(await attr(page, 'map-room-r3_chamber', 'data-current'), '1');
    assert.equal(await page.locator('.map-link').count(), 2, 'with their connections');
    assert.equal(await attr(page, 'map-door-r1_gate:east', 'data-state'), 'open', 'and the ways the world had opened are open');
    assert.equal(await page.locator('[data-testid^="map-poi-r3_chamber:seal"]').count(), 1, 'the seal of the third room is marked, intact');
    // the profile counts the very same rooms
    await q(page, 'pause-profile').click();
    await q(page, 'profile-screen').waitFor({ state: 'visible' });
    assert.match((await q(page, 'profile-rooms').textContent()) ?? '', /3/, 'the profile counts three rooms of four: the same record');
    await q(page, 'pause-map').click();
    await ctx.shot('f-02-three-rooms-after-a-reload');
    await q(page, 'pause-resume').click();
    await menuIs(page, false);

    // ================================================================================================ G · a phone held sideways, and one held upright — on a plain screen and under a notch
    const NOTCH = { top: 44, right: 47, bottom: 21, left: 47 }; // the one the other phone scenes use (`?safe=44,47,21,47`)
    const NO_NOTCH = { top: 0, right: 0, bottom: 0, left: 0 };
    const phones = [
      { name: 'landscape', size: { width: 844, height: 390 }, safe: NO_NOTCH },
      { name: 'portrait', size: { width: 390, height: 844 }, safe: NO_NOTCH },
      { name: 'landscape with a notch', size: { width: 844, height: 390 }, safe: NOTCH },
      { name: 'portrait with a notch', size: { width: 390, height: 844 }, safe: NOTCH },
    ] as const;
    for (const { name, size, safe } of phones) {
      const slug = name.replace(/ /g, '-');
      const upright = size.height > size.width;
      const query = safe === NOTCH ? `touch=1&new=1&safe=${safe.top},${safe.right},${safe.bottom},${safe.left}` : 'touch=1&new=1';
      await ctx.open(query, { ...size, dpr: 1, touch: true }); // (one device pixel per CSS pixel, as the other phone scenes: software rendering at two would make every frame a quarter of a second)
      page = ctx.page;
      const screen = await new TouchScreen(page).init();
      await page.evaluate('window.__troid.resume()');
      await waitFor(page, 'window.__troid.state().now > 20', `${name}: the game runs`);
      // A finger lands where the element is and lifts: nothing more. (The browser makes no click of a tap that comes straight after a drag or a pinch on the map — docs/PROMPT19-LOG.md §7 — so the
      // menu acts when the finger lifts; the taps below follow the gestures with no wait at all, the worst case, and have to work.)
      const tap = async (id: string): Promise<void> => {
        const c = centre(await box(page, id));
        await screen.tap(1, c.x, c.y);
      };
      const button = await box(page, 'pause-button');
      const hudBox = await box(page, 'hud-block');
      assert.ok(size.width - safe.right - button.x1 <= 24 && button.x1 <= size.width - safe.right, `${name}: the pause button is at the right edge of what is usable (${JSON.stringify(button)})`);
      assert.ok(button.y0 >= safe.top - 0.5, `${name}: and under the notch`);
      assert.ok(button.w >= 44 && button.h >= 44, `${name}: and a finger`);
      assert.ok(!overlap(button, hudBox), `${name}: clear of the HUD`);
      for (const id of ['touch-attack', 'touch-dash', 'touch-ability']) {
        const b = await q(page, id).first().boundingBox();
        if (b && (await q(page, id).first().isVisible())) assert.ok(!overlap(button, { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height, w: b.width, h: b.height }), `${name}: nor on ${id}`);
      }
      await ctx.shot(`g-${slug}-button`);
      const t0 = (await stateOf(page)).now ?? 0;
      await tap('pause-button');
      await menuIs(page, true);
      await screenIs(page, 'main');
      const win: Box = { x0: safe.left, y0: safe.top, x1: size.width - safe.right, y1: size.height - safe.bottom, w: size.width - safe.left - safe.right, h: size.height - safe.top - safe.bottom };
      const frame = (await page.locator('.pm-frame').boundingBox())!;
      assert.ok(inside({ x0: frame.x, y0: frame.y, x1: frame.x + frame.width, y1: frame.y + frame.height, w: frame.width, h: frame.height }, win), `${name}: the menu is inside what the notch leaves (${JSON.stringify(frame)} in ${JSON.stringify(win)})`);
      const mapBox = await box(page, 'map');
      const side = await box(page, 'pause-side');
      assert.ok(inside(mapBox, win), `${name}: the map is on the screen`);
      assert.ok(inside(side, win), `${name}: and so are the options`);
      assert.ok(mapBox.w >= 240 && mapBox.h >= 150, `${name}: the map is big enough to read (${mapBox.w.toFixed(0)} × ${mapBox.h.toFixed(0)})`);
      if (!upright) assert.ok(mapBox.x1 <= side.x0 + 0.5, `${name}: map on the left, options on the right`);
      else assert.ok(mapBox.y1 <= side.y0 + 0.5, `${name}: held upright the options go under the map`);
      assert.ok(mapBox.w * mapBox.h > side.w * side.h, `${name}: the map has the larger area`);
      for (const id of ['pause-resume', 'pause-map', 'pause-controls', 'pause-sound', 'pause-settings', 'pause-saves', 'pause-profile']) {
        const b = await box(page, id);
        assert.ok(b.h >= 44 - 0.5 && b.w >= 44, `${name}: ${id} is a finger (${b.w.toFixed(0)} × ${b.h.toFixed(0)})`);
        assert.ok(inside(b, win), `${name}: ${id} is on the screen`);
      }
      assert.ok(((await page.evaluate('document.documentElement.scrollWidth')) as number) <= size.width, `${name}: the page does not scroll sideways`);
      // the first view leaves the way out of the room (its door and the stub it leads to) clear of the zoom buttons
      const door = await box(page, 'map-door-r1_gate:east');
      const stub = await page.locator('.map-stub').first().boundingBox();
      assert.ok(stub, `${name}: the stub of the way on is drawn`);
      for (const id of ['map-zoom-in', 'map-zoom-out', 'map-center']) {
        const tool = await box(page, id);
        assert.ok(!overlap(door, tool), `${name}: the shut door is not behind ${id}`);
        assert.ok(!overlap({ x0: stub.x, y0: stub.y, x1: stub.x + stub.width, y1: stub.y + stub.height, w: stub.width, h: stub.height }, tool), `${name}: nor is the stub it leads out by`);
      }
      await ctx.shot(`g-${slug}-menu`);
      // a finger drags the map, two fingers zoom it — and nothing reaches the game
      const hero0 = await stateOf(page);
      const view0 = await viewOf(page);
      const c = centre(mapBox);
      await screen.touch(1, c.x, c.y);
      await screen.drag(1, 40, 10, 5);
      await screen.lift(1);
      const view1 = await viewOf(page);
      assert.ok(view1.x !== view0.x || view1.y !== view0.y, `${name}: a finger moves the map`);
      await screen.touch(1, c.x - 30, c.y);
      await screen.touch(2, c.x + 30, c.y);
      await screen.drag(1, -40, 0, 4);
      await screen.drag(2, 40, 0, 4);
      await screen.lift(1);
      await screen.lift(2);
      assert.ok((await viewOf(page)).scale > view1.scale * 1.3, `${name}: two fingers zoom it (${view1.scale} → ${(await viewOf(page)).scale})`);
      const hero1 = await stateOf(page);
      assert.equal(hero1.x, hero0.x, `${name}: the hero did not move`);
      assert.equal(hero1.combat?.attack, null, `${name}: and nothing was pressed`);
      assert.equal(hero1.now, hero0.now, `${name}: the world is stopped`);
      // straight from the pinch to the zoom button, and from there to an option: no click may come after any of these taps, and each still acts
      const pinched = (await viewOf(page)).scale;
      await tap('map-zoom-in');
      assert.ok((await viewOf(page)).scale > pinched * 1.2, `${name}: the zoom button answers a finger straight after a pinch (${pinched} → ${(await viewOf(page)).scale})`);
      // a thumb resting on the map while another finger presses the zoom button, and then an option: the browser makes no click at all of a tap that is one of two fingers on the screen
      // (docs/PROMPT15-LOG.md §6.4), which is why every entry and every button of the map acts when the finger lifts — and each press still has to act
      await screen.touch(2, c.x, c.y);
      const resting = (await viewOf(page)).scale;
      await tap('map-zoom-in');
      assert.ok((await viewOf(page)).scale > resting * 1.2, `${name}: the zoom button answers a finger while another rests on the map (${resting} → ${(await viewOf(page)).scale})`);
      await tap('pause-sound');
      await q(page, 'sound-screen').waitFor({ state: 'visible', timeout: 15000 });
      assert.ok(inside(await box(page, 'sound-screen'), win), `${name}: the sound screen is all on the screen`);
      await ctx.shot(`g-${slug}-sound`);
      await screen.lift(2); // the thumb lifts with the map out of sight
      await tap('pause-map');
      await q(page, 'map').waitFor({ state: 'visible', timeout: 15000 });
      // no finger was left behind on the map: one finger drags it, and does not zoom it
      const back0 = await viewOf(page);
      await screen.touch(1, c.x, c.y);
      await screen.drag(1, 30, 0, 3);
      await screen.lift(1);
      const back1 = await viewOf(page);
      assert.ok(Math.abs(back1.scale - back0.scale) < 1e-6, `${name}: one finger drags the map and does not zoom it — no finger left behind (${back0.scale} → ${back1.scale})`);
      assert.ok(Math.abs(back1.x - back0.x) > 1 || Math.abs(back1.y - back0.y) > 1, `${name}: and it moved`);
      await tap('pause-resume');
      await menuIs(page, false);
      await waitFor(page, `window.__troid.state().now > ${t0 + 5}`, `${name}: the game goes on`);
    }

    // ================================================================================================ H · the world is stopped for real: the foe, the bolt, the timers, the animations
    await ctx.open('new=1', DESKTOP); // R1, a new game, the world stepped by the test
    page = ctx.page;
    await sess(page, 's.loadout.acquire("card_spirit_bolt");');
    await ctx.teleport(88, 0); // within 8 m of the slime: it wakes
    await ctx.step(10);
    await page.keyboard.down('KeyK');
    await ctx.step(1);
    await page.keyboard.up('KeyK');
    await ctx.step(11); // the cast, its release, and three ticks of the bolt in the air
    const live = await stateOf(page);
    assert.equal(live.projectiles?.length, 1, 'a bolt is in flight');
    assert.ok((live.enemies?.[0]?.ticks ?? 0) > 0 && live.enemies?.[0]?.state !== 'idle', `and a foe is awake (${live.enemies?.[0]?.state})`);
    assert.equal(await cardState(page), 'cooldown', 'and the card is in its cooldown');
    assert.ok((live.magic ?? 100) < 100, `and the magic is being spent (${live.magic})`);
    /** Everything of the world that moves: the clock, the hero and how it is drawn, each foe with its own clock, each bolt, the magic, the bottles. */
    const worldOf = async (): Promise<string> => {
      const w = await stateOf(page);
      return JSON.stringify({
        now: w.now, tick: w.tick, hero: [w.x, w.y, w.vx, w.anim, w.sprite?.frame], camera: w.camera?.x, magic: w.magic, health: w.health, bottles: w.bottles, card: await cardState(page),
        foes: w.enemies?.map((e) => [e.id, e.state, e.ticks, e.x, e.y, e.vx, e.hp, e.anim, e.phase, e.phaseT]),
        bolts: w.projectiles?.map((b) => [b.id, b.x, b.y]),
      });
    };
    await q(page, 'pause-button').click();
    await menuIs(page, true);
    await screenIs(page, 'main');
    const stopped = await worldOf();
    await page.evaluate('window.__troid.resume()'); // the loop is let go: only the menu holds the world
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(150);
      assert.equal(await worldOf(), stopped, `behind the menu nothing of the world moves: no foe, no bolt, no timer, no animation (sample ${i})`);
    }
    await page.keyboard.press('Escape'); // the pause key goes back into the game from the map
    await menuIs(page, false);
    await waitFor(page, `window.__troid.state().now > ${live.now ?? 0} + 20`, 'the world goes on from where it stopped');
    assert.notEqual(await worldOf(), stopped, 'and then it does move: what was held was held by the menu');
    assert.equal(await cardState(page), 'ready', 'the cooldown ran out once the world was let go');

    // ================================================================================================ I · a place with no map says so, and the menu still works
    await ctx.open('room=movement_test', DESKTOP);
    page = ctx.page;
    await page.evaluate('window.__troid.resume()');
    await waitFor(page, 'window.__troid.state().now > 20', 'the playground runs');
    await q(page, 'pause-button').click();
    await menuIs(page, true);
    await screenIs(page, 'main');
    assert.equal(await q(page, 'map-empty').isVisible(), true, 'the map says there is none of this place');
    assert.equal(await q(page, 'map-empty').textContent(), 'There is no map of this place.');
    assert.equal(await q(page, 'map-zoom-in').isVisible(), false, 'and offers no zoom');
    assert.equal(await page.locator('[data-testid^="map-room-"]').count(), 0, 'nor any room');
    await q(page, 'pause-sound').click();
    await q(page, 'sound-screen').waitFor({ state: 'visible', timeout: 15000 });
    await q(page, 'sound-back').click();
    await screenIs(page, 'main');
    assert.equal(await q(page, 'map-empty').isVisible(), true, 'the way back is the same empty map');
    await q(page, 'pause-resume').click();
    await menuIs(page, false);
  },
};
