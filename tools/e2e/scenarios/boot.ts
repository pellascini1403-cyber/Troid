import assert from 'node:assert/strict';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { CURTAIN_TIMEOUT_MS } from '@/app/curtain';
import { decodePng, type Image } from '../png';
import type { Scenario } from '../scenario';

/**
 * THE FIRST MINUTE OF A PLAYER (docs/PROMPT8-LOG.md, phase J): the page without `?hooks=1`, an empty browser, as a player gets it. The art is images that arrive after the first frame, and a cold start used to show
 * — for three seconds on a fast line, nine on a phone's — the technical blockout (flat rectangles and a capsule) before the produced look. Now the page is the dark of the game from its first paint, the world waits
 * behind a curtain until the art of the first room is in, and the curtain lifts then: no picture of the blockout is ever seen, however slow the art is, and when it never comes the player is not kept waiting
 * for ever — the curtain gives up after ten seconds and the game starts as it can.
 */
const SIZE = { width: 844, height: 390 };

interface Sample {
  t: number;
  /** The curtain is on the page (up or fading). */
  curtain: boolean;
  /** `<html data-boot>`: what lifted it. */
  boot: string | null;
  /** The share of the picture that is the flat ground of the blockout. */
  flat: number;
  /** Mean luminance (0–1). */
  luma: number;
}

/** The colour of the blockout's ground, sampled at the bottom centre of its picture. */
function ground(img: Image): [number, number, number] {
  const o = (330 * img.width + 420) * 4;
  return [img.data[o]!, img.data[o + 1]!, img.data[o + 2]!];
}

/** The share of a picture that is (within 6 per channel of) one colour, and its mean luminance. */
function measure(img: Image, sig: readonly [number, number, number]): { flat: number; luma: number } {
  let flat = 0;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < img.height; y += 3) {
    for (let x = 0; x < img.width; x += 3) {
      const p = (y * img.width + x) * 4;
      const r = img.data[p]!;
      const g = img.data[p + 1]!;
      const b = img.data[p + 2]!;
      if (Math.abs(r - sig[0]) < 6 && Math.abs(g - sig[1]) < 6 && Math.abs(b - sig[2]) < 6) flat++;
      sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      n++;
    }
  }
  return { flat: flat / n, luma: sum / n };
}

