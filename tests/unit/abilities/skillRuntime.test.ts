import { describe, expect, it } from 'vitest';
import { Magic } from '@/abilities/Magic';
import { SkillRuntime } from '@/abilities/SkillRuntime';
import { MAGIC } from '@/content/resources';
import { SKILLS, SPIRIT_BOLT } from '@/content/skills';
import { secondsToTicks } from '@/core/time';

/** What the skills remember (docs/GAME-SPEC-2D.md §10): their cooldown, and the single question "can it be cast now?". */
function make() {
  return { rt: new SkillRuntime(SKILLS), magic: new Magic(MAGIC) };
}

describe('the Spirit Bolt as data', () => {
  it('has the numbers of the specification: cost 30, 0.3 s, 6 + 8 ticks, 40 % control, 16 m/s over 12 m, damage 2, knockback (6, 2), hit-stop 3', () => {
    const s = SPIRIT_BOLT;
    expect([s.cost, s.cooldown, s.startup, s.recovery, s.moveControl]).toEqual([30, 0.3, 6, 8, 0.4]);
    expect(s.projectile).toMatchObject({ speed: 16, range: 12, damage: 2, knockback: { x: 6, y: 2 }, hitStop: 3 });
    expect(s.handler).toBe('projectile');
  });

  it('three casts in a row fit in a full bar and a fourth does not (30 × 3 = 90 ≤ 100 < 120)', () => {
    expect(Math.floor(MAGIC.max / SPIRIT_BOLT.cost)).toBe(3);
  });
});

describe('can it be cast?', () => {
  it('yes with enough magic and no cooldown', () => {
    const { rt, magic } = make();
    expect(rt.check('spirit_bolt', magic)).toBe('ok');
  });

  it('an unknown skill is "noSkill"', () => {
    const { rt, magic } = make();
    expect(rt.check('nope', magic)).toBe('noSkill');
  });

  it('below the cost it is "noMagic"; exactly at the cost it is fine', () => {
    const { rt, magic } = make();
    magic.set(29.9);
    expect(rt.check('spirit_bolt', magic)).toBe('noMagic');
    magic.set(30);
    expect(rt.check('spirit_bolt', magic)).toBe('ok');
  });

  it('the cooldown is 0.3 s = 18 ticks from the release, and it wins over the magic as the reason', () => {
    const { rt, magic } = make();
    rt.startCooldown('spirit_bolt');
    expect(rt.ticksLeft('spirit_bolt')).toBe(secondsToTicks(0.3));
    expect(rt.ticksLeft('spirit_bolt')).toBe(18);
    expect(rt.check('spirit_bolt', magic)).toBe('cooldown');
    magic.set(0);
    expect(rt.check('spirit_bolt', magic)).toBe('cooldown');
    for (let i = 0; i < 17; i++) rt.tick();
    expect(rt.check('spirit_bolt', new Magic(MAGIC))).toBe('cooldown');
    rt.tick();
    expect(rt.check('spirit_bolt', new Magic(MAGIC))).toBe('ok');
  });

  it('the cooldown fraction counts down from 1 to 0 (the HUD sweep)', () => {
    const { rt } = make();
    expect(rt.cooldown01('spirit_bolt')).toBe(0);
    rt.startCooldown('spirit_bolt');
    expect(rt.cooldown01('spirit_bolt')).toBe(1);
    for (let i = 0; i < 9; i++) rt.tick();
    expect(rt.cooldown01('spirit_bolt')).toBeCloseTo(0.5, 9);
    expect(rt.cooldown01('nope')).toBe(0);
  });

  it('reset() clears every cooldown (a fresh start after a defeat)', () => {
    const { rt, magic } = make();
    rt.startCooldown('spirit_bolt');
    rt.reset();
    expect(rt.check('spirit_bolt', magic)).toBe('ok');
  });

  it('starting the cooldown of an unknown skill does nothing and ticking an idle runtime is free', () => {
    const { rt } = make();
    rt.startCooldown('nope');
    expect(() => rt.tick()).not.toThrow();
  });
});
