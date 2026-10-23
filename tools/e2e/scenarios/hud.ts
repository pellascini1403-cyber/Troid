import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright-core';
import { HUD_BAR_TRAVEL, HUD_PX, type PxBox } from '../../../src/ui/hud/artGeometry';
import { HUD_ORIGINALS_DIR, HUD_PIECES_DIR } from '../../hud/originals';
import { decodePng } from '../../assets/png';
import { createHash } from 'node:crypto';
import { frames } from '../frames';
import { barAt, cardState, dataOf, numberOf, outOfSync, sess, vials, vialsAre, watchRectangle } from '../hud';
import type { Scenario } from '../scenario';
import { centreOf, TouchScreen } from '../touch';

/**
 * The HUD of the artist (docs/PROMPT17-LOG.md, GAME-SPEC-2D §17): the portrait, the two bars with their numbers and the row of bottles as DOM at the top left, inside the safe area, on every aspect ratio; reacting to
 * the simulation through the status snapshot; every shape on it one of the artist's PNGs, as big and where the artist's own picture of the game has it. The resources are driven through the session the test hooks
 * expose (the controlled way to put the game in a state), and through real keys and real fingers where it matters.
 */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const box = async (page: Page, id: string): Promise<Box> => {
  const b = await page.locator(`[data-testid="${id}"]`).boundingBox();
  if (!b) throw new Error(`no box for ${id}`);
  return b;
};
const attr = (page: Page, id: string, name: string): Promise<string | null> => page.locator(`[data-testid="${id}"]`).getAttribute(name);

/** The pieces of the HUD: what the page calls them → the file in the repository. */
const FILES = {
  portrait: 'portrait',
  plateLife: 'plate-life',
  plateMagic: 'plate-magic',
  barLife: 'bar-life',
  barLifeLost: 'bar-life-lost',
  barMagic: 'bar-magic',
  barMagicLost: 'bar-magic-lost',
  marker: 'marker',
  bottle: 'bottle',
  bottleUsed: 'bottle-used',
} as const;
type Piece = keyof typeof FILES;

/**
 * The artist's own picture of the HUD in the game (an 844 × 390 phone): the canvas of the artist at 0.08395 px per pixel, its corner at (24.2, 3.15) — measured by laying the artist's PNG over the picture until the
 * two agreed to within 2.5 levels on 5 719 solid pixels. Where a piece should be on that screen.
 */
const ARTIST = { scale: 0.08395, x: 24.2, y: 3.15 } as const;
const where = (b: Pick<PxBox, 'x' | 'y' | 'w' | 'h'>): Box => ({ x: ARTIST.x + b.x * ARTIST.scale, y: ARTIST.y + b.y * ARTIST.scale, width: b.w * ARTIST.scale, height: b.h * ARTIST.scale });
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/** A pixel of a screenshot (decoded here), at `(x, y)` of the page. */
async function pixel(page: Page, x: number, y: number): Promise<[number, number, number]> {
  const img = decodePng(await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 } })) as { data: Uint8Array };
  return [img.data[0] as number, img.data[1] as number, img.data[2] as number];
}
const close = (c: readonly number[], want: readonly number[], tol = 6): boolean => c.every((v, i) => Math.abs(v - (want[i] as number)) <= tol);

