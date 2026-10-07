import assert from 'node:assert/strict';
import type { BrowserContext } from 'playwright-core';
import { PLAYER_ATTACKS } from '@/content/attacks';
import { PLAYER } from '@/content/player';
import { PLAYER_VISUAL } from '@/content/visuals';
import { createArtFixture, type Fixture, type FixturePack } from '../artFixture';
import type { Box, Ctx, GameState, Scenario } from '../scenario';

/**
 * THE PROTAGONIST'S ART IN R1, WHOLE (docs/ART-PIPELINE-2D.md, part G.3), with SYNTHETIC art that has all fifteen clips the delivery asks for (noise on a
 * transparent canvas: no character, no scene — the real art is not in the repository). What is proved is the INTEGRATION: that the day the real fifteen clips arrive, the
 * first room plays with them — every state the hero shows, the crawl through the tunnel and the slide under it included — and that the four boxes of the hero are what
 * they were.
 *
 *   A · R1 as a new game starts, with the art: the art is on the hero, nothing is lacking, no note, no extra draw
 *   B · the same scripted play of R1 three times — with no art, with the art, with the way back — gives the same simulation and the same three boxes (collision body,
 *       hurtbox, hitbox), tick by tick; only the picture's rectangle changes with the look
 *   C · in the art play every state of the hero is drawn by the art, with the clip that stands for it, and every blow's hitbox is the attack's own data
 *   D · the interaction, in the room that has something to take, and the way back in the middle of a pose
 */
const BLOW = { phases: { startup: [0, 1], active: [2, 2], recovery: [3, 3] } };
const CLIPS: Record<string, number> = { idle: 4, walk: 6, jump: 3, fall: 3, dash: 4, attack1: 4, attack2: 4, attackAir: 4, crouch: 3, attackCrouch: 4, hurt: 3, death: 5, cast: 4, drink: 4, interact: 3 };
const CANVAS: [number, number] = [96, 128]; // 1.6 × 2.13 m at 60 px/m: a figure much wider and taller than the body it stands for
/** The complete protagonist, synthetic: the fifteen clips of the delivery, the sword in the hand in each blow. */
export const HERO_PACKS: FixturePack[] = [
  {
    id: 'player',
    category: 'player',
    load: 'boot',
    sprites: [{ id: 'hero', canvas: CANVAS, clips: CLIPS, clipExtra: { attack1: BLOW, attack2: BLOW, attackAir: BLOW, attackCrouch: BLOW, cast: BLOW }, sword: ['attack1', 'attack2', 'attackAir', 'attackCrouch'] }],
  },
];
const SIZE = { width: 844, height: 390, dpr: 1 };
/** The clip that draws each state the hero shows: its own, or the one that stands for it (the gaits borrow the walk, a landing the idle, the crawl the crouch, the first blow the first swing). */
const CLIP_OF: Record<string, string> = {
  idle: 'idle', walk: 'walk', run: 'walk', jump: 'jump', fall: 'fall', land: 'idle', crouch: 'crouch', crouchWalk: 'crouch', dash: 'dash',
  attack: 'attack1', attack2: 'attack2', attackAir: 'attackAir', attackCrouch: 'attackCrouch', cast: 'cast', drink: 'drink', hurt: 'hurt', death: 'death', interact: 'interact',
};
/** What R1 can show of the hero: everything but the interaction, which R1 has nothing to do with (the card lies in R3). */
const IN_R1 = Object.keys(CLIP_OF).filter((s) => s !== 'interact');
/** The attack each blow state runs, and the metres the canvas of the art covers from the feet (the picture's rectangle can never leave it). */
const ATTACK_OF: Record<string, string> = { attack: 'slash_1', attack2: 'slash_2', attackAir: 'air_slash', attackCrouch: 'crouch_slash' };
const CANVAS_LOCAL = { x0: -(CANVAS[0] / 60) / 2, x1: (CANVAS[0] / 60) / 2, y0: 0, y1: CANVAS[1] / 60 };

interface Sample {
  tick: number;
  anim: string;
  state: GameState;
}

const open = (ctx: Ctx, fixture: Fixture | null, query: string): Promise<void> =>
  ctx.open(`${query}${fixture ? `${query ? '&' : ''}art=art-test` : ''}`, { ...SIZE, prepare: async (context: BrowserContext) => (fixture ? fixture.serve(context, 'art-test') : undefined) });
