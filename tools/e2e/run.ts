/**
 * E2E runner (`npm run test:e2e`): plays the real game in headless Chromium through real input events and checks
 * the outcome. Screenshots land in .shots/e2e/ (gitignored).
 *   npm run test:e2e                 all scenarios
 *   npm run test:e2e -- movement     scenarios whose name contains "movement"
 *   npm run test:e2e -- --only=hazard,soak   exactly the scenarios with those names (a long run can then be resumed where it was cut)
 *   npm run test:e2e -- --group=play         the scenes of one job of the CI (`groups.ts`: the CI runs them all, each scene in exactly one group)
 *   add --prod to run against the production build (run `npm run build` first)
 * A scene that fails leaves its evidence: the assertion, where in the scene it stood, what the page had written to its console and a screenshot of the page as it was (`.shots/e2e/<scene>-FAILED.png`; the CI
 * keeps that folder when a job fails). A scene that does not finish in `TROID_E2E_SCENE_LIMIT_S` seconds (25 minutes by default; the longest takes about eleven on the CI's runner) FAILS — it does not hold the job
 * until the CI's own limit cuts it off without saying which scene it was.
 */
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, startPreview, startServer, type OpenedPage } from './harness';
import { withDeadline } from './deadline';
import { GROUPS } from './groups';
import { ALL } from './registry';
import type { Ctx, GameState } from './scenario';

const filter = process.argv.slice(2).find((a) => !a.startsWith('--'));
const group = process.argv.find((a) => a.startsWith('--group='))?.slice('--group='.length);
if (group !== undefined && !(group in GROUPS)) {
  console.error(`unknown group "${group}" (${Object.keys(GROUPS).join(', ')})`);
  process.exit(2);
}
const only = group !== undefined ? [...GROUPS[group]!] : process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter((n) => n !== '');
const prod = process.argv.includes('--prod');
const selected = ALL.filter((s) => (!filter || s.name.includes(filter)) && (!only || only.includes(s.name)));
const unknown = (only ?? []).filter((n) => !ALL.some((s) => s.name === n));
if (unknown.length > 0) {
  console.error(`unknown scenario(s): ${unknown.join(', ')}`);
  process.exit(2);
}

/** A scene that hangs is a failure that names the scene, not a job that is cut off an hour later with nothing to read. */
const SCENE_LIMIT_MS = Number(process.env['TROID_E2E_SCENE_LIMIT_S'] ?? 1500) * 1000;

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
      // A page left open keeps its render loop running (software GL: it eats the CPU the next scenes need), so a scenario
      // that opens several pages in a row only ever has the latest one alive.
      await opened.current?.page.context().close();
      opened.current = null;
      // `TROID_E2E_QUERY='&light=off'` adds a query to every page a run opens: the same scenario with an option on (to see what an option changes of what the scenario sees)
      const o = await openPage(browser, `${server.url}/?hooks=1&${query}${process.env['TROID_E2E_QUERY'] ?? ''}`, size);
      opened.current = o;
      await o.page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
      // the effects load after the first frame (a separate chunk): a scenario starts with them in place
      await o.page.waitForFunction('!window.__troid.effectsReady || window.__troid.effectsReady()', undefined, { timeout: 30000 });
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
    await withDeadline(`scene "${scenario.name}"`, SCENE_LIMIT_MS, scenario.run(ctx));
    if (ctx.errors.length) throw new Error(`console/page errors:\n  - ${ctx.errors.join('\n  - ')}`);
    console.log(`✓ ${scenario.name}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    const warned = [...new Set(ctx.warnings)];
    if (warned.length) console.log(`  console warnings (${warned.length} distinct): ${warned.slice(0, 3).map((w) => w.slice(0, 140)).join(' | ')}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${scenario.name}\n  ${(e as Error).message}`);
    // WHERE in the scenario it stood (the message alone names the assertion, not the line): always on the CI, where the failure cannot be run again at will; `TROID_E2E_STACK=1` asks for it anywhere
    if (process.env['TROID_E2E_STACK'] === '1' || process.env['CI']) {
      const where = ((e as Error).stack ?? '').split('\n').filter((l) => l.includes('/tools/e2e/scenarios/')).slice(0, 4);
      if (where.length > 0) console.error(where.join('\n'));
    }
    // what the page said before it failed (a scene that throws does not get to the check of the console above) and how it looked
    if (ctx.errors.length && !(e as Error).message.startsWith('console/page errors')) console.error(`  the page's console/page errors until then (${ctx.errors.length}):\n    - ${ctx.errors.slice(0, 5).map((m) => m.slice(0, 300)).join('\n    - ')}`);
    const page = opened.current?.page;
    if (page) {
      const file = `.shots/e2e/${scenario.name}-FAILED.png`;
      await Promise.race([page.screenshot({ path: file }).then(() => console.error(`  the page as it was: ${file}`)), new Promise((resolve) => setTimeout(resolve, 5000))]).catch(() => undefined); // a page that is gone has nothing to show
    }
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
