import assert from 'node:assert/strict';
import type { BrowserContext } from 'playwright-core';
import type { CellInfo } from '@/app/labs/playerLab';
import { createArtFixture, type Fixture, type FixturePack } from '../artFixture';
import type { Ctx, Scenario } from '../scenario';

/**
 * THE PLAYER LAB in a real browser (`?lab=player`, docs/ART-PIPELINE-2D.md part G), with the placeholder and with SYNTHETIC art (noise on a transparent canvas; the
 * real art is not in the repository): a clip at a time, frame by frame, with the anchors, the sword, the picture's own bounds and — apart from them — the collision body,
 * the hurtbox and the hitbox the game really uses.
 *
 *   A · the placeholder alone: the panel, the clips, play / pause / step, the sword in the hand in every frame of a blow, the scale that touches the picture and not the body
 *   B · with art: both looks side by side and each alone; the art's frames, its bounds in metres, a clip it lacks said so, the phases and the sword of its blow, what is still to be drawn
 *   C · what the lab does and what it does not: no error in the console, and no page of the game ever asks for it
 */
const PACKS: FixturePack[] = [
  {
    id: 'player',
    category: 'player',
    load: 'boot',
    sprites: [{ id: 'hero', canvas: [64, 96], clips: { idle: 4, walk: 4, attack1: 4 }, clipExtra: { attack1: { phases: { startup: [0, 1], active: [2, 2], recovery: [3, 3] } } }, sword: ['attack1'] }],
  },
];
const SIZE = { width: 1100, height: 520, dpr: 1 };

interface LabState {
  look: string;
  clip: string;
  playing: boolean;
  speed: number;
  scale: number;
  facing: number;
  flags: Record<string, boolean>;
  cells: { placeholder: CellInfo | null; art: CellInfo | null };
  art: { loaded: boolean; id: string | null; provides: string[]; lacks: string[]; note: string };
  body: { halfWidth: number; height: number; hurtbox: { halfWidth: number; height: number } };
  draws: number;
}

