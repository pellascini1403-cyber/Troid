import { describe, expect, it } from 'vitest';
import { VFX, VFX_BINDINGS } from '@/content/vfx';
import { Rng } from '@/core/rng';
import { PALETTE, SLOT_COLORS } from '@/presentation/palette';
import {
  PARTICLE_BUDGET,
  SPRITE_FX_BUDGET,
  aimAngle,
  arcPose,
  burstCount,
  createParticleMotion,
  initParticle,
  lifeFraction,
  particleAlpha,
  particleSize,
  resolveColor,
  stepParticle,
  type ArcPose,
  type ArcVfx,
  type ParticleVfx,
  type VfxTrigger,
} from '@/presentation/vfx';

const burst = (over: Partial<ParticleVfx> = {}): ParticleVfx => ({
  kind: 'particles', id: 't', priority: 1, palette: 'energy', blend: 'add', shape: 'spark',
  count: [10, 10], speed: [4, 6], life: [0.2, 0.4], aim: 'along', spread: 0.6, size: [0.1, 0.2], sizeEnd: 0.5,
  gravity: 0, drag: 0, alpha: [1, 0], colors: ['core'], ...over,
});
const at = { x: 3, y: 2, facing: 1 as const };

describe('palette slots → colours (never hex in a definition)', () => {
  it('the hero energy is cyan with a white core; enemy energy is violet; the "ink" role is the black body of the slot', () => {
    expect(resolveColor('energy', 'core')).toBe(PALETTE.energyCore);
    expect(resolveColor('energy', 'hot')).toBe(PALETTE.whiteHot);
    expect(resolveColor('enemy', 'core')).toBe(PALETTE.violetCore);
    expect(resolveColor('enemy', 'ink')).toBe(PALETTE.enemyInk);
    expect(resolveColor('energy', 'ink')).toBe(PALETTE.heroInk);
  });

  it('the warm accent is OFF by default (it falls back to cyan) and only appears when explicitly enabled', () => {
    expect(resolveColor('accent', 'core')).toBe(SLOT_COLORS.energy.core);
    expect(resolveColor('accent', 'core', false)).toBe(PALETTE.energyCore);
    expect(resolveColor('accent', 'core', true)).toBe(PALETTE.accentWarm);
  });

  it('no effect of the table asks for the accent except the finisher slash', () => {
    const users = Object.values(VFX).filter((d) => d.palette === 'accent').map((d) => d.id);
    expect(users).toEqual(['slash_arc_finisher']);
  });
});

