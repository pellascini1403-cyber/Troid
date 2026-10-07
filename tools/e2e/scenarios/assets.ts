import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext } from 'playwright-core';
import type { ArtSnapshot } from '@/assets/artLibrary';
import { verifyArtFolder } from '../../assets/verify';
import { createArtFixture, type Fixture, type FixturePack } from '../artFixture';
import type { Ctx, Scenario } from '../scenario';

/**
 * THE ART LIBRARY in a real browser (docs/ART-PIPELINE-2D.md, part C), with SYNTHETIC art (noise on a transparent canvas, built by the real packer and
 * served through `?art=`): a page with no art costs nothing; a page with art loads what boots with the game, then the packs of the room the hero is in, and
 * lets them go as the hero moves on; a pack nobody asked for is never fetched; and nothing that goes wrong with the files can reach the game.
 *
 *   A · no art: no request for art, none of its code, `state().art` is null — the cost of the system is zero
 *   B · with art: the pack that boots is in memory, the pack of R1 too, the packs of other rooms and the lab's are not even asked for; the memory the library
 *       reports is the memory of the pages it was given; the game plays on
 *   C · R1 → R2: the next room's pack is fetched during the fade, the old one is let go once the new one is there, the pack that boots stays — once each
 *   D · a lazy pack loads when something asks for it by name, and its pages go when it is let go
 *   E · broken files (a corrupt image, a cut request): the game does not notice — no error, the hero plays, the library says what failed
 *   F · the same faults are found BEFORE a browser is opened: the checker that `npm run build` runs names the file and what is wrong, and the good art passes
 */
const PACKS: FixturePack[] = [
  { id: 'player', category: 'player', load: 'boot', sprites: [{ id: 'hero', canvas: [64, 96], clips: { idle: 4, walk: 4 } }] },
  { id: 'forest', category: 'environment', load: 'zone', zones: ['r1_gate'], sprites: [{ id: 'moss', canvas: [48, 48], clips: { idle: 3 } }] },
  { id: 'caves', category: 'environment', load: 'zone', zones: ['r2_hall', 'r3_chamber'], sprites: [{ id: 'drip', canvas: [48, 80], clips: { idle: 3 } }] },
  { id: 'lab', category: 'vfx', load: 'lazy', sprites: [{ id: 'probe', canvas: [32, 32], clips: { idle: 2, walk: 2 } }] },
];
const SIZE = { width: 844, height: 390, dpr: 1 };
const art = async (ctx: Ctx): Promise<ArtSnapshot | null> => (await ctx.state()).art ?? null;
const until = async (ctx: Ctx, what: string, test: (a: ArtSnapshot) => boolean, ms = 20000): Promise<ArtSnapshot> => {
  const t0 = Date.now();
  for (;;) {
    const a = await art(ctx);
    if (a && test(a)) return a;
    if (Date.now() - t0 > ms) throw new Error(`gave up waiting for ${what}; the library says ${JSON.stringify(a)}`);
    await ctx.page.waitForTimeout(50);
  }
};
const pack = (a: ArtSnapshot, id: string): ArtSnapshot['packList'][number] => {
  const p = a.packList.find((x) => x.id === id);
  assert.ok(p, `pack ${id} is in the index`);
  return p;
};
/** The files of a pack the pages asked for. */
const asked = (f: Fixture, id: string): string[] => f.requests.filter((r) => r.startsWith(`${id}/`));
const open = (ctx: Ctx, fixture: Fixture | null, query: string): Promise<void> =>
  ctx.open(query, { ...SIZE, prepare: async (context: BrowserContext) => (fixture ? fixture.serve(context, 'art-test') : undefined) });

