/**
 * E2E runner (`npm run test:e2e`): plays the real game in headless Chromium through real input events and checks
 * the outcome. Screenshots land in .shots/e2e/ (gitignored).
 *   npm run test:e2e                 all scenarios
 *   npm run test:e2e -- movement     scenarios whose name contains "movement"
 *   add --prod to run against the production build (run `npm run build` first)
 */
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, startPreview, startServer, type OpenedPage } from './harness';
import type { Ctx, GameState, Scenario } from './scenario';
import { camera } from './scenarios/camera';
import { crouch } from './scenarios/crouch';
import { movement } from './scenarios/movement';
import { render } from './scenarios/render';
import { sprites } from './scenarios/sprites';
import { stress } from './scenarios/stress';

const ALL: Scenario[] = [movement, crouch, render, camera, sprites, stress];
const filter = process.argv.slice(2).find((a) => !a.startsWith('--'));
const prod = process.argv.includes('--prod');
const selected = ALL.filter((s) => !filter || s.name.includes(filter));

mkdirSync('.shots/e2e', { recursive: true });
const server = prod ? await startPreview() : await startServer();
const browser = await launchBrowser();
let failed = 0;

for (const scenario of selected) {
  const t0 = Date.now();
  const opened: { current: OpenedPage | null } = { current: null };
  const ctx: Ctx = {
    get page() {
      if (!opened.current) throw new Error('call ctx.open() first');
      return opened.current.page;
    },
    get errors() {
      return opened.current?.errors ?? [];
    },
    get warnings() {
      return opened.current?.warnings ?? [];
    },
    async open(query = '', size) {
      const o = await openPage(browser, `${server.url}/?hooks=1&${query}`, size);
      opened.current = o;
      await o.page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
      await o.page.evaluate('window.__troid.pause()');
      await o.page.waitForTimeout(150);
    },
    async shot(name) {
      await ctx.page.waitForTimeout(60); // let a frame render with the new state
      await ctx.page.screenshot({ path: `.shots/e2e/${scenario.name}-${name}.png` });
    },
    async step(n) {
      await ctx.page.evaluate(`window.__troid.step(${n})`);
    },
    async state() {
      return (await ctx.page.evaluate('window.__troid.state()')) as GameState;
    },
    async teleport(x, y) {
      await ctx.page.evaluate(`window.__troid.teleport(${x}, ${y})`);
    },
  };
  try {
    await scenario.run(ctx);
    if (ctx.errors.length) throw new Error(`console/page errors:\n  - ${ctx.errors.join('\n  - ')}`);
    console.log(`✓ ${scenario.name}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    const warned = [...new Set(ctx.warnings)];
    if (warned.length) console.log(`  console warnings (${warned.length} distinct): ${warned.slice(0, 3).map((w) => w.slice(0, 140)).join(' | ')}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${scenario.name}\n  ${(e as Error).message}`);
  }
  await opened.current?.page.context().close();
}

await browser.close();
await server.close();
if (failed) {
  console.error(`\n${failed} scenario(s) failed`);
  process.exit(1);
}
console.log(`\n${selected.length} scenario(s) passed`);
