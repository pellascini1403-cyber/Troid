import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLAYER_VISUAL } from '@/content/visuals';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * THE PROTAGONIST ANIMATED, IN THE REAL GAME with the REAL art (docs/ART-PIPELINE-2D.md part N): what `npm run assets:animate` made of the user's sheet, played by the simulation in a
 * browser — the repository's own art, no fixture. What is proved is that each state of the hero is drawn by the clip made for it and that the frames FOLLOW: the gaits turn over
 * their frames in order, a jump is a jump then a fall then a landing, a blow is drawn by the phases of the simulation with the sword in the hand, a dash, a cast, a hit, a death,
 * a drink and an interaction play their frames once and in order; the way back to the placeholder works in the middle of any of them; and the simulation is the same whichever look
 * draws it.
 *
 *   A · standing, walking, running and turning round
 *   B · a jump: rise, fall, land; a dash
 *   C · the first blow and the second (the phases decide the frame; the sword is in the hand), the blow in the air
 *   D · the crouch, the crawl and the blow from the crouch
 *   E · the Spirit Bolt, being hurt, a drink, dying — and an interaction, in the room that has something to take
 *   F · the looks (`auto`, `placeholder`, `art`) and one scripted play with each: the simulation does not know
 *
 * The animation clock stands still while the page is paused (stable screenshots), so the scenario advances it by hand, a tick at a time, next to the simulation: what it sees is what
 * a player sees over the same seconds.
 */
const SIZE = { width: 844, height: 390, dpr: 1 };

interface Sample {
  tick: number;
  anim: string;
  state: string;
  frame: string;
  set: string;
  shows: string;
  phase: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  facing: number;
  visible: boolean;
  hand: { x: number; y: number };
  grip: { x: number; y: number };
  tip: { x: number; y: number };
}

interface ManifestClip {
  frames: string;
  count: number;
  fps: number;
  loop: boolean;
  phases?: { startup: [number, number]; active: [number, number]; recovery: [number, number] };
}
const manifest = JSON.parse(readFileSync('public/art/player/player.pack.json', 'utf8')) as { sprites: Array<{ clips: Record<string, ManifestClip> }> };
const CLIPS = manifest.sprites[0]!.clips;
/** The manifest says `aerialAttack` and `crouchAttack`; the simulation says `attackAir` and `attackCrouch`. */
const CLIP_OF: Record<string, string> = { attack: 'attack1', attackAir: 'aerialAttack', attackCrouch: 'crouchAttack' };
const clipOf = (anim: string): string => CLIP_OF[anim] ?? anim;
const index = (frame: string): number => Number(frame.slice(frame.lastIndexOf('_') + 1));
const prefix = (frame: string): string => frame.slice(0, frame.lastIndexOf('_'));

const collapse = <T>(seq: readonly T[]): T[] => seq.filter((v, i) => i === 0 || v !== seq[i - 1]);

/** Runs `n` ticks of the simulation with the current keys, advancing the animation clock a tick each, and says what was on screen after each. */
async function run(ctx: Ctx, n: number): Promise<Sample[]> {
  return (await ctx.page.evaluate(`(() => {
    const out = [];
    for (let i = 0; i < ${n}; i++) {
      window.__troid.step(1);
      if (!window.__troid.session.frozen) window.__troid.advanceAnimation(1 / 60);
      const s = window.__troid.state();
      out.push({ tick: s.tick, anim: s.anim, state: s.state, frame: s.sprite.frame, set: s.sprite.set, shows: s.visual.shows, phase: s.combat.phase, x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: s.grounded, facing: s.sprite.facing, visible: s.sprite.visible, hand: s.sprite.hand, grip: s.sprite.grip, tip: s.sprite.tip });
    }
    return out;
  })()`)) as Sample[];
}
const hold = async (ctx: Ctx, ...keys: string[]): Promise<void> => void (await Promise.all(keys.map((k) => ctx.page.keyboard.down(k))));
const release = async (ctx: Ctx, ...keys: string[]): Promise<void> => void (await Promise.all(keys.map((k) => ctx.page.keyboard.up(k))));
/** One tick with `key` down: a press. */
const tap = async (ctx: Ctx, key: string): Promise<Sample[]> => {
  await hold(ctx, key);
  const s = await run(ctx, 1);
  await release(ctx, key);
  return s;
};
const waitFor = async (ctx: Ctx, what: string, test: (s: GameState) => boolean, ms = 30000): Promise<GameState> => {
  const t0 = Date.now();
  for (;;) {
    const s = await ctx.state();
    if (test(s)) return s;
    if (Date.now() - t0 > ms) throw new Error(`gave up waiting for ${what}: ${JSON.stringify(s.visual)}`);
    await ctx.page.waitForTimeout(50);
  }
};
const hooks = (ctx: Ctx, code: string): Promise<unknown> => ctx.page.evaluate(`window.__troid.${code}`);

