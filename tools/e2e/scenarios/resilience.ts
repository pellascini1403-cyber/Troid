import assert from 'node:assert/strict';
import type { BrowserContext, CDPSession, Page } from 'playwright-core';
import { frames } from '../frames';
import type { Ctx, Scenario } from '../scenario';

/**
 * THE GAME THAT DOES NOT BREAK, in a real browser (docs/PROMPT20-LOG.md): what a player meets when something goes wrong, and what a long session leaves behind.
 *
 *  - a frame that throws is skipped and the game goes on; a hundred and twenty in a row are the end, and the page says so — in the player's language — with a button that reloads (and the game that was saved comes back);
 *  - a page that cannot start (the game's code does not arrive, the browser has no WebGL, a download that never ends) says so instead of staying black;
 *  - the GPU takes the context away (a phone that goes to the background does it) and gives it back: the game neither throws nor dies, and draws again;
 *  - cycles of the menu, of every one of its screens, of rooms, fights and defeats leave behind no listener on the window, the document or the page, no timer, no DOM and no heap — measured with the browser's own tools
 *    (the debugger's list of listeners, a wrapper that counts every `setTimeout` / `setInterval` that is still alive, a garbage collection and the size of the heap that remains).
 */
const DESKTOP = { width: 1280, height: 720, dpr: 1 };