describe('particle emitter (pure, with an injected Rng)', () => {
  it('is deterministic: the same seed gives the same burst, bit for bit', () => {
    const make = (seed: number): string => {
      const rng = new Rng(seed);
      const out: number[] = [];
      for (let i = 0; i < 20; i++) {
        const m = initParticle(burst(), at, rng, false, createParticleMotion());
        out.push(m.x, m.y, m.vx, m.vy, m.life, m.size0, m.rotation, m.tint);
      }
      return out.join(',');
    };
    expect(make(7)).toBe(make(7));
    expect(make(7)).not.toBe(make(8));
  });

  it('draws speed, life and size from the ranges of the definition', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 200; i++) {
      const m = initParticle(burst({ speed: [4, 6], life: [0.2, 0.4], size: [0.1, 0.2] }), at, rng, false, createParticleMotion());
      const speed = Math.hypot(m.vx, m.vy);
      expect(speed).toBeGreaterThanOrEqual(4 - 1e-9);
      expect(speed).toBeLessThanOrEqual(6 + 1e-9);
      expect(m.life).toBeGreaterThanOrEqual(0.2);
      expect(m.life).toBeLessThanOrEqual(0.4);
      expect(m.size0).toBeGreaterThanOrEqual(0.1);
      expect(m.size0).toBeLessThanOrEqual(0.2);
      expect(m.size1).toBeCloseTo(m.size0 * 0.5, 9);
    }
  });

  it('aims along the facing, against it, up, or all around; the spread limits the cone', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 100; i++) {
      const right = initParticle(burst({ aim: 'along', spread: 0.6 }), { ...at, facing: 1 }, rng, false, createParticleMotion());
      expect(right.vx).toBeGreaterThan(0);
      expect(Math.abs(Math.atan2(right.vy, right.vx))).toBeLessThanOrEqual(0.3 + 1e-9);
      const left = initParticle(burst({ aim: 'along', spread: 0.6 }), { ...at, facing: -1 }, rng, false, createParticleMotion());
      expect(left.vx).toBeLessThan(0);
      const back = initParticle(burst({ aim: 'back', spread: 0.6 }), { ...at, facing: 1 }, rng, false, createParticleMotion());
      expect(back.vx).toBeLessThan(0);
      const up = initParticle(burst({ aim: 'up', spread: 0.6 }), at, rng, false, createParticleMotion());
      expect(up.vy).toBeGreaterThan(0);
    }
    const dirs = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const m = initParticle(burst({ aim: 'any', spread: Math.PI * 2 }), at, rng, false, createParticleMotion());
      dirs.add(`${Math.sign(m.vx)}${Math.sign(m.vy)}`);
    }
    expect(dirs.size).toBe(4); // every quadrant
  });

  it('an explicit direction (a hit) overrides the facing', () => {
    expect(aimAngle('along', { ...at, dirX: 0, dirY: 1 })).toBeCloseTo(Math.PI / 2, 9);
    expect(aimAngle('back', { ...at, dirX: 0, dirY: 1 })).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('`align` turns the particle along its velocity, and keeps it aligned as it moves', () => {
    const rng = new Rng(5);
    const m = initParticle(burst({ align: true, gravity: -20 }), at, rng, false, createParticleMotion());
    for (let i = 0; i < 6; i++) stepParticle(m, 0.016);
    expect(m.rotation).toBeCloseTo(Math.atan2(m.vy, m.vx), 9);
  });

  it('the spawn scatter stays inside `radius`', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 200; i++) {
      const m = initParticle(burst({ radius: 0.4 }), at, rng, false, createParticleMotion());
      expect(Math.hypot(m.x - at.x, m.y - at.y)).toBeLessThanOrEqual(0.4 + 1e-9);
    }
  });

  it('burstCount follows the range and the scale of the spawn', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 100; i++) {
      const n = burstCount(burst({ count: [8, 12] }), rng);
      expect(n).toBeGreaterThanOrEqual(8);
      expect(n).toBeLessThanOrEqual(12);
    }
    expect(burstCount(burst({ count: [10, 10] }), new Rng(1), 1.5)).toBe(15);
    expect(burstCount(burst({ count: [10, 10] }), new Rng(1), 0)).toBe(0);
  });

  it('picks its colour from the roles it was given, resolved through the slot', () => {
    const rng = new Rng(2);
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(initParticle(burst({ colors: ['core', 'hot'] }), at, rng, false, createParticleMotion()).tint);
    expect([...seen].sort()).toEqual([PALETTE.energyCore, PALETTE.whiteHot].sort());
  });
});

describe('particle integration', () => {
  it('gravity pulls it down (negative), drag slows it, and it dies when its life is over', () => {
    const m = createParticleMotion();
    Object.assign(m, { vx: 5, vy: 5, life: 0.5, gravity: -10, drag: 2 });
    const speed0 = Math.hypot(m.vx, m.vy);
    stepParticle(m, 0.1);
    expect(m.vy).toBeLessThan(5);
    expect(m.x).toBeGreaterThan(0);
    expect(Math.hypot(m.vx, m.vy)).toBeLessThan(speed0);
    let alive = true;
    let steps = 0;
    while (alive && steps++ < 100) alive = stepParticle(m, 0.1);
    expect(alive).toBe(false);
    expect(steps).toBeLessThanOrEqual(6);
  });

  it('is frame-rate independent for drag: two half steps ≈ one whole step', () => {
    const a = createParticleMotion();
    const b = createParticleMotion();
    for (const m of [a, b]) Object.assign(m, { vx: 8, vy: 0, life: 5, drag: 3, gravity: 0 });
    stepParticle(a, 0.1);
    stepParticle(b, 0.05);
    stepParticle(b, 0.05);
    expect(b.vx).toBeCloseTo(a.vx, 9);
    expect(b.x).toBeCloseTo(a.x, 1);
  });

  it('size interpolates to sizeEnd and alpha fades late (ease-in), never leaving [0, 1]', () => {
    const m = createParticleMotion();
    Object.assign(m, { life: 1, size0: 0.4, size1: 0.1, alpha0: 1, alpha1: 0 });
    expect(particleSize(m)).toBeCloseTo(0.4);
    m.age = 0.5;
    expect(particleSize(m)).toBeCloseTo(0.25);
    expect(particleAlpha(m)).toBeCloseTo(0.75); // still bright at half life
    m.age = 1;
    expect(particleAlpha(m)).toBeCloseTo(0);
    expect(lifeFraction(5, 1)).toBe(1);
    expect(lifeFraction(-1, 1)).toBe(0);
    expect(lifeFraction(0.2, 0)).toBe(1);
  });
});

