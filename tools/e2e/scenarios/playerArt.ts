import assert from 'node:assert/strict';
import type { BrowserContext } from 'playwright-core';
import { chooseSource } from '@/presentation/visualSource';
import type { AnimState } from '@/presentation/vocabulary';
import { createArtFixture, type Fixture, type FixturePack } from '../artFixture';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * THE PROTAGONIST'S VISUAL in a real browser (docs/ART-PIPELINE-2D.md, part D), with SYNTHETIC art (noise on a transparent canvas: no character, no scene —
 * the real art is not in the repository). What is proved is the MACHINERY: the placeholder is what the game shows until the art is there; when the art is
 * there it draws every state it has and the placeholder draws the rest; the sword follows the hand in the frames the art provides; the way back works at any
 * moment; a broken or missing art leaves the placeholder without a sound; and — the whole point — the simulation does not know any of it.
 *
 *   A · no art: the placeholder, and the clips the art still has to provide are all of them
 *   B · with art: idle, walk and the blow are the art; jump, death and the cast are the placeholder; every tick obeys the policy; the blow follows the phases of the
 *       simulation and the sword is in the hand; the way back and forth
 *   C · art that is broken, or has no pack for the hero: the placeholder, no console error, the game plays on
 *   D · the same scripted play with no art, with art, with the way back and with art-only gives the SAME simulation, tick by tick
 */
const PACKS: FixturePack[] = [
  {
    id: 'player',
    category: 'player',
    load: 'boot',
    sprites: [{ id: 'hero', canvas: [64, 96], clips: { idle: 4, walk: 4, attack1: 4 }, clipExtra: { attack1: { phases: { startup: [0, 1], active: [2, 2], recovery: [3, 3] } } }, sword: ['attack1'] }],
  },
];
const ROOM = 'room=movement_test&unlock=dash';
const SIZE = { width: 844, height: 390, dpr: 1 };
const REQUIRED = ['idle', 'walk', 'jump', 'fall', 'dash', 'attack1', 'attack2', 'attackAir', 'crouch', 'attackCrouch', 'hurt', 'death', 'cast', 'drink', 'interact'];
const PROVIDED = ['attack1', 'idle', 'walk'];

const open = (ctx: Ctx, fixture: Fixture | null, query = ''): Promise<void> =>
  ctx.open(`${ROOM}${query ? `&${query}` : ''}${fixture ? '&art=art-test' : ''}`, { ...SIZE, prepare: async (context: BrowserContext) => (fixture ? fixture.serve(context, 'art-test') : undefined) });
const waitFor = async (ctx: Ctx, what: string, test: (s: GameState) => boolean, ms = 20000): Promise<GameState> => {
  const t0 = Date.now();
  for (;;) {
    const s = await ctx.state();
    if (test(s)) return s;
    if (Date.now() - t0 > ms) throw new Error(`gave up waiting for ${what}: ${JSON.stringify(s.visual)}`);
    await ctx.page.waitForTimeout(50);
  }
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const sess = (ctx: Ctx, code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);

/**
 * The part of the state that is SIMULATION: what must be identical whatever the hero looks like. (The camera and its trauma follow real time, frame by frame,
 * and the tick counter starts wherever the page was paused: neither is a rule of the game, so the tick is counted from the start of the script.)
 */
const sim = (s: GameState, t0: number): unknown => ({
  tick: s.tick - t0, x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: s.grounded, state: s.state, anim: s.anim, health: s.health, magic: s.magic,
  crouched: s.crouched, bodyHeight: s.bodyHeight, combat: s.combat, hitStop: s.hitStop, invulnerable: s.invulnerable,
  dummies: s.dummies?.map((d) => ({ x: d.x, hp: d.hp, hits: d.hits })),
});

/** Where two traces first part ways, said in words (a deepEqual of two hundred samples says everything and tells nothing). */
function firstDifference(a: unknown[], b: unknown[]): string | null {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = JSON.stringify(a[i]);
    const y = JSON.stringify(b[i]);
    if (x !== y) return `sample ${i} of ${n}:\n   now:       ${x}\n   reference: ${y}\n   (previous reference: ${JSON.stringify(b[i - 1])})`;
  }
  return null;
}

