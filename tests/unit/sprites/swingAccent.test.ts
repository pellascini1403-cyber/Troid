// @vitest-environment happy-dom
import type { Sprite } from 'pixi.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { SLASH_1, SLASH_2 } from '@/content/attacks';
import { log } from '@/core/log';
import { createActorViewState } from '@/presentation/actorViewState';
import { createSwingAccent, isAccented, SWING_LIMITS, swingAccent } from '@/presentation/swingAccent';
import { ANCHOR_IDS, ANIM_STATES, type AnimPhase } from '@/presentation/vocabulary';
import { ActorSprite } from '@/render/ActorSprite';
import { fakeSet } from '../../helpers/sprites';

beforeAll(() => log.setSink(() => {}));

const PHASES: readonly AnimPhase[] = ['startup', 'active', 'recovery'];
/** Every tick of the second blow as the simulation publishes it: the phase and the progress inside it (`CombatActor.progress`). */
function ticksOfBlow(): Array<{ phase: AnimPhase; phaseT: number }> {
  const out: Array<{ phase: AnimPhase; phaseT: number }> = [];
  for (const [phase, n] of [['startup', SLASH_2.startup], ['active', SLASH_2.active], ['recovery', SLASH_2.recovery]] as const) {
    for (let i = 0; i < n; i++) out.push({ phase, phaseT: i / n });
  }
  return out;
}

describe('the accent of the second blow (docs/PROMPT25-LOG.md, P2-1)', () => {
  it('is the identity for every state of the hero but the second blow — exactly, in every phase', () => {
    for (const anim of ANIM_STATES) {
      if (anim === 'attack2') continue;
      for (const phase of [...PHASES, 'none'] as const) {
        for (const t of [0, 0.25, 0.5, 1]) {
          const a = swingAccent(anim, phase, t);
          expect(isAccented(a), `${anim} ${phase} ${t}`).toBe(false);
          expect(a).toEqual({ shift: 0, lean: 0, stretchX: 1, stretchY: 1 });
        }
      }
    }
  });

  it('moves the picture through the whole second blow: coiled back, driven forward, settled', () => {
    const at = (phase: AnimPhase, t: number) => swingAccent('attack2', phase, t);
    expect(isAccented(at('startup', 0)), 'it starts from the body at rest').toBe(false);
    const coil = at('startup', 1);
    expect(coil.shift).toBeLessThan(0);
    expect(coil.lean).toBeLessThan(0);
    const drive = at('active', 1);
    expect(drive.shift).toBeGreaterThan(0.1);
    expect(drive.lean).toBeGreaterThan(0.1);
    expect(drive.stretchX).toBeGreaterThan(1);
    expect(drive.stretchY).toBeLessThan(1);
    expect(isAccented(at('recovery', 1)), 'it ends at rest').toBe(false);
    expect(isAccented(at('none', 0.5)), 'with no phase there is no accent').toBe(false);
  });

  it('has no jump between the parts of the blow, and is one thing from one tick to the next', () => {
    const same = (a: ReturnType<typeof swingAccent>, b: ReturnType<typeof swingAccent>, what: string): void => {
      for (const k of ['shift', 'lean', 'stretchX', 'stretchY'] as const) expect(a[k], `${what} ${k}`).toBeCloseTo(b[k], 9);
    };
    same(swingAccent('attack2', 'startup', 1), swingAccent('attack2', 'active', 0), 'startup → active');
    same(swingAccent('attack2', 'active', 1), swingAccent('attack2', 'recovery', 0), 'active → recovery');
    // the largest step between two ticks of the blow, against the whole travel of the drive: it moves fast, and it never snaps (the blow is a few ticks long: a curve that did it all in one would be a cut)
    const ticks = ticksOfBlow();
    const drive = swingAccent('attack2', 'active', 1);
    const coil = swingAccent('attack2', 'startup', 1);
    let widest = 0;
    for (let i = 1; i < ticks.length; i++) {
      const a = swingAccent('attack2', ticks[i - 1]!.phase, ticks[i - 1]!.phaseT);
      const b = swingAccent('attack2', ticks[i]!.phase, ticks[i]!.phaseT);
      widest = Math.max(widest, Math.abs(b.shift - a.shift) / (drive.shift - coil.shift), Math.abs(b.lean - a.lean) / (drive.lean - coil.lean));
    }
    expect(widest, 'no tick carries more than three quarters of the drive').toBeLessThan(0.75);
  });

  it('stays inside its limits in every tick of the blow, whatever the progress given (the limits are what keep it a movement and not another drawing)', () => {
    for (const phase of PHASES) {
      for (let i = -5; i <= 25; i++) {
        const a = swingAccent('attack2', phase, i / 20); // out-of-range progress is clamped
        expect(Math.abs(a.shift), `${phase} ${i} shift`).toBeLessThanOrEqual(SWING_LIMITS.shift);
        expect(Math.abs(a.lean), `${phase} ${i} lean`).toBeLessThanOrEqual(SWING_LIMITS.lean);
        expect(Math.abs(a.stretchX - 1), `${phase} ${i} stretchX`).toBeLessThanOrEqual(SWING_LIMITS.stretch);
        expect(Math.abs(a.stretchY - 1), `${phase} ${i} stretchY`).toBeLessThanOrEqual(SWING_LIMITS.stretch);
        for (const v of Object.values(a)) expect(Number.isFinite(v)).toBe(true);
      }
    }
    // the limits themselves: a lean of under eight and a half degrees and a shift under the first blow's own step forward (3 m/s for 4 ticks = 20 cm)
    expect(SWING_LIMITS.lean * (180 / Math.PI)).toBeLessThan(8.5);
    expect(SWING_LIMITS.shift).toBeLessThan((SLASH_1.lunge!.speed * SLASH_1.lunge!.ticks) / 60);
    expect(SWING_LIMITS.stretch).toBeLessThanOrEqual(0.08);
  });

  it('is a pure function of the state: the same tick gives the same accent, and writing into a given object leaves nothing of the last call', () => {
    const out = createSwingAccent();
    const first = { ...swingAccent('attack2', 'active', 0.4, out) };
    swingAccent('attack2', 'recovery', 0.9, out);
    expect(swingAccent('attack2', 'active', 0.4, out)).toEqual(first);
    expect(swingAccent('attack2', 'active', 0.4)).toEqual(first);
    // and the blow it belongs to is the one that FOLLOWS the first (the accent is keyed on the clip the simulation plays)
    expect(SLASH_1.next).toBe(SLASH_2.id);
    expect(SLASH_2.anim).toBe('attack2');
    expect(SLASH_1.anim).not.toBe('attack2');
  });
});

