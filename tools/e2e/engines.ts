/**
 * THE GAME IN OTHER ENGINES (docs/PROMPT20-LOG.md §6): the E2E of `npm run test:e2e` drives Chromium, because it needs the DevTools protocol (fingers by the dozen, a lost WebGL context, heap snapshots). What a player
 * on Firefox or on Safari meets first is something else — does the game START, DRAW, MOVE, PAUSE, SAVE and COME BACK? — and that needs nothing of Chromium. This is that, and only that, on the PRODUCTION build
 * (`npm run build` first), in the engine named:
 *
 *   npx tsx tools/e2e/engines.ts --browser=firefox     (or webkit, or chromium — the default)
 *
 *  - **starts**: the page's curtain lifts (`<html data-boot>` is not `failed` / `stalled`), the first room is up, nothing in the console is an error;
 *  - **draws**: a screenshot of the page has a picture in it (many colours, not one wash);
 *  - **moves**: a real key held moves the hero; a real click or key attacks; Escape opens the pause menu, a language button changes `<html lang>`, Escape closes it;
 *  - **saves and comes back**: what the hero wins is in `localStorage` and a reload continues from it;
 *  - **a finger** (a phone held sideways, real touches): a tap opens the pause menu and a tap on «Continue» closes it WITHOUT the hero attacking — the echo mouse events a browser makes after a touch are exactly the
 *    kind of thing engines differ in.
 *
 * What it is NOT. Playwright's WebKit is the engine of Safari on a Linux desktop: it is not Safari on an iPhone (another system's audio, memory, gestures and WebView), so a pass here says nothing about a device. And
 * all three draw with software GL (or the canvas): the speed of a frame says nothing about a phone. It is the cheapest way to find, before a player does, that a browser does not even start.
 */
import assert from 'node:assert/strict';
import { chromium, firefox, webkit, type Browser, type BrowserContext, type BrowserType, type ConsoleMessage, type Page } from 'playwright-core';
import { launchBrowser, startPreview } from './harness';
import { decodePng } from './png';

const engine = (process.argv.find((a) => a.startsWith('--browser=')) ?? '--browser=chromium').slice('--browser='.length);
const types: Record<string, BrowserType> = { chromium, firefox, webkit };
if (!(engine in types)) {
  console.error(`unknown browser "${engine}" (chromium, firefox or webkit)`);
  process.exit(2);
}

/** A slow engine on a shared runner: generous everywhere (a step that is slow is fine, one that never ends is not). */
const SLOW = 60_000;

const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);
const state = <T = Record<string, unknown>>(page: Page): Promise<T> => page.evaluate('window.__troid.state()') as Promise<T>;

interface Hero { x: number; y: number; room?: string; menuOpen?: boolean; combat?: { attack: string | null }; flags?: string[] }
const hero = (page: Page): Promise<Hero> => state<Hero>(page);

/** What the page complains of: console errors, errors thrown, requests that failed (but not the ones a reload or a navigation aborts). */
function listen(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    if (!/abort|cancel/i.test(why)) errors.push(`requestfailed: ${r.url()} ${why}`);
  });
  return errors;
}

/** A wait that says what it was waiting for when it gives up (a bare «Timeout 60000ms exceeded» says nothing about which of the waits it was). */
async function until(page: Page, expr: string, what: string): Promise<void> {
  try {
    await page.waitForFunction(expr, undefined, { timeout: SLOW });
  } catch {
    assert.fail(`${what} (${expr})`);
  }
}

/** The game is up and the room that was asked for has arrived (the same wait every scenario of the E2E makes, minus the hooks that pause the clock: here the game runs in real time). */
async function up(page: Page): Promise<void> {
  await page.waitForFunction('window.__troid && window.__troid.ready() && !window.__troid.arrival().blocking', undefined, { timeout: SLOW });
  await page.waitForFunction('!window.__troid.effectsReady || window.__troid.effectsReady()', undefined, { timeout: SLOW });
}

/** How many different colours (3 bits a channel) a picture has, and what share of it is not the commonest one. */
function richness(png: Buffer): { colours: number; elsewhere: number } {
  const img = decodePng(png);
  const seen = new Map<number, number>();
  let n = 0;
  for (let y = 0; y < img.height; y += 3) {
    for (let x = 0; x < img.width; x += 3) {
      const o = (y * img.width + x) * 4;
      const key = ((img.data[o]! >> 5) << 6) | ((img.data[o + 1]! >> 5) << 3) | (img.data[o + 2]! >> 5);
      seen.set(key, (seen.get(key) ?? 0) + 1);
      n++;
    }
  }
  return { colours: seen.size, elsewhere: 1 - Math.max(...seen.values()) / n };
}

