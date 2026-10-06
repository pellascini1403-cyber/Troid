// @vitest-environment happy-dom
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { VFX } from '@/content/vfx';
import type { VfxDefinition, ParticleVfx } from '@/presentation/vfx';
import { VfxSystem } from '@/vfx/VfxSystem';
import { fakeVfxAtlas } from '../../helpers/vfx';

function make(options: Partial<ConstructorParameters<typeof VfxSystem>[3]> = {}, defs: Readonly<Record<string, VfxDefinition>> = VFX) {
  const add = new Container();
  const normal = new Container();
  const system = new VfxSystem({ add, normal }, fakeVfxAtlas(), defs, { particleBudget: 300, spriteBudget: 40, seed: 11, ...options });
  return { system, add, normal };
}
const at = { x: 0, y: 1, facing: 1 as const };
const particleCount = (c: Container): number => c.children.reduce((n, ch) => n + ((ch as unknown as { particleChildren?: unknown[] }).particleChildren?.length ?? 0), 0);
const run = (system: VfxSystem, seconds: number, step = 1 / 60): void => {
  for (let t = 0; t < seconds; t += step) system.update(step);
};
const quick = (over: Partial<ParticleVfx> = {}): ParticleVfx => ({
  kind: 'particles', id: 'quick', priority: 1, palette: 'energy', blend: 'add', shape: 'spark', count: [20, 20], speed: [1, 2], life: [0.2, 0.2],
  aim: 'any', spread: 6.28, size: [0.1, 0.1], sizeEnd: 1, gravity: 0, drag: 0, alpha: [1, 0], colors: ['core'], ...over,
});

