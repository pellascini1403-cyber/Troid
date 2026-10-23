import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { Scenario } from '../scenario';

/**
 * WHAT THE GAME SENDS AND WHAT IT KEEPS (docs/PROMPT20-LOG.md, docs/PUBLISHING.md): the privacy statement of the stores is a claim about the program, so the program is made to show it. A player's session — a new game, the
 * walk, the pause menu with every one of its screens, a setting changed, a game saved, the end of the adventure, a reload — is recorded request by request, and the page's storage is listed afterwards:
 *
 *  - every request goes to the game's OWN origin (and nothing to an analytics, advertising or any other third party; a `blob:` or `data:` URL never leaves the page);
 *  - no cookie is set, and the page keeps nothing but its own `troid.*` entries in `localStorage` — no IndexedDB, no cache storage, no service worker;
 *  - no beacon is sent and no socket is opened (but the development server's own, which a production build does not have).
 */
const DESKTOP = { width: 1280, height: 720, dpr: 1 };
const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);

export const privacy: Scenario = {
  name: 'privacy',
  async run(ctx) {
    const requests: string[] = [];
    await ctx.open('new=1&lang=en', {
      ...DESKTOP,
      prepare: async (context) => {
        context.on('request', (r) => void requests.push(r.url()));
        await context.addInitScript(`(() => {
          window.__beacons = 0; window.__sockets = [];
          const beacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
          navigator.sendBeacon = function (...a) { window.__beacons++; return beacon ? beacon(...a) : false; };
          const Socket = window.WebSocket;
          window.WebSocket = function (url, ...rest) { window.__sockets.push(String(url)); return new Socket(url, ...rest); };
          window.WebSocket.prototype = Socket.prototype;
        })()`);
      },
    });
    const page = ctx.page;
    const origin = new URL(page.url()).origin;

    // ---- a session
    await page.keyboard.down('KeyD');
    await ctx.step(40);
    await page.keyboard.up('KeyD');
    await page.evaluate('window.__troid.session.flags.set("defeated:r1_slime")'); // something won: the game saves
    await ctx.step(5);
    await q(page, 'pause-button').click();
    await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 15000 });
    for (const id of ['pause-controls', 'pause-sound', 'pause-settings', 'pause-saves', 'pause-profile']) {
      await q(page, id).click();
      await page.waitForTimeout(200);
    }
    await q(page, 'pause-saves').click();
    await page.waitForSelector('[data-testid="saves-screen"][data-open="1"][data-ready="1"]', { timeout: 15000 });
    await q(page, 'saves-save-now').click();
    await page.waitForTimeout(400);
    await q(page, 'pause-settings').click();
    await q(page, 'settings-lang-es').click();
    await page.waitForTimeout(200);
    await q(page, 'pause-resume').click();
    await page.evaluate(`window.__troid.session.bus.emit('adventure:ended', { roomId: 'r4_sanctum', exitId: 'east' })`);
    await page.waitForSelector('[data-testid="ending-screen"][data-open="1"]', { timeout: 15000 });
    await page.waitForTimeout(500);
    const loaded = page.waitForEvent('load', { timeout: 30000 });
    await page.reload();
    await loaded;
    await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
    await page.waitForTimeout(800);

    // ---- what went out
    const foreign = requests.filter((u) => {
      if (/^(data|blob):/.test(u)) return false;
      const url = new URL(u);
      return url.host !== new URL(origin).host; // (`ws:` of the development server has the same host)
    });
    assert.deepEqual(foreign, [], 'every request of a whole session is to the game\'s own origin');
    assert.ok(requests.length > 20, `the session really loaded things (${requests.length} requests)`);
    assert.equal(await page.evaluate('window.__beacons'), 0, 'no beacon was sent');
    const sockets = (await page.evaluate('window.__sockets')) as string[];
    assert.ok(sockets.every((s) => new URL(s).host === new URL(origin).host), `no socket to anyone else (${JSON.stringify(sockets)})`);

    // ---- what is kept
    assert.deepEqual(await page.context().cookies(), [], 'no cookie was set');
    assert.equal(await page.evaluate('document.cookie'), '', 'and the page sees none');
    const keys = (await page.evaluate('Object.keys(localStorage)')) as string[];
    assert.ok(keys.length > 0 && keys.every((k) => k.startsWith('troid.')), `the page keeps only its own entries (${keys.join(', ')})`);
    const dbs = (await page.evaluate('indexedDB.databases ? indexedDB.databases().then((d) => d.map((x) => x.name)) : []')) as string[];
    assert.deepEqual(dbs, [], 'no IndexedDB database');
    assert.deepEqual(await page.evaluate('caches.keys()'), [], 'no cache storage');
    assert.deepEqual(await page.evaluate('navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((r) => r.length) : 0'), 0, 'no service worker');
    assert.equal(await page.evaluate('sessionStorage.length'), 0, 'nothing in the session storage');
    console.log(`  privacy: ${requests.length} requests, all to ${new URL(origin).host} · no beacon, no socket to others, no cookie, no IndexedDB, no cache, no service worker · localStorage: ${keys.sort().join(', ')}`);
  },
};