async function context(browser: Browser, phone: boolean): Promise<BrowserContext> {
  return browser.newContext(
    phone
      ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, ...(engine === 'firefox' ? {} : { isMobile: true }) } // (Firefox does not do `isMobile`)
      : { viewport: { width: 1280, height: 720 } },
  );
}

const lines: string[] = [];
const failures: string[] = [];

/** One check: it says what it was, how long it took and how it went; the next one runs either way (a browser that fails to draw may still pause). */
async function step(what: string, body: () => Promise<string | void>): Promise<void> {
  const t0 = Date.now();
  try {
    const note = await body();
    lines.push(`  ✓ ${what} (${((Date.now() - t0) / 1000).toFixed(1)} s)${note ? ` — ${note}` : ''}`);
  } catch (e) {
    failures.push(what);
    lines.push(`  ✗ ${what}\n      ${(e as Error).message.split('\n').join('\n      ')}`);
  }
}

const server = await startPreview();
const browser = engine === 'chromium' ? await launchBrowser() : await types[engine]!.launch();
console.log(`${engine} ${browser.version()} · the production build at ${server.url}`);

// ---- a desktop: keyboard and mouse
{
  const ctx = await context(browser, false);
  const page = await ctx.newPage();
  const errors = listen(page);
  const url = `${server.url}/?hooks=1&new=1&lang=en`;

  await step('the page starts: the curtain lifts and the first room is up', async () => {
    await page.goto(url, { waitUntil: 'load' });
    await up(page);
    const boot = await page.evaluate('document.documentElement.dataset.boot ?? ""');
    assert.ok(boot !== 'failed' && boot !== 'stalled', `the page says it did not start (data-boot="${boot}")`);
    assert.equal((await hero(page)).room, 'r1_gate', 'a new game starts in R1');
    return `data-boot="${boot}"`;
  });

  await step('the game draws a picture', async () => {
    await page.waitForTimeout(800);
    const { colours, elsewhere } = richness(await page.screenshot({ type: 'png' }));
    assert.ok(colours >= 16, `the page shows ${colours} colours: a blank or flat screen`);
    assert.ok(elsewhere >= 0.05, `${(elsewhere * 100).toFixed(1)}% of the page is not its commonest colour: nothing is drawn on it`);
    return `${colours} colours, ${(elsewhere * 100).toFixed(0)}% off the background`;
  });

  await step('a held key moves the hero', async () => {
    const x0 = (await hero(page)).x;
    await page.keyboard.down('KeyD');
    await until(page, `window.__troid.state().x > ${x0 + 1}`, 'the hero moved with the key held');
    await page.keyboard.up('KeyD');
    return `x ${x0.toFixed(1)} → ${(await hero(page)).x.toFixed(1)}`;
  });

  await step('a key attacks (and so does the mouse)', async () => {
    await page.keyboard.down('KeyJ');
    await until(page, 'window.__troid.state().combat && window.__troid.state().combat.attack !== null', 'the key started a blow');
    await page.keyboard.up('KeyJ');
    await until(page, 'window.__troid.state().combat.attack === null', 'the blow of the key ended');
    await page.mouse.move(640, 300);
    await page.mouse.down();
    await until(page, 'window.__troid.state().combat.attack !== null', 'the mouse started a blow');
    await page.mouse.up();
    await until(page, 'window.__troid.state().combat.attack === null', 'the blow of the mouse ended');
  });

  await step('Escape opens the pause menu, a button changes the language, Escape goes back and Continue closes it', async () => {
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: SLOW });
    await q(page, 'pause-settings').click();
    await q(page, 'settings-lang-es').click();
    await until(page, "document.documentElement.lang === 'es'", 'the language of the page became Spanish');
    await q(page, 'settings-lang-en').click();
    await until(page, "document.documentElement.lang === 'en'", 'and English again');
    await page.keyboard.press('Escape'); // (from a screen of the menu: back to the map, the menu stays)
    await until(page, "document.querySelector('[data-testid=\"pause-menu\"]')?.dataset.screen === 'main'", 'Escape went back to the map of the menu');
    await page.keyboard.press('Escape'); // (from the map: into the game)
    await until(page, "!window.__troid.state().menuOpen && document.querySelector('[data-testid=\"pause-menu\"]')?.dataset.open !== '1'", 'the second Escape closed the menu');
  });

  await step('what the hero wins is saved, and a reload continues from it', async () => {
    await page.evaluate('window.__troid.session.flags.set("defeated:r1_slime")');
    await until(page, `(localStorage.getItem('troid.progress') ?? '').includes('defeated:r1_slime')`, 'what the hero won was written to the storage');
    await page.reload({ waitUntil: 'load' });
    await up(page);
    const flags = (await hero(page)).flags ?? [];
    assert.ok(flags.includes('defeated:r1_slime'), `the reloaded game lost what was won (${flags.join(', ')})`);
    const keys = (await page.evaluate('Object.keys(localStorage)')) as string[];
    assert.ok(keys.length > 0 && keys.every((k) => k.startsWith('troid.')), `the page keeps only its own entries (${keys.join(', ')})`);
    return `kept: ${keys.sort().join(', ')}`;
  });

  await step('the console stays clean', async () => {
    assert.deepEqual(errors, [], 'the page complained');
  });
  await ctx.close();
}