describe('VfxSystem (pooled, budgeted, real time)', () => {
  it('spawns a burst into the right container and returns every particle to its pool when it dies', () => {
    const { system, add, normal } = make();
    expect(system.spawn('impact_sparks', at)).toBe(true);
    const live = system.stats.particles;
    expect(live).toBeGreaterThanOrEqual(10);
    expect(particleCount(add)).toBe(live);
    expect(particleCount(normal)).toBe(0);
    run(system, 1);
    expect(system.stats.particles).toBe(0);
    expect(particleCount(add)).toBe(0);
  });

  it('normal-blend effects (dust, ink) go to the normal container and additive ones to the additive container', () => {
    const { system, add, normal } = make();
    system.spawn('dash_dust', at);
    system.spawn('death_ink', at);
    expect(particleCount(normal)).toBe(system.stats.particles);
    expect(particleCount(add)).toBe(0);
    system.spawn('impact_sparks', at);
    expect(particleCount(add)).toBeGreaterThan(0);
  });

  it('sprite effects (arcs, flashes) live in the additive layer and come back too', () => {
    const { system, add } = make();
    const before = add.children.length;
    expect(system.spawn('slash_arc', { ...at, rect: { x0: 0, y0: 0, x1: 1.4, y1: 1.1 }, variant: 'slash_1' })).toBe(true);
    expect(system.stats.sprites).toBe(3); // halo + body + white core
    expect(system.spawn('impact_flash', at)).toBe(true);
    expect(system.stats.sprites).toBe(4);
    expect(add.children.length).toBeGreaterThan(before);
    run(system, 0.5);
    expect(system.stats.sprites).toBe(0);
    expect(system.stats.particles).toBe(0);
  });

  /** One fight's worth of effects, then enough time for all of them to die (so fights do not overlap). */
  const fight = (system: VfxSystem): void => {
    system.spawn('impact_sparks', at);
    system.spawn('impact_flash', at);
    system.spawn('impact_ring', at);
    system.spawn('hurt_shards', at);
    system.spawn('death_ink', at);
    system.spawn('dash_dust', at);
    system.spawn('slash_arc', { ...at, rect: { x0: 0, y0: 0, x1: 1.4, y1: 1.1 }, variant: 'slash_2' });
    run(system, 1.2);
  };

  it('POOLING: the pools are bounded by the worst simultaneous need, NOT by how many effects were played', () => {
    const { system } = make();
    for (let i = 0; i < 40; i++) fight(system);
    const created = system.stats.poolCreated;
    expect(system.stats.particles + system.stats.sprites).toBe(0); // everything came back
    // worst case of one fight: every burst at its maximum count + the sprites of the arc and the flashes
    const worst = 14 + 15 + 20 + 7 + 5;
    expect(created).toBeLessThanOrEqual(worst);
    for (let i = 0; i < 400; i++) fight(system);
    expect(system.stats.poolCreated).toBeLessThanOrEqual(worst); // 10× more fights, still bounded: no leak
  });

  it('after prewarm a long fight allocates NOTHING new (zero pool misses)', () => {
    const { system } = make();
    system.prewarm();
    const created = system.stats.poolCreated;
    for (let i = 0; i < 300; i++) fight(system);
    expect(system.stats.poolCreated).toBe(created);
    expect(system.stats.dropped).toBe(0);
  });

  it('prewarm creates the pools in advance, so the first big fight allocates nothing either', () => {
    const { system } = make();
    system.prewarm();
    const created = system.stats.poolCreated;
    expect(created).toBeGreaterThan(50);
    system.spawn('impact_sparks', at);
    system.spawn('hurt_shards', at);
    expect(system.stats.poolCreated).toBe(created);
  });

  it('the particle BUDGET is a hard cap, never exceeded however many effects ask', () => {
    const { system, add } = make({ particleBudget: 150 });
    for (let i = 0; i < 80; i++) {
      system.spawn('energy_scatter', at);
      system.spawn('death_ink', at);
      system.spawn('hurt_shards', at);
      expect(system.stats.particles).toBeLessThanOrEqual(150);
    }
    expect(system.stats.peakParticles).toBeLessThanOrEqual(150);
    expect(particleCount(add)).toBeLessThanOrEqual(150);
  });

  it('when the screen is full the LOWEST priority goes first: an important burst evicts trivia, trivia never evicts it', () => {
    const defs = { low: quick({ id: 'low', priority: 1 }), high: quick({ id: 'high', priority: 9 }) };
    const { system } = make({ particleBudget: 40 }, defs);
    system.spawn('low', at);
    system.spawn('low', at);
    expect(system.stats.particles).toBe(40);
    expect(system.spawn('high', at)).toBe(true);
    expect(system.stats.particles).toBe(40);
    // the survivors are 20 high + 20 low: a second high burst evicts the remaining low ones
    expect(system.spawn('high', at)).toBe(true);
    expect(system.stats.particles).toBe(40);
    // now the screen is all high-priority: a low burst is dropped entirely, and counted
    const dropped = system.stats.dropped;
    expect(system.spawn('low', at)).toBe(false);
    expect(system.stats.dropped).toBe(dropped + 1);
    expect(system.stats.particles).toBe(40);
  });

  it('the sprite budget caps arcs and flashes too, dropping the oldest less important one', () => {
    const { system } = make({ spriteBudget: 6 });
    for (let i = 0; i < 40; i++) system.spawn('impact_flash', at);
    expect(system.stats.sprites).toBeLessThanOrEqual(6);
  });

  it('is deterministic: the same seed gives the same particles frame for frame', () => {
    const trace = (seed: number): string => {
      const { system, add } = make({ seed });
      system.spawn('hurt_shards', at);
      system.spawn('impact_sparks', at);
      const out: string[] = [];
      for (let i = 0; i < 20; i++) {
        system.update(1 / 60);
        for (const c of add.children) for (const p of (c as unknown as { particleChildren?: Array<{ x: number; y: number; alpha: number }> }).particleChildren ?? []) out.push(`${p.x.toFixed(5)},${p.y.toFixed(5)},${p.alpha.toFixed(4)}`);
      }
      return out.join('|');
    };
    expect(trace(5)).toBe(trace(5));
    expect(trace(5)).not.toBe(trace(6));
  });

  it('knows nothing about ticks: it only advances with the real dt it is given (a hit-stop does not freeze it)', () => {
    const { system } = make();
    system.spawn('impact_sparks', at);
    const live = system.stats.particles;
    system.update(0); // a frozen world gives the sim no time, but the VFX still get theirs from the loop
    expect(system.stats.particles).toBe(live);
    system.update(0.05);
    system.update(0.05);
    system.update(0.5);
    expect(system.stats.particles).toBe(0);
  });

  it('an unknown effect id is ignored (and not counted as spawned)', () => {
    const { system } = make();
    expect(system.spawn('no_such_effect', at)).toBe(false);
    expect(system.stats.spawned).toBe(0);
  });

  it('clear() and destroy() leave nothing alive, and destroy is idempotent', () => {
    const { system, add, normal } = make();
    system.spawn('death_ink', at);
    system.spawn('impact_sparks', at);
    system.spawn('impact_flash', at);
    system.clear();
    expect(system.stats.particles + system.stats.sprites).toBe(0);
    expect(particleCount(add) + particleCount(normal)).toBe(0);
    system.spawn('impact_sparks', at);
    system.destroy();
    system.destroy();
    expect(system.spawn('impact_sparks', at)).toBe(false);
    expect(() => system.update(0.1)).not.toThrow();
  });
});
