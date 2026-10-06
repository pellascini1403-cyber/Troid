import { describe, expect, it } from 'vitest';
import { VFX, VFX_BINDINGS } from '@/content/vfx';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import type { VfxSpawn } from '@/presentation/vfx';
import { VfxDirector } from '@/vfx/VfxDirector';
import type { VfxSystem } from '@/vfx/VfxSystem';

/** A recording stand-in for the VfxSystem: the director is pure routing, so it is tested without any renderer. */
function setup() {
  const calls: Array<{ id: string; at: VfxSpawn }> = [];
  const system = { spawn: (id: string, at: VfxSpawn) => (calls.push({ id, at }), true) } as unknown as VfxSystem;
  const bus = new EventBus<GameEvents>();
  const player = { x: 0, y: 0 };
  const director = new VfxDirector(bus, system, VFX_BINDINGS, VFX, () => ({ ...player }));
  const ids = (): string[] => calls.map((c) => c.id);
  return { bus, calls, ids, player, director };
}

describe('VfxDirector: simulation events → effects (the sim never knows it exists)', () => {
  it('a slash starts when the blow becomes ACTIVE, fits the hitbox, and the finisher has its own effect', () => {
    const { bus, calls, ids } = setup();
    const rect = { x0: 10.2, y0: 0.3, x1: 11.6, y1: 1.4 };
    bus.emit('player:attackActive', { attackId: 'slash_1', x: 10, y: 0, facing: 1, air: false, combo: 0, rect });
    expect(ids()).toEqual(['slash_arc']);
    expect(calls[0]!.at).toMatchObject({ facing: 1, variant: 'slash_1', rect });
    bus.emit('player:attackActive', { attackId: 'slash_2', x: 10, y: 0, facing: -1, air: false, combo: 1, rect });
    expect(ids()).toEqual(['slash_arc', 'slash_arc_finisher']);
    expect(calls[1]!.at).toMatchObject({ facing: -1, variant: 'slash_2' });
  });

  it('a hit that lands on an enemy or a wall sparks at the impact point, along the blow; killing blows are bigger', () => {
    const { bus, calls, ids } = setup();
    bus.emit('combat:hit', { attackId: 'slash_1', attackerId: 'p', targetId: 'e', targetTeam: 'enemy', damage: 1, x: 4, y: 1, direction: 1, killed: false, hitStop: 4, shake: 0.1 });
    expect(ids()).toEqual(VFX_BINDINGS.hitLanded);
    expect(calls[0]!.at).toMatchObject({ x: 4, y: 1, dirX: 1, scale: 1 });
    calls.length = 0;
    bus.emit('combat:hit', { attackId: 'slash_1', attackerId: 'p', targetId: 'e', targetTeam: 'neutral', damage: 1, x: 4, y: 1, direction: -1, killed: true, hitStop: 4, shake: 0.1 });
    expect(calls[0]!.at).toMatchObject({ dirX: -1, scale: 1.3 });
  });

  it('a hit on the PLAYER does not raise the generic impact (player:hurt owns that moment): no double effects', () => {
    const { bus, ids } = setup();
    bus.emit('combat:hit', { attackId: 'bite', attackerId: 'e', targetId: 'p', targetTeam: 'player', damage: 1, x: 0, y: 1, direction: 1, killed: false, hitStop: 6, shake: 0.2 });
    expect(ids()).toEqual([]);
    bus.emit('player:hurt', { x: 0, y: 1, damage: 1, direction: 1 });
    expect(ids()).toEqual(VFX_BINDINGS.playerHurt);
  });

  it('a dash bursts at the start (+ dust at the feet) and lays a trail along the DISTANCE travelled, whatever the frame rate', () => {
    const { bus, calls, ids, player, director } = setup();
    bus.emit('player:dashed', { x: 0, y: 0, facing: 1, air: false });
    expect(ids()).toEqual([...VFX_BINDINGS.dashStart, ...VFX_BINDINGS.dashDust]);
    const dust = calls.find((c) => c.id === 'dash_dust')!;
    expect(dust.at.y).toBeLessThan(0.5); // at the feet
    calls.length = 0;
    director.update();
    expect(calls).toHaveLength(0); // has not moved: no puff
    player.x = 2.3; // 2.3 m at 0.45 m spacing = 5 puffs, all in one big frame
    director.update();
    const puffs = calls.filter((c) => c.id === 'dash_trail');
    expect(puffs).toHaveLength(5);
    expect(puffs.map((p) => p.at.x)).toEqual([0.45, 0.9, 1.35, 1.8, 2.25].map((x) => expect.closeTo(x, 9)));
    calls.length = 0;
    player.x = 2.5; // 0.25 m more: not enough for another puff
    director.update();
    expect(calls).toHaveLength(0);
    player.x = 3.0;
    director.update();
    expect(calls.filter((c) => c.id === 'dash_trail')).toHaveLength(1);
  });

  it('the trail follows a dash to the left, stops when the dash ends, and does not run away on a huge jump', () => {
    const { bus, calls, player, director } = setup();
    player.x = 10;
    bus.emit('player:dashed', { x: 10, y: 0, facing: -1, air: false });
    calls.length = 0;
    player.x = 6.4;
    director.update();
    const xs = calls.filter((c) => c.id === 'dash_trail').map((c) => c.at.x);
    expect(xs.length).toBe(7);
    expect(xs[0]!).toBeLessThan(10);
    calls.length = 0;
    bus.emit('player:dashEnded', { x: 6.4, y: 0 });
    player.x = -100;
    director.update();
    expect(calls.filter((c) => c.id === 'dash_trail')).toHaveLength(0); // the dash is over
    // and an absurd distance inside one dash is capped per frame
    bus.emit('player:dashed', { x: 0, y: 0, facing: 1, air: false });
    calls.length = 0;
    player.x = 500;
    director.update();
    expect(calls.filter((c) => c.id === 'dash_trail').length).toBeLessThanOrEqual(12);
  });

  it('an enemy death splashes ink; the death of the player disperses its energy; the player is not an "enemy death"', () => {
    const { bus, ids } = setup();
    bus.emit('actor:died', { id: 'slime', team: 'enemy', x: 5, y: 0 });
    expect(ids()).toEqual(VFX_BINDINGS.enemyDied);
    bus.emit('actor:died', { id: 'p', team: 'player', x: 0, y: 0 });
    expect(ids()).toHaveLength(VFX_BINDINGS.enemyDied.length);
    bus.emit('player:died', { x: 0, y: 0 });
    expect(ids().slice(-VFX_BINDINGS.playerDied.length)).toEqual(VFX_BINDINGS.playerDied);
  });

  it('the wind-up of an enemy lunge starts the violet warning on the creature, facing where it will strike', () => {
    const { bus, calls, ids } = setup();
    bus.emit('enemy:telegraph', { id: 'slime_1', defId: 'ink_slime', x: 12, y: 0, facing: -1, ticks: 24 });
    expect(ids()).toEqual(VFX_BINDINGS.enemyTelegraph);
    expect(calls[0]!.at).toMatchObject({ x: 12, facing: -1 });
    expect(calls[0]!.at.y).toBeGreaterThan(0); // on its body, not on the floor
    // noticing the player is an audio cue, not a visual effect (yet)
    calls.length = 0;
    bus.emit('enemy:alerted', { id: 'slime_1', defId: 'ink_slime', x: 12, y: 0 });
    expect(calls).toHaveLength(0);
  });

  it('dispose() unsubscribes everything (no listener survives a room or a hot reload)', () => {
    const { bus, ids, director } = setup();
    expect(bus.listenerCount()).toBeGreaterThan(0);
    director.dispose();
    expect(bus.listenerCount()).toBe(0);
    bus.emit('player:died', { x: 0, y: 0 });
    expect(ids()).toEqual([]);
  });
});
