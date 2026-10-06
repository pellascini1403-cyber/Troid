import { gzipSync } from 'node:zlib';
import { launchBrowser, startPreview } from '../e2e/harness';

/**
 * What a real player's browser DOWNLOADS to start R1 (`npm run bench:bundle`, needs `npm run build`): every JavaScript
 * response of a cold load of the production build, with its gzip size. The build folder holds MORE than that — the lab chunks
 * (dev tooling, code-split), and the WebGPU / Canvas renderers Pixi only fetches when the platform asks for them — so
 * the size of `dist/` over-states what is loaded. This is the number the budget (docs/MIGRATION-2D.md §9: JS ≤ 200 KB gz) is about.
 */
const server = await startPreview();
const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
const loaded: Array<{ url: string; raw: number; gz: number }> = [];
page.on('response', async (res) => {
  if (!res.url().endsWith('.js')) return;
  const body = await res.body();
  loaded.push({ url: res.url().replace(server.url, ''), raw: body.length, gz: gzipSync(body, { level: 9 }).length });
});
// A player's page: no `?hooks=1` (the test hooks are for the E2E; they load the effects at once). It is "up" when the game's HUD is in the
// page and a canvas is drawing; the 500 ms that follow are what the first frames download.
await page.goto(`${server.url}/`);
await page.waitForSelector('[data-testid="hud"]', { timeout: 30000 });
await page.waitForFunction('document.querySelector("canvas") !== null', undefined, { timeout: 30000 });
await page.waitForTimeout(500);
const first = loaded.length;
const sum = (list: typeof loaded): { raw: number; gz: number } => list.reduce((n, f) => ({ raw: n.raw + f.raw, gz: n.gz + f.gz }), { raw: 0, gz: 0 });
const cold = sum(loaded.slice(0, first));
for (const f of [...loaded.slice(0, first)].sort((a, b) => b.gz - a.gz)) console.log(`${(f.gz / 1024).toFixed(1).padStart(7)} KB gz  ${(f.raw / 1024).toFixed(1).padStart(7)} KB raw  ${f.url}`);
console.log(`\nloaded by a cold start of R1: ${first} scripts, ${(cold.gz / 1024).toFixed(1)} KB gz (${(cold.raw / 1024).toFixed(1)} KB raw)`);

// then what the page fetches by itself once it is idle (the effects): the cold start does not wait for it, but a player downloads it
await page.waitForTimeout(5000);
const later = loaded.slice(first);
const rest = sum(later);
console.log(`fetched afterwards, when idle (not needed to play the first minute): ${later.length} scripts, ${(rest.gz / 1024).toFixed(1)} KB gz (${(rest.raw / 1024).toFixed(1)} KB raw)${later.map((f) => `\n${(f.gz / 1024).toFixed(1).padStart(7)} KB gz  ${f.url}`).join('')}`);
console.log(`the whole first session: ${loaded.length} scripts, ${((cold.gz + rest.gz) / 1024).toFixed(1)} KB gz`);
await browser.close();
await server.close();