export const playerArt: Scenario = {
  name: 'player-art',
  async run(ctx) {
    const fixture = createArtFixture(PACKS);
    try {
      // ===================================================================================================== A · no art
      await open(ctx, null);
      let s = await ctx.state();
      assert.deepEqual(s.visual, { mode: 'auto', shows: 'placeholder', art: null, provides: [], lacks: REQUIRED }, 'no art: the placeholder, and every clip is still to be drawn');
      const placeholderSet = s.sprite!.set;
      assert.ok(placeholderSet.length > 0);
      await ctx.step(5);
      assert.equal((await ctx.state()).visual!.shows, 'placeholder');
      assert.equal(fixture.requests.length, 0, 'and nothing was asked for');

      // ===================================================================================================== B · with art
      await open(ctx, fixture);
      s = await waitFor(ctx, 'the art on the hero', (x) => x.visual?.art === 'player/hero');
      assert.deepEqual([...s.visual!.provides].sort(), PROVIDED);
      assert.deepEqual(s.visual!.lacks, REQUIRED.filter((c) => !PROVIDED.includes(c)), 'what is still to be drawn: the other twelve');
      await ctx.step(5);
      s = await ctx.state();
      assert.equal(s.anim, 'idle');
      assert.deepEqual({ shows: s.visual!.shows, set: s.sprite!.set }, { shows: 'art', set: 'player/hero' }, 'standing: the real art');
      assert.match(s.sprite!.frame ?? '', /^idle_0[0-3]$/);
      await ctx.shot('b-01-art-idle');

      // every tick of a scripted play obeys the policy: the art where it can stand for the state, the placeholder where not
      const policy = (state: GameState): void => {
        const expected = chooseSource('auto', { clips: Object.fromEntries(PROVIDED.map((c) => [c, { frames: `${c}_`, count: 4 }])) }, state.anim as AnimState);
        assert.equal(state.visual!.shows, expected, `tick ${state.tick}: ${state.anim} is drawn by the ${expected}, not by the ${state.visual!.shows}`);
        assert.equal(state.sprite!.set === 'player/hero', expected === 'art', `tick ${state.tick}: the set on screen is the look chosen`);
      };
      const seen = new Map<string, Set<string>>(); // look → the states it drew
      const note = (state: GameState): void => {
        policy(state);
        seen.set(state.visual!.shows, (seen.get(state.visual!.shows) ?? new Set()).add(state.anim));
      };
      await ctx.page.keyboard.down('KeyD');
      for (let i = 0; i < 12; i++) {
        await ctx.step(4);
        note(await ctx.state());
      }
      s = await ctx.state();
      assert.ok(['walk', 'run'].includes(s.anim), `moving: ${s.anim}`);
      assert.match(s.sprite!.frame ?? '', /^walk_0[0-3]$/, 'the gaits are the art\'s walk');
      await ctx.page.keyboard.up('KeyD');
      await ctx.step(30);
      // a jump: the art has no jump, the placeholder draws it — and the landing is the art's idle again
      await ctx.page.keyboard.down('Space');
      await ctx.step(2);
      await ctx.page.keyboard.up('Space');
      let jumped = false;
      for (let i = 0; i < 60; i++) {
        await ctx.step(2);
        const x = await ctx.state();
        note(x);
        if (x.anim === 'jump' || x.anim === 'fall') {
          jumped = true;
          assert.deepEqual({ shows: x.visual!.shows, set: x.sprite!.set }, { shows: 'placeholder', set: placeholderSet }, 'in the air: the placeholder (the art has no jump)');
        }
        if (x.grounded && i > 10) break;
      }
      assert.ok(jumped, 'the hero jumped');
      await ctx.step(20);
      assert.equal((await ctx.state()).visual!.shows, 'art', 'back on the ground: the art');

      // the blow: the art's `attack1`, frame by frame as the simulation's phases say, with the sword in the hand
      const dummy = await ctx.page.evaluate('window.__troid.spawnDummy(window.__troid.session.player.body.x + 1.3, 0, 9)');
      assert.ok(dummy);
      await ctx.step(2);
      await ctx.page.keyboard.down('KeyJ');
      await ctx.step(1);
      await ctx.page.keyboard.up('KeyJ');
      const frames: Array<{ phase: string; frame: string; grip: number; tipAhead: number }> = [];
      let attacking = false;
      for (let i = 0; i < 40; i++) {
        const x = await ctx.state();
        note(x);
        if (x.anim === 'attack') {
          attacking = true;
          assert.equal(x.visual!.shows, 'art', 'the blow is drawn by the art (attack1 stands for the first swing)');
          const hand = x.sprite!.hand;
          const grip = x.sprite!.grip;
          const tip = x.sprite!.tip;
          frames.push({ phase: x.combat!.phase, frame: x.sprite!.frame ?? '', grip: dist(hand, grip), tipAhead: (tip.x - grip.x) * x.sprite!.facing });
        }
        await ctx.step(1);
      }
      assert.ok(attacking && frames.length >= 6, `the blow was seen (${frames.length} ticks)`);
      for (const f of frames) {
        assert.match(f.frame, /^attack1_0[0-3]$/, 'the art\'s blow clip');
        assert.ok(f.grip < 0.05, `the sword is in the hand (${f.grip.toFixed(3)} m apart in ${f.frame})`);
        assert.ok(Math.abs(f.tipAhead - 0.9) < 0.06, `the tip is 0.9 m ahead of the grip, in front (${f.tipAhead.toFixed(3)} in ${f.frame})`);
        const want = { startup: /^attack1_0[01]$/, active: /^attack1_02$/, recovery: /^attack1_03$/ }[f.phase as 'startup' | 'active' | 'recovery'];
        if (want) assert.match(f.frame, want, `${f.phase}: the visible blow is the one of the phase the simulation is in`);
      }
      assert.ok(frames.some((f) => f.phase === 'active'), 'the active phase was drawn');
      const hit = (await ctx.state()).dummies![0]!;
      assert.ok(hit.hits >= 1, 'the blow connected: the hitbox is the simulation\'s, not the picture\'s');
      await ctx.shot('b-02-art-blow');

      // death and the cast: the art has neither, the placeholder draws them; afterwards, the art again
      await ctx.step(60);
      await sess(ctx, 's.loadout.acquire("card_spirit_bolt");');
      await ctx.step(2);
      await ctx.page.keyboard.down('KeyK');
      await ctx.step(1);
      await ctx.page.keyboard.up('KeyK');
      s = await ctx.state();
      assert.equal(s.anim, 'cast');
      assert.deepEqual({ shows: s.visual!.shows, set: s.sprite!.set }, { shows: 'placeholder', set: placeholderSet }, 'the cast: the placeholder (the art has no cast)');
      await ctx.step(60);
      assert.equal((await ctx.state()).visual!.shows, 'art', 'and the art again once it is over');
      await sess(ctx, 's.player.health.damage(s.player.health.current - 1);');
      await ctx.page.evaluate('window.__troid.strikePlayer(1)');
      let died = false;
      for (let i = 0; i < 80; i++) {
        await ctx.step(2);
        const x = await ctx.state();
        if (x.anim === 'death') {
          died = true;
          assert.deepEqual({ shows: x.visual!.shows, set: x.sprite!.set }, { shows: 'placeholder', set: placeholderSet }, 'death: the placeholder (the art has no death)');
          break;
        }
      }
      assert.ok(died, 'the hero fell');
      for (let i = 0; i < 400 && (await ctx.state()).death?.phase !== 'none'; i++) await ctx.step(2);
      await ctx.step(10);
      s = await ctx.state();
      assert.equal(s.visual!.shows, 'art', 'risen again: the art');
      const drawn = (look: string): string[] => [...(seen.get(look) ?? [])].sort();
      assert.ok(['walk', 'run'].some((a) => drawn('art').includes(a)) && ['jump', 'fall'].some((a) => drawn('placeholder').includes(a)), `both looks were on screen in this play (art: ${drawn('art')}; placeholder: ${drawn('placeholder')})`);

      // the way back, at any moment — and forth
      await ctx.page.evaluate("window.__troid.setVisualMode('placeholder')");
      s = await ctx.state();
      assert.deepEqual({ mode: s.visual!.mode, shows: s.visual!.shows, set: s.sprite!.set }, { mode: 'placeholder', shows: 'placeholder', set: placeholderSet }, 'the way back: the placeholder at once');
      assert.equal(s.visual!.art, 'player/hero', 'the art stays loaded: the way forth is instant');
      await ctx.page.evaluate("window.__troid.setVisualMode('auto')");
      assert.equal((await ctx.state()).visual!.shows, 'art');
      await ctx.page.evaluate("window.__troid.setVisualMode('art')");
      await ctx.page.keyboard.down('Space');
      await ctx.step(3);
      await ctx.page.keyboard.up('Space');
      s = await ctx.state();
      assert.equal(s.visual!.shows, 'art', 'art mode: the art even in the air, drawing its own idle for the jump it lacks');
      assert.match(s.sprite!.frame ?? '', /^idle_0[0-3]$/);
      assert.equal(ctx.errors.length, 0);

      // ===================================================================================================== C · art that is broken or missing
      const broken = createArtFixture(PACKS);
      try {
        broken.faults.set('player/hero_0.png', 'corrupt');
        await open(ctx, broken);
        await ctx.page.waitForFunction('window.__troid.state().art && window.__troid.state().art.failures >= 1', undefined, { timeout: 20000 });
        await ctx.step(40);
        s = await ctx.state();
        assert.deepEqual({ shows: s.visual!.shows, art: s.visual!.art, set: s.sprite!.set }, { shows: 'placeholder', art: null, set: placeholderSet }, 'a broken image: the placeholder');
        assert.ok(ctx.warnings.some((w) => w.includes('[art]') && /player/.test(w)), 'in development the library says why');
        assert.ok(s.sprite!.visible, 'and the hero is drawn');
      } finally {
        broken.cleanup();
      }
      const other = createArtFixture([{ id: 'enemies', category: 'enemies', load: 'boot', sprites: [{ id: 'blob', canvas: [32, 32], clips: { idle: 2 } }] }]);
      try {
        await open(ctx, other);
        await ctx.page.waitForFunction('window.__troid.state().art && window.__troid.state().art.state === "ready"', undefined, { timeout: 20000 });
        await ctx.page.waitForFunction('window.__troid.state().art.packList.some((p) => p.id === "enemies" && p.held && p.sets.length === 1)', undefined, { timeout: 20000 });
        await ctx.step(20);
        s = await ctx.state();
        assert.deepEqual({ shows: s.visual!.shows, art: s.visual!.art }, { shows: 'placeholder', art: null }, 'art for others, none for the hero: the placeholder');
        assert.ok(ctx.warnings.some((w) => /pack "player" is not in the art index/.test(w)), 'in development, said once');
      } finally {
        other.cleanup();
      }
    } finally {
      fixture.cleanup();
    }

    // ======================================================================================================= D · the simulation does not know
    const traced = createArtFixture(PACKS);
    try {
      const play = async (label: string, withArt: boolean, mode: string): Promise<unknown[]> => {
        await open(ctx, withArt ? traced : null, `visual=${mode}`);
        if (withArt) await waitFor(ctx, 'the art on the hero', (x) => x.visual?.art === 'player/hero');
        await ctx.page.evaluate('window.__troid.spawnDummy(window.__troid.session.player.body.x + 3.2, 0, 9)');
        const trace: unknown[] = [];
        const t0 = (await ctx.state()).tick;
        const mark = async (): Promise<void> => void trace.push(sim(await ctx.state(), t0));
        await ctx.step(10);
        await mark();
        await ctx.page.keyboard.down('KeyD');
        for (let i = 0; i < 8; i++) {
          await ctx.step(5);
          await mark();
        }
        await ctx.page.keyboard.down('Space');
        for (let i = 0; i < 6; i++) {
          await ctx.step(4);
          await mark();
        }
        await ctx.page.keyboard.up('Space');
        await ctx.page.keyboard.down('KeyJ');
        await ctx.step(1);
        await ctx.page.keyboard.up('KeyJ');
        for (let i = 0; i < 12; i++) {
          await ctx.step(3);
          await mark();
        }
        await ctx.page.keyboard.down('ShiftLeft');
        await ctx.step(2);
        await ctx.page.keyboard.up('ShiftLeft');
        for (let i = 0; i < 6; i++) {
          await ctx.step(3);
          await mark();
        }
        await ctx.page.keyboard.up('KeyD');
        await ctx.step(20);
        await mark();
        assert.equal(ctx.errors.length, 0, label);
        return trace;
      };
      const reference = await play('no art', false, 'auto');
      assert.ok(reference.length > 30);
      assert.equal(firstDifference(await play('art, auto', true, 'auto'), reference), null, 'with the art on the hero the simulation is the same, tick by tick');
      assert.equal(firstDifference(await play('art, the way back', true, 'placeholder'), reference), null, 'and with the way back');
      assert.equal(firstDifference(await play('art only', true, 'art'), reference), null, 'and with the art only');
    } finally {
      traced.cleanup();
    }
  },
};
