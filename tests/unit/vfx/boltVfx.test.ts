// @vitest-environment happy-dom
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { SKILLS } from '@/content/skills';
import { VFX, VFX_BINDINGS } from '@/content/vfx';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import type { VfxSpawn } from '@/presentation/vfx';
import { PALETTE } from '@/presentation/palette';
import { EntityViews } from '@/render/EntityViews';
import { ProjectileView } from '@/render/ProjectileView';
import { VfxDirector } from '@/vfx/VfxDirector';
import type { VfxSystem } from '@/vfx/VfxSystem';
import { fakeVfxAtlas } from '../../helpers/vfx';

/**
 * The look of the Spirit Bolt (docs/GAME-SPEC-2D.md §10.1: "arco/estela cian con núcleo blanco"): its effects are data in the
 * hero's energy palette, the director raises them from the simulation's events (a bolt hit is NOT a sword hit), and the bolt
 * in flight is drawn by a small view in the light layer.
 */
function setup() {
  const calls: Array<{ id: string; at: VfxSpawn }> = [];
  const system = { spawn: (id: string, at: VfxSpawn) => (calls.push({ id, at }), true) } as unknown as VfxSystem;
  const bus = new EventBus<GameEvents>();
  new VfxDirector(bus, system, VFX_BINDINGS, VFX, () => ({ x: 0, y: 0 }), new Set(Object.keys(SKILLS)));
  return { bus, calls, ids: () => calls.map((c) => c.id) };
}
const hit = (attackId: string, extra: Partial<GameEvents['combat:hit']> = {}): GameEvents['combat:hit'] => ({
  attackId, attackerId: 'p', targetId: 'e', targetTeam: 'enemy', damage: 2, x: 5, y: 1, direction: 1, killed: false, hitStop: 3, shake: 0.1, ...extra,
});

describe('the bolt effects are data', () => {
  it('every trigger is bound to effects that exist (all of them, new ones included), in the hero\'s energy palette', () => {
    for (const [trigger, ids] of Object.entries(VFX_BINDINGS)) {
      expect(ids.length, trigger).toBeGreaterThan(0);
      for (const id of ids) expect(VFX[id], `${trigger} → ${id}`).toBeDefined();
    }
    for (const trigger of ['boltCast', 'boltImpact', 'boltEnd'] as const) {
      for (const id of VFX_BINDINGS[trigger]) expect(VFX[id]!.palette, id).toBe('energy');
    }
  });

  it('the muzzle flash and the impact core are WHITE-hot over a cyan body (light, so additive)', () => {
    const flash = VFX['bolt_muzzle_flash']!;
    const impact = VFX['bolt_impact_flash']!;
    expect(flash.kind === 'flash' && flash.role).toBe('hot');
    expect(impact.kind === 'flash' && impact.role).toBe('hot');
    const burst = VFX['bolt_impact_burst']!;
    expect(burst.kind === 'particles' && burst.blend).toBe('add');
    expect(burst.kind === 'particles' && burst.colors.includes('hot') && burst.colors.includes('core')).toBe(true);
  });

  it('the bolt uses no warm accent and no violet (violet is the enemies\' energy)', () => {
    for (const trigger of ['boltCast', 'boltImpact', 'boltEnd'] as const) {
      for (const id of VFX_BINDINGS[trigger]) expect(['energy', 'neutral']).toContain(VFX[id]!.palette);
    }
  });
});

describe('the director raises them from simulation events', () => {
  it('a cast flashes at the muzzle, facing the way the bolt goes', () => {
    const { bus, calls, ids } = setup();
    bus.emit('skill:cast', { skillId: 'spirit_bolt', x: 3, y: 1.1, facing: -1, cost: 30 });
    expect(ids()).toEqual(VFX_BINDINGS.boltCast);
    expect(calls[0]!.at).toMatchObject({ x: 3, y: 1.1, facing: -1, dirX: -1 });
  });

  it('a bolt hit is a bolt impact and NOT a sword hit (no double effects); a sword hit is still a sword hit', () => {
    const { bus, ids } = setup();
    bus.emit('combat:hit', hit('spirit_bolt'));
    expect(ids()).toEqual(VFX_BINDINGS.boltImpact);
    bus.emit('combat:hit', hit('slash_1'));
    expect(ids().slice(VFX_BINDINGS.boltImpact.length)).toEqual(VFX_BINDINGS.hitLanded);
  });

  it('a bolt that ends on a wall or at the end of its range fizzles; one that hit something does not add a second effect', () => {
    const { bus, ids } = setup();
    bus.emit('projectile:ended', { id: 'b1', skillId: 'spirit_bolt', x: 9, y: 1, facing: 1, reason: 'wall' });
    bus.emit('projectile:ended', { id: 'b2', skillId: 'spirit_bolt', x: 20, y: 1, facing: 1, reason: 'range' });
    expect(ids()).toEqual([...VFX_BINDINGS.boltEnd, ...VFX_BINDINGS.boltEnd]);
    bus.emit('projectile:ended', { id: 'b3', skillId: 'spirit_bolt', x: 5, y: 1, facing: 1, reason: 'hit' });
    expect(ids()).toHaveLength(VFX_BINDINGS.boltEnd.length * 2);
  });

  it('without the set of projectile skills every hit is a generic hit (the director has no hidden knowledge of skills)', () => {
    const calls: string[] = [];
    const system = { spawn: (id: string) => (calls.push(id), true) } as unknown as VfxSystem;
    const bus = new EventBus<GameEvents>();
    new VfxDirector(bus, system, VFX_BINDINGS, VFX, () => ({ x: 0, y: 0 }));
    bus.emit('combat:hit', hit('spirit_bolt'));
    expect(calls).toEqual(VFX_BINDINGS.hitLanded);
  });
});