const waitFor = async (ctx: Ctx, what: string, test: (s: GameState) => boolean, ms = 20000): Promise<GameState> => {
  const t0 = Date.now();
  for (;;) {
    const s = await ctx.state();
    if (test(s)) return s;
    if (Date.now() - t0 > ms) throw new Error(`gave up waiting for ${what}: ${JSON.stringify(s.visual)}`);
    await ctx.page.waitForTimeout(50);
  }
};
const sess = (ctx: Ctx, code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
const close = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;
const same = (a: Box, b: Box): boolean => close(a.x0, b.x0) && close(a.x1, b.x1) && close(a.y0, b.y0) && close(a.y1, b.y1);
const inside = (inner: Box, outer: Box, eps = 1e-6): boolean => inner.x0 >= outer.x0 - eps && inner.x1 <= outer.x1 + eps && inner.y0 >= outer.y0 - eps && inner.y1 <= outer.y1 + eps;

/** The part of a state that is SIMULATION, the boxes the simulation owns included: what must not change by a hair whatever the hero looks like. */
const simOf = (s: GameState, tick: number): unknown => ({
  tick, x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: s.grounded, state: s.state, anim: s.anim, health: s.health, magic: s.magic,
  crouched: s.crouched, bodyHeight: s.bodyHeight, combat: s.combat, hitStop: s.hitStop, invulnerable: s.invulnerable, bottles: s.bottles,
  dummies: s.dummies?.map((d) => ({ x: d.x, hp: d.hp, hits: d.hits })),
  body: s.boxes?.body, hurtbox: s.boxes?.hurtbox, hitbox: s.boxes?.hitbox,
});

function firstDifference(a: unknown[], b: unknown[]): string | null {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = JSON.stringify(a[i]);
    const y = JSON.stringify(b[i]);
    if (x !== y) return `sample ${i} of ${n}:\n   now:       ${x}\n   reference: ${y}\n   (previous reference: ${JSON.stringify(b[i - 1])})`;
  }
  return null;
}

/**
 * A scripted play of R1 with the REAL keyboard: every state the hero has. The same script, tick for tick, whatever the look — it only decides which keys are held and
 * for how many ticks; what is polled (grounded, invulnerable, the death flow) is the simulation's, so it is the same in every run.
 */
async function play(ctx: Ctx): Promise<Sample[]> {
  const samples: Sample[] = [];
  const kb = ctx.page.keyboard;
  const t0 = (await ctx.state()).tick;
  const mark = async (): Promise<GameState> => {
    const state = await ctx.state();
    samples.push({ tick: state.tick - t0, anim: state.anim, state });
    return state;
  };
  /** `ticks` ticks, looked at every `every`. */
  const run = async (ticks: number, every = 3): Promise<void> => {
    for (let left = ticks; left > 0; left -= every) {
      await ctx.step(Math.min(every, left));
      await mark();
    }
  };
  const tap = async (code: string, hold = 1): Promise<void> => {
    await kb.down(code);
    await ctx.step(hold);
    await kb.up(code);
    await mark();
  };
  const untilGrounded = async (): Promise<void> => {
    for (let i = 0; i < 80; i++) {
      await ctx.step(1);
      const s = await mark();
      if (s.grounded && i > 4) return;
    }
    throw new Error('the hero never landed');
  };

  await mark();
  await run(12); // standing
  await kb.down('KeyD');
  await run(45); // from standing to the full gait: the walk and then the run
  await kb.up('KeyD');
  await run(30);
  // a jump, and the landing looked at every tick
  await tap('Space', 2);
  await untilGrounded();
  await run(10, 1);
  await run(20);
  // the dash on foot
  await tap('ShiftLeft', 2);
  await run(30);
  // a dummy in front: the blows are real, they hit it
  await ctx.page.evaluate('window.__troid.spawnDummy(window.__troid.session.player.body.x + 1.3, 0, 99)');
  await ctx.step(2);
  await mark();
  await tap('KeyJ'); // the first blow
  await run(6, 1);
  await tap('KeyJ'); // and the second, in the window of the first
  await run(40, 2);
  // the blow in the air
  await tap('Space', 2);
  await run(9, 3);
  await tap('KeyJ');
  await run(24, 2);
  await untilGrounded();
  await run(20);
  // the blow crouched, and the crouch
  await kb.down('KeyS');
  await run(24);
  await tap('KeyJ');
  await run(36, 2);
  await kb.up('KeyS');
  await run(18);
  // the cast: a card the hero does not have in R1 (it lies in R3), given by the test
  await sess(ctx, 's.loadout.acquire("card_spirit_bolt");');
  await ctx.step(2);
  await tap('KeyK');
  await run(48, 2);
  // the bottle, after some damage
  await sess(ctx, 's.player.health.damage(2);');
  await ctx.step(2);
  await tap('KeyL');
  await run(42, 2);
  // a hit
  await ctx.page.evaluate('window.__troid.strikePlayer(1)');
  await run(36, 2);
  // the passage under the wall of R1: the crawl, and the slide of a crouched dash
  await ctx.teleport(61, 0);
  await kb.down('KeyS');
  await run(24);
  await kb.down('KeyD');
  await run(30);
  await tap('ShiftLeft', 2);
  await run(24, 2);
  await kb.up('KeyD');
  await run(12);
  await kb.up('KeyS');
  await run(24);
  // the death: the last point of life, the i-frames of the hit over, a strike
  for (let i = 0; i < 200 && (await ctx.state()).invulnerable; i++) await ctx.step(2);
  await sess(ctx, 's.player.health.damage(s.player.health.current - 1);');
  await ctx.step(1);
  await ctx.page.evaluate('window.__troid.strikePlayer(1)');
  await run(30, 2);
  for (let i = 0; i < 400 && (await ctx.state()).death?.phase !== 'none'; i++) {
    await ctx.step(4);
    await mark();
  }
  await run(24);
  assert.equal(ctx.errors.length, 0, 'the console stayed clean through the play');
  return samples;
}

