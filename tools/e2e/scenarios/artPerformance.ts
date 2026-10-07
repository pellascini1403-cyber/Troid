import assert from 'node:assert/strict';
import type { BrowserContext } from 'playwright-core';
import type { Measurement, StressConfig } from '../../../src/app/labs/artStressLab';
import { DRAW_CALL_BUDGET, MEMORY_BUDGET_MIB, MIB } from '../../../src/presentation/stressModel';
import { createArtFixture, type FixturePack } from '../artFixture';
import type { Ctx, Scenario } from '../scenario';

/**
 * THE COST OF ART, MEASURED (docs/ART-PIPELINE-2D.md part J) — with SYNTHETIC art (noise on transparent canvases, sized like plausible art, never art): a crowd of 100, 500
 * and 1000 sprites dealt among several atlas pages that come through the real art library, with alpha, with light, and with the real effects, drawn by the real renderer
 * (`?lab=art-stress`). What it measures, and what each number can and cannot say:
 *
 *   draw calls   per frame, from the WebGL calls themselves. A property of HOW the scene is built, not of the machine: the budget (≤ 60) is asserted.
 *   memory       what the art library holds (the pages as the GPU has them, RGBA8), against the proposed budgets of part C; the JavaScript heap is reported.
 *   frames       how long each takes and how uneven they are. Headless Chromium draws with SOFTWARE GL (SwiftShader) on this machine's CPU, so these are for comparing one scene
 *                with another HERE; they say nothing about any phone, and no check is made on them beyond that they were taken. There are no measurements on iOS or Android.
 *   asset load   the time for the art library to read the index and manifests and fetch, decode and upload every page — over a local route: no network.
 */
const SETS = 8;
const MANY = 24;
const PACKS: FixturePack[] = [
  // eight sprite sets of sixteen 256 × 256 frames: a crowd of characters, each set in pages of its own
  { id: 'crowd', category: 'enemies', load: 'lazy', sprites: Array.from({ length: SETS }, (_, i) => ({ id: `s${i}`, canvas: [256, 256] as [number, number], prefix: `s${i}_`, clips: { idle: 16 } })) },
  // a zone's ground: three 1536 × 1024 pictures (kept resident, not drawn: it is here for the memory)
  { id: 'terrain', category: 'environment', load: 'lazy', sprites: [{ id: 'ground', canvas: [1536, 1024], prefix: 'ground_', clips: { idle: 3 }, extra: { pivot: [0, 0], tags: ['role:solid', 'material:stone', 'part:fill'] } }] },
  // twenty-four tiny sets, for the day a scene draws from more pages than a GPU can bind at once
  { id: 'many', category: 'enemies', load: 'lazy', sprites: Array.from({ length: MANY }, (_, i) => ({ id: `m${i}`, canvas: [64, 64] as [number, number], prefix: `m${i}_`, clips: { idle: 4 } })) },
];
const names = (pack: string, n: number, letter: string): string => Array.from({ length: n }, (_, i) => `${pack}/${letter}${i}`).join(',');
const SIZE = { width: 844, height: 390, dpr: 1 };
const FRAMES = 45;