export const assets: Scenario = {
  name: 'assets',
  async run(ctx) {
    const fixture = createArtFixture(PACKS);
    try {
      // ===================================================================================================== A · a page with no art
      const stray: string[] = [];
      await ctx.open('', {
        ...SIZE,
        prepare: async (context) => {
          context.on('request', (r) => {
            if (/\/art-test\/|\/art\/index\.json|\/assets\/art-|\/assets\/playerLab-|\/app\/art\.ts|\/labs\/playerLab|artLibrary|artIO/.test(r.url())) stray.push(r.url());
          });
        },
      });
      await ctx.step(10);
      assert.equal((await ctx.state()).art, null, 'no art: no library');
      await ctx.page.waitForTimeout(500);
      assert.deepEqual(stray, [], 'no art: not one request for art or for its code');
      assert.equal(fixture.requests.length, 0);

      // ===================================================================================================== B · with art
      await open(ctx, fixture, 'art=art-test');
      let a = await until(ctx, 'the boot pack and the pack of R1 in memory', (x) => x.state === 'ready' && pack(x, 'player').held && pack(x, 'forest').held && pack(x, 'player').sets.length === 1 && pack(x, 'forest').sets.length === 1);
      assert.equal(a.packs, 4);
      assert.deepEqual(pack(a, 'player').sets, ['player/hero']);
      assert.deepEqual(pack(a, 'forest').sets, ['forest/moss']);
      assert.equal(a.zone, 'r1_gate');
      assert.ok(!pack(a, 'caves').read && !pack(a, 'lab').read, 'the packs of other rooms and the lab are not even read');
      assert.deepEqual(asked(fixture, 'caves'), [], 'not one request for the caves');
      assert.deepEqual(asked(fixture, 'lab'), [], 'not one request for the lab');
      assert.equal(a.bytes, fixture.decodedBytes['player']! + fixture.decodedBytes['forest']!, 'the memory it reports is the memory of the pages it was given');
      assert.ok(a.peakBytes >= a.bytes);
      assert.equal(a.failures, 0);
      assert.equal(a.requests, fixture.requests.length, `every request the library made is one the page made (${a.requests} vs ${fixture.requests.length})`);
      assert.equal(new Set(fixture.requests).size, fixture.requests.length, 'and none was asked for twice');
      const before = (await ctx.state()).tick;
      await ctx.step(30);
      assert.equal((await ctx.state()).tick, before + 30, 'the simulation does not know the art is there');
      const warnedAboutArt = ctx.warnings.filter((w) => w.includes('[art]'));
      assert.deepEqual(warnedAboutArt, [], 'good art: nothing to warn about');
      await ctx.shot('b-01-art-loaded');

      // ===================================================================================================== C · R1 → R2
      const sess = (code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
      await sess('s.flags.set("defeated:r1_slime")');
      await ctx.step(2);
      await ctx.teleport(110, 0);
      await ctx.step(1);
      assert.equal((await ctx.state()).transition?.phase, 'fadeOut');
      // the new room's pack is asked for while the screen is still fading out
      a = await until(ctx, 'the caves in memory', (x) => pack(x, 'caves').held && pack(x, 'caves').sets.length === 1);
      assert.equal((await ctx.state()).room, 'r1_gate', 'it was fetched before the room changed');
      await ctx.step(12);
      assert.equal((await ctx.state()).room, 'r2_hall');
      a = await until(ctx, 'the forest let go', (x) => !pack(x, 'forest').held && pack(x, 'forest').sets.length === 0);
      assert.ok(pack(a, 'player').held, 'what boots with the game stays');
      assert.ok(pack(a, 'caves').held);
      assert.equal(a.zone, 'r2_hall');
      assert.deepEqual([...new Set(a.pageList.map((p) => p.url.split('/art-test/')[1]!.split('/')[0]))].sort(), ['caves', 'player'], 'only the pages of the hero and of the caves stay in memory');
      assert.equal(a.bytes, fixture.decodedBytes['player']! + fixture.decodedBytes['caves']!);
      assert.equal(asked(fixture, 'caves').filter((r) => r.endsWith('.png')).length, 1, 'the caves image was fetched once');
      assert.equal(asked(fixture, 'player').filter((r) => r.endsWith('.png')).length, 1, 'the hero image was never fetched again');
      assert.deepEqual(asked(fixture, 'lab'), []);

      // ===================================================================================================== D · a lazy pack, asked for by name
      const got = (await ctx.page.evaluate("window.__troid.artAcquire('lab', 'probe')")) as { id: string; atlas: string; frames: number; clips: string[] } | null;
      assert.ok(got, 'the lab pack loads when it is asked for');
      assert.deepEqual({ id: got.id, atlas: got.atlas, frames: got.frames, clips: got.clips.sort() }, { id: 'lab/probe', atlas: 'art:lab/probe@1', frames: 4, clips: ['idle', 'walk'] });
      a = (await art(ctx))!;
      assert.equal(a.bytes, fixture.decodedBytes['player']! + fixture.decodedBytes['caves']! + fixture.decodedBytes['lab']!);
      assert.ok(asked(fixture, 'lab').length > 0);
      await ctx.page.evaluate("window.__troid.artRelease('lab/probe')");
      a = (await art(ctx))!;
      assert.equal(a.bytes, fixture.decodedBytes['player']! + fixture.decodedBytes['caves']!, 'its pages go when it is let go');
      assert.equal(a.failures, 0);
      assert.equal(ctx.errors.length, 0);

      // ===================================================================================================== F · found before a browser
      const good = verifyArtFolder(fixture.dir);
      assert.deepEqual(good.issues.filter((i) => i.level === 'error'), [], 'the good art passes the checker');
      assert.ok(good.ok);
      const copy = mkdtempSync(join(tmpdir(), 'troid-e2e-verify-'));
      try {
        const fresh = (): string => {
          rmSync(copy, { recursive: true, force: true });
          cpSync(fixture.dir, copy, { recursive: true });
          return copy;
        };
        const errs = (dir: string): string => verifyArtFolder(dir).issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`).join('\n');
        // an image with a flipped byte, an image of another size than declared, a frame gone from its page, a manifest the game would refuse
        let dir = fresh();
        const png = readFileSync(join(dir, 'forest', 'moss_0.png'));
        png[png.length - 20] ^= 0xff;
        writeFileSync(join(dir, 'forest', 'moss_0.png'), png);
        assert.match(errs(dir), /forest atlases\.moss_0: moss_0\.png: the PNG is corrupt/);
        dir = fresh();
        const manifest = JSON.parse(readFileSync(join(dir, 'caves', 'caves.pack.json'), 'utf8')) as { atlases: Array<{ width: number }>; sprites: Array<{ pivot: number[] }> };
        manifest.atlases[0]!.width += 8;
        writeFileSync(join(dir, 'caves', 'caves.pack.json'), JSON.stringify(manifest));
        assert.match(errs(dir), /caves atlases\.drip_0: the image file drip_0\.png is \d+ × \d+ but the manifest declares \d+ × \d+/);
        dir = fresh();
        const page = JSON.parse(readFileSync(join(dir, 'player', 'hero_0.json'), 'utf8')) as { frames: Record<string, unknown> };
        delete page.frames['idle_02'];
        writeFileSync(join(dir, 'player', 'hero_0.json'), JSON.stringify(page));
        assert.match(errs(dir), /the game would REFUSE this set: clip "idle": missing frame idle_02/);
        dir = fresh();
        manifest.atlases[0]!.width -= 8;
        manifest.sprites[0]!.pivot = [0.5, 4];
        writeFileSync(join(dir, 'caves', 'caves.pack.json'), JSON.stringify(manifest));
        assert.match(errs(dir), /caves sprites\[0\]\.pivot/);
      } finally {
        rmSync(copy, { recursive: true, force: true });
      }
    } finally {
      fixture.cleanup();
    }

    // ======================================================================================================= E · broken files
    const broken = createArtFixture(PACKS);
    try {
      const h = (id: string, file: string): string => `${id}/${file}`;
      broken.faults.set(h('forest', 'moss_0.png'), 'corrupt'); // an image that is not one
      broken.faults.set(h('player', 'hero_0.json'), 'abort'); // a request that is cut
      await open(ctx, broken, 'art=art-test');
      const a = await until(ctx, 'the library to have tried everything', (x) => x.state === 'ready' && x.failures >= 2);
      assert.deepEqual(pack(a, 'forest').sets, [], 'the forest did not load');
      assert.deepEqual(pack(a, 'player').sets, [], 'the hero set did not load');
      assert.equal(a.bytes, 0, 'nothing broken stays in memory');
      assert.deepEqual(a.pageList, []);
      const t0 = (await ctx.state()).tick;
      await ctx.step(40);
      const s = await ctx.state();
      assert.equal(s.tick, t0 + 40, 'the game plays on');
      assert.ok(s.sprite && s.sprite.visible, 'the hero is drawn (the placeholder: the real art never arrived)');
      assert.ok(ctx.warnings.some((w) => w.includes('[art]')), 'in a development build the library says what failed');
      assert.ok(ctx.warnings.some((w) => /forest/.test(w)) && ctx.warnings.some((w) => /player|hero/.test(w)));
    } finally {
      broken.cleanup();
    }
  },
};
