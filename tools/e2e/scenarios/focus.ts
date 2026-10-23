import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { neighbour, type PadBox } from '@/ui/settings/padNav';
import { frames } from '../frames';
import type { Ctx, Scenario } from '../scenario';
import { centreOf, TouchScreen } from '../touch';

/**
 * THE WINDOW, THE ORIENTATION AND THE PAD IN THE MENUS, in a real browser (docs/PROMPT20-LOG.md):
 *
 *  - a window that loses the focus (another window in front, the address bar) lets go of every key that was held and waits at the pause menu; the game after it is not running on a key nobody holds. The browser raises a
 *    `blur` at the window when that happens — the test raises it by hand: no physical focus is moved, and what is proven is what the page does with the event;
 *  - a pad that is pulled out while it is the one in use stops the hero (the source lets go of everything) and the game waits at the menu; a pad that is not the one in use changes nothing;
 *  - a touch screen held upright: a line under the HUD asks to turn the device, clear of the HUD, the pause button, the controls and the notch; "play anyway" is a real tap and is not a press of the game; turning the
 *    device closes it and holding it upright again says it once more; a mouse in a tall window is not asked to turn anything;
 *  - the pad in the menus: Start, the D-pad and the stick, A and B reach every control of every screen (the same nearest-control rule the page uses, run over the real layout of each screen at a desktop and at a phone
 *    held sideways), sliders take left and right, the map takes the stick, the focus is drawn and the world stays held the whole time. A pad in a menu is the abstract pad of the test hook: no physical device.
 */
const DESKTOP = { width: 1280, height: 720, dpr: 1 };
const PHONE = { width: 844, height: 390, dpr: 2, touch: true };
const PORTRAIT = { width: 390, height: 844, dpr: 3, touch: true };
const SAFE = '47,0,34,0';

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

async function waitFor(page: Page, expr: string, what: string, tries = 160): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(expr)) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what} (${expr})`);
}
const menuIs = (page: Page, open: boolean): Promise<void> =>
  waitFor(page, `document.querySelector('[data-testid="pause-menu"]')?.dataset.open === '${open ? '1' : '0'}' && window.__troid.state().menuOpen === ${open}`, `the menu is ${open ? 'open' : 'closed'}`);
const screenIs = (page: Page, screen: string): Promise<void> =>
  waitFor(page, `document.querySelector('[data-testid="pause-menu"]')?.dataset.screen === '${screen}' && document.querySelector('[data-testid="pause-menu"]')?.dataset.open === '1'`, `the menu is on its ${screen} screen`);
const rectOf = async (page: Page, id: string): Promise<Rect> => {
  const r = (await page.evaluate(
    `(() => { const e = document.querySelector('[data-testid="${id}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; })()`,
  )) as Rect | null;
  assert.ok(r, `${id} is in the page`);
  return r;
};
const apart = (a: Rect, b: Rect): boolean => a.x1 <= b.x0 + 0.5 || b.x1 <= a.x0 + 0.5 || a.y1 <= b.y0 + 0.5 || b.y1 <= a.y0 + 0.5;
const activeId = (page: Page): Promise<string> => page.evaluate(`(() => { const a = document.activeElement; return (a && (a.dataset.testid || a.className)) || ''; })()`) as Promise<string>;

/** A clock the test holds: the pad listens by `performance.now()`, and a held direction repeats by it — with a stopped clock a press is exactly one step, however slow the frames of a software renderer are. */
const freezeClock = (page: Page): Promise<void> => page.evaluate(`(() => { const real = performance.now.bind(performance); const c = (window.__clock = { value: real(), real }); performance.now = () => c.value; })()`);
const moveClock = (page: Page, ms: number): Promise<void> => page.evaluate(`window.__clock.value += ${ms}`);
const thawClock = (page: Page): Promise<void> => page.evaluate('performance.now = window.__clock.real');

/** The abstract pad (`__troid.pad`), in its own terms: the stick's +y is DOWN. */
const setPad = (page: Page, x: number, y: number, buttons: number[] = []): Promise<unknown> => page.evaluate(`window.__troid.pad.set(${x}, ${y}, ${JSON.stringify(buttons)})`);