/** What every sample says of the hero's boxes, whatever the look draws: the body, the hurtbox and the hitbox are the simulation's. */
function checkBoxes(samples: Sample[], what: string): void {
  const halfW = PLAYER.body.halfWidth;
  for (const { tick, state: s } of samples) {
    const at = `${what}, tick ${tick} (${s.anim})`;
    const boxes = s.boxes!;
    assert.ok(close(boxes.body.x1 - boxes.body.x0, 2 * halfW), `${at}: the collision body is ${2 * halfW} m wide, as defined`);
    assert.ok(close(boxes.body.y1 - boxes.body.y0, s.bodyHeight!), `${at}: and as tall as the posture says (${s.bodyHeight})`);
    assert.ok(close(boxes.body.x0, s.x - halfW) && close(boxes.body.y0, s.y), `${at}: standing on the position of the simulation`);
    const hurtHeight = s.crouched ? PLAYER.movement.crouch.hurtboxHeight : PLAYER.body.hurtbox.height;
    assert.ok(close(boxes.hurtbox.x1 - boxes.hurtbox.x0, 2 * PLAYER.body.hurtbox.halfWidth) && close(boxes.hurtbox.y1 - boxes.hurtbox.y0, hurtHeight), `${at}: the hurtbox is the posture's (${hurtHeight} m tall), not the picture's`);
    assert.ok(boxes.visual.x1 > boxes.visual.x0 && boxes.visual.y1 > boxes.visual.y0, `${at}: the picture has an area`);
    if (boxes.hitbox) {
      assert.ok(s.combat!.attack, `${at}: a hitbox only while a blow is out`);
      const def = PLAYER_ATTACKS[s.combat!.attack!]!.hitbox;
      const facing = s.sprite!.facing;
      // the blow is put where the hero stood when its tick submitted it: up to a couple of ticks of the movement away from where it is now
      const tol = (Math.abs(s.vx) + Math.abs(s.vy)) / 30 + 0.01;
      const near = facing > 0 ? boxes.hitbox.x0 - s.x : s.x - boxes.hitbox.x1;
      assert.ok(close(boxes.hitbox.x1 - boxes.hitbox.x0, def.w) && close(boxes.hitbox.y1 - boxes.hitbox.y0, def.h), `${at}: the hitbox is as big as the attack says (${def.w} × ${def.h} m), not as big as the picture`);
      assert.ok(close(near, def.x, tol) && close(boxes.hitbox.y0 - s.y, def.y, tol), `${at}: and in front of the hero where the attack says (${def.x}, ${def.y}) from the feet (${near.toFixed(3)}, ${(boxes.hitbox.y0 - s.y).toFixed(3)})`);
    }
  }
}

