import { beforeAll, describe, expect, it } from 'vitest';
import { PLAYER_PLACEHOLDER } from '@/content/placeholders/playerPlaceholder';
import { log } from '@/core/log';
import { frameForPhase, frameForTime, resolveClip, SpriteAnimator } from '@/presentation/animation';
import type { SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';

beforeAll(() => log.setSink(() => {}));

const FULL = PLAYER_PLACEHOLDER.def;
const make = (def: SpriteSetDefinition = FULL): SpriteAnimator => new SpriteAnimator(def);
const only = (...states: Array<keyof SpriteSetDefinition['clips']>): SpriteSetDefinition => ({
  ...FULL,
  clips: Object.fromEntries(states.map((s) => [s, FULL.clips[s]!])),
});

describe('SpriteAnimator (port of AnimationController)', () => {
  it('starts in idle on its first frame (no empty frame on spawn)', () => {
    const anim = make();
    expect(anim.state).toBe('idle');
    expect(anim.frameName).toBe('idle_00');
    expect(anim.frameIndex).toBe(0);
  });

  it('falls back through the chain: no walk → run; no clip at all for a state → idle, never throws', () => {
    const anim = make(only('idle', 'run'));
    anim.play('walk');
    expect(anim.state).toBe('run');
    expect(anim.requested).toBe('walk');
    anim.play('death'); // death → hurt → idle
    expect(anim.state).toBe('idle');
    expect(() => anim.play('phaseTransition')).not.toThrow();
    // a set with ONLY idle animates every state
    const minimal = make(only('idle'));
    for (const s of ['run', 'jump', 'attack', 'dash', 'hurt', 'death'] as const) {
      minimal.play(s);
      expect(minimal.state).toBe('idle');
      expect(minimal.frameName).toMatch(/^idle_/);
    }
  });

  it('restarting a one-shot clip resets it to its first frame (combo hits do not continue the old swing)', () => {
    const anim = make();
    anim.play('jump');
    anim.update(0.2);
    expect(anim.progress).toBeGreaterThan(0.3);
    anim.play('jump', { restart: true });
    expect(anim.progress).toBeCloseTo(0, 2);
    expect(anim.frameName).toBe('jump_00');
  });

  it('time-fits a clip to a gameplay duration', () => {
    const anim = make();
    anim.play('jump', { duration: 0.125 }); // the clip lasts 0.25 s → plays at 2×
    anim.update(0.0625);
    expect(anim.progress).toBeCloseTo(0.5, 1);
    anim.update(0.0625);
    expect(anim.finished).toBe(true);
  });

  it('one-shots report finished and hold their last frame; loops never finish', () => {
    const anim = make();
    anim.play('hurt');
    expect(anim.finished).toBe(false);
    anim.update(1);
    expect(anim.finished).toBe(true);
    expect(anim.frameName).toBe('hurt_01'); // holds the last frame
    anim.play('idle');
    anim.update(10);
    expect(anim.finished).toBe(false);
  });

  it('phase-driven clips take their frame from the SIMULATION phase, not from time (replaces the 3D cross-fade)', () => {
    const anim = make();
    const at = (phase: 'startup' | 'active' | 'recovery', phaseT: number, dt = 0): string | null => {
      anim.play('attack', { phase, phaseT });
      anim.update(dt);
      return anim.frameName;
    };
    expect(at('startup', 0)).toBe('attack_00');
    expect(at('startup', 0.99)).toBe('attack_01');
    expect(at('active', 0)).toBe('attack_02');
    expect(at('active', 0.99)).toBe('attack_03');
    expect(at('recovery', 0)).toBe('attack_04');
    expect(at('recovery', 0.99)).toBe('attack_05');
    // real time passing changes nothing while the phase is fixed: the blow is tied to the hitbox, not to the clock
    expect(at('active', 0.2, 5)).toBe('attack_02');
    // and a clip without phases (or no phase) is time-driven again
    anim.play('attack');
    anim.update(0);
    expect(anim.frameName).toBe('attack_00');
    anim.update(0.5);
    expect(anim.frameName).toBe('attack_05'); // 6 frames at 12 fps = 0.5 s, then holds
  });

  it('a phase-driven one-shot finishes only at the end of recovery', () => {
    const anim = make();
    anim.play('attack', { phase: 'active', phaseT: 1 });
    expect(anim.finished).toBe(false);
    anim.play('attack', { phase: 'recovery', phaseT: 1 });
    expect(anim.finished).toBe(true);
  });
});

describe('animation maths', () => {
  const idle = FULL.clips.idle!; // 4 frames at 5 fps
  it('frameForTime loops and clamps', () => {
    expect(frameForTime(idle, 0, true)).toBe(0);
    expect(frameForTime(idle, 0.2, true)).toBe(1);
    expect(frameForTime(idle, 0.8, true)).toBe(0); // wraps
    expect(frameForTime(idle, 0.8, false)).toBe(3); // holds
    expect(frameForTime(idle, -1, true)).toBe(0);
  });

  it('frameForPhase spreads a phase over its frames and rejects clips without phases', () => {
    const attack = FULL.clips.attack!;
    expect(frameForPhase(attack, 'active', 0)).toBe(2);
    expect(frameForPhase(attack, 'active', 0.49)).toBe(2);
    expect(frameForPhase(attack, 'active', 0.5)).toBe(3);
    expect(frameForPhase(attack, 'active', 7)).toBe(3); // clamped
    expect(frameForPhase(idle, 'active', 0.5)).toBe(-1);
    expect(frameForPhase(attack, 'none', 0.5)).toBe(-1);
  });

  it('resolveClip reports which state really plays and whether it loops', () => {
    expect(resolveClip(FULL, 'run')).toMatchObject({ state: 'run', loops: true });
    expect(resolveClip(FULL, 'jump')).toMatchObject({ state: 'jump', loops: false });
    expect(resolveClip({ clips: { idle: idle } }, 'dash')).toMatchObject({ state: 'idle' });
    expect(resolveClip({ clips: {} }, 'idle')).toBeNull();
  });
});
