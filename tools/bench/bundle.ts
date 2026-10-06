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
await page.goto(`${server.url}/?hooks=1`);
await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
await page.waitForTimeout(500);
let rawTotal = 0;
let gzTotal = 0;
for (const f of loaded.sort((a, b) => b.gz - a.gz)) {
  rawTotal += f.raw;
  gzTotal += f.gz;
  console.log(`${(f.gz / 1024).toFixed(1).padStart(7)} KB gz  ${(f.raw / 1024).toFixed(1).padStart(7)} KB raw  ${f.url}`);
}
console.log(`\nloaded by a cold start of R1: ${loaded.length} scripts, ${(gzTotal / 1024).toFixed(1)} KB gz (${(rawTotal / 1024).toFixed(1)} KB raw)`);
await browser.close();
await server.close();