export const playerR1: Scenario = {
  name: 'player-r1',
  async run(ctx) {
    assert.deepEqual(Object.keys(CLIPS).sort(), [...PLAYER_VISUAL.required].sort(), 'the synthetic hero has exactly the clips the delivery asks for');
    const complete = createArtFixture(HERO_PACKS);
    try {
      // ===================================================================================================== A · R1, with the whole art
      await open(ctx, complete, '');
      let s = await waitFor(ctx, 'the art on the hero', (x) => x.visual?.art === 'player/hero');
      assert.equal(s.room, 'r1_gate', 'a new game starts in R1');
      assert.deepEqual([...s.visual!.provides].sort(), [...PLAYER_VISUAL.required].sort(), 'the art has the fifteen clips');
      assert.deepEqual(s.visual!.lacks, [], 'and nothing is left to draw: the placeholder has no state of its own to show');
      assert.equal(s.enemies?.length, 1, 'R1 is built whole around the art: the slime is in the world');
      assert.equal(s.gates?.exit_door?.alpha, 1);
      assert.equal(ctx.warnings.filter((w) => w.includes('[art]')).length, 0, 'and the library had nothing to say about it');
      await ctx.step(10);
      s = await ctx.state();
      assert.deepEqual({ shows: s.visual!.shows, set: s.sprite!.set }, { shows: 'art', set: 'player/hero' });
      await ctx.shot('a-01-r1-with-art');
      const scene = s.scene;
      const placeholderSet = await (async () => {
        await ctx.page.evaluate("window.__troid.setVisualMode('placeholder')");
        const p = await ctx.state();
        await ctx.page.evaluate("window.__troid.setVisualMode('auto')");
        assert.deepEqual(p.scene, scene, 'the way back changes nothing in the scene: the same objects in every layer');
        return p.sprite!.set;
      })();
      assert.notEqual(placeholderSet, 'player/hero');

      // ===================================================================================================== B · one play, three looks
      await open(ctx, null, '');
      assert.equal((await ctx.state()).visual!.shows, 'placeholder');
      const bare = await play(ctx);
      assert.ok(bare.length > 150, `a long play (${bare.length} samples)`);
      for (const { state: x, tick } of bare) assert.equal(x.visual!.shows, 'placeholder', `no art, tick ${tick}: the placeholder`);
      checkBoxes(bare, 'no art');

      await open(ctx, complete, '');
      await waitFor(ctx, 'the art on the hero', (x) => x.visual?.art === 'player/hero');
      const withArt = await play(ctx);
      let worstDraws = 0;
      for (const { state: x } of withArt) worstDraws = Math.max(worstDraws, x.drawsMax ?? 0);
      checkBoxes(withArt, 'art');

      await open(ctx, complete, 'visual=placeholder');
      await waitFor(ctx, 'the art loaded (and held back)', (x) => x.visual?.art === 'player/hero');
      const wayBack = await play(ctx);
      for (const { state: x, tick } of wayBack) assert.equal(x.visual!.shows, 'placeholder', `the way back, tick ${tick}: the placeholder though the art is loaded`);
      checkBoxes(wayBack, 'the way back');

      const trace = (samples: Sample[]): unknown[] => samples.map((x) => simOf(x.state, x.tick));
      assert.equal(firstDifference(trace(withArt), trace(bare)), null, 'with the whole art on the hero the simulation AND its three boxes are the same, tick by tick, as with none');
      assert.equal(firstDifference(trace(wayBack), trace(bare)), null, 'and with the art loaded and held back');

      // the fourth box is the one that changes: the picture is the art's where the art is on screen, and never leaves its canvas
      let differs = 0;
      for (let i = 0; i < withArt.length; i++) {
        const a = withArt[i]!.state;
        const b = bare[i]!.state;
        if (!same(a.boxes!.visual, b.boxes!.visual)) differs++;
        const canvas = { x0: a.x + (a.sprite!.facing > 0 ? CANVAS_LOCAL.x0 : -CANVAS_LOCAL.x1), x1: a.x + (a.sprite!.facing > 0 ? CANVAS_LOCAL.x1 : -CANVAS_LOCAL.x0), y0: a.y, y1: a.y + CANVAS_LOCAL.y1 };
        assert.ok(inside(a.boxes!.visual, canvas, 1e-3), `tick ${withArt[i]!.tick} (${a.anim}): the art's picture ${JSON.stringify(a.boxes!.visual)} is inside its canvas ${JSON.stringify(canvas)}`);
      }
      assert.ok(differs > withArt.length * 0.8, `the picture is the art's, not the placeholder's (${differs} of ${withArt.length} samples differ)`);
      for (const { state: x, tick } of withArt) assert.ok(!same(x.boxes!.visual, x.boxes!.hurtbox) && !same(x.boxes!.visual, x.boxes!.body), `tick ${tick} (${x.anim}): the picture is neither the hurtbox nor the body`);

      // ===================================================================================================== C · every state, drawn by the art
      const seen = new Set<string>();
      const clipsUsed = new Set<string>();
      for (const { state: x, tick } of withArt) {
        seen.add(x.anim);
        const clip = CLIP_OF[x.anim];
        assert.ok(clip, `tick ${tick}: a state of the hero the test does not know: "${x.anim}"`);
        assert.equal(x.visual!.shows, 'art', `tick ${tick}: "${x.anim}" is drawn by the art, never by the placeholder`);
        assert.equal(x.sprite!.set, 'player/hero');
        assert.ok((x.sprite!.frame ?? '').startsWith(`${clip}_`), `tick ${tick}: "${x.anim}" is drawn with the clip "${clip}" (the frame on screen is ${x.sprite!.frame})`);
        clipsUsed.add(clip!);
      }
      for (const state of IN_R1) assert.ok(seen.has(state), `the play of R1 showed "${state}" (it showed ${[...seen].sort().join(', ')})`);
      assert.deepEqual([...clipsUsed].sort(), Object.keys(CLIPS).filter((c) => c !== 'interact').sort(), 'and used every clip of the art but the interaction');
      for (const attack of Object.values(ATTACK_OF)) assert.ok(withArt.some((x) => x.state.combat!.attack === PLAYER_ATTACKS[attack]!.id && x.state.boxes!.hitbox), `the hitbox of ${attack} was out`);
      // the sword is in the hand in every frame of every blow the art drew (the contract of the delivery, at run time)
      const blows = withArt.filter((x) => ATTACK_OF[x.anim]);
      assert.ok(blows.length > 25, `${blows.length} blow samples`);
      for (const { state: x, tick } of blows) {
        const grip = Math.hypot(x.sprite!.hand.x - x.sprite!.grip.x, x.sprite!.hand.y - x.sprite!.grip.y);
        assert.ok(grip < 0.05, `tick ${tick} (${x.anim}, ${x.sprite!.frame}): the sword is in the hand (${grip.toFixed(3)} m apart)`);
      }
      // the crawl: through R1's passage the hero is the art's crouch, the same height as the body that goes under the wall
      const crawl = withArt.filter((x) => x.anim === 'crouchWalk');
      assert.ok(crawl.length >= 8, `the crawl was drawn (${crawl.length} samples)`);
      for (const { state: x } of crawl) {
        assert.equal(x.crouched, true);
        assert.equal(x.bodyHeight, PLAYER.movement.crouch.height);
        assert.match(x.sprite!.frame ?? '', /^crouch_0[0-2]$/);
      }
      assert.ok(worstDraws > 0 && worstDraws <= 60, `the draw calls stay under the budget with the art on the hero (${worstDraws} at worst)`);
      await ctx.shot('c-01-the-play-ends');

      // ===================================================================================================== D · the interaction, and the way back mid-pose
      await open(ctx, complete, 'room=interaction_test&unlock=dash');
      await waitFor(ctx, 'the art on the hero', (x) => x.visual?.art === 'player/hero');
      await ctx.teleport(4, 0);
      await ctx.step(30);
      await ctx.page.keyboard.down('KeyD');
      for (let i = 0; i < 90; i++) {
        await ctx.step(1);
        if ((await ctx.state()).x >= 10.3) break;
      }
      await ctx.page.keyboard.up('KeyD');
      await ctx.step(25);
      await ctx.page.keyboard.down('KeyE');
      await ctx.step(1);
      await ctx.page.keyboard.up('KeyE');
      let interacting = 0;
      let before: GameState | null = null;
      for (let i = 0; i < 20; i++) {
        s = await ctx.state();
        if (s.anim === 'interact') {
          interacting++;
          assert.deepEqual({ shows: s.visual!.shows, set: s.sprite!.set }, { shows: 'art', set: 'player/hero' }, 'the interaction: the art');
          assert.match(s.sprite!.frame ?? '', /^interact_0[0-2]$/, 'with its own clip');
          before ??= s;
        }
        if (interacting === 2) break;
        await ctx.step(1);
      }
      assert.ok(interacting >= 2 && before, `the hero interacted (${interacting} samples)`);
      // the way back, in the middle of the pose: the capsule at once, the same body, the same hurtbox, the same place
      await ctx.page.evaluate("window.__troid.setVisualMode('placeholder')");
      s = await ctx.state();
      assert.equal(s.anim, 'interact');
      assert.deepEqual({ shows: s.visual!.shows, set: s.sprite!.set }, { shows: 'placeholder', set: placeholderSet }, 'the way back: the placeholder in the middle of the pose');
      assert.ok(same(s.boxes!.body, before.boxes!.body) && same(s.boxes!.hurtbox, before.boxes!.hurtbox), 'and the body and the hurtbox did not move');
      assert.ok(!same(s.boxes!.visual, before.boxes!.visual), 'only the picture did');
      await ctx.page.evaluate("window.__troid.setVisualMode('auto')");
      s = await ctx.state();
      assert.equal(s.visual!.shows, 'art', 'and the way forth, as quick');
      assert.equal(ctx.errors.length, 0);
    } finally {
      complete.cleanup();
    }
  },
};