async function waitFor(page: Page, expr: string, what: string, tries = 200): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(expr)) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what} (${expr})`);
}
const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);

/** A page's console errors that the scenario expects: taken out of the list the runner fails on, once they were looked at. */
function expectErrors(ctx: Ctx, match: RegExp): string[] {
  const taken = ctx.errors.filter((e) => match.test(e));
  for (const e of taken) ctx.errors.splice(ctx.errors.indexOf(e), 1);
  return taken;
}

/** Counts of what a long session must not grow: listeners on what the page listens on, timers that are alive, DOM nodes and the heap that survives a garbage collection. */
interface Footprint {
  listeners: Record<string, number>;
  timers: number;
  dom: number;
  heap: number;
}
async function listenersOn(cdp: CDPSession, expression: string): Promise<number> {
  const { result } = await cdp.send('Runtime.evaluate', { expression });
  if (!result.objectId) return 0;
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
  await cdp.send('Runtime.releaseObject', { objectId: result.objectId });
  return listeners.length;
}
async function footprint(page: Page, cdp: CDPSession): Promise<Footprint> {
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  const listeners: Record<string, number> = {};
  for (const [name, expression] of [['window', 'window'], ['document', 'document'], ['body', 'document.body'], ['ui', 'document.getElementById("ui")'], ['canvas', 'document.querySelector("#app canvas")']] as const) {
    listeners[name] = await listenersOn(cdp, expression);
  }
  return { listeners, timers: (await page.evaluate('window.__timers()')) as number, dom: (await page.evaluate('document.getElementsByTagName("*").length')) as number, heap: usedSize };
}

/** Wraps `setTimeout` / `setInterval` before the page's own code runs, and counts what is still alive: set, not yet fired, not yet cleared. */
const COUNT_TIMERS = `(() => {
  const alive = new Set();
  const set = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window), setI = window.setInterval.bind(window), clearI = window.clearInterval.bind(window);
  window.setTimeout = function (fn, ms, ...args) { const id = set(function () { alive.delete(id); return typeof fn === 'function' ? fn.apply(this, arguments) : undefined; }, ms, ...args); alive.add(id); return id; };
  window.clearTimeout = function (id) { alive.delete(id); return clear(id); };
  window.setInterval = function (fn, ms, ...args) { const id = setI(fn, ms, ...args); alive.add(id); return id; };
  window.clearInterval = function (id) { alive.delete(id); return clearI(id); };
  window.__timers = () => alive.size;
})()`;
const prepareTimers = async (context: BrowserContext): Promise<void> => void (await context.addInitScript(COUNT_TIMERS));

/** A page the test opens by hand (the runner's `open` waits for a game that, here, is not coming). */
async function raw(ctx: Ctx, query: string, setup: (context: BrowserContext) => Promise<void>, opts: { locale?: string } = {}): Promise<Page> {
  const browser = ctx.page.context().browser();
  assert.ok(browser, 'a browser to open pages in');
  const origin = new URL(ctx.page.url()).origin;
  await ctx.page.context().close();
  const context = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height }, ...(opts.locale ? { locale: opts.locale } : {}) });
  await setup(context);
  const page = await context.newPage();
  // (`commit`: a script that never arrives keeps the page from ever "loading", and that is one of the cases)
  await page.goto(`${origin}/?${query}`, { waitUntil: 'commit' });
  return page;
}

export const resilience: Scenario = {
  name: 'resilience',
  async run(ctx) {
    // ================================================================================================ a frame that throws
    await ctx.open('lang=en', DESKTOP);
    let page = ctx.page;
    await page.evaluate('(() => { const s = window.__troid.session; s.flags.set("defeated:r1_slime"); })()');
    await ctx.step(3);
    await waitFor(page, `(() => { try { return (JSON.parse(localStorage.getItem('troid.progress') ?? 'null')?.flags ?? []).includes('defeated:r1_slime'); } catch { return false; } })()`, 'the game saved what was won');
    await page.evaluate('window.__troid.resume()');
    await waitFor(page, 'window.__troid.state().now > 10', 'the game runs by itself');

    // a few frames that fail: skipped, written down once, and the game goes on
    await page.evaluate('window.__troid.failFrames(4)');
    const before = (await ctx.state()).now!;
    await waitFor(page, `window.__troid.state().now > ${before + 30}`, 'the simulation goes on after four frames that threw');
    assert.equal(await q(page, 'crash').count(), 0, 'four bad frames are not the end');
    let said = expectErrors(ctx, /a frame failed/);
    assert.equal(said.length, 1, `only the first of a run is written (${said.length}: ${said.map((e) => e.slice(0, 80)).join(' | ')})`);
    assert.match(said[0]!, /1 in a row/);
    assert.match(said[0]!, /E2E: a frame that fails/, 'with the error and where it came from');

    // …and when every frame fails, the game stops and says so
    await page.evaluate('window.__troid.failFrames(100000)');
    await q(page, 'crash').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await q(page, 'crash').getAttribute('role'), 'alertdialog');
    assert.equal(await page.locator('#crash-title').textContent(), 'Something went wrong');
    assert.equal(await q(page, 'crash-reload').textContent(), 'Reload');
    assert.equal(await page.evaluate('document.activeElement && document.activeElement.dataset.testid'), 'crash-reload', 'the way out has the focus');
    const frozen = (await ctx.state()).now;
    await page.waitForTimeout(500);
    assert.equal((await ctx.state()).now, frozen, 'the world stopped');
    said = expectErrors(ctx, /a frame failed/);
    assert.ok(said.length >= 2 && said.length <= 4, `a failure that goes on is written now and then, not once a frame (${said.length} lines)`);
    await ctx.shot('crash-page');
    // reloading brings the game that was saved
    const loaded = page.waitForEvent('load', { timeout: 30000 });
    await q(page, 'crash-reload').click();
    await loaded;
    await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
    await waitFor(page, `window.__troid.state().flags.includes('defeated:r1_slime')`, 'the saved game came back');
    assert.equal(await q(page, 'crash').count(), 0);

    // in Spanish when the page is
    await page.evaluate('document.documentElement.lang = "es"');
    await page.evaluate('window.__troid.resume()');
    await page.evaluate('window.__troid.failFrames(100000)');
    await q(page, 'crash').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await page.locator('#crash-title').textContent(), 'Algo ha fallado');
    assert.equal(await q(page, 'crash-reload').textContent(), 'Recargar');
    expectErrors(ctx, /a frame failed/);

    // ================================================================================================ a page that cannot start says so
    // 1 · the game's code does not arrive
    page = await raw(ctx, 'hooks=1&lang=en', async (c) => void (await c.route(/Game2D|\/app-[\w-]+\.js/, (route) => route.abort())));
    await page.waitForFunction(`document.documentElement.dataset.boot === 'failed'`, undefined, { timeout: 30000 });
    let curtain = page.locator('#boot-curtain');
    assert.equal(await curtain.count(), 1, 'the curtain stays up: it carries the message');
    assert.equal(await page.locator('#boot-curtain [role="alert"]').count(), 1, 'and what it says is an alert, read out');
    const boot = (await page.evaluate(`[...document.querySelectorAll('#boot-curtain .boot-msg')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.textContent.trim())`)) as string[];
    assert.equal(boot.length, 1, `one message, in one language (${JSON.stringify(boot)})`);
    assert.match(boot[0]!, /could not start/i);
    assert.equal(await page.locator('#boot-curtain button').isVisible(), true, 'with a way to try again');
    await page.screenshot({ path: '.shots/e2e/resilience-boot-failed.png' });
    // 2 · a browser with no WebGL is not a browser that cannot play: the game falls back to the canvas and plays, picture and all
    page = await raw(
      ctx,
      'hooks=1',
      async (c) =>
        void (await c.addInitScript(`(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(String(type)) ? null : get.call(this, type, ...rest); }; })()`)),
    );
    await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
    assert.equal(await page.evaluate('document.getElementById("boot-curtain")'), null, 'no curtain left, no message: it started');
    await page.evaluate('window.__troid.pause()');
    const x0 = ((await page.evaluate('window.__troid.state()')) as { x: number }).x;
    await page.keyboard.down('KeyD');
    await page.evaluate('window.__troid.step(40)');
    await page.keyboard.up('KeyD');
    assert.ok(((await page.evaluate('window.__troid.state()')) as { x: number }).x > x0 + 2, 'the hero plays on a page with no WebGL');
    assert.equal(await page.locator('canvas').count() >= 1, true);
    // …and the first blow — the first particle — does not break it: the effects arrive in a chunk of their own after the renderer is made, and the pipe that draws their particles has to be the canvas one (Firefox, whose headless build has no
    // WebGL, found it in the CI: the WebGL pipe asked a canvas renderer for a shader system, every frame threw and the page said the game had failed)
    const seen = (): Promise<{ quality: { renderer: string }; vfx: { spawned: number; particles: number } }> => page.evaluate('window.__troid.state()') as never;
    assert.equal((await seen()).quality.renderer, 'canvas', 'with no WebGL the game draws on the canvas');
    const complaints: string[] = [];
    page.on('console', (m) => void (m.type() === 'error' && complaints.push(m.text())));
    page.on('pageerror', (e) => void complaints.push(e.message));
    await waitFor(page, 'window.__troid.effectsReady()', 'the effects arrived on the canvas page');
    await page.evaluate('window.__troid.spawnSlime(window.__troid.state().x + 1.4, 0, -1)');
    await page.evaluate('window.__troid.resume()');
    await page.keyboard.down('KeyJ');
    await waitFor(page, 'window.__troid.state().vfx.spawned > 0', 'the blow made particles on the canvas page');
    await page.waitForTimeout(1500); // …and the frames that draw them (the particles live a fraction of a second) go on
    await page.keyboard.up('KeyJ');
    await page.waitForTimeout(500);
    assert.equal(await q(page, 'crash').count(), 0, 'a blow on a page with no WebGL is not the end of the game');
    assert.deepEqual(complaints.filter((c) => /frame failed/.test(c)), [], 'and no frame failed');
    const sparks = (await seen()).vfx.spawned;
    assert.ok(sparks > 0, `the effects drew (${sparks} spawned)`);
    // 2b · a browser that gives no drawing context at all cannot play, and says so — in Spanish when it is
    page = await raw(
      ctx,
      'hooks=1',
      async (c) => void (await c.addInitScript(`HTMLCanvasElement.prototype.getContext = function () { return null; }`)),
      { locale: 'es-ES' },
    );
    await page.waitForFunction(`document.documentElement.dataset.boot === 'failed'`, undefined, { timeout: 30000 });
    const es = (await page.evaluate(`[...document.querySelectorAll('#boot-curtain .boot-msg')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.textContent.trim())`)) as string[];
    assert.equal(es.length, 1);
    assert.match(es[0]!, /No se ha podido iniciar/i);
    assert.equal(((await page.evaluate(`document.querySelector('#boot-curtain button').innerText.trim()`)) as string), 'Reintentar');
    // 3 · a download that never ends: the page does not stay black for good
    page = await raw(ctx, 'lang=en', async (c) => void (await c.route(/Game2D|\/app-[\w-]+\.js/, () => undefined)));
    await page.waitForFunction(`document.documentElement.dataset.boot === 'stalled'`, undefined, { timeout: 40000 });
    curtain = page.locator('#boot-curtain');
    assert.equal(await curtain.count(), 1, 'the curtain is still up, saying so');
    assert.equal(await page.locator('#boot-curtain button').isVisible(), true);
    await page.context().close();

    // ================================================================================================ the GPU takes the context away, and gives it back
    await ctx.open('room=movement_test&lang=en', DESKTOP);
    page = ctx.page;
    await page.evaluate('window.__troid.resume()');
    await waitFor(page, 'window.__troid.state().now > 10', 'the game runs');
    const lumaOf = async (): Promise<number> => {
      const png = await page.screenshot();
      return (await page.evaluate(
        `(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 36); const d = g.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4); })(${JSON.stringify(png.toString('base64'))})`,
      )) as number;
    };
    await frames(page, 6);
    const drawn = await lumaOf();
    assert.ok(drawn > 3, `the game draws something (${drawn.toFixed(1)})`);
    await page.evaluate(`(() => { const c = document.querySelector('#app canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); window.__lose = gl.getExtension('WEBGL_lose_context'); window.__lost = 0; window.__restored = 0; c.addEventListener('webglcontextlost', () => window.__lost++); c.addEventListener('webglcontextrestored', () => window.__restored++); window.__lose.loseContext(); })()`);
    await waitFor(page, 'window.__lost === 1', 'the context was lost');
    const at = (await ctx.state()).now!;
    await page.waitForTimeout(600);
    assert.ok((await ctx.state()).now! > at, 'the simulation goes on while the screen has no context');
    assert.equal(await q(page, 'crash').count(), 0, 'and nothing was thrown at the player');
    await page.evaluate('window.__lose.restoreContext()');
    await waitFor(page, 'window.__restored === 1', 'the context came back');
    await frames(page, 10);
    await page.waitForTimeout(800);
    const back = await lumaOf();
    assert.ok(Math.abs(back - drawn) < 0.15 * Math.max(drawn, 10), `it draws again, the same room (mean light ${drawn.toFixed(1)} → ${back.toFixed(1)})`);
    assert.equal(await q(page, 'crash').count(), 0);
    await ctx.shot('context-restored');

    // ================================================================================================ a device that cannot draw the effects
    // The effects are cosmetic — nothing in the rules depends on them — and the one part of the drawing the game adds to Pixi's own. A device whose GPU cannot draw one of their parts fails every frame in which it has to (here: the
    // pipe that draws the particles throws, as the WebGL one did on a canvas renderer). A hundred and twenty frames in a row are the end of the game; a third of a second of them is the end of the effects, and the game goes on.
    await ctx.open('room=movement_test&lang=en', DESKTOP);
    page = ctx.page;
    await page.evaluate('window.__troid.resume()');
    await waitFor(page, 'window.__troid.effectsReady()', 'the effects arrived');
    assert.ok((await ctx.state()).quality!.particleBudget !== null, 'the effects are on');
    await page.evaluate(`window.__troid.game.renderer.app.renderer.renderPipes.particle.execute = () => { throw new Error('E2E: this device cannot draw a particle'); }`);
    await page.keyboard.down('KeyJ'); // a blow, as a player would: sparks
    await waitFor(page, 'window.__troid.state().quality.particleBudget === null', 'the effects were given up', 400);
    await page.keyboard.up('KeyJ');
    const kept = (await ctx.state()).now!;
    await waitFor(page, `window.__troid.state().now > ${kept + 60}`, 'the simulation goes on after the effects went');
    await page.waitForTimeout(500); // …and the frames that draw it succeed again: no new line, no page that says the game failed
    assert.equal(await q(page, 'crash').count(), 0, 'frames that failed for the effects alone are not the end of the game');
    said = expectErrors(ctx, /a frame failed/);
    assert.equal(said.length, 1, `one line for the run of failures (${said.length}: ${said.map((e) => e.slice(0, 90)).join(' | ')})`);
    assert.match(said[0]!, /1 in a row/);
    assert.match(said[0]!, /E2E: this device cannot draw a particle/, 'with the error and where it came from');
    assert.ok(ctx.warnings.some((w) => /effects are off for this session/.test(w)), `and the one thing that was given up is written down (${ctx.warnings.map((w) => w.slice(0, 60)).join(' | ')})`);
    // the frames succeed again: nothing is written for the next second and a half (a failure that went on would write a line at the 61st frame, and the page would say the game failed at the 120th)
    await page.waitForTimeout(1500);
    assert.deepEqual(expectErrors(ctx, /a frame failed/), [], 'and no frame fails any more');
    assert.equal(await q(page, 'crash').count(), 0);
    await ctx.shot('effects-given-up');

    // ================================================================================================ a long session leaves nothing behind
    await ctx.open('lang=en&unlock=dash', { ...DESKTOP, prepare: prepareTimers });
    page = ctx.page;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    await page.evaluate('window.__troid.resume()');
    await waitFor(page, 'window.__troid.state().now > 10', 'the game runs');
    const screens = ['pause-controls', 'pause-sound', 'pause-settings', 'pause-saves', 'pause-profile', 'pause-map'];
    const cycle = async (round: number): Promise<void> => {
      await q(page, 'pause-button').click();
      await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 15000 });
      for (const id of screens) {
        await q(page, id).click();
        await page.waitForTimeout(40);
      }
      await q(page, 'pause-resume').click();
      await page.waitForSelector('[data-testid="pause-menu"][data-open="0"]', { state: 'attached', timeout: 15000 });
      // rooms, a fight and a defeat, the way the game does them
      await page.evaluate(`(() => { const s = window.__troid.session; s.loadRoom(${JSON.stringify(['r1_gate', 'r2_hall', 'r3_chamber', 'r1_gate'][round % 4])}); window.__troid.spawnSlime(s.player.body.x + 2, s.player.body.y, -1); })()`);
      await page.evaluate('window.__troid.step(180)');
      await page.evaluate('window.__troid.strikePlayer(99)');
      await page.evaluate('window.__troid.step(240)');
      await page.evaluate('window.__troid.resume()');
    };
    for (let i = 0; i < 4; i++) await cycle(i); // warm up: chunks, caches, pools — everything that is built once
    await frames(page, 10);
    const start = await footprint(page, cdp);
    // three batches of cycles: a cache fills up and stops growing, a leak keeps growing by as much each time
    const heaps = [start.heap];
    let end = start;
    for (let batch = 0; batch < 3; batch++) {
      for (let i = 0; i < 10; i++) await cycle(4 + batch * 10 + i);
      await frames(page, 10);
      end = await footprint(page, cdp);
      heaps.push(end.heap);
    }
    const mb = (n: number): string => (n / 1048576).toFixed(2);
    console.log(`  after 30 cycles   listeners ${JSON.stringify(start.listeners)} → ${JSON.stringify(end.listeners)}   timers ${start.timers} → ${end.timers}   DOM ${start.dom} → ${end.dom}   heap ${heaps.map(mb).join(' → ')} MB`);
    assert.deepEqual(end.listeners, start.listeners, 'no listener was added to the window, the document, the page, the interface or the canvas by 30 cycles');
    assert.ok(end.timers <= start.timers + 2, `no timer was left alive (${start.timers} → ${end.timers})`);
    assert.ok(Math.abs(end.dom - start.dom) <= 12, `the DOM did not grow (${start.dom} → ${end.dom})`);
    assert.ok(end.heap - start.heap < 4 * 1048576, `the heap that survives a collection did not grow by megabytes (${mb(start.heap)} → ${mb(end.heap)} MB)`);
    assert.ok(heaps[3]! - heaps[2]! < 1048576, `and it is not growing by as much each time: the last batch added ${mb(heaps[3]! - heaps[2]!)} MB`);
    assert.equal(await q(page, 'crash').count(), 0);
  },
};