/**
 * One press of the pad in the menu: held for a few frames — the pad is POLLED once per frame, and a press that comes and goes between two polls is not seen — and let go. With the clock stopped that is one step,
 * or one press of A, whatever the speed of the frames.
 */
async function padPress(page: Page, x: number, y: number, buttons: number[] = []): Promise<void> {
  await setPad(page, x, y, buttons);
  await frames(page, 3);
  await setPad(page, 0, 0, []);
  await frames(page, 3);
}
/** The directions of the stick (+y is down for the pad: the page flips it) and the buttons. */
const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
const A = 0;
const B = 1;
const X = 2;
const Y = 3;
const LB = 4;
const go = (page: Page, dir: keyof typeof DIR): Promise<void> => padPress(page, DIR[dir][0], DIR[dir][1]);

/** What the pad can reach in the menu now, as the page sees it: the visible, enabled controls of the open screen and of the column, with their boxes (the map is one stop). */
async function reachable(page: Page): Promise<Array<{ id: string; box: PadBox }>> {
  return (await page.evaluate(`(() => {
    const menu = document.querySelector('[data-testid="pause-menu"]');
    const screen = menu.dataset.screen;
    const shown = (e) => !e.disabled && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0;
    const used = new Map();
    const id = (e) => { const base = e.dataset.testid || e.dataset.id || e.className; const n = used.get(base) || 0; used.set(base, n + 1); return n === 0 ? base : base + '#' + n; };
    const list = [];
    const scope = screen === 'main' ? null : menu.querySelector('.troid-settings[data-open="1"]');
    if (screen === 'main') { const map = menu.querySelector('.map-view'); if (map && shown(map)) list.push(map); }
    else if (scope) for (const e of scope.querySelectorAll('button, input[type="range"]')) if (shown(e)) list.push(e);
    for (const e of menu.querySelectorAll('.pm-side button')) if (shown(e)) list.push(e);
    return list.map((e) => { const r = e.getBoundingClientRect(); return { id: id(e), box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }; });
  })()`)) as Array<{ id: string; box: PadBox }>;
}

/** Every control that can be reached from the first one by some run of steps, by the rule the page uses over the layout the browser made. */
function reach(controls: Array<{ id: string; box: PadBox }>, from: string): Set<string> {
  const seen = new Set([from]);
  const todo = [from];
  while (todo.length) {
    const name = todo.pop();
    const here = controls.find((c) => c.id === name);
    if (!here) continue;
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      const to = neighbour(here.box, controls.filter((c) => c !== here).map((c) => ({ item: c.id, box: c.box })), dir);
      if (to && !seen.has(to)) {
        seen.add(to);
        todo.push(to);
      }
    }
  }
  return seen;
}

/** Opens the pause menu of a game that is not running, as a player with a keyboard would (the key is heard on a tick), and hands it to the pad: the first press of a pad button only wakes it up as the device in use. */
async function openForPad(ctx: Ctx): Promise<void> {
  const page = ctx.page;
  await page.keyboard.press('Escape');
  await ctx.step(1);
  await menuIs(page, true);
  await screenIs(page, 'main');
  await padPress(page, 0, 0, [LB]); // the pad is the device in use now; this press does nothing in a menu
  await moveClock(page, 400); // …and the menu has settled
  await frames(page, 2);
}