describe('slash arc geometry', () => {
  const arc = VFX['slash_arc'] as ArcVfx;
  const pose = (): ArcPose => ({ x: 0, y: 0, width: 0, height: 0, rotation0: 0, rotation1: 0, flip: 1 });
  const rect = { x0: 10.2, y0: 0.3, x1: 11.6, y1: 1.4 };

  it('fits the attack\'s hitbox: centred on it, sized from it (the visible blow IS the hit area)', () => {
    const p = arcPose(arc, { x: 10, y: 0, facing: 1, rect, variant: 'slash_1' }, pose());
    expect(p.x).toBeCloseTo((10.2 + 11.6) / 2);
    expect(p.y).toBeCloseTo((0.3 + 1.4) / 2);
    expect(p.width).toBeCloseTo(1.4 * arc.variants['slash_1']!.width);
    expect(p.height).toBeCloseTo(1.1 * arc.variants['slash_1']!.height);
  });

  it('mirrors with the facing: flipped sprite, opposite rotation', () => {
    const right = arcPose(arc, { x: 10, y: 0, facing: 1, rect, variant: 'slash_1' }, pose());
    const left = arcPose(arc, { x: 10, y: 0, facing: -1, rect, variant: 'slash_1' }, pose());
    expect(right.flip).toBe(1);
    expect(left.flip).toBe(-1);
    expect(left.rotation0).toBeCloseTo(-right.rotation0, 9);
    expect(left.rotation1).toBeCloseTo(-right.rotation1, 9);
  });

  it('every attack has its own sweep (the opener comes down, the finisher goes up) and an unknown variant falls back', () => {
    const rot = (variant: string): number => {
      const p = arcPose(arc, { x: 0, y: 0, facing: 1, rect, variant }, pose());
      return p.rotation1 - p.rotation0; // view convention: clockwise positive
    };
    expect(rot('slash_1')).toBeGreaterThan(0); // sweeps clockwise = downward on screen
    expect(rot('slash_2')).toBeLessThan(0); // rises
    const fallback = arcPose(arc, { x: 0, y: 0, facing: 1, rect, variant: 'does_not_exist' }, pose());
    const none = arcPose(arc, { x: 0, y: 0, facing: 1, rect }, pose());
    expect(fallback.rotation0).toBe(none.rotation0);
  });

  it('without a rect it still answers: a box in front of the actor', () => {
    const p = arcPose(arc, { x: 5, y: 0, facing: -1 }, pose());
    expect(p.x).toBeLessThan(5);
    expect(p.width).toBeGreaterThan(0);
  });

  it('scale grows the arc (the finisher is bigger)', () => {
    const a = arcPose(arc, { x: 0, y: 0, facing: 1, rect }, pose());
    const b = arcPose(arc, { x: 0, y: 0, facing: 1, rect, scale: 1.3 }, pose());
    expect(b.width).toBeCloseTo(a.width * 1.3);
  });
});

