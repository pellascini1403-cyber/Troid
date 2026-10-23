/**
 * E2E runner (`npm run test:e2e`): plays the real game in headless Chromium through real input events and checks
 * the outcome. Screenshots land in .shots/e2e/ (gitignored).
 *   npm run test:e2e                 all scenarios
 *   npm run test:e2e -- movement     scenarios whose name contains "movement"
 *   npm run test:e2e -- --only=hazard,soak   exactly the scenarios with those names (a long run can then be resumed where it was cut)
 *   add --prod to run against the production build (run `npm run build` first)
 */
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, startPreview, startServer, type OpenedPage } from './harness';
import type { Ctx, GameState, Scenario } from './scenario';
import { accessibility } from './scenarios/accessibility';
import { arrival } from './scenarios/arrival';
import { assets } from './scenarios/assets';
import { bolt } from './scenarios/bolt';
import { boot } from './scenarios/boot';
import { boss } from './scenarios/boss';
import { bossDeath } from './scenarios/bossDeath';
import { bottles } from './scenarios/bottles';
import { bottle4 } from './scenarios/bottle4';
import { playerAnim } from './scenarios/playerAnim';
import { playerArt } from './scenarios/playerArt';
import { playerLab } from './scenarios/playerLab';
import { audio } from './scenarios/audio';
import { audioCues } from './scenarios/audioCues';
import { environment } from './scenarios/environment';
import { artPerformance } from './scenarios/artPerformance';
import { roomArt } from './scenarios/roomArt';
import { playerR1 } from './scenarios/playerR1';
import { progression } from './scenarios/progression';
import { camera } from './scenarios/camera';
import { checkpoint } from './scenarios/checkpoint';
import { combat } from './scenarios/combat';
import { crouch } from './scenarios/crouch';
import { gamepad } from './scenarios/gamepad';
import { hazard } from './scenarios/hazard';
import { hud } from './scenarios/hud';
import { interaction } from './scenarios/interaction';
import { language } from './scenarios/language';
import { lighting } from './scenarios/lighting';
import { magic } from './scenarios/magic';
import { mobile } from './scenarios/mobile';
import { death } from './scenarios/death';
import { devtools } from './scenarios/devtools';
import { ending } from './scenarios/ending';
import { fallbacks } from './scenarios/fallbacks';
import { finale } from './scenarios/finale';
import { movement } from './scenarios/movement';
import { pause } from './scenarios/pause';
import { pauseMap } from './scenarios/pauseMap';
import { pauseZone } from './scenarios/pauseZone';
import { r1 } from './scenarios/r1';
import { room } from './scenarios/room';
import { save } from './scenarios/save';
import { settings } from './scenarios/settings';
import { slots } from './scenarios/slots';
import { render } from './scenarios/render';
import { slime } from './scenarios/slime';
import { soak } from './scenarios/soak';
import { sprites } from './scenarios/sprites';
import { tabs } from './scenarios/tabs';
import { stress } from './scenarios/stress';
import { touch } from './scenarios/touch';
import { touchEditor } from './scenarios/touchEditor';
import { transition } from './scenarios/transition';
import { vertical } from './scenarios/vertical';
import { vfx } from './scenarios/vfx';
import { vfxArt } from './scenarios/vfxArt';
import { world, worldArt } from './scenarios/world';

const ALL: Scenario[] = [assets, playerArt, playerAnim, playerLab, playerR1, audioCues, audio, environment, artPerformance, roomArt, movement, crouch, combat, slime, r1, room, death, render, camera, sprites, vfx, vfxArt, lighting, fallbacks, boot, stress, touch, touchEditor, gamepad, hud, magic, bolt, bottles, bottle4, progression, interaction, devtools, language, vertical, transition, arrival, world, worldArt, boss, bossDeath, checkpoint, save, settings, pause, pauseMap, pauseZone, slots, tabs, accessibility, hazard, mobile, finale, ending, soak];
const filter = process.argv.slice(2).find((a) => !a.startsWith('--'));
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter((n) => n !== '');
const prod = process.argv.includes('--prod');
const selected = ALL.filter((s) => (!filter || s.name.includes(filter)) && (!only || only.includes(s.name)));
const unknown = (only ?? []).filter((n) => !ALL.some((s) => s.name === n));
if (unknown.length > 0) {
  console.error(`unknown scenario(s): ${unknown.join(', ')}`);
  process.exit(2);
}

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
    await scenario.run(ctx);
    if (ctx.errors.length) throw new Error(`console/page errors:\n  - ${ctx.errors.join('\n  - ')}`);
    console.log(`✓ ${scenario.name}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    const warned = [...new Set(ctx.warnings)];
    if (warned.length) console.log(`  console warnings (${warned.length} distinct): ${warned.slice(0, 3).map((w) => w.slice(0, 140)).join(' | ')}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${scenario.name}\n  ${(e as Error).message}`);
    // `TROID_E2E_STACK=1` says WHERE in the scenario it stood (the message alone names the assertion, not the line)
    if (process.env['TROID_E2E_STACK'] === '1') console.error(((e as Error).stack ?? '').split('\n').filter((l) => l.includes('/tools/e2e/scenarios/')).slice(0, 4).join('\n'));
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