export const focus: Scenario = {
  name: 'focus',
  async run(ctx) {
    // ================================================================================================ the window loses the focus
    await ctx.open('room=movement_test&lang=en', DESKTOP);
    let page = ctx.page;
    await ctx.teleport(60, 0);
    await page.evaluate('window.__troid.resume()'); // the loop runs in real time: a player's game
    await page.keyboard.down('KeyD');
    await waitFor(page, 'window.__troid.state().vx > 8', 'the hero runs');
    assert.equal((await ctx.state()).menuOpen, false);
    await page.evaluate(`window.dispatchEvent(new Event('blur'))`); // what the browser raises when another window takes the focus
    await menuIs(page, true);
    const frozen = (await ctx.state()).now;
    await page.waitForTimeout(400);
    assert.equal((await ctx.state()).now, frozen, 'the world waits at the menu');
    await page.keyboard.press('Escape'); // …and the player comes back, with D still down as far as the browser knows: the key was let go of when the window lost the focus
    await menuIs(page, false);
    // (the loop of a software renderer runs few ticks a second: wait for the hero to come to rest rather than for a time — a key that stayed down would keep him running for ever)
    await waitFor(page, 'Math.abs(window.__troid.state().vx) < 0.5', 'the hero does not run on a key nobody lets go of any more', 200);
    let s = await ctx.state();
    const x0 = s.x;
    await page.waitForTimeout(400);
    assert.ok(Math.abs((await ctx.state()).x - x0) < 0.3, 'and stands there');
    await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyD'); // a fresh press plays as ever
    await waitFor(page, 'window.__troid.state().vx > 8', 'the keyboard plays after the window came back');
    await page.keyboard.up('KeyD');
    // a blur with the menu already open is not a second menu
    await page.evaluate(`window.dispatchEvent(new Event('blur'))`);
    await menuIs(page, true);
    await page.evaluate(`window.dispatchEvent(new Event('blur'))`);
    await page.waitForTimeout(150);
    assert.equal(await page.locator('[data-testid="pause-menu"]').count(), 1);
    await page.keyboard.press('Escape');
    await menuIs(page, false);

    // ================================================================================================ the pad that is in use is pulled out
    // while the keyboard is the device in use, a pad that goes changes nothing
    await page.evaluate(`window.dispatchEvent(new Event('gamepaddisconnected'))`);
    await page.waitForTimeout(300);
    assert.equal((await ctx.state()).menuOpen, false, 'a pad that was not in use going away does not stop the game');
    await setPad(page, 0.6, 0);
    await waitFor(page, `window.__troid.state().device === 'gamepad'`, 'the pad is the device in use');
    await setPad(page, 0, 0);
    await page.evaluate('window.__troid.pad.disconnect()');
    await page.evaluate(`window.dispatchEvent(new Event('gamepaddisconnected'))`); // the event the browser raises with it
    await menuIs(page, true);
    await page.keyboard.press('Escape');
    await menuIs(page, false);
    await page.evaluate('window.__troid.pad.remove()');

    // ================================================================================================ a touch screen held upright
    await ctx.open(`touch=1&room=movement_test&lang=en&safe=${SAFE}`, PORTRAIT);
    page = ctx.page;
    await ctx.step(3);
    const notice = 'rotate-notice';
    await waitFor(page, `document.querySelector('[data-testid="${notice}"]')?.dataset.open === '1'`, 'the notice asks to turn the device');
    assert.equal(await page.locator('[data-testid="rotate-text"]').textContent(), 'Turn your device: the game is played sideways.');
    assert.equal(await page.locator('[data-testid="rotate-play"]').textContent(), 'Play anyway');
    const box = await rectOf(page, notice);
    assert.ok(box.x0 >= 0 && box.x1 <= PORTRAIT.width, `inside the window (${JSON.stringify(box)})`);
    assert.ok(box.y0 >= 47, 'under the notch');
    const hudBottom = (await page.evaluate(`Math.max(...[...document.querySelectorAll('[data-testid="hud"] *')].map((e) => e.getBoundingClientRect().bottom))`)) as number;
    assert.ok(box.y0 >= hudBottom - 0.5, `under the HUD (${box.y0} vs ${hudBottom})`);
    for (const id of ['pause-button', 'touch-attack', 'touch-dash', 'touch-ability']) {
      const other = await rectOf(page, id).catch(() => null);
      if (other && other.x1 > other.x0) assert.ok(apart(box, other), `clear of ${id}`);
    }
    const picture = (await page.evaluate('(() => { const v = window.__troid.state().view; return { top: v.barY, bottom: v.barY + v.contentHeight }; })()')) as { top: number; bottom: number };
    assert.ok(box.y1 <= picture.top + 0.5, `and above the picture (${box.y1} vs ${picture.top}): nothing of the game is covered`);
    assert.equal(await page.locator('[data-testid="rotate-play"]').evaluate((e) => (e as HTMLElement).tabIndex), -1, 'it never takes the focus: the keys of the game cannot press it');
    await ctx.shot('portrait-notice');
    // a real tap on "play anyway": it closes the notice and is not a press of the game
    const before = await ctx.state();
    const finger = await new TouchScreen(page).init();
    const at = await centreOf(page, 'rotate-play');
    await finger.touch(1, at.x, at.y);
    await finger.lift(1);
    await waitFor(page, `document.querySelector('[data-testid="${notice}"]')?.dataset.open === '0'`, '"play anyway" closes it');
    await ctx.step(10);
    s = await ctx.state();
    assert.equal(s.state, before.state, 'the tap was not a press of the game');
    assert.equal(s.x, before.x, 'nor a step');
    // it stays away while the window stays upright (a resize that is still upright asks again; the choice stands)…
    await page.setViewportSize({ width: 380, height: 840 });
    await page.waitForTimeout(250);
    assert.equal(await page.locator(`[data-testid="${notice}"]`).getAttribute('data-open'), '0', 'it stays away');
    // …until the device has been turned and is held upright again
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(250);
    assert.equal(await page.locator(`[data-testid="${notice}"]`).getAttribute('data-open'), '0', 'sideways there is nothing to ask');
    await page.setViewportSize({ width: 390, height: 844 });
    await waitFor(page, `document.querySelector('[data-testid="${notice}"]')?.dataset.open === '1'`, 'held upright again, it says it once more');
    // and it goes by itself when the device is turned
    await page.setViewportSize({ width: 844, height: 390 });
    await waitFor(page, `document.querySelector('[data-testid="${notice}"]')?.dataset.open === '0'`, 'turned, it goes');
    await frames(page, 2);
    await ctx.shot('landscape-no-notice');

    // a tablet held upright, and a mouse in a tall window
    await ctx.open(`touch=1&room=movement_test&lang=es&safe=24,0,20,0`, { width: 768, height: 1024, dpr: 2, touch: true });
    page = ctx.page;
    await ctx.step(3);
    await waitFor(page, `document.querySelector('[data-testid="${notice}"]')?.dataset.open === '1'`, 'a tablet held upright is asked too');
    assert.equal(await page.locator('[data-testid="rotate-text"]').textContent(), 'Gira el dispositivo: el juego se juega en horizontal.');
    assert.equal(await page.locator('[data-testid="rotate-play"]').textContent(), 'Jugar así');
    // (a tablet's HUD is larger and its black is shorter: the line may reach into the top of the picture there, which is sky — what it never does is cover the HUD or a finger's target)
    const tablet = await rectOf(page, notice);
    assert.ok(tablet.x0 >= 0 && tablet.x1 <= 768 && tablet.y0 >= 24, `a tablet: inside the window and under its safe area (${JSON.stringify(tablet)})`);
    const tabletHud = (await page.evaluate(`Math.max(...[...document.querySelectorAll('[data-testid="hud"] *')].map((e) => e.getBoundingClientRect().bottom))`)) as number;
    assert.ok(tablet.y0 >= tabletHud - 0.5, `a tablet: under the HUD (${tablet.y0} vs ${tabletHud})`);
    for (const id of ['pause-button', 'touch-attack', 'touch-dash', 'touch-ability']) {
      const other = await rectOf(page, id).catch(() => null);
      if (other && other.x1 > other.x0) assert.ok(apart(tablet, other), `a tablet: clear of ${id}`);
    }
    await ctx.shot('tablet-notice');
    await ctx.open('room=movement_test&lang=en', { width: 600, height: 900, dpr: 1 });
    page = ctx.page;
    await ctx.step(3);
    await page.waitForTimeout(250);
    assert.equal(await page.locator(`[data-testid="${notice}"]`).getAttribute('data-open'), '0', 'a mouse in a tall window has no device to turn');

    // ================================================================================================ a finger that closes the menu is not a sword stroke
    // (the browser makes mouse events after a tap, at what is under the finger when it has lifted: when the button just closed its menu, that is the game)
    await ctx.open('touch=1&room=movement_test&lang=en', PHONE);
    page = ctx.page;
    await page.evaluate('window.__troid.resume()');
    await page.waitForTimeout(500);
    const hand = await new TouchScreen(page).init();
    const tapOn = async (id: string): Promise<void> => {
      const c = await centreOf(page, id);
      await hand.touch(1, c.x, c.y);
      await hand.lift(1);
    };
    await tapOn('pause-button');
    await menuIs(page, true);
    await page.waitForTimeout(300);
    assert.equal((await ctx.state()).combat?.attack, null, 'opening the menu with a finger is not a stroke either');
    await tapOn('pause-resume');
    await menuIs(page, false);
    for (let i = 0; i < 8; i++) {
      const w = await ctx.state();
      assert.equal(w.combat?.attack, null, `closing the menu with a finger did not attack (sample ${i})`);
      assert.equal(w.state, 'free');
      await page.waitForTimeout(120);
    }
    assert.equal((await ctx.state()).device, 'touch', 'and the prompts still speak of fingers');

    // ================================================================================================ the pad in the menus (desktop)
    await ctx.open('paused=1&lang=en', DESKTOP);
    page = ctx.page;
    await freezeClock(page);
    await openForPad(ctx);
    const worldBefore = await ctx.state();
    assert.equal(await activeId(page), 'pause-resume', 'the menu opens on Continue');
    await go(page, 'down');
    assert.equal(await activeId(page), 'pause-map', 'down goes to the next option');
    assert.equal(await page.locator('[data-testid="pause-menu"]').getAttribute('data-pad'), '1', 'the focus is drawn for the pad');
    const ring = (await page.evaluate(`getComputedStyle(document.activeElement).boxShadow`)) as string;
    assert.notEqual(ring, 'none', 'and the focused option is drawn lit');
    await ctx.shot('pad-focus-column');
    await go(page, 'down');
    assert.equal(await activeId(page), 'pause-controls');
    await go(page, 'up');
    await go(page, 'up');
    assert.equal(await activeId(page), 'pause-resume');
    await go(page, 'up');
    assert.equal(await activeId(page), 'pause-resume', 'nothing above Continue');

    // every control of every screen can be reached with the pad, over the layout the browser made
    for (const [entry, screenName] of [['pause-controls', 'controls'], ['pause-sound', 'sound'], ['pause-settings', 'settings'], ['pause-saves', 'saves'], ['pause-profile', 'profile']] as const) {
      await page.locator(`[data-testid="${entry}"]`).focus();
      await padPress(page, 0, 0, [A]);
      await screenIs(page, screenName);
      await frames(page, 2);
      const all = await reachable(page);
      const start = all.find((c) => c.id === entry);
      assert.ok(start, `${entry} is in the column`);
      const seen = reach(all, entry);
      const missing = all.filter((c) => !seen.has(c.id)).map((c) => c.id);
      assert.deepEqual(missing, [], `${screenName}: every control is a step away from some other (${all.length} of them)`);
      assert.ok(all.length >= 8, `${screenName}: there is something to reach (${all.length})`);
      await padPress(page, 0, 0, [B]); // B: back to the map
      await screenIs(page, 'main');
    }
    const mainControls = await reachable(page);
    assert.ok(reach(mainControls, 'pause-resume').has('map'), 'the map is a stop of the main screen, reached from the column');

    // a screen by hand: Sound — down the column, in, along the sliders, out
    await page.locator('[data-testid="pause-sound"]').focus();
    await padPress(page, 0, 0, [A]);
    await screenIs(page, 'sound');
    await go(page, 'left'); // into the screen
    const inScreen = await page.evaluate(`!!document.activeElement.closest('.troid-settings')`);
    assert.equal(inScreen, true, 'left goes into the screen');
    const level = async (): Promise<number> => (await ctx.state()).volume!.levels.master;
    // find the master slider by going down from where the focus landed
    for (let i = 0; i < 6 && (await activeId(page)) !== 'settings-volume'; i++) await go(page, 'down');
    for (let i = 0; i < 6 && (await activeId(page)) !== 'settings-volume'; i++) await go(page, 'up');
    assert.equal(await activeId(page), 'settings-volume', 'the master volume slider has the focus');
    const v0 = await level();
    await go(page, 'left');
    await go(page, 'left');
    const v1 = await level();
    assert.ok(v1 < v0 - 0.05, `left lowers the volume (${v0} → ${v1})`);
    assert.equal(await activeId(page), 'settings-volume', 'and the focus stays on the slider');
    await go(page, 'right');
    const v2 = await level();
    assert.ok(v2 > v1, `right raises it (${v1} → ${v2})`);
    // up/down leave the slider
    await go(page, 'down');
    assert.notEqual(await activeId(page), 'settings-volume');
    await ctx.shot('pad-sound');
    await padPress(page, 0, 0, [B]);
    await screenIs(page, 'main');

    // the map: left from the column reaches it, the stick moves it, A centres it, X and Y bring it closer and farther, B goes back to the column
    await page.locator('[data-testid="pause-resume"]').focus();
    await go(page, 'left');
    assert.equal(await page.evaluate(`document.activeElement.classList.contains('map-view')`), true, 'left reaches the map');
    const view = async (): Promise<{ scale: number; x: number; moved: string }> =>
      (await page.evaluate(`(() => { const m = document.querySelector('.map-view'); return { scale: Number(m.dataset.scale), x: Number(m.dataset.x), moved: m.dataset.moved }; })()`)) as { scale: number; x: number; moved: string };
    const m0 = await view();
    await padPress(page, 0, 0, [X]);
    const m1 = await view();
    assert.ok(m1.scale > m0.scale, `X brings the map closer (${m0.scale} → ${m1.scale})`);
    await go(page, 'right'); // it moves under the stick
    const m2 = await view();
    assert.notEqual(m2.x, m1.x, 'the stick moves the map');
    assert.equal(m2.moved, '1');
    await padPress(page, 0, 0, [Y]);
    await padPress(page, 0, 0, [Y]);
    assert.ok((await view()).scale < m1.scale, 'Y takes it farther');
    await padPress(page, 0, 0, [A]);
    assert.equal((await view()).moved, '0', 'A puts it back on the hero');
    await ctx.shot('pad-map');
    await padPress(page, 0, 0, [B]);
    assert.equal(await activeId(page), 'pause-resume', 'B leaves the map for the column');
    // …and B from the column goes back into the game
    await padPress(page, 0, 0, [B]);
    await menuIs(page, false);
    const worldAfter = await ctx.state();
    assert.equal(worldAfter.now, worldBefore.now, 'the world did not move while the pad crossed the menus');
    assert.equal(worldAfter.x, worldBefore.x);
    assert.equal(worldAfter.health, worldBefore.health);
    await thawClock(page);

    // ================================================================================================ the pad in the menus on a phone held sideways (the screens scroll: the focus is brought into view)
    await ctx.open('paused=1&lang=en&touch=1', PHONE);
    page = ctx.page;
    await freezeClock(page);
    await openForPad(ctx);
    for (const [entry, screenName] of [['pause-controls', 'controls'], ['pause-settings', 'settings'], ['pause-saves', 'saves']] as const) {
      await page.locator(`[data-testid="${entry}"]`).focus();
      await padPress(page, 0, 0, [A]);
      await screenIs(page, screenName);
      await frames(page, 2);
      const all = await reachable(page);
      const seen = reach(all, entry);
      const missing = all.filter((c) => !seen.has(c.id)).map((c) => c.id);
      assert.deepEqual(missing, [], `phone · ${screenName}: every control is reachable (${all.length} of them)`);
      // down through the whole screen: the last control comes into view (it scrolls), and it is the way back
      await go(page, 'left');
      let last = '';
      for (let i = 0; i < 40 && (await activeId(page)) !== last; i++) {
        last = await activeId(page);
        await go(page, 'down');
      }
      const lastBox = await page.evaluate(`(() => { const e = document.activeElement; const r = e.getBoundingClientRect(); return { y0: r.top, y1: r.bottom, id: e.dataset.testid || e.className }; })()`) as { y0: number; y1: number; id: string };
      assert.ok(lastBox.y1 <= PHONE.height + 0.5 && lastBox.y0 >= -0.5, `phone · ${screenName}: the control the focus ended on is on the screen (${JSON.stringify(lastBox)})`);
      await padPress(page, 0, 0, [B]);
      await screenIs(page, 'main');
    }
    await ctx.shot('pad-phone');
    await thawClock(page);
  },
};