export const boot: Scenario = {
  name: 'boot',
  async run(ctx) {
    // ================================================================================================ what the technical blockout looks like (the picture that must never be seen)
    await ctx.open('room=r1_gate&paused=1&art=', { ...SIZE, dpr: 1 });
    await ctx.page.waitForFunction('window.__troid.state().scene.terrain > 0', undefined, { timeout: 20000 });
    await ctx.page.waitForTimeout(300);
    const blockout = decodePng(await ctx.page.screenshot());
    const sig = ground(blockout);
    const known = measure(blockout, sig);
    assert.ok(known.flat > 0.12, `the blockout is mostly one flat colour (${(known.flat * 100).toFixed(1)} % of the picture): the signature that says «this is the blockout» works`);
    const origin = new URL(ctx.page.url()).origin;
    const browser: Browser = ctx.page.context().browser()!;
    // (a page left running keeps drawing frames with the CPU the cold starts below need)
    await ctx.page.goto('about:blank');

    /** A cold start of the page a player gets (no hooks, an empty browser, `prepare` to bend the network): a picture every ~130 ms until the curtain is gone or `limit` ms pass. */
    async function coldStart(prepare: (c: BrowserContext) => Promise<void>, limit: number, lean = false): Promise<{ samples: Sample[]; presence: Array<{ t: number; curtain: boolean }>; page: Page; context: BrowserContext; errors: string[] }> {
      const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1 });
      await prepare(context);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      const t0 = Date.now();
      await page.goto(`${origin}/`, { waitUntil: 'commit' });
      // the curtain is part of the page itself: it is there from the first paint, before one line of the game has run
      await page.waitForSelector('#boot-curtain', { state: 'attached', timeout: 20000 });
      const samples: Sample[] = [];
      // The pictures above cost a page that draws with software seconds each (a CI runner takes ~2 s for one), so how many of them a wait gets says how slow the runner is, not whether the curtain was there. Next to them,
      // a second and cheap sampler reads only whether the curtain is on the page, every ~80 ms, whatever the pictures cost: that is what «it was there all that time» is measured with.
      const presence: Array<{ t: number; curtain: boolean }> = [];
      let watching = true;
      const watcher = (async () => {
        while (watching) {
          const here = (await page.evaluate("document.getElementById('boot-curtain') !== null").catch(() => null)) as boolean | null;
          if (here !== null) presence.push({ t: Date.now() - t0, curtain: here });
          await page.waitForTimeout(80).catch(() => undefined);
        }
      })();
      for (;;) {
        const t = Date.now() - t0;
        if (t > limit) break;
        const info = (await page.evaluate("({ curtain: document.getElementById('boot-curtain') !== null, boot: document.documentElement.dataset.boot ?? null })").catch(() => null)) as { curtain: boolean; boot: string | null } | null;
        if (info) {
          // `lean`: only the page's own state is read (a picture costs a software-GL page seconds): for the waits that are about WHEN, not about WHAT is seen
          const m = lean ? { flat: 0, luma: 0 } : measure(decodePng(await page.screenshot()), sig);
          samples.push({ t, curtain: info.curtain, boot: info.boot, flat: m.flat, luma: m.luma });
          if (!info.curtain && info.boot !== null) break;
        }
        await page.waitForTimeout(lean ? 100 : 60);
      }
      watching = false;
      await watcher;
      return { samples, presence, page, context, errors };
    }

    const never = (samples: Sample[], what: string): void => {
      const worst = samples.reduce((a, s) => (s.flat > a.flat ? s : a), samples[0]!);
      assert.ok(worst.flat < 0.02, `${what}: not one picture of the blockout is ever seen (worst ${(worst.flat * 100).toFixed(1)} % flat ground at ${worst.t} ms, ${samples.length} pictures)`);
    };

    // ================================================================================================ a cold start on a fast line
    {
      const { samples, page, context, errors } = await coldStart(async () => undefined, 30000);
      const first = samples[0]!;
      assert.ok(first.curtain, 'the very first picture has the curtain on it');
      assert.ok(first.luma < 0.05, `and the first picture is the dark of the game (${first.luma.toFixed(3)}), not a white page`);
      never(samples, 'on a fast line');
      const last = samples[samples.length - 1]!;
      assert.equal(last.boot, 'art', `the curtain lifted because the art of the first room was in (${last.boot})`);
      // the world begins once the curtain is up: holding right for a second scrolls the room
      await page.waitForTimeout(500);
      const still = decodePng(await page.screenshot());
      await page.keyboard.down('KeyD');
      await page.waitForTimeout(1100);
      await page.keyboard.up('KeyD');
      const moved = decodePng(await page.screenshot());
      let diff = 0;
      for (let i = 0; i < still.data.length; i += 4 * 11) diff += Math.abs(still.data[i]! - moved.data[i]!) + Math.abs(still.data[i + 1]! - moved.data[i + 1]!) + Math.abs(still.data[i + 2]! - moved.data[i + 2]!);
      const mean = diff / (still.data.length / (4 * 11)) / 3;
      assert.ok(mean > 1.5, `and the game plays once it has lifted: a second of running changes the picture (mean change ${mean.toFixed(2)} / 255)`);
      assert.deepEqual(errors, [], 'the page threw nothing');
      console.log(`  boot: fast line — curtain lifted at ${last.t} ms (${samples.length} pictures, none of them the blockout)`);
      await context.close();
    }

    // ================================================================================================ a slow line: every file of the art arrives late
    {
      const { samples, presence, context, errors } = await coldStart(
        async (c) => {
          await c.route('**/art/**', async (route) => {
            await new Promise((r) => setTimeout(r, 700));
            await route.continue();
          });
        },
        30000,
      );
      never(samples, 'on a slow line');
      const last = samples[samples.length - 1]!;
      assert.equal(last.boot, 'art', `the curtain waited for the art and lifted when it came (${last.boot})`);
      assert.ok(last.t > 2500, `it waited (lifted at ${last.t} ms, with the art arriving late): the player was kept behind a dark page, not a half-made picture`);
      const up = presence.filter((p) => p.curtain);
      assert.ok(up.length >= 8, `and it was seen to be there all that time (${up.length} of ${presence.length} readings of the page, one every ~80 ms)`);
      const lifted = presence.findIndex((p) => !p.curtain);
      assert.ok(lifted === -1 || presence.slice(lifted).every((p) => !p.curtain), 'and once it was lifted it did not come back');
      assert.ok(lifted === -1 || presence[lifted]!.t > 2500, `and no reading saw it gone before the art had come (first gone at ${presence[lifted]?.t} ms)`);
      assert.deepEqual(errors, [], 'the page threw nothing');
      console.log(`  boot: slow line — curtain waited ${last.t} ms (${samples.length} pictures, none of them the blockout)`);
      await context.close();
    }

    // ================================================================================================ the art is refused (a broken deploy): the curtain does not wait for what will not come
    {
      const { samples, context, errors } = await coldStart(
        async (c) => {
          await c.route('**/art/**', (route) => route.abort());
        },
        30000,
        true,
      );
      const last = samples[samples.length - 1]!;
      assert.ok(last.boot === 'no-art' || last.boot === 'art-failed', `the curtain lifted because there was no art (${last.boot})`);
      assert.ok(last.t < CURTAIN_TIMEOUT_MS * 0.9 + 6000, `and it did not wait the ten seconds out (${last.t} ms)`);
      assert.deepEqual(errors, [], 'the page threw nothing');
      console.log(`  boot: art refused — the curtain lifted at ${last.t} ms (${last.boot}) and the game started as the blockout`);
      await context.close();
    }

    // ================================================================================================ the art never arrives: the player is not kept waiting for ever
    {
      const { samples, context, errors } = await coldStart(
        async (c) => {
          await c.route('**/art/**', () => {
            // never answered: the download hangs
          });
        },
        CURTAIN_TIMEOUT_MS + 20000,
        true,
      );
      const last = samples[samples.length - 1]!;
      assert.equal(last.boot, 'timeout', `the curtain gave up (${last.boot})`);
      // (the wait starts when the game is made — a few seconds into a development page, one into a production build — so it is not before, and the loop above is what bounds how much later)
      assert.ok(last.t >= CURTAIN_TIMEOUT_MS - 500, `after ${CURTAIN_TIMEOUT_MS / 1000} s and not before (${last.t} ms)`);
      // and what is behind it is the game as it can be: the blockout
      const after = decodePng(await (await context.pages())[0]!.screenshot());
      assert.ok(measure(after, sig).flat > 0.12, 'the game it shows is the blockout, whole and playable');
      assert.deepEqual(errors, [], 'the page threw nothing');
      console.log(`  boot: art that never arrives — the curtain gave up at ${last.t} ms and the game started as the blockout`);
      await context.close();
    }
  },
};