describe('the sprite of the hero carries the accent (and nothing else changes)', () => {
  const body = (a: ActorSprite): Sprite => a.root.children[0] as Sprite;
  const flash = (a: ActorSprite): Sprite => a.root.children[1] as Sprite;
  const view = (anim: 'attack' | 'attack2', phase: AnimPhase, phaseT: number, facing: 1 | -1 = 1) => {
    const v = createActorViewState();
    Object.assign(v, { x: 6, prevX: 6, y: 1, prevY: 1, facing, anim, phase, phaseT });
    return v;
  };

  it('tips and carries the picture, the frame and its flash together, about the feet', () => {
    const a = new ActorSprite(fakeSet(), { accent: true });
    a.sync(view('attack2', 'active', 1), 0, 0);
    const drive = swingAccent('attack2', 'active', 1);
    for (const s of [body(a), flash(a)]) {
      expect(s.rotation).toBeCloseTo(drive.lean, 9);
      expect(s.position.x).toBeCloseTo(drive.shift, 9);
    }
    expect(body(a).rotation).toBe(flash(a).rotation);
    expect(body(a).scale.x).toBe(flash(a).scale.x);
    expect(body(a).scale.y).toBe(flash(a).scale.y);
    // stretched wider and squashed lower than the frame's own size
    const plain = new ActorSprite(fakeSet(), { accent: true });
    plain.sync(view('attack2', 'startup', 0), 0, 0);
    expect(body(a).scale.x).toBeGreaterThan(body(plain).scale.x);
    expect(body(a).scale.y).toBeLessThan(body(plain).scale.y);
  });

  it('leaves the sprite exactly as it was when the blow is over (no residue in the transform)', () => {
    const a = new ActorSprite(fakeSet(), { accent: true });
    const rest = new ActorSprite(fakeSet(), { accent: true });
    rest.sync(view('attack', 'recovery', 0.5), 0, 0);
    a.sync(view('attack2', 'active', 1), 0, 0);
    a.sync(view('attack', 'recovery', 0.5), 0, 0);
    for (const s of [body, flash]) {
      expect(s(a).rotation).toBe(0);
      expect(s(a).position.x).toBe(0);
      expect(s(a).scale.x).toBe(s(rest).scale.x);
      expect(s(a).scale.y).toBe(s(rest).scale.y);
    }
  });

  it('is for the hero only: a sprite made without the accent never carries one', () => {
    const a = new ActorSprite(fakeSet());
    a.sync(view('attack2', 'active', 1), 0, 0);
    expect(body(a).rotation).toBe(0);
    expect(body(a).position.x).toBe(0);
  });

  it('the first blow is untouched: not a hair of its picture moves', () => {
    const a = new ActorSprite(fakeSet(), { accent: true });
    const plain = new ActorSprite(fakeSet());
    for (const { phase, phaseT } of ticksOfBlow()) {
      a.sync(view('attack', phase, phaseT), 0, 0);
      plain.sync(view('attack', phase, phaseT), 0, 0);
      expect(body(a).rotation).toBe(body(plain).rotation);
      expect(body(a).position.x).toBe(body(plain).position.x);
      expect(body(a).scale.x).toBe(body(plain).scale.x);
      expect(body(a).scale.y).toBe(body(plain).scale.y);
    }
  });

  it('mirrors with the facing like the rest of the picture (the accent is forward either way) and moves no anchor, no bounds and no position of the simulation', () => {
    const right = new ActorSprite(fakeSet(), { accent: true });
    const left = new ActorSprite(fakeSet(), { accent: true });
    const still = new ActorSprite(fakeSet());
    right.sync(view('attack2', 'active', 1, 1), 0, 0);
    left.sync(view('attack2', 'active', 1, -1), 0, 0);
    still.sync(view('attack2', 'active', 1, 1), 0, 0);
    // the same local transform, inside a root that is mirrored: forward is the other way on screen
    expect(right.root.scale.x).toBe(1);
    expect(left.root.scale.x).toBe(-1);
    expect(body(left).rotation).toBe(body(right).rotation);
    expect(body(left).position.x).toBe(body(right).position.x);
    // the simulation's position and the data of the frame are the same with or without the accent
    expect([right.root.position.x, right.root.position.y]).toEqual([still.root.position.x, still.root.position.y]);
    for (const id of ANCHOR_IDS) expect(right.anchorWorld(id), id).toEqual(still.anchorWorld(id));
    expect(right.bounds()).toEqual(still.bounds());
    expect(right.frame).toBe(still.frame);
  });
});