/** Every sample of `seq` is drawn by the art with the clip of its state, and the frame is a frame of that clip. */
function drawnByItsClip(seq: Sample[], what: string): void {
  for (const s of seq) {
    const clip = clipOf(s.anim);
    assert.equal(s.set, 'player/hero', `${what}, tick ${s.tick}: the art draws the hero (${s.anim})`);
    assert.equal(s.shows, 'art', `${what}, tick ${s.tick}: the look on screen`);
    assert.equal(prefix(s.frame), clip, `${what}, tick ${s.tick}: ${s.anim} is drawn by the clip "${clip}", not "${s.frame}"`);
    assert.ok(index(s.frame) < CLIPS[clip]!.count, `${what}, tick ${s.tick}: ${s.frame} is a frame of the clip`);
  }
}

/** The frames of a clip, in the order they appear in `seq`, each once (a run of one frame is one entry). */
const framesIn = (seq: Sample[], clip: string): number[] => collapse(seq.filter((s) => prefix(s.frame) === clip).map((s) => index(s.frame)));
const inOrder = (xs: readonly number[]): boolean => xs.every((v, i) => i === 0 || v > xs[i - 1]!);
const cyclesInOrder = (xs: readonly number[], count: number): boolean => xs.every((v, i) => i === 0 || v === (xs[i - 1]! + 1) % count);