describe('the bolt in flight (view)', () => {
  const bolt = (): { x: number; y: number; prevX: number; prevY: number; facing: 1 | -1 } => ({ x: 6, y: 1.2, prevX: 5, prevY: 1.2, facing: 1 });

  it('is a cyan glow with a white-hot core and a two-streak tail, all additive light', () => {
    const v = new ProjectileView(bolt(), fakeVfxAtlas());
    expect(v.additive).toBe(true);
    const [tail, tailCore, head, core] = v.root.children as import('pixi.js').Sprite[];
    expect([tail, tailCore, head, core].every((s) => s!.blendMode === 'add')).toBe(true);
    expect(head!.tint).toBe(PALETTE.energyCore);
    expect(core!.tint).toBe(PALETTE.whiteHot);
    expect(tailCore!.tint).toBe(PALETTE.whiteHot);
    // the tail is behind the head: its bright end (right) is anchored on the head
    expect(tail!.anchor.x).toBe(1);
    expect(tail!.width).toBeGreaterThan(head!.width * 2);
  });

  it('is placed between the two ticks it was simulated at (interpolation), y-down in view space', () => {
    const v = new ProjectileView(bolt(), fakeVfxAtlas());
    v.sync(0.5, 0);
    expect(v.root.position.x).toBeCloseTo(5.5, 9);
    expect(v.root.position.y).toBeCloseTo(-1.2, 9);
    v.sync(1, 0);
    expect(v.root.position.x).toBeCloseTo(6, 9);
  });

  it('is mirrored with the facing: the tail trails behind when it flies left', () => {
    const b = { ...bolt(), facing: -1 as const };
    const v = new ProjectileView(b, fakeVfxAtlas());
    v.sync(1, 0);
    expect(v.root.scale.x).toBe(-1);
  });

  it('flickers while time runs and holds still when it does not (a hit-stop or a paused test)', () => {
    const v = new ProjectileView(bolt(), fakeVfxAtlas());
    const head = v.root.children[2] as import('pixi.js').Sprite;
    v.sync(1, 0);
    const still = head.scale.x;
    v.sync(1, 0);
    expect(head.scale.x).toBe(still);
    const seen = new Set<number>();
    for (let i = 0; i < 12; i++) {
      v.sync(1, 1 / 60);
      seen.add(Math.round(head.scale.x * 1e6));
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('is routed to the LIGHT layer, not the actors\' layer, and removed with its entity', () => {
    const actors = new Container();
    const light = new Container();
    const bus = new EventBus<GameEvents>();
    const views = new EntityViews(actors, { projectile: () => new ProjectileView(bolt(), fakeVfxAtlas()) }, light);
    views.attach(bus);
    const entity = { id: 'b', kind: 'projectile', tick: () => undefined };
    bus.emit('entity:spawned', { entity });
    expect(light.children).toHaveLength(1);
    expect(actors.children).toHaveLength(0);
    bus.emit('entity:despawned', { entity });
    expect(light.children).toHaveLength(0);
    views.destroy();
  });

  it('a view that is not additive still goes to the actors\' layer (nothing changed for the enemies)', () => {
    const actors = new Container();
    const light = new Container();
    const bus = new EventBus<GameEvents>();
    const views = new EntityViews(actors, { dummy: () => ({ root: new Container(), sync: () => undefined, destroy: () => undefined }) }, light);
    views.attach(bus);
    bus.emit('entity:spawned', { entity: { id: 'd', kind: 'dummy', tick: () => undefined } });
    expect(actors.children).toHaveLength(1);
    expect(light.children).toHaveLength(0);
    views.destroy();
  });
});
