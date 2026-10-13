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
// everything that is not JavaScript (the page, the manifest, the icon… and, once there is art, its images and JSON): the budget is about JS, but the art
// is the heaviest thing a game ships, so it is measured too (docs/ART-PIPELINE-2D.md, part C)
const others: Array<{ url: string; bytes: number }> = [];
page.on('response', async (res) => {
  if (!res.url().endsWith('.js')) {
    if (res.request().resourceType() !== 'websocket') others.push({ url: res.url().replace(server.url, '') || '/', bytes: (await res.body().catch(() => Buffer.alloc(0))).length });
    return;
  }
  const body = await res.body();
  loaded.push({ url: res.url().replace(server.url, ''), raw: body.length, gz: gzipSync(body, { level: 9 }).length });
});
// A player's page: no `?hooks=1` (the test hooks are for the E2E; they load the effects at once). It is "up" when the boot curtain has lifted — the art of the first room is in and the
// first picture is the game's — and a second more is given to whatever is still on its way.
const t0 = Date.now();
await page.goto(`${server.url}/`);
await page.waitForFunction('document.documentElement.dataset.boot !== undefined', undefined, { timeout: 60000 });
const pictureAt = Date.now() - t0;
await page.waitForTimeout(1500);
// The game marks the moment it asks for its cosmetic parts (the effects, the art, the views of the boss): the scripts it had requested before are the code of its first frame — the cold start
// the budget is about — and the rest are what it fetches while the curtain is up (they are lazy chunks: the code of the first frame does not change with them).
const timing = (await page.evaluate(
  `({ mark: (performance.getEntriesByName('troid:cosmetics')[0] || {}).startTime ?? null, how: document.documentElement.dataset.boot, js: performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.js')).map((r) => [r.name, r.startTime]), img: performance.getEntriesByType('resource').filter((r) => /\\.(png|webp|jpg|jpeg)$/i.test(r.name)).map((r) => r.transferSize || r.encodedBodySize || 0) })`,
)) as { mark: number | null; how: string; js: Array<[string, number]>; img: number[] };
if (timing.mark === null) throw new Error('the game never marked the moment it asks for its cosmetic parts (troid:cosmetics)');
const startOf = new Map(timing.js.map(([name, at]) => [name.replace(server.url, ''), at]));
const coldList = loaded.filter((f) => (startOf.get(f.url) ?? 0) < timing.mark!);
const laterList = loaded.filter((f) => (startOf.get(f.url) ?? 0) >= timing.mark!);
const sum = (list: typeof loaded): { raw: number; gz: number } => list.reduce((n, f) => ({ raw: n.raw + f.raw, gz: n.gz + f.gz }), { raw: 0, gz: 0 });
const cold = sum(coldList);
for (const f of [...coldList].sort((a, b) => b.gz - a.gz)) console.log(`${(f.gz / 1024).toFixed(1).padStart(7)} KB gz  ${(f.raw / 1024).toFixed(1).padStart(7)} KB raw  ${f.url}`);
console.log(`\nloaded by a cold start of R1 (the code of its first frame): ${coldList.length} scripts, ${(cold.gz / 1024).toFixed(1)} KB gz (${(cold.raw / 1024).toFixed(1)} KB raw)`);

// then what the game fetches by itself once its first frame is up (the effects, the art, the views of the boss): behind the boot curtain, at once
const rest = sum(laterList);
console.log(`fetched next, while the curtain is up (the effects, the art, the boss's views: lazy chunks): ${laterList.length} scripts, ${(rest.gz / 1024).toFixed(1)} KB gz (${(rest.raw / 1024).toFixed(1)} KB raw)${laterList.map((f) => `\n${(f.gz / 1024).toFixed(1).padStart(7)} KB gz  ${f.url}`).join('')}`);
console.log(`the whole first session: ${loaded.length} scripts, ${((cold.gz + rest.gz) / 1024).toFixed(1)} KB gz — the first picture of the game (the curtain lifted: "${timing.how}") came ${pictureAt} ms after the request on this machine, with a local server`);
const kindOf = (url: string): string => (/\.(png|webp|jpg|jpeg|svg)$/i.test(url) ? 'images' : /\.json$/i.test(url) ? 'data (json)' : 'page and manifest');
const groups = new Map<string, { n: number; bytes: number }>();
for (const f of others) {
  const g = groups.get(kindOf(f.url)) ?? { n: 0, bytes: 0 };
  groups.set(kindOf(f.url), { n: g.n + 1, bytes: g.bytes + f.bytes });
}
// the art's images come with `fetch` and are consumed by the page before this script can read their bodies: their size is the browser's own account of what it transferred
const artImages = timing.img.reduce((n, b) => n + b, 0);
console.log(`the art's images, which the first picture waits for: ${timing.img.length} files, ${(artImages / 1024).toFixed(0)} KB`);
console.log(`not JavaScript (what this script could read): ${others.length} files, ${(others.reduce((n, f) => n + f.bytes, 0) / 1024).toFixed(1)} KB${[...groups].map(([k, g]) => `\n${(g.bytes / 1024).toFixed(1).padStart(7)} KB  ${g.n} ${k}`).join('')}`);
await browser.close();
await server.close();