describe('the effect table (content/vfx.ts)', () => {
  const TRIGGERS: VfxTrigger[] = ['slash', 'slashFinisher', 'hitLanded', 'playerHurt', 'dashStart', 'dashDust', 'dashTrail', 'enemyDied', 'enemyTelegraph', 'playerDied', 'boltCast', 'boltImpact', 'boltEnd', 'drinkStart', 'drinkHeal', 'pickup', 'sealRejected'];

  it('binds every trigger, and every bound id is a defined effect', () => {
    expect(Object.keys(VFX_BINDINGS).sort()).toEqual([...TRIGGERS].sort());
    for (const [trigger, ids] of Object.entries(VFX_BINDINGS)) {
      expect(ids.length, trigger).toBeGreaterThan(0);
      for (const id of ids) expect(VFX[id], `${trigger} → ${id}`).toBeDefined();
    }
  });

  it('keys match ids and every definition has sane numbers (lives, counts, alphas, priorities)', () => {
    for (const [key, d] of Object.entries(VFX)) {
      expect(d.id).toBe(key);
      expect(d.priority).toBeGreaterThan(0);
      if (d.kind === 'particles') {
        expect(d.count[0]).toBeGreaterThanOrEqual(1);
        expect(d.count[1]).toBeGreaterThanOrEqual(d.count[0]);
        expect(d.life[0]).toBeGreaterThan(0);
        expect(d.life[1]).toBeGreaterThanOrEqual(d.life[0]);
        expect(d.size[0]).toBeGreaterThan(0);
        expect(d.colors.length).toBeGreaterThan(0);
        for (const a of d.alpha) expect(a >= 0 && a <= 1, key).toBe(true);
      } else if (d.kind === 'flash') {
        expect(d.life).toBeGreaterThan(0);
        for (const a of d.alpha) expect(a >= 0 && a <= 1, key).toBe(true);
      } else {
        expect(d.life).toBeGreaterThan(0);
        expect(d.layers.length).toBeGreaterThan(0);
        expect(Object.keys(d.variants)).toEqual(expect.arrayContaining(['slash_1', 'slash_2', 'air_slash', 'crouch_slash']));
      }
    }
  });

  it('is short-lived: nothing lingers more than 2 s (the screen stays clean) and the dark ink is the only normal-blend burst with a dark colour', () => {
    for (const d of Object.values(VFX)) {
      if (d.kind === 'particles') expect(d.life[1]).toBeLessThanOrEqual(2);
      else expect(d.life).toBeLessThanOrEqual(2);
    }
    const dark = Object.values(VFX).filter((d) => d.kind === 'particles' && d.colors.includes('ink')).map((d) => `${d.id}:${(d as ParticleVfx).blend}`);
    expect(dark).toEqual(['death_ink:normal']); // black cannot be additive
  });

  it('the particle budget follows the spec per quality profile (150 / 300 / 400)', () => {
    expect(PARTICLE_BUDGET).toEqual({ low: 150, medium: 300, high: 400 });
    expect(SPRITE_FX_BUDGET.low).toBeLessThan(SPRITE_FX_BUDGET.medium);
    expect(SPRITE_FX_BUDGET.medium).toBeLessThan(SPRITE_FX_BUDGET.high);
  });

  it('one hit never asks for more than a fraction of the budget (a fight does not fill the screen)', () => {
    const worst = (ids: readonly string[]): number =>
      ids.reduce((n, id) => {
        const d = VFX[id]!;
        return n + (d.kind === 'particles' ? d.count[1] * 1.3 : 0);
      }, 0);
    expect(worst(VFX_BINDINGS.hitLanded)).toBeLessThan(PARTICLE_BUDGET.low / 4);
    expect(worst(VFX_BINDINGS.enemyDied)).toBeLessThan(PARTICLE_BUDGET.low / 2);
    expect(worst(VFX_BINDINGS.playerDied)).toBeLessThan(PARTICLE_BUDGET.low / 3);
    expect(worst(VFX_BINDINGS.enemyTelegraph)).toBeLessThan(PARTICLE_BUDGET.low / 6);
  });

  it('the warning of a lunge is VIOLET and lasts the 24-tick wind-up (0.4 s): the telegraph is readable and never longer than the blow', () => {
    for (const id of VFX_BINDINGS.enemyTelegraph) {
      const d = VFX[id]!;
      expect(d.palette, id).toBe('enemy');
      const life = d.kind === 'particles' ? d.life[1] : d.life;
      expect(life, id).toBeLessThanOrEqual(24 / 60 + 1e-9);
    }
    // the ring CLOSES in (a clock): it starts wide and ends tight, and gets brighter as it does
    const ring = VFX.telegraph_ring!;
    expect(ring.kind).toBe('flash');
    if (ring.kind === 'flash') {
      expect(ring.size[1]).toBeLessThan(ring.size[0]);
      expect(ring.alpha[1]).toBeGreaterThan(ring.alpha[0]);
    }
  });
});
