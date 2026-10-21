import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLAYER_VISUAL } from '@/content/visuals';
import { deriveAnimation } from '@/player/playerAnimation';
import { SpriteAnimator, clipLength, frameForPhase, resolveClip } from '@/presentation/animation';
import { parseArtPack, toSpriteSetDefinition } from '@/presentation/artManifest';
import { clipFrameNames, type SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';
import { chooseSource, providesState, standInFor } from '@/presentation/visualSource';
import { ANIM_STATES, type AnimPhase, type AnimState } from '@/presentation/vocabulary';

/**
 * THE PROTAGONIST'S CLIPS AS THE ENGINE PLAYS THEM (docs/ART-PIPELINE-2D.md part N; docs/PROMPT16-LOG.md): the real manifest, read by the real parser, played by the real animator at 60 ticks a second.
 * Nothing here draws: it is the CHOICE of frame — which clip a state plays, which frame a moment shows, which frame a phase of a blow shows — over the committed art, so that what the
 * game puts on the screen follows the simulation (the phases of a blow) and the clock (the gaits) the way the clips were made for. The character sheet has no drawing for five of the fifteen states the game asks of
 * the protagonist (`NOT_IN_THE_SHEET`): those are not declared, and the test says what draws each — the placeholder, or (the second blow) the first blow's clip, which the engine declares as its stand-in.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const raw = JSON.parse(readFileSync(join(root, 'public', 'art', 'player', 'player.pack.json'), 'utf8')) as unknown;
const parsed = parseArtPack(raw);
const pack = parsed.value!;
const hero = pack.sprites.find((s) => s.id === PLAYER_VISUAL.art.sprite)!;
const def: SpriteSetDefinition = toSpriteSetDefinition(pack.id, hero, { resolution: 1 });
const TICK = 1 / 60;
/** The states of the game the character sheet has no drawing for (the engine's names): not in the manifest. */
const NOT_IN_THE_SHEET = ['attack2', 'attackAir', 'crouch', 'attackCrouch', 'drink'] as const;
const IN_THE_SHEET = PLAYER_VISUAL.required.filter((state) => !(NOT_IN_THE_SHEET as readonly string[]).includes(state));

/** The frame indices an animator shows, tick by tick, while `state` is asked for with `options` for `ticks` ticks. */
function play(state: AnimState, ticks: number, options: { speed?: number; phase?: (tick: number) => { phase: AnimPhase; phaseT: number } } = {}): number[] {
  const a = new SpriteAnimator(def, true);
  const seen: number[] = [];
  for (let t = 0; t < ticks; t++) {
    a.play(state, { speed: options.speed ?? 1, ...(options.phase ? options.phase(t) : {}) });
    a.update(TICK);
    seen.push(a.frameIndex);
  }
  return seen;
}

describe('the protagonist\'s clips, as the engine plays them', () => {
  it('the manifest the game fetches parses without a word of complaint, and every frame of every clip is in the atlas', () => {
    expect(parsed.issues.filter((i) => i.level !== 'info')).toEqual([]);
    const atlas = JSON.parse(readFileSync(join(root, 'public', 'art', 'player', 'hero_0.json'), 'utf8')) as { frames: Record<string, unknown> };
    for (const [state, clip] of Object.entries(def.clips)) for (const name of clipFrameNames(clip!)) expect(atlas.frames[name], `${state}: ${name}`).toBeDefined();
    expect(Object.keys(atlas.frames)).toHaveLength(Object.values(def.clips).reduce((n, c) => n + c!.count, 0));
  });

  it('every state the sheet has a drawing for is drawn by a clip of its own — never by a fallback — and the art provides it, so `auto` shows the art', () => {
    for (const state of [...IN_THE_SHEET, 'land', 'run'] as AnimState[]) {
      const r = resolveClip(def, state);
      expect(r?.state, `${state} resolves to its own clip`).toBe(state);
      expect(providesState(def, state), state).toBe(true);
      expect(chooseSource('auto', def, state), state).toBe('art');
    }
    // `attack` is the first blow's name in the simulation: the clip is `attack1`
    expect(resolveClip(def, 'attack')?.state).toBe('attack1');
    expect(chooseSource('auto', def, 'attack')).toBe('art');
  });

  it('the states the sheet has no drawing for are NOT faked: the second blow repeats the first (the engine\'s declared stand-in, the same drawing and nothing moved or bent); the air blow, the crouch blow, the crouch, the crawl and the drink are drawn by the placeholder', () => {
    for (const state of NOT_IN_THE_SHEET) expect(def.clips[state], `${state} has no clip of its own`).toBeUndefined();
    expect(def.clips['crouchWalk']).toBeUndefined();
    expect(standInFor(def, 'attack2')).toBe('attack1');
    expect(chooseSource('auto', def, 'attack2')).toBe('art');
    for (const state of ['attackAir', 'attackCrouch', 'crouch', 'crouchWalk', 'drink'] as AnimState[]) {
      expect(providesState(def, state), `${state}: nothing of the art can stand for it`).toBe(false);
      expect(chooseSource('auto', def, state), `${state} is drawn by the placeholder`).toBe('placeholder');
    }
    // `land` and `alert` are held poses of a few ticks: the engine lets the art's own pose (the landing) or its idle stand for them, never the placeholder
    expect(chooseSource('auto', def, 'alert')).toBe('art');
    // the art on its own (`art` mode, to judge it) chains to the idle for what it lacks, as it always did — it never throws
    for (const state of NOT_IN_THE_SHEET) expect(resolveClip(def, state), state).not.toBeNull();
  });

  it('the gaits turn over the frames in order, forever: a step a hair under a third of a second', () => {
    const walk = play('walk', 60 * 4);
    const run = play('run', 60 * 4);
    for (const [id, seq] of [['walk', walk], ['run', run]] as const) {
      const { count, fps } = { count: def.clips[id]!.count, fps: def.clips[id]!.fps ?? 12 };
      // every frame of the loop is shown, in order, and the loop comes round again
      const order: number[] = [];
      for (const f of seq) if (order[order.length - 1] !== f) order.push(f);
      expect(order.slice(0, count + 1), id).toEqual([...Array(count).keys(), 0]);
      // each frame is held for 60 / fps ticks (3 or 4 at 16 fps, 3 at 20)
      const held = seq.length / order.length;
      expect(Math.abs(held - 60 / fps), `${id}: ticks per frame`).toBeLessThan(0.6);
    }
  });

  it('a gait follows the ground speed: half the speed is half the cadence (so the feet keep up with the floor), and the animator never goes below half or above a half more', () => {
    const slow = play('walk', 120, { speed: 0.5 });
    const normal = play('walk', 120, { speed: 1 });
    const fast = play('walk', 120, { speed: 1.5 });
    const changes = (seq: number[]): number => seq.filter((f, i) => i > 0 && f !== seq[i - 1]).length;
    expect(changes(slow)).toBeLessThan(changes(normal));
    expect(changes(normal)).toBeLessThan(changes(fast));
    // the speed the simulation hands the animation is clamped to [0.5, 1.5] of the clip's own pace
    const gait = (vx: number) => deriveAnimation({ dashing: false, grounded: true, vx, vy: 0, landTicks: 0, walkSpeed: 4.2, runSpeed: 8.5, crouching: false, crouchSpeed: 3 });
    expect(gait(2.1)).toEqual({ anim: 'walk', speed: 0.5 });
    expect(gait(4.2)).toEqual({ anim: 'walk', speed: 1 });
    expect(gait(8.5)).toEqual({ anim: 'run', speed: 1 });
    expect(gait(1.2).speed).toBe(0.5);
  });

  it('the idle sways and loops; the fall flutters and loops (the crouch has no drawing yet)', () => {
    for (const state of ['idle', 'fall'] as const) {
      const count = def.clips[state]!.count;
      const seq = play(state, 60 * 6);
      expect(new Set(seq).size, `${state}: all its frames are shown`).toBe(count);
      expect(seq.slice(-60).some((f) => f === 0) || seq.slice(-120).some((f) => f === 0), `${state} loops`).toBe(true);
    }
  });

  it('the one-shot clips play once and hold their last frame: the jump, the landing, the dash, the hurt, the death, the interaction', () => {
    for (const state of ['jump', 'land', 'dash', 'hurt', 'death', 'interact'] as const) {
      const clip = def.clips[state]!;
      const seq = play(state, 60 * 3);
      expect(seq[0], `${state} begins at its first frame`).toBe(0);
      expect(seq[seq.length - 1], `${state} ends held on its last`).toBe(clip.count - 1);
      expect(seq.every((f, i) => i === 0 || f >= seq[i - 1]!), `${state} never goes back`).toBe(true);
      expect(new Set(seq).size, `${state}: every frame is shown`).toBe(clip.count);
      // and it takes what the clip says it takes
      const first = seq.findIndex((f) => f === clip.count - 1);
      expect(Math.abs((first + 1) * TICK - (clip.count - 1) / (clip.fps ?? 12)), `${state}: when the last frame arrives`).toBeLessThan(0.06);
    }
  });

  it('a blow is drawn by the SIMULATION\'s phases: every frame is shown at least one tick, in order, and the sword is raised before it strikes', () => {
    // (the second blow plays the first one's clip: its stand-in; the air blow and the crouch blow have no clip)
    const blows: Array<[AnimState, number, number, number]> = [
      ['attack1', 4, 3, 8],
      ['attack2', 3, 3, 11],
      ['cast', 6, 1, 8],
    ];
    for (const [state, startup, active, recovery] of blows) {
      const clip = def.clips[standInFor(def, state)!]!;
      const phases: Array<[AnimPhase, number]> = [['startup', startup], ['active', active], ['recovery', recovery]];
      const seq: number[] = [];
      const phaseOf: AnimPhase[] = [];
      for (const [phase, n] of phases) for (let i = 0; i < n; i++) { seq.push(frameForPhase(clip, phase, i / n)); phaseOf.push(phase); }
      expect(seq.length).toBe(startup + active + recovery);
      expect(new Set(seq).size, `${state}: every frame of the blow is shown`).toBe(clip.count);
      expect(seq.every((f, i) => i === 0 || f >= seq[i - 1]!), `${state}: frames in order`).toBe(true);
      // each phase draws its own frames: the ones the clip says belong to it
      seq.forEach((f, i) => {
        const [lo, hi] = clip.phases![phaseOf[i] as 'startup' | 'active' | 'recovery'];
        expect(f >= lo && f <= hi, `${state} tick ${i}: frame ${f} in ${phaseOf[i]} [${lo}, ${hi}]`).toBe(true);
      });
      // the animator, driven the way the game drives it (phase and progress each frame), shows the same frames
      const a = new SpriteAnimator(def, true);
      const shown: number[] = [];
      for (const [phase, n] of phases) for (let i = 0; i < n; i++) { a.play(state, { phase, phaseT: i / n }); a.update(TICK); shown.push(a.frameIndex); }
      expect(shown).toEqual(seq);
    }
  });

  it('the simulation\'s clip lengths agree with the gameplay it is drawing', () => {
    const length = (s: AnimState): number => clipLength(def.clips[s]!);
    expect(length('dash')).toBeCloseTo(0.1667, 3);
    expect(length('land')).toBeCloseTo(10 / 60, 3);
    expect(length('interact')).toBeCloseTo(0.2, 3);
    expect(length('hurt')).toBeCloseTo(0.25, 3);
    expect(length('cast')).toBeCloseTo(0.5, 3);
    expect(length('death')).toBeGreaterThan(0.6);
    expect(length('death')).toBeLessThan(1);
    // and the sprite set is the one the placeholder's contract describes
    expect(def.height).toBe(1.7);
    expect(def.artPxPerMeter).toBe(65);
    expect(ANIM_STATES.filter((s) => def.clips[s] !== undefined), 'twelve clips: the sheet\'s').toHaveLength(12);
  });
});