const lab = async (ctx: Ctx): Promise<LabState> => (await ctx.page.evaluate('window.__playerLab.state()')) as LabState;
const open = async (ctx: Ctx, fixture: Fixture | null, query = ''): Promise<void> => {
  await ctx.open(`lab=player${query ? `&${query}` : ''}${fixture ? '&art=art-test' : ''}`, { ...SIZE, prepare: async (context: BrowserContext) => (fixture ? fixture.serve(context, 'art-test') : undefined) });
  await ctx.page.waitForFunction('window.__playerLab && window.__playerLab.ready', undefined, { timeout: 30000 });
};
const tid = (id: string): string => `[data-testid="${id}"]`;
const pick = async (ctx: Ctx, clip: string): Promise<void> => void (await ctx.page.selectOption(tid('lab-clip'), clip));
const click = (ctx: Ctx, id: string): Promise<void> => ctx.page.click(tid(id));
const within = (a: number, b: number, eps: number, what: string): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} vs ${b}`);

export const playerLab: Scenario = {
  name: 'player-lab',
  async run(ctx) {
    // ===================================================================================================== A · the placeholder alone
    await open(ctx, null);
    let s = await lab(ctx);
    assert.equal(s.look, 'placeholder');
    assert.equal(s.art.loaded, false, 'no art: only the placeholder');
    assert.equal(s.art.lacks.length, 15, 'every clip is still to be drawn');
    assert.equal(await ctx.page.isDisabled(tid('lab-look-art')), true, 'there is no art to look at');
    assert.equal(await ctx.page.isDisabled(tid('lab-look-both')), true);
    assert.match((await ctx.page.textContent(tid('lab-lacks'))) ?? '', /^15 of 15: all/);
    const options = await ctx.page.$$eval(`${tid('lab-clip')} option`, (os) => os.map((o) => (o as HTMLOptionElement).value));
    for (const c of ['idle', 'walk', 'jump', 'fall', 'dash', 'attack1', 'attack2', 'attackAir', 'crouch', 'attackCrouch', 'hurt', 'death', 'cast', 'drink', 'interact']) assert.ok(options.includes(c), `${c} can be looked at`);

    // a blow, frame by frame: pause, step through the whole clip and back; the sword is in the hand in every frame of it
    await pick(ctx, 'attack');
    await click(ctx, 'lab-play'); // pauses (the lab starts playing)
    s = await lab(ctx);
    assert.equal(s.playing, false);
    const ph = (st: LabState): CellInfo => st.cells.placeholder!;
    assert.equal(ph(s).hasClip, true);
    const count = ph(s).count;
    assert.ok(count >= 4, `the placeholder's blow has ${count} frames`);
    const seen: string[] = [];
    const phases: string[] = [];
    await ctx.page.evaluate('window.__playerLab.seek(0)');
    for (let i = 0; i < count; i++) {
      s = await lab(ctx);
      assert.equal(ph(s).index, i, 'one step, one frame');
      seen.push(ph(s).frame!);
      phases.push(ph(s).phase);
      assert.ok(ph(s).gripFromHand !== null && ph(s).gripFromHand! <= 0.04, `the sword is in the hand in ${ph(s).frame} (${ph(s).gripFromHand})`);
      await click(ctx, 'lab-next');
    }
    assert.equal((await lab(ctx)).cells.placeholder!.index, 0, 'one step past the last frame wraps to the first');
    assert.equal(new Set(seen).size, count, 'every frame is a different one');
    assert.deepEqual([...new Set(phases)].filter((p) => p !== 'none'), ['startup', 'active', 'recovery'], 'the blow goes through its phases in order');
    await click(ctx, 'lab-prev');
    assert.equal((await lab(ctx)).cells.placeholder!.index, count - 1, 'one step back from the first wraps to the last');
    // paused really is paused, and play goes on
    const paused = (await lab(ctx)).cells.placeholder!.index;
    await ctx.page.waitForTimeout(500);
    assert.equal((await lab(ctx)).cells.placeholder!.index, paused, 'paused stays on its frame');
    await click(ctx, 'lab-play');
    await ctx.page.waitForFunction(`window.__playerLab.state().cells.placeholder.index !== ${paused}`, undefined, { timeout: 10000 });

    // the hitbox, the hurtbox and the body are the game's — and the scale touches only the picture
    await ctx.page.evaluate('window.__playerLab.pause()');
    await ctx.page.check(tid('lab-flag-hitbox'));
    await ctx.page.check(tid('lab-flag-hurtbox'));
    s = await lab(ctx);
    assert.equal(s.flags['hitbox'], true);
    assert.deepEqual(s.body, { halfWidth: 0.35, height: 1.7, hurtbox: { halfWidth: 0.3, height: 1.55 } }, 'the body and the hurtbox are the ones of the game');
    const before = ph(s).canvas!;
    await ctx.page.fill(tid('lab-scale'), '1.5');
    s = await lab(ctx);
    assert.equal(s.scale, 1.5);
    within((ph(s).canvas!.x1 - ph(s).canvas!.x0) / (before.x1 - before.x0), 1.5, 1e-6, 'the picture grows by the scale');
    await ctx.page.evaluate('window.__playerLab.setScale(2)'); // the limits of the lab: ×0.5 … ×1.5
    assert.equal((await lab(ctx)).scale, 1.5);
    await ctx.page.evaluate('window.__playerLab.setScale(0.1)');
    assert.equal((await lab(ctx)).scale, 0.5);
    await ctx.page.fill(tid('lab-scale'), '1.5');
    assert.deepEqual(s.body, { halfWidth: 0.35, height: 1.7, hurtbox: { halfWidth: 0.3, height: 1.55 } }, 'the body, the hurtbox and the hitbox do not');
    await ctx.shot('a-01-placeholder-scaled');
    await click(ctx, 'lab-scale-reset');
    assert.equal((await lab(ctx)).scale, 1);
    await click(ctx, 'lab-flip');
    assert.equal((await lab(ctx)).facing, -1, 'mirrored');
    await click(ctx, 'lab-flip');

    // ===================================================================================================== B · with art
    const fixture = createArtFixture(PACKS);
    try {
      await open(ctx, fixture);
      s = await lab(ctx);
      assert.equal(s.art.loaded, true);
      assert.equal(s.art.id, 'player/hero');
      assert.equal(s.look, 'both', 'with art, the two side by side');
      assert.deepEqual([...s.art.provides].sort(), ['attack1', 'idle', 'walk']);
      assert.deepEqual(s.art.lacks, ['jump', 'fall', 'dash', 'attack2', 'attackAir', 'crouch', 'attackCrouch', 'hurt', 'death', 'cast', 'drink', 'interact'], 'what is still to be drawn: the other twelve');
      assert.match((await ctx.page.textContent(tid('lab-lacks'))) ?? '', /^12 of 15: jump, fall, dash/);
      await click(ctx, 'lab-play'); // pause
      await pick(ctx, 'idle');
      await ctx.page.evaluate('window.__playerLab.seek(2)');
      s = await lab(ctx);
      const art = s.cells.art!;
      assert.equal(art.frame, 'idle_02');
      assert.deepEqual([art.index, art.count], [2, 4]);
      // the picture in metres: the canvas of the fixture (64 × 96 px at 60 px/m) and the part of it that was kept
      within(art.canvas!.x1 - art.canvas!.x0, 64 / 60, 1e-6, 'the canvas is 64 px / 60 px/m wide');
      within(art.canvas!.y1 - art.canvas!.y0, 96 / 60, 1e-6, 'and 96 px / 60 px/m tall');
      assert.ok(art.visible!.x1 - art.visible!.x0 < art.canvas!.x1 - art.canvas!.x0, 'the packer trimmed the empty border: the kept part is smaller than the canvas');
      assert.equal(art.visualScale, 1);
      assert.equal(art.artPxPerMeter, 60);
      await ctx.shot('b-01-both-idle');

      // a clip the art lacks is said so, and the game draws the placeholder there
      await pick(ctx, 'jump');
      s = await lab(ctx);
      assert.equal(s.cells.art!.hasClip, false);
      assert.equal(s.cells.placeholder!.hasClip, true);
      assert.match((await ctx.page.textContent(tid('lab-info'))) ?? '', /no clip "jump" → the game draws the placeholder here/);

      // the blow of the art: its phases and the sword in the hand, frame by frame — against the placeholder's, which the game calls `attack`
      await pick(ctx, 'attack1');
      s = await lab(ctx);
      assert.deepEqual([s.cells.art!.clip, s.cells.placeholder!.clip], ['attack1', 'attack'], 'the same blow under the artist\'s name and the game\'s own');
      await pick(ctx, 'attack');
      s = await lab(ctx);
      assert.deepEqual([s.cells.art!.clip, s.cells.placeholder!.clip], ['attack1', 'attack'], 'asked for by the game\'s name, the art answers with its attack1');
      assert.match((await ctx.page.textContent(tid('lab-info'))) ?? '', /attack ← attack1 · attack1_0/);
      await pick(ctx, 'attack1');
      const frames: Array<{ phase: string; grip: number | null; tip: number }> = [];
      await ctx.page.evaluate('window.__playerLab.seek(0)');
      for (let i = 0; i < 4; i++) {
        const a = (await lab(ctx)).cells.art!;
        assert.equal(a.frame, `attack1_0${i}`);
        frames.push({ phase: a.phase, grip: a.gripFromHand, tip: a.anchors.weapon_tip!.x - a.anchors.weapon_grip!.x });
        await click(ctx, 'lab-next');
      }
      assert.deepEqual(frames.map((f) => f.phase), ['startup', 'startup', 'active', 'recovery'], 'the phases the manifest declares');
      for (const f of frames) {
        assert.ok(f.grip !== null && f.grip < 0.01, `the sword is in the hand (${f.grip})`);
        within(f.tip, 0.9, 1e-6, 'the tip is 0.9 m ahead of the grip');
      }
      assert.match((await ctx.page.textContent(tid('lab-info'))) ?? '', /sword: grip is 0\.00 m from the hand ✓/);

      // each look alone
      await click(ctx, 'lab-look-art');
      s = await lab(ctx);
      assert.equal(s.look, 'art');
      await ctx.shot('b-02-art-alone');
      await click(ctx, 'lab-look-placeholder');
      assert.equal((await lab(ctx)).look, 'placeholder');
      await click(ctx, 'lab-look-both');

      // the scale touches the picture of each look, and nothing of the game
      const canvasBefore = (await lab(ctx)).cells.art!.canvas!;
      await ctx.page.fill(tid('lab-scale'), '1.25');
      s = await lab(ctx);
      within((s.cells.art!.canvas!.x1 - s.cells.art!.canvas!.x0) / (canvasBefore.x1 - canvasBefore.x0), 1.25, 1e-6, 'the art grows by the scale');
      assert.deepEqual(s.body, { halfWidth: 0.35, height: 1.7, hurtbox: { halfWidth: 0.3, height: 1.55 } }, 'the body does not');
      assert.equal(s.cells.art!.visualScale, 1.25);
      await ctx.shot('b-03-scaled');

      // ================================================================================================= C · the lab changes nothing and costs nothing
      assert.ok(s.draws <= 12, `${s.draws} draw calls`);
      assert.equal(ctx.errors.length, 0);
    } finally {
      fixture.cleanup();
    }
  },
};