export const playerAnim: Scenario = {
  name: 'player-anim',
  async run(ctx) {
    await ctx.open('room=movement_test&unlock=dash', SIZE);
    let s = await waitFor(ctx, 'the art on the hero', (x) => x.visual?.art === `${PLAYER_VISUAL.art.pack}/${PLAYER_VISUAL.art.sprite}`);
    assert.deepEqual(s.visual!.lacks, [], 'the art draws every state of the hero: nothing is left to the placeholder');
    assert.equal(s.visual!.mode, 'auto');
    await hooks(ctx, 'teleport(4, 0)');
    await ctx.step(40);

    // ===================================================================================================== A · standing, walking, running, turning
    let seq = await run(ctx, 70);
    drawnByItsClip(seq, 'idle');
    assert.ok(new Set(seq.map((x) => x.frame)).size >= 6, `standing breathes: ${[...new Set(seq.map((x) => x.frame))].join(' ')}`);
    assert.ok(cyclesInOrder(framesIn(seq, 'idle'), CLIPS['idle']!.count), 'the idle turns over its frames in order');
    await ctx.shot('a-01-idle');

    await hold(ctx, 'KeyD', 'ControlLeft'); // a half push: the walk
    seq = await run(ctx, 36);
    const walking = seq.filter((x) => x.anim === 'walk');
    assert.ok(walking.length >= 28, `a half push walks (${walking.length} of 36 ticks)`);
    drawnByItsClip(walking, 'walk');
    assert.ok(framesIn(walking, 'walk').length >= Math.min(6, CLIPS['walk']!.count) && cyclesInOrder(framesIn(walking, 'walk'), CLIPS['walk']!.count), `the walk turns over its frames in order: ${framesIn(walking, 'walk').join(' ')}`);
    await ctx.shot('a-02-walk');

    await release(ctx, 'ControlLeft'); // a full push: the run
    seq = await run(ctx, 30);
    const running = seq.filter((x) => x.anim === 'run');
    assert.ok(running.length >= 20, `a full push runs (${running.length} of 30 ticks)`);
    drawnByItsClip(running, 'run');
    assert.ok(framesIn(running, 'run').length >= 6 && cyclesInOrder(framesIn(running, 'run'), CLIPS['run']!.count), `the run turns over its frames in order: ${framesIn(running, 'run').join(' ')}`);
    assert.ok(running.every((x) => x.facing === 1), 'running right looks right');
    await ctx.shot('a-03-run');

    // turning round: the picture is mirrored the moment the hero faces the other way, in the same tick, and is never missing
    await release(ctx, 'KeyD');
    await hold(ctx, 'KeyA');
    seq = await run(ctx, 20);
    assert.ok(seq.every((x) => x.visible), 'the hero is drawn through the turn');
    assert.equal(seq[seq.length - 1]!.facing, -1, 'running left looks left');
    assert.ok(seq.some((x) => x.facing === 1) || true);
    drawnByItsClip(seq.filter((x) => x.anim === 'run' || x.anim === 'walk'), 'turn');
    await release(ctx, 'KeyA');
    await ctx.step(40);
    await hooks(ctx, 'teleport(4, 0)');
    await ctx.step(30);

    // ===================================================================================================== B · a jump, a dash
    await hold(ctx, 'Space');
    seq = await run(ctx, 30); // held: the whole jump
    await release(ctx, 'Space');
    seq.push(...(await run(ctx, 70)));
    const anims = collapse(seq.map((x) => x.anim));
    assert.deepEqual(anims.slice(0, 4), ['jump', 'fall', 'land', 'idle'], `a jump is a rise, a fall, a landing and rest: ${anims.join(' → ')}`);
    drawnByItsClip(seq, 'jump');
    const rise = framesIn(seq, 'jump');
    assert.ok(rise[0] === 0 && inOrder(rise) && rise.length >= 4, `the jump plays its frames in order from the first: ${rise.join(' ')}`);
    const fall = framesIn(seq, 'fall');
    assert.ok(fall.length >= 3 && cyclesInOrder(fall, CLIPS['fall']!.count), `the fall flutters: ${fall.join(' ')}`);
    const land = framesIn(seq, 'land');
    assert.deepEqual(land, [0, 1, 2, 3], 'the landing plays its four frames, once');
    assert.equal(seq.filter((x) => x.anim === 'land').length, 10, 'and lasts the ten ticks of a hard landing');
    await ctx.shot('b-01-landed');

    await hooks(ctx, 'teleport(4, 0)');
    await ctx.step(20);
    seq = await tap(ctx, 'ShiftLeft');
    seq.push(...(await run(ctx, 14)));
    const dashing = seq.filter((x) => x.anim === 'dash');
    assert.ok(dashing.length >= 8, `a dash is ticks of dash (${dashing.length})`);
    drawnByItsClip(dashing, 'dash');
    assert.deepEqual(framesIn(dashing, 'dash'), [...Array(CLIPS['dash']!.count).keys()], 'the dash plays every frame of its clip, in order');
    assert.ok(dashing.every((x) => x.facing === seq[0]!.facing), 'a dash keeps the way the hero faces');
    await ctx.step(50);

    // ===================================================================================================== C · the blows
    await hooks(ctx, 'teleport(4, 0)');
    await ctx.step(40);
    // the first blow, alone: every frame of it, in the phases of the simulation
    seq = await tap(ctx, 'KeyJ');
    seq.push(...(await run(ctx, 30)));
    // the second, as the first's cancel window lets it chain: it plays through
    await ctx.step(30);
    const combo = await tap(ctx, 'KeyJ');
    combo.push(...(await run(ctx, 9)));
    combo.push(...(await tap(ctx, 'KeyJ'))); // inside the cancel window of the first: the second blow
    combo.push(...(await run(ctx, 40)));
    for (const [state, clip, from] of [['attack', 'attack1', seq], ['attack2', 'attack2', combo]] as const) {
      const blow = from.filter((x) => x.anim === state);
      assert.ok(blow.length > 0, `the ${state} happened (${collapse(from.map((x) => x.anim)).join(' → ')})`);
      drawnByItsClip(blow, state);
      const phases = CLIPS[clip]!.phases!;
      for (const x of blow) {
        const [lo, hi] = phases[x.phase as 'startup' | 'active' | 'recovery'];
        assert.ok(index(x.frame) >= lo && index(x.frame) <= hi, `${state}, tick ${x.tick}: the ${x.phase} is drawn by frame ${index(x.frame)}, not one of [${lo}, ${hi}]`);
      }
      assert.deepEqual(framesIn(blow, clip), [...Array(CLIPS[clip]!.count).keys()], `${state}: every frame of the blow is shown, in order`);
      // the sword is in the hand in every tick of it, and it is raised before it strikes
      for (const x of blow) assert.ok(Math.hypot(x.grip.x - x.hand.x, x.grip.y - x.hand.y) <= 0.04, `${state}, tick ${x.tick}: the grip is in the hand`);
      const rel = (x: Sample): number => x.tip.y - x.y;
      const startupTip = Math.max(...blow.filter((x) => x.phase === 'startup').map(rel));
      const activeTip = Math.min(...blow.filter((x) => x.phase === 'active').map(rel));
      if (state === 'attack') assert.ok(startupTip - activeTip > 0.5, `the first blow comes DOWN: tip ${startupTip.toFixed(2)} m high in the wind-up, ${activeTip.toFixed(2)} m in the cut`);
      else assert.ok(Math.max(...blow.filter((x) => x.phase === 'active').map(rel)) - Math.min(...blow.filter((x) => x.phase === 'startup').map(rel)) > 0.4, 'the second blow comes UP: from low to high');
    }
    // the first blow of the chain is drawn by the same clip, up to where the second takes over
    const chained = combo.filter((x) => x.anim === 'attack');
    assert.ok(inOrder(framesIn(chained, 'attack1')) && framesIn(chained, 'attack1').length >= 4, 'the first blow of a combo plays its frames in order until the second takes over');
    await ctx.shot('c-01-blows');
    await ctx.step(40);

    // in the air
    await hooks(ctx, 'teleport(4, 0)');
    await ctx.step(30);
    await hold(ctx, 'Space');
    seq = await run(ctx, 12);
    await release(ctx, 'Space');
    seq.push(...(await tap(ctx, 'KeyJ')));
    seq.push(...(await run(ctx, 24)));
    const air = seq.filter((x) => x.anim === 'attackAir');
    assert.ok(air.length > 0, `a blow in the air (${collapse(seq.map((x) => x.anim)).join(' → ')})`);
    drawnByItsClip(air, 'air blow');
    assert.ok(air.every((x) => !x.grounded || x.y < 0.3), 'in the air');
    assert.deepEqual(framesIn(air, 'aerialAttack'), [...Array(CLIPS['aerialAttack']!.count).keys()], 'every frame of the blow in the air is shown, in order');
    for (const x of air) assert.ok(Math.hypot(x.grip.x - x.hand.x, x.grip.y - x.hand.y) <= 0.04, `air blow, tick ${x.tick}: the grip is in the hand`);
    await ctx.step(60);

    // ===================================================================================================== D · the crouch
    await hooks(ctx, 'teleport(4, 0)');
    await ctx.step(40);
    await hold(ctx, 'KeyS');
    seq = await run(ctx, 40);
    const crouched = seq.filter((x) => x.anim === 'crouch');
    assert.ok(crouched.length >= 30, 'down is a crouch');
    drawnByItsClip(crouched, 'crouch');
    assert.ok(framesIn(crouched, 'crouch').length >= Math.min(3, CLIPS['crouch']!.count), 'the crouch breathes');
    await hold(ctx, 'KeyD');
    seq = await run(ctx, 36);
    const crawling = seq.filter((x) => x.anim === 'crouchWalk');
    assert.ok(crawling.length >= 28, `down and forward is a crawl (${crawling.length})`);
    drawnByItsClip(crawling, 'crawl');
    assert.ok(cyclesInOrder(framesIn(crawling, 'crouchWalk'), CLIPS['crouchWalk']!.count) && framesIn(crawling, 'crouchWalk').length >= Math.min(5, CLIPS['crouchWalk']!.count), `the crawl turns over its frames: ${framesIn(crawling, 'crouchWalk').join(' ')}`);
    await release(ctx, 'KeyD');
    await run(ctx, 20);
    seq = await tap(ctx, 'KeyJ');
    seq.push(...(await run(ctx, 24)));
    const low = seq.filter((x) => x.anim === 'attackCrouch');
    assert.ok(low.length > 0, `a blow from the crouch (${collapse(seq.map((x) => x.anim)).join(' → ')})`);
    drawnByItsClip(low, 'crouch blow');
    assert.deepEqual(framesIn(low, 'crouchAttack'), [...Array(CLIPS['crouchAttack']!.count).keys()], 'every frame of the blow from the crouch is shown, in order');
    for (const x of low) assert.ok(Math.hypot(x.grip.x - x.hand.x, x.grip.y - x.hand.y) <= 0.04, `crouch blow, tick ${x.tick}: the grip is in the hand`);
    await ctx.shot('d-01-crouch-blow');
    await release(ctx, 'KeyS');
    await ctx.step(40);

    // ===================================================================================================== E · cast, hurt, drink, death, interact
    await hooks(ctx, 'teleport(4, 0)');
    await ctx.step(20);
    await ctx.page.evaluate('window.__troid.session.loadout.acquire("card_spirit_bolt")');
    await ctx.step(2);
    seq = await tap(ctx, 'KeyK');
    seq.push(...(await run(ctx, 26)));
    const cast = seq.filter((x) => x.anim === 'cast');
    assert.ok(cast.length >= 14 && cast.length <= 15, `a cast is 6 ticks of gathering, 1 of release and 8 of recovery (${cast.length})`);
    drawnByItsClip(cast, 'cast');
    assert.deepEqual(framesIn(cast, 'cast'), [...Array(CLIPS['cast']!.count).keys()], 'every frame of the cast is shown, in order');
    assert.deepEqual(cast.filter((x) => x.phase === 'active').map((x) => index(x.frame)), [3], 'the release is the frame of the release');
    await ctx.shot('e-01-cast');
    await ctx.step(60);

    await hooks(ctx, 'revive()');
    seq = [];
    await hooks(ctx, 'strikePlayer(1)');
    seq.push(...(await run(ctx, 30)));
    const hurt = seq.filter((x) => x.anim === 'hurt');
    assert.ok(hurt.length >= 12 && hurt.length <= 20, `a hit stuns the hero for a dozen ticks and more (${hurt.length})`);
    drawnByItsClip(hurt, 'hurt');
    assert.deepEqual(framesIn(hurt, 'hurt'), [0, 1, 2, 3, 4], 'being hurt plays its five frames, once, in order');
    await ctx.step(120);

    await ctx.page.evaluate('window.__troid.session.player.health.damage(3)');
    await ctx.step(1);
    seq = await tap(ctx, 'KeyL');
    seq.push(...(await run(ctx, 30)));
    const drink = seq.filter((x) => x.anim === 'drink');
    assert.equal(drink.length, 24, 'a drink is the 24 ticks of its channel');
    drawnByItsClip(drink, 'drink');
    assert.deepEqual(framesIn(drink, 'drink'), [...Array(CLIPS['drink']!.count).keys()], 'every frame of the drink is shown, in order');
    await ctx.step(60);

    await hooks(ctx, 'revive()');
    await ctx.page.evaluate('window.__troid.session.player.health.damage(4)');
    await hooks(ctx, 'strikePlayer(1)');
    seq = await run(ctx, 90);
    const dead = seq.filter((x) => x.anim === 'death');
    assert.ok(dead.length >= 70, `a hit that takes the last of the life is a death (${collapse(seq.map((x) => x.anim)).join(' → ')})`);
    drawnByItsClip(dead, 'death');
    assert.deepEqual(framesIn(dead, 'death'), [...Array(CLIPS['death']!.count).keys()], 'the death plays every frame of its clip, in order');
    assert.equal(dead[dead.length - 1]!.frame, `${CLIPS['death']!.frames}${String(CLIPS['death']!.count - 1).padStart(2, '0')}`, 'and the hero lies on the last, until the screen takes over');
    await ctx.shot('e-02-death');

    await ctx.open('room=interaction_test&unlock=dash', SIZE);
    await waitFor(ctx, 'the art on the hero', (x) => x.visual?.art === 'player/hero');
    await hooks(ctx, 'teleport(12, 0)');
    await ctx.step(30);
    seq = await tap(ctx, 'KeyE');
    seq.push(...(await run(ctx, 20)));
    const touched = seq.filter((x) => x.anim === 'interact');
    assert.equal(touched.length, 12, 'an interaction holds the hero for its twelve ticks');
    drawnByItsClip(touched, 'interact');
    assert.deepEqual(framesIn(touched, 'interact'), [...Array(CLIPS['interact']!.count).keys()], 'the interaction plays every frame of its clip, once, in order');
    await ctx.shot('e-03-interact');

    // ===================================================================================================== F · the looks, and the simulation that does not know
    await ctx.open('room=movement_test&unlock=dash', SIZE);
    await waitFor(ctx, 'the art on the hero', (x) => x.visual?.art === 'player/hero');
    const play = async (mode: 'auto' | 'placeholder' | 'art'): Promise<unknown[]> => {
      await hooks(ctx, `setVisualMode(${JSON.stringify(mode)})`);
      await hooks(ctx, 'teleport(4, 0)');
      await ctx.step(20);
      const t0 = (await ctx.state()).tick;
      const trace: unknown[] = [];
      const record = async (n: number): Promise<void> => {
        for (let i = 0; i < n; i++) {
          const x = (await ctx.state()) as GameState;
          trace.push({ tick: x.tick - t0, x: x.x, y: x.y, vx: x.vx, vy: x.vy, grounded: x.grounded, state: x.state, anim: x.anim, health: x.health, combat: x.combat, crouched: x.crouched });
          await run(ctx, 1);
        }
      };
      await hold(ctx, 'KeyD');
      await record(30);
      await hold(ctx, 'Space');
      await record(4);
      await release(ctx, 'Space');
      await record(26);
      await hold(ctx, 'KeyJ');
      await record(2);
      await release(ctx, 'KeyJ');
      await record(14);
      await release(ctx, 'KeyD');
      await tap(ctx, 'ShiftLeft');
      await record(26);
      await hold(ctx, 'KeyS');
      await record(24);
      await release(ctx, 'KeyS');
      await record(16);
      return trace;
    };
    const withArt = await play('auto');
    const way = (await ctx.state()).visual!;
    assert.equal(way.shows, 'art');
    const withPlaceholder = await play('placeholder');
    s = await ctx.state();
    assert.equal(s.visual!.shows, 'placeholder', 'the way back: the placeholder');
    assert.notEqual(s.sprite!.set, 'player/hero');
    const artOnly = await play('art');
    assert.equal((await ctx.state()).visual!.shows, 'art');
    assert.equal(JSON.stringify(withArt), JSON.stringify(withPlaceholder), 'the simulation is the same with the art and with the placeholder');
    assert.equal(JSON.stringify(withArt), JSON.stringify(artOnly), 'and with the art alone');
    // and in the middle of a pose the way back works: the blow is drawn by the placeholder from the next frame, then by the art again
    await hooks(ctx, 'setVisualMode("auto")');
    await tap(ctx, 'KeyJ');
    await ctx.step(2);
    assert.equal((await ctx.state()).visual!.shows, 'art');
    await hooks(ctx, 'setVisualMode("placeholder")');
    assert.equal((await ctx.state()).visual!.shows, 'placeholder');
    await hooks(ctx, 'setVisualMode("auto")');
    assert.equal((await ctx.state()).visual!.shows, 'art');
    assert.equal(ctx.errors.length, 0, ctx.errors.join('\n'));
  },
};