export const artPerformance: Scenario = {
  name: 'art-performance',
  async run(ctx: Ctx) {
    const fixture = createArtFixture(PACKS);
    try {
      const open = (query: string): Promise<void> => ctx.open(`lab=art-stress&art=art-test&${query}`, { ...SIZE, prepare: async (context: BrowserContext) => fixture.serve(context, 'art-test') });
      const run = async (config: Partial<StressConfig>): Promise<Measurement> => {
        await ctx.page.evaluate(`window.__artStress.configure(${JSON.stringify(config)})`);
        return (await ctx.page.evaluate(`window.__artStress.measure(${FRAMES})`)) as Measurement;
      };
      const row = (label: string, m: Measurement): string =>
        `  ${label.padEnd(36)} draws ${String(m.draws.median).padStart(3)} (worst ${String(m.draws.max).padStart(3)}) · ${String(m.textures).padStart(2)} pages in view · frame ${m.frame.meanMs.toFixed(1)} ms (p95 ${m.frame.p95Ms.toFixed(1)}, max ${m.frame.maxMs.toFixed(1)}, ${m.frame.hitches} hitches)${m.vfx ? ` · particles peak ${m.vfx.peakParticles}/${m.vfx.budget.particles}, ${m.vfx.dropped} dropped` : ''}`;
      const within = (label: string, m: Measurement): void => {
        assert.ok(m.frame.frames === FRAMES && Number.isFinite(m.frame.meanMs) && m.frame.meanMs > 0, `${label}: ${m.frame.frames} frames were taken`);
        assert.ok(m.draws.median > 0, `${label}: something was drawn`);
        assert.ok(m.draws.max <= DRAW_CALL_BUDGET, `${label}: ${m.draws.max} draw calls at the worst frame, over the budget of ${DRAW_CALL_BUDGET}`);
      };

      // ================================================================================================== A · the art arrives: asset load and memory
      await open(`use=${names('crowd', SETS, 's')}&hold=terrain/ground&n=100&sets=1`);
      await ctx.page.waitForFunction('window.__artStress', undefined, { timeout: 60000 });
      const loaded = (await ctx.page.evaluate('window.__artStress.loaded()')) as { loadMs: number; used: string[]; held: string[]; notes: string[] };
      assert.deepEqual(loaded.notes, [], 'the library had nothing to say');
      assert.equal(loaded.used.length, SETS, 'every set of the crowd arrived');
      assert.deepEqual(loaded.held, ['terrain/ground']);
      assert.ok(loaded.loadMs > 0 && loaded.loadMs < 20000, `all the art arrived in ${loaded.loadMs.toFixed(0)} ms`);
      let m = await run({ n: 100, sets: 1, order: 'sorted' });
      const decoded = fixture.decodedBytes['crowd']! + fixture.decodedBytes['terrain']!;
      assert.equal(m.art.failures, 0);
      assert.equal(m.art.bytes, decoded, 'the library holds exactly the pages the packer wrote (RGBA8)');
      assert.equal(m.art.requests, fixture.requests.length, 'and asked for exactly the files there were');
      assert.ok(m.art.peakBytes >= m.art.bytes);
      const crowdMiB = fixture.decodedBytes['crowd']! / MIB;
      const terrainMiB = fixture.decodedBytes['terrain']! / MIB;
      assert.ok(crowdMiB <= MEMORY_BUDGET_MIB.boot, `the crowd's pages, ${crowdMiB.toFixed(1)} MiB, fit the boot budget of ${MEMORY_BUDGET_MIB.boot} MiB`);
      assert.ok(terrainMiB <= MEMORY_BUDGET_MIB.zone, `a zone's ground, ${terrainMiB.toFixed(1)} MiB, fits the zone budget of ${MEMORY_BUDGET_MIB.zone} MiB`);
      assert.ok(m.art.bytes / MIB <= MEMORY_BUDGET_MIB.resident, `everything resident, ${(m.art.bytes / MIB).toFixed(1)} MiB, fits ${MEMORY_BUDGET_MIB.resident} MiB`);
      console.log(`  art: ${m.art.pages} pages, ${(m.art.bytes / MIB).toFixed(1)} MiB (crowd ${crowdMiB.toFixed(1)} · ground ${terrainMiB.toFixed(1)}) · ${m.art.requests} files · ready in ${loaded.loadMs.toFixed(0)} ms (library: ${m.art.loadMs.toFixed(0)} ms for the images) · heap ${m.heapBytes === null ? 'n/a' : `${(m.heapBytes / MIB).toFixed(0)} MiB`}`);

      // ================================================================================================== B · a crowd from several pages
      const baseline = m;
      within('100 sprites, one page', m);
      console.log(row('n=100 sets=1', m));
      for (const n of [100, 500, 1000]) {
        for (const sets of [1, 4, 8]) {
          if (n === 100 && sets === 1) continue;
          m = await run({ n, sets, order: 'sorted' });
          within(`n=${n} sets=${sets}`, m);
          console.log(row(`n=${n} sets=${sets} sorted`, m));
        }
      }
      for (const sets of [4, 8]) {
        m = await run({ n: 1000, sets, order: 'interleaved' });
        within(`n=1000 sets=${sets} interleaved`, m);
        console.log(row(`n=1000 sets=${sets} interleaved`, m));
      }
      assert.ok(baseline.draws.max <= 2, 'a crowd of sprites from one page is a draw call or two');

      // ================================================================================================== C · alpha, light and effects
      const opaque = await run({ n: 500, sets: 4, order: 'sorted', alpha: 1, additive: 0, vfx: 0 });
      const translucent = await run({ n: 500, sets: 4, order: 'sorted', alpha: 0.5, additive: 0, vfx: 0 });
      console.log(row('n=500 sets=4 opaque', opaque));
      console.log(row('n=500 sets=4 alpha 0.5', translucent));
      assert.equal(translucent.draws.median, opaque.draws.median, 'translucent sprites cost no extra draw call: they blend in the same batch');
      const lit = await run({ n: 500, sets: 4, alpha: 1, additive: 0.3, blend: 'layered' });
      within('30 % of the crowd with light, in a layer of its own', lit);
      console.log(row('n=500 sets=4 light 30 % (own layer)', lit));
      assert.ok(lit.draws.median <= opaque.draws.median + 2, 'light in a layer of its own costs one more batch');
      const mixed = await run({ n: 500, sets: 4, alpha: 1, additive: 0.3, blend: 'mixed' });
      console.log(row('n=500 sets=4 light 30 % MIXED in', mixed));
      assert.ok(mixed.draws.median > 100 && mixed.draws.median > 20 * lit.draws.median, `light mixed in with the others breaks the batch at every change of blend: ${mixed.draws.median} draw calls against ${lit.draws.median}`);
      const fight = await run({ n: 500, sets: 4, alpha: 1, additive: 0, blend: 'layered', vfx: 20 });
      within('500 sprites and the effects of a fight', fight);
      assert.ok(fight.vfx && fight.vfx.peakParticles > 20, `the effects were drawn (${fight.vfx?.peakParticles} particles at the peak)`);
      assert.ok(fight.vfx!.peakParticles <= fight.vfx!.budget.particles, `the particles stayed inside the profile's budget (${fight.vfx!.peakParticles} of ${fight.vfx!.budget.particles})`);
      console.log(row('n=500 sets=4 effects 20 bursts/s', fight));

      // ================================================================================================== D · everything at once
      const worst = await run({ n: 1000, sets: 8, order: 'interleaved', animate: true, alpha: 0.7, additive: 0.3, blend: 'layered', vfx: 30 });
      within('the worst scene: 1000 sprites over 8 pages, interleaved, translucent, with light, animated, and 30 effect bursts a second', worst);
      assert.ok(worst.vfx!.peakParticles <= worst.vfx!.budget.particles);
      console.log(row('WORST: 1000 · 8 pages · all of it', worst));

      // ================================================================================================== E · more pages than a GPU binds at once
      await open(`use=${names('many', MANY, 'm')}&n=1000&sets=1`);
      await ctx.page.waitForFunction('window.__artStress', undefined, { timeout: 60000 });
      for (const sets of [16, 24]) {
        for (const order of ['sorted', 'interleaved'] as const) {
          m = await run({ n: 1000, sets, order });
          within(`n=1000 over ${sets} pages ${order}`, m);
          console.log(row(`n=1000 over ${sets} pages ${order}`, m));
        }
      }
      assert.equal(ctx.errors.length, 0);
    } finally {
      fixture.cleanup();
    }
  },
};