export const hud: Scenario = {
  name: 'hud',
  async run(ctx) {
    await ctx.open('touch=1', { width: 844, height: 390, touch: true });
    let { page } = ctx;
    await ctx.step(20);
    await frames(page, 6);

    // ================================================================== the art: the pieces in the page are the artist's, pixel for pixel
    const step = 7;
    const decoded = (await page.evaluate(
      `(async () => {
        const out = {};
        for (const piece of ${JSON.stringify(Object.keys(FILES))}) {
          const img = document.querySelector('[data-testid="hud"] img[data-piece="' + piece + '"]');
          if (!img.complete) await img.decode();
          const bytes = await (await fetch(img.currentSrc)).arrayBuffer();
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const g = canvas.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          const px = [];
          for (let y = 0; y < canvas.height; y += ${step}) for (let x = 0; x < canvas.width; x += ${step}) px.push(...g.getImageData(x, y, 1, 1).data);
          out[piece] = { sha256: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''), bytes: bytes.byteLength, w: img.naturalWidth, h: img.naturalHeight, px };
        }
        return out;
      })()`,
    )) as Record<Piece, { sha256: string; bytes: number; w: number; h: number; px: number[] }>;
    for (const piece of Object.keys(FILES) as Piece[]) {
      const file = readFileSync(fileURLToPath(new URL(`../../../${HUD_PIECES_DIR}/${FILES[piece]}.png`, import.meta.url)));
      const got = decoded[piece];
      assert.equal(got.sha256, createHash('sha256').update(file).digest('hex'), `${piece}: the bytes the browser gets are the file's (${FILES[piece]}.png)`);
      assert.equal(got.bytes, file.length, `${piece}: and as many`);
      const original = decodePng(file) as { width: number; height: number; data: Uint8Array };
      assert.deepEqual([got.w, got.h], [original.width, original.height], `${piece}: at its full size, not a reduced copy`);
      let mismatches = 0;
      let k = 0;
      for (let y = 0; y < original.height; y += step) {
        for (let x = 0; x < original.width; x += step) {
          for (let c = 0; c < 4; c++) {
            const o = original.data[(y * original.width + x) * 4 + c] as number;
            // (a canvas keeps a pixel premultiplied: where the pixel is clear its colour is gone, and only its alpha is compared)
            if ((c === 3 || (original.data[(y * original.width + x) * 4 + 3] as number) > 0) && Math.abs((got.px[k] as number) - o) > 1) mismatches++;
            k++;
          }
        }
      }
      assert.equal(mismatches, 0, `${piece}: ${k / 4} sampled pixels of the picture in the page are the file's own`);
    }
    // the pieces cut from the artist's two originals: the originals themselves are in the repository, and the cutter says the pieces are what they give
    assert.ok(readFileSync(fileURLToPath(new URL(`../../../${HUD_ORIGINALS_DIR}/hud-complete.png`, import.meta.url))).length > 100000, 'the artist\'s originals are kept in the repository');
    // what is done to what is seen: nothing but where it goes and how much of it shows
    const looks = (await page.evaluate(
      `[...document.querySelectorAll('[data-testid="hud"] img')].map((img) => { const cs = getComputedStyle(img); return [img.dataset.testid, cs.filter, cs.mixBlendMode, cs.maskImage, cs.backgroundImage, cs.objectFit, cs.imageRendering].join('|'); })`,
    )) as string[];
    for (const l of looks) assert.match(l, /\|none\|normal\|none\|none\|fill\|auto$/, `a picture with no filter, blend, mask or background: ${l}`);
    assert.equal(await page.locator('[data-testid="hud"] canvas, [data-testid="hud"] svg').count(), 0, 'nothing of the HUD is drawn by code');

    // ================================================================== what is on screen: all of it DOM, and nothing but the two numbers written
    assert.equal(await numberOf(page, 'life'), '100', 'a new game: 100 of life');
    assert.equal(await numberOf(page, 'magic'), '100', 'and 100 of magic');
    assert.deepEqual(await vials(page), [{ state: 'ready', dark: '0' }, { state: 'ready', dark: '0' }, { state: 'ready', dark: '0' }], 'three bottles, all available');
    assert.equal(await page.locator('[data-testid="hud-card"]').count(), 0, 'no slot for the power: the artist\'s HUD has none');
    assert.equal(await page.evaluate('document.getElementById("ui").contains(document.querySelector("[data-testid=hud]"))'), true, 'the HUD lives in the DOM layer, not in the canvas');
    assert.equal(await page.locator('canvas').count(), 1, 'one canvas: the world');
    assert.equal(String(await page.evaluate('document.querySelector("[data-testid=hud]").textContent')), '100100', 'the HUD writes its two numbers and nothing else');
    assert.equal(await dataOf(page, 'hud-life', 'data-edge'), '1');
    assert.equal(await attr(page, 'hud-life-mark', 'style') !== null, true);
    assert.equal(await page.locator('[data-testid="hud-life-mark"]').evaluate((e) => getComputedStyle(e).opacity), '0', 'a full bar has no white rectangle');
    await ctx.shot('01-hud');

    // ================================================================== placement: where the artist's own picture of the game puts every piece, as big
    const pieces: Array<[string, PxBox]> = [
      ['hud-portrait', HUD_PX.portrait],
      ['hud-plate-life', HUD_PX.plateLife],
      ['hud-plate-magic', HUD_PX.plateMagic],
      ['hud-life', HUD_PX.barLife],
      ['hud-magic', HUD_PX.barMagic],
    ];
    for (const [id, p] of pieces) {
      const got = await box(page, id);
      const want = where(p);
      assert.ok(near(got.x, want.x, 0.8) && near(got.y, want.y, 0.8) && near(got.width, want.width, 0.8) && near(got.height, want.height, 0.8), `${id}: where the artist's picture has it ${JSON.stringify(want)} (${JSON.stringify(got)})`);
    }
    const b0 = await box(page, 'hud-vial-0-bright');
    const b0want = where({ ...HUD_PX.bottle, x: HUD_PX.bottle.x, y: HUD_PX.bottle.y });
    assert.ok(near(b0.x, b0want.x, 0.8) && near(b0.y, b0want.y, 0.8) && near(b0.width, b0want.width, 0.8) && near(b0.height, b0want.height, 0.8), `the first bottle: where the artist's picture has it (${JSON.stringify(b0)} / ${JSON.stringify(b0want)})`);
    const b2 = await box(page, 'hud-vial-2-bright');
    assert.ok(near(b2.x - b0.x, 2 * HUD_PX.bottle.pitch * ARTIST.scale, 0.8), 'and the third is two pitches of the artist\'s row to its right');
    const layout = (await page.evaluate('window.__troid.hud().layout')) as { scale: number; x: number; y: number };
    const bt = await box(page, 'hud-bottle-0');
    assert.ok(bt.width >= 18 * layout.scale && bt.height >= 43 * layout.scale, `a bottle has a real touch area (${bt.width.toFixed(1)} × ${bt.height.toFixed(1)})`);
    const hit = await page.evaluate(`document.elementFromPoint(${bt.x + bt.width / 2}, ${bt.y + bt.height / 2})?.closest('[data-testid]')?.getAttribute('data-testid')`);
    assert.match(String(hit), /^hud-bottle-0$/, 'the bottle is ABOVE the movement zone: a finger on it is a bottle, not a run');
    const zoneHit = await page.evaluate('document.elementFromPoint(300, 300)?.getAttribute("data-testid")');
    assert.equal(zoneHit, 'touch-zone', 'and the rest of the left side is still the movement zone');
    // the pixels on the screen are the artist's colours, with nothing laid over them: the bright bar, the plate behind the heart, the bright bottle
    const red = await pixel(page, where(HUD_PX.barLife).x + 60, where(HUD_PX.barLife).y + 7);
    assert.ok(close(red, [249, 55, 56]), `the life bar on the screen is the artist's red (${red})`);
    const cyan = await pixel(page, where(HUD_PX.barMagic).x + 60, where(HUD_PX.barMagic).y + 7);
    assert.ok(close(cyan, [84, 220, 252]), `the magic bar is the artist's cyan (${cyan})`);
    const bottle = await pixel(page, b0.x + b0.width / 2, b0.y + b0.height / 2);
    assert.ok(close(bottle, [84, 220, 252]), `a bottle is the artist's cyan (${bottle})`);

    // ================================================================== life: a point lost is 80, a number at once, a picture that follows, and a white rectangle that trails it
    const lostWatched = watchRectangle(page, 'life', 1500);
    await page.evaluate('window.__troid.strikePlayer(1)');
    await ctx.step(2);
    assert.equal(await numberOf(page, 'life'), '80', 'one of five points lost: 100 → 80');
    assert.equal(await attr(page, 'hud-life', 'aria-valuenow'), '4', 'with the real points beside it for a screen reader');
    assert.equal(await attr(page, 'hud-life', 'aria-valuemax'), '5');
    assert.equal(await attr(page, 'hud-life', 'aria-valuetext'), '80%');
    await ctx.shot('02-life-lost');
    await barAt(page, 'life', 0.8);
    const peak = await lostWatched;
    assert.ok(peak > 1.5, `the white rectangle trailed the picture of the bar, stretching behind it (${peak.toFixed(2)} times the artist's width), and then came back to its size`);
    assert.equal(await page.locator('[data-testid="hud-life-mark"]').evaluate((e) => (e as HTMLElement).style.transform.endsWith('scaleX(1)')), true);
    // the rectangle stands where the artist's picture of 75 has it, to within what a quarter of a point is: its left edge at 0.8 of its travel
    const mark = await box(page, 'hud-life-mark');
    const markWant = where({ x: HUD_PX.barLife.x + 0.8 * HUD_BAR_TRAVEL, y: HUD_PX.barLife.y - HUD_PX.marker.overhang, w: HUD_PX.marker.w, h: HUD_PX.marker.h });
    assert.ok(near(mark.x, markWant.x, 0.8) && near(mark.width, markWant.width, 0.8) && near(mark.height, markWant.height, 0.8), `the white rectangle of the artist, at its size, where the life ends (${JSON.stringify(mark)} / ${JSON.stringify(markWant)})`);
    const white = await pixel(page, mark.x + mark.width / 2, mark.y + mark.height / 2);
    assert.ok(close(white, [255, 255, 255]), `and white (${white})`);
    const dark = await pixel(page, mark.x + mark.width + 20, where(HUD_PX.barLife).y + 7);
    assert.ok(close(dark, [78, 17, 17]), `the lost part is the dark red of the artist's picture (${dark})`);
    const bright = await pixel(page, mark.x - 10, where(HUD_PX.barLife).y + 7);
    assert.ok(close(bright, [249, 55, 56]), `and the rest is the bright (${bright})`);
    await ctx.step(80); // the hit's invulnerability and stun are over
    await sess(page, 's.player.health.damage(3);');
    await ctx.step(1);
    assert.equal(await numberOf(page, 'life'), '20', 'one point left: 20');
    await barAt(page, 'life', 0.2);
    await sess(page, 's.player.health.heal(2);');
    await ctx.step(1);
    assert.equal(await numberOf(page, 'life'), '60', 'two points back: 60');
    await barAt(page, 'life', 0.6);
    await sess(page, 's.player.health.heal(99);');
    await ctx.step(1);
    assert.equal(await numberOf(page, 'life'), '100', 'never beyond the maximum');
    await barAt(page, 'life', 1);
    // (the rectangle fades out: a single sample taken while the fade is on its last frames reads 0.017 on a slow frame, so the fade is given its time and then it must be exactly 0)
    await page.waitForFunction("getComputedStyle(document.querySelector('[data-testid=\"hud-life-mark\"]')).opacity === '0'", undefined, { timeout: 3000 }).catch(() => undefined);
    assert.equal(await page.locator('[data-testid="hud-life-mark"]').evaluate((e) => getComputedStyle(e).opacity), '0', 'a full bar again has no white rectangle');

    // ================================================================== magic: a bar that follows the number, continuously, in the artist's colours
    await sess(page, 's.magic.spend(50);');
    await ctx.step(1);
    assert.equal(await numberOf(page, 'magic'), '50');
    assert.equal(await attr(page, 'hud-magic', 'aria-valuenow'), '50');
    await barAt(page, 'magic', 0.5);
    const mm = await box(page, 'hud-magic-mark');
    // where the artist's picture of 50 puts it: 609 px of its canvas from the end of the bar (this one is the 1210 of the travel, which puts it within 4 px of that)
    const mmWant = where({ x: HUD_PX.barMagic.x + 609, y: HUD_PX.barMagic.y, w: HUD_PX.marker.w, h: HUD_PX.marker.h });
    assert.ok(near(mm.x, mmWant.x, 0.7), `the white rectangle of the magic at 50 is where the artist's picture has it (${mm.x.toFixed(2)} vs ${mmWant.x.toFixed(2)})`);
    const dm = await pixel(page, mm.x + mm.width + 20, where(HUD_PX.barMagic).y + 7);
    assert.ok(close(dm, [26, 68, 77]), `the lost magic is the dark teal of the artist's picture (${dm})`);
    await ctx.shot('03-magic');
    await ctx.step(70 + 60);
    const m1 = Number(await numberOf(page, 'magic'));
    assert.ok(m1 > 50 && m1 < 60, `it comes back as the simulation brings it: 6 a second after a second of delay (${m1})`);
    await sess(page, 's.magic.restore();');
    await ctx.step(1);
    assert.equal(await numberOf(page, 'magic'), '100');
    await barAt(page, 'magic', 1);

    // ================================================================== bottles: bright or dark, one by one, as the real inventory says
    await sess(page, 's.bottles.consume(0);');
    await ctx.step(1);
    await vialsAre(page, ['1', '0', '0']);
    assert.deepEqual((await vials(page)).map((v) => v.state), ['recharging', 'ready', 'ready']);
    const used = await box(page, 'hud-vial-0-dark');
    const usedPx = await pixel(page, used.x + used.width / 2, used.y + used.height / 2);
    assert.ok(close(usedPx, [26, 68, 77]), `the bottle that was drunk is the artist's dark one (${usedPx})`);
    const kept = await box(page, 'hud-vial-1-bright');
    assert.ok(close(await pixel(page, kept.x + kept.width / 2, kept.y + kept.height / 2), [84, 220, 252]), 'and the others keep their bright one');
    await ctx.shot('04-bottle-1');
    await sess(page, 's.bottles.consume(1);');
    await ctx.step(1);
    await vialsAre(page, ['1', '1', '0']);
    assert.deepEqual((await vials(page)).map((v) => v.state), ['recharging', 'empty', 'ready'], 'a second drink waits its turn: only one recharges at a time, and both are dark');
    await ctx.shot('05-bottles-2');
    await sess(page, 's.bottles.consume(2);');
    await ctx.step(1);
    await vialsAre(page, ['1', '1', '1']);
    await ctx.shot('06-bottles-3');
    await ctx.step(60 * 60 + 5);
    await vialsAre(page, ['0', '1', '1']);
    assert.deepEqual((await vials(page)).map((v) => v.state), ['ready', 'recharging', 'empty'], 'the first is back after a minute and the next one starts');
    await sess(page, 's.bottles.refillAll(); s.bottles.addSlot("energy_bottle");');
    await ctx.step(1);
    await vialsAre(page, ['0', '0', '0', '0']);
    assert.equal(await page.locator('[data-testid^="hud-bottle-"]').count(), 4, 'a fourth bottle (the reward) appears in the artist\'s row');
    const fourth = await box(page, 'hud-vial-3-bright');
    assert.ok(near(fourth.x - b0.x, 3 * HUD_PX.bottle.pitch * ARTIST.scale, 0.8), 'one more pitch to the right');
    await sess(page, 's.bottles.consume(3);');
    await ctx.step(1);
    await vialsAre(page, ['0', '0', '0', '1']);

    // ================================================================== no slot for the power: it is the Ability button that says it is there
    await sess(page, 's.bottles.refillAll();');
    assert.equal(await page.locator('[data-testid="touch-ability"]').evaluate((e) => getComputedStyle(e).display), 'none', 'no card: the Ability button is not drawn');
    assert.equal(await cardState(page), 'empty');
    await sess(page, 's.loadout.acquire("card_spirit_bolt");');
    await ctx.step(1);
    assert.equal(await cardState(page), 'ready');
    assert.notEqual(await page.locator('[data-testid="touch-ability"]').evaluate((e) => getComputedStyle(e).display), 'none', 'a card: the Ability button appears');
    await sess(page, 's.loadout.equip(null);');
    await ctx.step(1);
    assert.equal(await page.locator('[data-testid="touch-ability"]').evaluate((e) => getComputedStyle(e).display), 'none', 'card taken off: the button goes away again');

    // ================================================================== the contextual bottle chip: only when drinking would help
    const chip = (): Promise<string> => page.locator('[data-testid="touch-chip"]').evaluate((e) => getComputedStyle(e).display);
    assert.equal(await chip(), 'none', 'full life: no chip');
    await sess(page, 's.player.health.damage(2);');
    await ctx.step(1);
    assert.notEqual(await chip(), 'none', 'hurt and a bottle ready: the chip appears');
    await sess(page, 's.player.health.restore();');
    await ctx.step(1);
    assert.equal(await chip(), 'none', 'healed: it goes away');

    // ================================================================== a finger on a bottle belongs to the bottle
    const screen = await new TouchScreen(page).init();
    const v1 = await centreOf(page, 'hud-bottle-1');
    await screen.touch(1, v1.x, v1.y);
    assert.equal(await page.evaluate('window.__troid.touch().active'), 1, 'one finger, owned by the bottle');
    const gesture = (await page.evaluate('window.__troid.touch().gesture')) as { pointer: number | null };
    assert.equal(gesture.pointer, null, 'and the movement zone did not take it');
    await screen.lift(1);
    assert.equal(await page.evaluate('window.__troid.touch().active'), 0);

    // ================================================================== a change of zone: the hero takes the same life, magic and bottles into the next room, and the HUD does not start over
    await sess(page, 's.flags.set("defeated:r1_slime");');
    await ctx.step(2);
    await sess(page, 's.player.health.damage(2); s.magic.spend(40); s.bottles.consume(1);');
    await ctx.step(1);
    await barAt(page, 'life', 0.6);
    await barAt(page, 'magic', 0.6);
    await vialsAre(page, ['0', '1', '0', '0']);
    assert.equal(await outOfSync(page), null, 'before the change of zone the HUD says what the game has');
    await ctx.teleport(110, 0);
    for (let k = 0; k < 150 && (await ctx.state()).room !== 'r2_hall'; k++) await ctx.step(2);
    assert.equal((await ctx.state()).room, 'r2_hall', 'the hero went through to the next zone');
    await ctx.step(40);
    assert.equal(await numberOf(page, 'life'), '60', 'the life is the one they had: a zone does not give it back');
    assert.equal(await outOfSync(page), null, 'and after it the HUD still says what the game has (the magic may have started to come back)');
    assert.deepEqual((await vials(page)).map((v) => v.state), ['ready', 'recharging', 'ready', 'ready'], 'the bottle that was drunk is still the dark one and the others are as they were');
    await vialsAre(page, ['0', '1', '0', '0']);
    assert.equal(await dataOf(page, 'hud-life', 'data-edge'), '0.6', 'and the picture of the bar did not start over from full');

    // ================================================================== the pause: the pictures wait with the game, the numbers never lie, and the pictures go on when the game does
    await sess(page, 's.player.health.restore(); s.magic.restore();');
    await ctx.step(1);
    await barAt(page, 'life', 1);
    await barAt(page, 'magic', 1);
    await page.locator('[data-testid="pause-button"]').click();
    await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { state: 'attached', timeout: 20000 });
    assert.equal(await attr(page, 'hud', 'data-paused'), '1', 'the HUD knows the game waits');
    await sess(page, 's.player.health.damage(2); s.magic.spend(40);'); // (only a test can change a game that waits: the simulation does not run)
    await frames(page, 8);
    assert.equal(await numberOf(page, 'life'), '60', 'the number is the real one at once, with the game waiting');
    assert.equal(await numberOf(page, 'magic'), '60');
    await page.waitForTimeout(400);
    assert.deepEqual([await dataOf(page, 'hud-life', 'data-edge'), await dataOf(page, 'hud-life', 'data-wear'), await dataOf(page, 'hud-magic', 'data-edge')], ['1', '1', '1'], 'and the pictures of the bars wait with the game: nothing of them moved');
    await page.locator('[data-testid="pause-resume"]').click();
    await page.waitForSelector('[data-testid="pause-menu"][data-open="0"]', { state: 'attached', timeout: 20000 });
    assert.equal(await attr(page, 'hud', 'data-paused'), '0');
    await barAt(page, 'life', 0.6);
    await barAt(page, 'magic', 0.6);
    assert.deepEqual([await numberOf(page, 'life'), await numberOf(page, 'magic')], ['60', '60'], 'resumed: the pictures arrive where the numbers already were');
    assert.equal(await outOfSync(page), null);
    await sess(page, 's.player.health.restore(); s.magic.restore();');
    await ctx.step(1);
    await barAt(page, 'life', 1);

    // ================================================================== every aspect ratio: top left, on screen, clear of the controls
    for (const [w, h] of [[1024, 768], [1280, 720], [844, 390], [1260, 540], [667, 375]] as const) {
      await page.setViewportSize({ width: w, height: h });
      // wait for the page to have laid the HUD out for THIS window (its `resize` runs on the page's own frames, which can be slow without a GPU), not for a time
      const scale = Math.min(1.6, Math.max(0.9, Math.min(w, h * 2.1) / 844));
      for (let i = 0; i < 80 && Math.abs(((await page.evaluate('window.__troid.hud().layout.scale')) as number) - scale) > 1e-9; i++) await page.waitForTimeout(50);
      await frames(page, 3);
      const hb = await box(page, 'hud-block');
      const l = (await page.evaluate('window.__troid.hud().layout')) as { scale: number };
      assert.ok(hb.x >= 0 && hb.y >= 0 && hb.x + hb.width <= w && hb.y + hb.height <= h, `${w}×${h}: the HUD is entirely on screen (${JSON.stringify(hb)})`);
      assert.ok(hb.x < w * 0.25 && hb.y < h * 0.25, `${w}×${h}: and at the top left`);
      assert.ok(Math.abs(hb.x - 25.7 * l.scale) < 1.5, `${w}×${h}: 25.7 dp from the left edge, scaled (${hb.x} vs ${25.7 * l.scale})`);
      assert.ok(Math.abs(hb.width - 218.33 * l.scale) < 1.5, `${w}×${h}: 218.3 dp wide at the window's scale (${hb.width})`);
      const attack = await box(page, 'touch-attack');
      assert.ok(hb.x + hb.width < attack.x || hb.y + hb.height < attack.y, `${w}×${h}: clear of the touch controls`);
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(120);

    // ================================================================== the safe area: a notch and a home indicator
    await ctx.open('touch=1&safe=44,47,21,47', { width: 844, height: 390, touch: true });
    page = ctx.page;
    await ctx.step(5);
    const notch = await box(page, 'hud-portrait');
    const ls = (await page.evaluate('window.__troid.hud().layout')) as { scale: number };
    assert.ok(notch.x >= 47 + 25.7 * ls.scale - 1, `47 px of notch on the left push the HUD in (${notch.x})`);
    assert.ok(notch.y >= 44 + 25.7 * ls.scale - 1, `44 px at the top too (${notch.y})`);
    await ctx.shot('07-notch');

    // ================================================================== the HUD speaks the player's language
    await ctx.open('lang=en', { width: 844, height: 390 });
    assert.equal(await attr(ctx.page, 'hud-life', 'aria-label'), 'Life');
    assert.equal(await attr(ctx.page, 'hud-magic', 'aria-label'), 'Magic');
    assert.equal(await attr(ctx.page, 'hud-bottle-0', 'aria-label'), 'Bottle 1: ready');
    await ctx.open('lang=es', { width: 844, height: 390 });
    assert.equal(await attr(ctx.page, 'hud-life', 'aria-label'), 'Vida');
    assert.equal(await attr(ctx.page, 'hud-magic', 'aria-label'), 'Magia');
    assert.equal(await attr(ctx.page, 'hud-bottle-0', 'aria-label'), 'Botella 1: lista');
    // a desktop sees the HUD too (it is not part of the touch layer)
    assert.equal(await ctx.page.locator('[data-testid="hud"]').isVisible(), true);

    // ================================================================== what is written on it is never a word, in either language
    const written = async (): Promise<string> => String(await ctx.page.evaluate('document.querySelector("[data-testid=hud]").textContent'));
    await sess(ctx.page, 's.bottles.consume(0); s.magic.spend(30); s.player.health.damage(1);');
    await ctx.step(2);
    await frames(ctx.page, 4);
    assert.equal(await written(), '8070', 'the life and the magic, whole: nothing else');
    assert.match(await written(), /^[0-9]+$/, 'numbers: no word of any language');
    await ctx.open('lang=en', { width: 844, height: 390 });
    await sess(ctx.page, 's.bottles.consume(0); s.magic.spend(30); s.player.health.damage(1);');
    await ctx.step(2);
    assert.equal(await written(), '8070', 'and it is the same in English');
  },
};