// ---- the sound: the context a first key creates, and the formats the browser can play
{
  const ctx = await context(browser, false);
  const page = await ctx.newPage();
  const errors = listen(page);

  await step('the sound: a first key wakes the audio engine, the browser says which formats it plays, and the game plays on', async () => {
    await page.goto(`${server.url}/?hooks=1&audio=on&new=1&lang=en`, { waitUntil: 'load' });
    await up(page);
    await page.keyboard.press('KeyD'); // a gesture: before it there is no audio context at all
    await until(page, 'window.__troid.state().audio != null', 'the audio engine woke after the first key');
    await page.keyboard.down('KeyJ');
    await until(page, 'window.__troid.state().combat && window.__troid.state().combat.attack !== null', 'a blow started with the sound on');
    await page.keyboard.up('KeyJ');
    const { audio } = await state<{ audio: { engine: { state: string; played: number }; formats: string[]; sounds: number; loader: { groups: Record<string, { state: string; failed: number }> } } }>(page);
    assert.ok(audio.formats.length > 0, 'the browser plays none of the formats the game ships (Opus, MP3): the game would be silent');
    const failed = Object.entries(audio.loader.groups).filter(([, g]) => g.failed > 0).map(([name]) => name);
    assert.deepEqual(failed, [], 'groups of sounds that failed to load');
    // (whether the context RUNS depends on the runner having a sound device and on the browser's autoplay rule: it is reported, not demanded)
    return `context ${audio.engine.state} · plays ${audio.formats.join(', ')} · ${audio.engine.played} sounds played so far`;
  });

  await step('the console stays clean', async () => {
    assert.deepEqual(errors, [], 'the page complained');
  });
  await ctx.close();
}

// ---- a phone held sideways: real touches
{
  const ctx = await context(browser, true);
  const page = await ctx.newPage();
  const errors = listen(page);

  await step('a finger: a tap opens the pause menu and a tap on «Continue» closes it without a blow', async () => {
    await page.goto(`${server.url}/?hooks=1&new=1&lang=en`, { waitUntil: 'load' });
    await up(page);
    const centre = async (id: string): Promise<{ x: number; y: number }> => {
      const box = await q(page, id).boundingBox();
      assert.ok(box, `${id} is on the page`);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const blows: string[] = [];
    await page.exposeFunction('__blow', (what: string) => void blows.push(what));
    await page.evaluate(`window.__troid.session.bus.on('player:attacked', (e) => window.__blow(String(e && e.attackId)))`);
    const pause = await centre('pause-button');
    await page.touchscreen.tap(pause.x, pause.y);
    await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: SLOW });
    const back = await centre('pause-resume');
    await page.touchscreen.tap(back.x, back.y);
    await until(page, "document.querySelector('[data-testid=\"pause-menu\"]')?.dataset.open !== '1'", 'the tap on «Continue» closed the menu');
    // the browser's own echo of a touch (mousedown / mouseup / click on whatever is under the finger) arrives within a moment: the hero must not strike with it
    for (let i = 0; i < 20; i++) {
      assert.equal((await hero(page)).combat?.attack ?? null, null, 'the hero attacked after a tap on «Continue»');
      await page.waitForTimeout(50);
    }
    assert.deepEqual(blows, [], 'the simulation counted a blow');
    const device = (await state<{ device?: string }>(page)).device;
    assert.equal(device, 'touch', `the game knows a finger is playing (device "${device}")`);
  });

  await step('the console stays clean', async () => {
    assert.deepEqual(errors, [], 'the page complained');
  });
  await ctx.close();
}

await browser.close();
await server.close();
console.log(lines.join('\n'));
if (failures.length > 0) {
  console.error(`\n${engine}: ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(`\n${engine}: all checks passed (the production build, software drawing; not a device)`);
